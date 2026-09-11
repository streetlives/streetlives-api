// Copyright (c) 2026 Streetlives, Inc. MIT license; see LICENSE.
/* eslint-disable no-param-reassign, no-await-in-loop */
const crypto = require('crypto');
const { parseNumber } = require('./phone');

const DAY = 86400000;
const LIVE = new Set(['reserved', 'dialing', 'active', 'ending']);
const TERMINAL = new Set(['ended', 'failed']);
const fail = (code, message, status = 400) => {
  throw Object.assign(new Error(message), { code, status });
};
const clone = value => JSON.parse(JSON.stringify(value));
const randomId = () => crypto.randomBytes(16).toString('hex');

function createService({
  config, store, provider, directory, now = Date.now,
}) {
  const hash = value => crypto.createHmac('sha256', config.hashSecret).update(value).digest('hex');
  const identity = context => ({
    session: hash(`session:${context.session}`),
    ip: hash(`ip:${Math.floor(now() / DAY)}:${context.ip}`),
  });
  const session = (state, context) => {
    const key = identity(context).session;
    let entry = state.sessions[key];
    if (!entry || entry.expiresAt < now()) {
      if (Object.keys(state.sessions).length >= 2048 && !entry) {
        fail('busy', 'Calling is temporarily busy. Please try later.', 503);
      }
      entry = { createdAt: now(), expiresAt: now() + config.sessionMs };
      state.sessions[key] = entry;
    }
    if (entry.verifiedUntil < now()) {
      delete entry.verifiedNumber;
      delete entry.verifiedUntil;
    }
    return entry;
  };
  const quota = (state, key, max, duration, amount = 1) => {
    const bucket = Math.floor(now() / duration);
    const id = `${key}:${bucket}`;
    const current = state.quotas[id] || { count: 0, expiresAt: (bucket + 1) * duration };
    if (current.count + amount > max) fail('rate_limited', 'Please wait before trying again.', 429);
    current.count += amount;
    state.quotas[id] = current;
  };
  const cleanup = (state) => {
    Object.entries(state.quotas).forEach(([key, value]) => {
      if (value.expiresAt < now() - DAY) delete state.quotas[key];
    });
    Object.entries(state.events).forEach(([key, value]) => {
      if (value < now() - DAY) delete state.events[key];
    });
    Object.entries(state.sessions).forEach(([key, value]) => {
      if (value.expiresAt < now()) delete state.sessions[key];
      else {
        if (value.challenge && value.challenge.expiresAt < now()) delete value.challenge;
        if (value.verifiedUntil < now()) {
          delete value.verifiedNumber;
          delete value.verifiedUntil;
        }
      }
    });
    Object.entries(state.calls).forEach(([key, call]) => {
      if (TERMINAL.has(call.status) && call.endedAt < now() - DAY) delete state.calls[key];
      if (
        call.status === 'queued' &&
        (call.createdAt + config.queueMs < now() || call.lastSeenAt + 60000 < now())
      ) {
        call.status = 'ended';
        call.endedAt = now();
      }
    });
  };
  const owned = (state, context, id) => {
    const call = state.calls[id];
    if (!call || call.session !== identity(context).session) {
      fail('not_found', 'Call not found.', 404);
    }
    return call;
  };
  const promote = (state) => {
    const active = Object.values(state.calls).filter(call => LIVE.has(call.status));
    const queued = Object.values(state.calls)
      .filter(call => call.status === 'queued')
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    queued.forEach((call) => {
      const capacity = config.capacity[call.number] || 1;
      if (
        active.length < config.maxConcurrent &&
        active.filter(other => other.number === call.number).length < capacity
      ) {
        call.status = 'reserved';
        call.reservedUntil = now() + config.reservationMs;
        active.push(call);
      }
    });
  };
  const snapshot = async (context, id) => {
    const result = await store.transaction((state) => {
      cleanup(state);
      const call = owned(state, context, id);
      call.lastSeenAt = now();
      promote(state);
      const queued = Object.values(state.calls)
        .filter(other => other.status === 'queued' && other.number === call.number)
        .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
      return {
        call: clone(call),
        position:
          call.status === 'queued' ? queued.findIndex(other => other.id === id) + 1 : undefined,
      };
    });
    const { call, position } = result;
    const response = {
      id: call.id,
      status: call.status,
      number: call.number,
      extension: call.extension,
      callerNumber: call.callerNumber,
      position,
      connectedAt: call.connectedAt || null,
      maxCallSeconds: config.maxCallSeconds,
    };
    if (call.status === 'reserved' && call.reservedUntil > now()) {
      const room = await provider.createRoom(call);
      const allowed = await store.transaction((state) => {
        const current = owned(state, context, id);
        if (current.status !== 'reserved' || current.reservedUntil <= now()) return false;
        if (current.roomSid && current.roomSid !== room.sid) return false;
        current.roomSid = room.sid;
        return true;
      });
      if (allowed) response.room = { url: config.livekitUrl, token: await provider.token(call) };
      else await provider.closeRoom(call);
    }
    return response;
  };

  const finish = async (id) => {
    const call = await store.transaction((state) => {
      const current = state.calls[id];
      if (!current || TERMINAL.has(current.status)) return null;
      if (current.status === 'queued') {
        current.status = 'ended';
        current.endedAt = now();
        return null;
      }
      current.status = 'ending';
      return clone(current);
    });
    if (!call) return;
    // A timed-out dial may have succeeded. Keep its slot until the provider's hard
    // maximum lifetime has passed, and repeatedly close its room in the reaper.
    await provider.closeRoom(call);
    await store.transaction((state) => {
      const current = state.calls[id];
      if (!current || TERMINAL.has(current.status)) return;
      if (current.dialInFlight && now() < current.finishBy) return;
      current.status = 'ended';
      current.endedAt = now();
      promote(state);
    });
  };

  return {
    async config(context) {
      return store.transaction((state) => {
        cleanup(state);
        // A directory visitor reading config must not consume one of the bounded
        // enrollment/session slots until they actually request a call or OTP.
        const entry = state.sessions[identity(context).session] || {};
        return {
          enabled: config.enabled,
          verifiedNumber: entry.verifiedNumber || null,
          defaultCallerLabel: 'YourPeer',
          maxCallSeconds: config.maxCallSeconds,
        };
      });
    },
    async requestVerification(context, number) {
      const phone = parseNumber(number);
      if (!phone || phone.extension) fail('invalid_number', 'Enter a complete US phone number.');
      const attempt = randomId();
      await store.transaction((state) => {
        cleanup(state);
        const entry = session(state, context);
        const { session: owner, ip } = identity(context);
        const pending = Object.entries(state.sessions).find(([key, value]) =>
          key !== owner &&
            value.challenge &&
            value.challenge.number === phone.number &&
            value.challenge.expiresAt > now());
        if (pending || (entry.challenge && entry.challenge.createdAt + 60000 > now())) {
          fail('verification_pending', 'Please wait a minute before requesting another code.', 429);
        }
        quota(state, 'otp:global', config.dailyOtp, DAY);
        quota(state, `otp:session:${owner}`, 4, DAY);
        quota(state, `otp:ip:${ip}`, 10, DAY);
        quota(state, `otp:number:${hash(phone.number)}`, 4, DAY);
        entry.challenge = {
          attempt,
          number: phone.number,
          createdAt: now(),
          expiresAt: now() + config.challengeMs,
          attempts: 0,
          inFlight: true,
        };
      });
      let result;
      try {
        result = await provider.requestVerification(phone.number);
      } catch (_) {
        // Preserve cooldown/quotas after an uncertain SMS outcome; never retry automatically.
        fail(
          'verification_unavailable',
          'The code could not be requested. Please wait a minute and try again.',
          503,
        );
      }
      await store.transaction((state) => {
        const entry = session(state, context);
        if (!entry.challenge || entry.challenge.attempt !== attempt) {
          fail('verification_expired', 'Request a new verification code.');
        }
        Object.assign(entry.challenge, result, { inFlight: false });
      });
      return { sent: true, expiresIn: Math.floor(config.challengeMs / 1000) };
    },
    async confirmVerification(context, code) {
      if (!/^\d{4,8}$/.test(String(code))) {
        fail('invalid_code', 'Enter the code from your text message.');
      }
      const challenge = await store.transaction((state) => {
        const entry = session(state, context);
        const value = entry.challenge;
        if (!value || value.expiresAt <= now()) {
          fail('verification_expired', 'Request a new verification code.');
        }
        if (value.inFlight) {
          fail('verification_pending', 'Verification is still running. Please wait.', 409);
        }
        if (value.attempts >= 5) fail('too_many_attempts', 'Request a new verification code.', 429);
        value.attempts += 1;
        value.inFlight = true;
        return clone(value);
      });
      let accepted = false;
      try {
        accepted = await provider.confirmVerification(challenge, String(code));
      } catch (_) {
        /* fixed response below */
      }
      return store.transaction((state) => {
        const entry = session(state, context);
        if (!entry.challenge || entry.challenge.attempt !== challenge.attempt) {
          fail('verification_expired', 'Request a new verification code.');
        }
        entry.challenge.inFlight = false;
        if (!accepted || entry.challenge.expiresAt <= now()) return { verified: false };
        entry.verifiedNumber = challenge.number;
        entry.verifiedUntil = now() + config.sessionMs;
        delete entry.challenge;
        return { verified: true, verifiedNumber: entry.verifiedNumber };
      });
    },
    async forget(context) {
      await store.transaction((state) => {
        const entry = session(state, context);
        delete entry.verifiedNumber;
        delete entry.verifiedUntil;
        delete entry.challenge;
      });
      return { forgotten: true };
    },
    async create(context, input) {
      if (
        !/^[\da-z-]{16,64}$/i.test(input.requestId || '') ||
        typeof input.useOwnNumber !== 'boolean'
      ) { fail('invalid_request', 'Invalid call request.'); }
      const destination = await directory(input);
      const id = hash(`call:${identity(context).session}:${input.requestId}`).slice(0, 32);
      await store.transaction((state) => {
        cleanup(state);
        const entry = session(state, context);
        const owner = identity(context);
        if (state.calls[id]) {
          const existing = owned(state, context, id);
          if (
            existing.number !== destination.number ||
            existing.extension !== destination.extension ||
            existing.useOwnNumber !== input.useOwnNumber
          ) { fail('request_conflict', 'This request was already used for another call.', 409); }
          return;
        }
        if (
          Object.values(state.calls).some(call =>
            call.session === owner.session && !TERMINAL.has(call.status))
        ) { fail('call_in_progress', 'Finish your current YourPeer call first.', 409); }
        if (input.useOwnNumber && !entry.verifiedNumber) {
          fail('verification_required', 'Verify your number before using it for a call.', 403);
        }
        if (Object.keys(state.calls).length >= 2048) {
          fail('busy', 'Calling is temporarily busy.', 503);
        }
        quota(state, 'calls:global', config.dailyCalls, DAY);
        // Reserve worst-case minutes, including ringing, before any paid call starts.
        // Reservations are not refunded. This gives a conservative hard daily minute budget.
        quota(
          state,
          'minutes:global',
          config.dailyMinutes,
          DAY,
          Math.ceil((config.maxCallSeconds + config.ringingSeconds) / 60),
        );
        quota(state, `calls:session:${owner.session}`, 8, DAY);
        quota(state, `calls:ip:${owner.ip}`, 30, DAY);
        quota(
          state,
          `calls:destination:${destination.number}`,
          20 * (config.capacity[destination.number] || 1),
          DAY,
        );
        quota(state, `calls:pair:${owner.session}:${destination.number}`, 1, 60000);
        if (input.useOwnNumber) quota(state, `calls:caller:${hash(entry.verifiedNumber)}`, 12, DAY);
        state.calls[id] = {
          ...destination,
          id,
          session: owner.session,
          ip: owner.ip,
          useOwnNumber: input.useOwnNumber,
          callerNumber: input.useOwnNumber ? entry.verifiedNumber : config.callerNumber,
          status: 'queued',
          createdAt: now(),
          lastSeenAt: now(),
          roomName: `yp-public-${id}`,
          browserIdentity: `visitor-${id}`,
          sipIdentity: `phone-${id}`,
        };
        promote(state);
      });
      return snapshot(context, id);
    },
    async status(context, id) {
      const call = await store.transaction(state => clone(owned(state, context, id)));
      if (
        (call.status === 'reserved' && call.reservedUntil <= now()) ||
        call.status === 'ending' ||
        (call.finishBy && call.finishBy <= now())
      ) { await finish(id); } else if (call.status === 'dialing' || call.status === 'active') {
        const participants = await provider.participants(call);
        const remote = participants.find(value => value.identity === call.sipIdentity);
        if (remote && remote.attributes && remote.attributes['sip.callStatus'] === 'active') {
          await store.transaction((state) => {
            const current = owned(state, context, id);
            if (current.status === 'dialing') {
              current.status = 'active';
              current.connectedAt = now();
            }
          });
        } else if (!remote && call.status === 'active') await finish(id);
      }
      return snapshot(context, id);
    },
    async start(context, id) {
      const existing = await store.transaction(state => clone(owned(state, context, id)));
      if (existing.status !== 'reserved') return snapshot(context, id);
      if (existing.reservedUntil <= now()) {
        await finish(id);
        return snapshot(context, id);
      }
      // Re-read the publication/phone data immediately before spending, including queued calls.
      await directory(existing);
      const participant = await provider.participant(existing);
      if (
        !participant ||
        participant.identity !== existing.browserIdentity ||
        !(participant.tracks || []).some(track =>
          track.type === 0 && track.source === 2 && !track.muted)
      ) { fail('microphone_required', 'Allow microphone access before calling.', 409); }
      const call = await store.transaction((state) => {
        const current = owned(state, context, id);
        if (current.status !== 'reserved' || current.reservedUntil <= now()) return null;
        const entry = session(state, context);
        if (current.useOwnNumber && entry.verifiedNumber !== current.callerNumber) {
          fail('verification_required', 'Verify your number before calling.', 403);
        }
        current.status = 'dialing';
        current.dialStartedAt = now();
        current.dialInFlight = true;
        current.finishBy = now() + ((config.maxCallSeconds + config.ringingSeconds + 60) * 1000);
        return clone(current);
      });
      if (!call) return snapshot(context, id);
      try {
        await provider.dial(call);
        const ending = await store.transaction((state) => {
          const current = owned(state, context, id);
          current.dialInFlight = false;
          return current.status === 'ending';
        });
        if (ending) await finish(id);
      } catch (_) {
        await store.transaction((state) => {
          const current = state.calls[id];
          if (!TERMINAL.has(current.status)) current.status = 'ending';
        });
        await finish(id);
      }
      return snapshot(context, id);
    },
    async hangup(context, id) {
      await store.transaction(state => owned(state, context, id));
      await finish(id);
      return snapshot(context, id);
    },
    async webhook(body, authorization) {
      let event;
      try {
        event = await provider.receiveWebhook(body, authorization);
      } catch (_) {
        fail('invalid_webhook', 'Invalid webhook signature.', 401);
      }
      if (
        !event.id ||
        !event.room ||
        !event.room.name ||
        !event.room.sid ||
        !Number.isFinite(Number(event.createdAt)) ||
        Math.abs(now() - (Number(event.createdAt) * 1000)) > DAY
      ) { fail('invalid_webhook', 'Invalid webhook event.', 400); }
      const stop = await store.transaction((state) => {
        cleanup(state);
        if (state.events[event.id]) return null;
        const call = Object.values(state.calls).find(value =>
          value.roomName === event.room.name && value.roomSid === event.room.sid);
        if (!call) return null;
        if (TERMINAL.has(call.status)) return null;
        // Duplicate lifecycle actions are idempotent even after this bounded cache fills.
        if (Object.keys(state.events).length < 16384) state.events[event.id] = now();
        const actor = event.participant && event.participant.identity;
        if (
          event.event === 'participant_joined' &&
          actor === call.sipIdentity &&
          call.status === 'dialing'
        ) {
          // SIP joins while ringing; sip.callStatus becomes active only after answer.
          if (
            event.participant.attributes &&
            event.participant.attributes['sip.callStatus'] === 'active'
          ) {
            call.status = 'active';
            call.connectedAt = now();
          }
        }
        if (
          event.event === 'room_finished' ||
          (event.event === 'participant_left' &&
            (actor === call.browserIdentity || actor === call.sipIdentity))
        ) { return call.id; }
        return null;
      });
      if (stop) await finish(stop);
      return { received: true };
    },
    async reap() {
      const calls = await store.transaction((state) => {
        cleanup(state);
        return Object.values(state.calls)
          .filter(call => LIVE.has(call.status))
          .map(clone);
      });
      let failed = 0;
      for (const call of calls) {
        try {
          if (
            call.status === 'ending' ||
            (call.status === 'reserved' && call.reservedUntil <= now()) ||
            (call.finishBy && call.finishBy <= now()) ||
            (call.dialStartedAt && call.lastSeenAt + 60000 < now())
          ) {
            await finish(call.id);
          } else if (call.status === 'dialing' || call.status === 'active') {
            const participants = await provider.participants(call);
            const browser = participants.find(value => value.identity === call.browserIdentity);
            const remote = participants.find(value => value.identity === call.sipIdentity);
            if (!browser || (!remote && call.dialStartedAt + 60000 < now())) await finish(call.id);
            else if (
              remote &&
              remote.attributes &&
              remote.attributes['sip.callStatus'] === 'active'
            ) {
              await store.transaction((state) => {
                const current = state.calls[call.id];
                if (current.status === 'dialing') {
                  current.status = 'active';
                  current.connectedAt = now();
                }
              });
            }
          }
        } catch (_) {
          failed += 1;
        }
      }
      if (failed) fail('cleanup_pending', 'Some call cleanup requests must be retried.', 503);
      return { checked: calls.length };
    },
  };
}

module.exports = { createService, LIVE, TERMINAL };
