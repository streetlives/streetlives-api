// Copyright (c) 2026 Streetlives, Inc. MIT license; see LICENSE.
const { parseNumber } = require('./phone');

const integer = (env, name, fallback, min, max) => {
  if (env[name] === undefined || env[name] === '') return fallback;
  const value = Number(env[name]);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}`);
  return value;
};

function readConfig(env = process.env) {
  const config = {
    enabled: env.PUBLIC_CALLING_ENABLED === 'true',
    secret: env.PUBLIC_CALLING_BFF_SECRET || '',
    hashSecret: env.PUBLIC_CALLING_HASH_SECRET || '',
    livekitUrl: env.PUBLIC_CALLING_LIVEKIT_URL || '',
    livekitKey: env.PUBLIC_CALLING_LIVEKIT_API_KEY || '',
    livekitSecret: env.PUBLIC_CALLING_LIVEKIT_API_SECRET || '',
    trunkId: env.PUBLIC_CALLING_LIVEKIT_TRUNK_ID || '',
    callerNumber: env.PUBLIC_CALLING_CALLER_NUMBER || '',
    telnyxKey: env.PUBLIC_CALLING_TELNYX_API_KEY || '',
    verifyProfileId: env.PUBLIC_CALLING_TELNYX_VERIFY_PROFILE_ID || '',
    maxConcurrent: integer(env, 'PUBLIC_CALLING_MAX_CONCURRENT', 2, 1, 100),
    maxCallSeconds: integer(env, 'PUBLIC_CALLING_MAX_CALL_SECONDS', 900, 60, 3600),
    dailyMinutes: integer(env, 'PUBLIC_CALLING_DAILY_MINUTES', 120, 15, 10000),
    dailyCalls: integer(env, 'PUBLIC_CALLING_DAILY_CALLS', 60, 1, 2000),
    dailyOtp: integer(env, 'PUBLIC_CALLING_DAILY_OTP', 40, 1, 1000),
    capacity: {},
    reservationMs: 45000,
    queueMs: 10 * 60 * 1000,
    sessionMs: 30 * 24 * 60 * 60 * 1000,
    challengeMs: 5 * 60 * 1000,
    ringingSeconds: 45,
  };
  const capacities = JSON.parse(env.PUBLIC_CALLING_DESTINATION_CAPACITIES || '{}');
  Object.entries(capacities).forEach(([number, limit]) => {
    const parsed = parseNumber(number);
    if (!parsed || parsed.extension || !Number.isInteger(limit) || limit < 1 || limit > 20) {
      throw new Error('Invalid PUBLIC_CALLING_DESTINATION_CAPACITIES');
    }
    config.capacity[parsed.number] = limit;
  });
  if (config.enabled) {
    if (
      config.secret.length < 32 ||
      config.hashSecret.length < 32 ||
      !/^wss:\/\//.test(config.livekitUrl) ||
      !config.livekitKey ||
      !config.livekitSecret ||
      !config.trunkId ||
      !config.telnyxKey ||
      !config.verifyProfileId ||
      !parseNumber(config.callerNumber) ||
      parseNumber(config.callerNumber).extension
    ) {
      throw new Error('Public calling configuration is incomplete');
    }
    config.callerNumber = parseNumber(config.callerNumber).number;
  }
  return config;
}

module.exports = { readConfig };
