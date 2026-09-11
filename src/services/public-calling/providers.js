// Copyright (c) 2026 Streetlives, Inc. MIT license; see LICENSE.
/* global fetch, AbortSignal */
const { parseNumber } = require('./phone');

const upstreamError = () =>
  Object.assign(new Error('Calling is temporarily unavailable. Please try again later.'), {
    status: 503,
    code: 'provider_unavailable',
  });

function createProviders(config) {
  // Loaded only when configured; disabled deployments need no provider connections.
  const {
    AccessToken,
    RoomServiceClient,
    SipClient,
    WebhookReceiver,
  } = require('livekit-server-sdk'); // eslint-disable-line global-require
  const host = config.livekitUrl.replace(/^wss:/, 'https:');
  const rooms = new RoomServiceClient(host, config.livekitKey, config.livekitSecret, {
    timeout: 10,
  });
  const sip = new SipClient(host, config.livekitKey, config.livekitSecret, { timeout: 10 });
  const receiver = new WebhookReceiver(config.livekitKey, config.livekitSecret);

  async function telnyx(path, body) {
    const response = await fetch(`https://api.telnyx.com/v2${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${config.telnyxKey}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10000),
    });
    if (response.status === 404 && body === undefined) return null;
    if (!response.ok) throw upstreamError();
    const result = await response.json();
    if (!result) throw upstreamError();
    // The verified_numbers request endpoint uniquely returns an unwrapped object.
    const data = result.data || (path === '/verified_numbers' && body ? result : null);
    if (!data) throw upstreamError();
    return data;
  }

  return {
    createRoom: call =>
      rooms.createRoom({
        name: call.roomName,
        maxParticipants: 2,
        emptyTimeout: 60,
        departureTimeout: 15,
        metadata: JSON.stringify({ publicCallId: call.id }),
      }),
    async token(call) {
      const token = new AccessToken(config.livekitKey, config.livekitSecret, {
        identity: call.browserIdentity,
        ttl: 60,
      });
      token.addGrant({
        roomJoin: true,
        room: call.roomName,
        canPublish: true,
        canPublishSources: [2],
        canSubscribe: true,
        canPublishData: true,
        canUpdateOwnMetadata: false,
        roomAdmin: false,
        roomCreate: false,
        roomList: false,
        roomRecord: false,
      });
      // No SIP grant, admin grant, Telnyx token or SIP credentials reach the visitor.
      return token.toJwt();
    },
    participant: call => rooms.getParticipant(call.roomName, call.browserIdentity),
    participants: call => rooms.listParticipants(call.roomName),
    listRooms: call => rooms.listRooms([call.roomName]),
    async closeRoom(call) {
      try {
        await rooms.deleteRoom(call.roomName);
      } catch (error) {
        if (error.code !== 'not_found' && error.status !== 404) throw error;
      }
    },
    dial: call =>
      sip.createSipParticipant(config.trunkId, call.number, call.roomName, {
        fromNumber: call.callerNumber,
        participantIdentity: call.sipIdentity,
        participantName: 'Directory service',
        hidePhoneNumber: true,
        participantMetadata: JSON.stringify({ publicCallId: call.id }),
        maxCallDuration: config.maxCallSeconds,
        ringingTimeout: config.ringingSeconds,
        waitUntilAnswered: false,
        timeout: 10,
        playDialtone: true,
      }),
    receiveWebhook: (body, authorization) => receiver.receive(body, authorization),
    async requestVerification(number) {
      const registered = await telnyx(`/verified_numbers/${encodeURIComponent(number)}`);
      if (registered && registered.verified_at) {
        // An account-level verified number is NOT proof that this visitor owns it.
        const verification = await telnyx('/verifications/sms', {
          phone_number: number,
          verify_profile_id: config.verifyProfileId,
        });
        if (
          !verification.id ||
          verification.status !== 'pending' ||
          verification.phone_number !== number
        ) { throw upstreamError(); }
        return { mode: 'visitor', providerId: verification.id };
      }
      const challenge = await telnyx('/verified_numbers', {
        phone_number: number,
        verification_method: 'sms',
      });
      if (challenge.phone_number !== number || challenge.verified_at) throw upstreamError();
      return { mode: 'registration' };
    },
    async confirmVerification(challenge, code) {
      if (challenge.mode === 'visitor') {
        const result = await telnyx(
          `/verifications/${encodeURIComponent(challenge.providerId)}/actions/verify`,
          { code },
        );
        if (
          result.response_code !== 'accepted' ||
          (result.phone_number && result.phone_number !== challenge.number)
        ) { return false; }
        const path = `/verified_numbers/${encodeURIComponent(challenge.number)}`;
        const registered = await telnyx(path);
        return !!(
          registered &&
          registered.verified_at &&
          registered.phone_number === challenge.number
        );
      }
      if (challenge.mode !== 'registration') return false;
      const result = await telnyx(
        `/verified_numbers/${encodeURIComponent(challenge.number)}/actions/verify`,
        { verification_code: code },
      );
      const verifiedAt = Date.parse(result.verified_at);
      return !!(
        parseNumber(result.phone_number) &&
        result.phone_number === challenge.number &&
        Number.isFinite(verifiedAt) &&
        verifiedAt >= challenge.createdAt - 5000
      );
    },
  };
}

module.exports = { createProviders };
