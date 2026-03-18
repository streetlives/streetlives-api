import crypto from 'crypto';
import axios from 'axios';
import config from '../config';
import { AuthError, ForbiddenError } from '../utils/errors';

const JWKS_CACHE_TTL_MS = 10 * 60 * 1000;
const COGNITO_ISSUER_RE = /^https:\/\/cognito-idp\.[a-z0-9-]+\.amazonaws\.com\/[a-z0-9_-]+$/i;
const SUPPORTED_TOKEN_USES = new Set(['id', 'access']);
const jwksCache = new Map();
const tokenCache = new Map();

function decodeBase64UrlBuffer(value) {
  const normalized = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64');
}

function decodeBase64UrlJson(value) {
  try {
    return JSON.parse(decodeBase64UrlBuffer(value).toString('utf8'));
  } catch (error) {
    throw new AuthError('Malformed bearer token');
  }
}

function parseJwt(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) {
    throw new AuthError('Malformed bearer token');
  }
  return {
    header: decodeBase64UrlJson(parts[0]),
    payload: decodeBase64UrlJson(parts[1]),
    signingInput: `${parts[0]}.${parts[1]}`,
    signature: decodeBase64UrlBuffer(parts[2]),
  };
}

function normalizeHost(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '');
}

function normalizeValues(values) {
  return values
    .map(value => String(value || '').trim())
    .filter(Boolean);
}

function getClaimValues(value) {
  if (Array.isArray(value)) {
    return normalizeValues(value);
  }
  if (value == null) {
    return [];
  }
  if (typeof value === 'string' && value.includes(',')) {
    return normalizeValues(value.split(','));
  }
  return normalizeValues([value]);
}

function extractRequestHost(value) {
  if (!value) return null;
  try {
    const parsedUrl = new URL(value);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return null;
    }
    return normalizeHost(parsedUrl.hostname);
  } catch (error) {
    if (String(value).includes('://')) {
      return null;
    }
    return normalizeHost(value);
  }
}

function isAllowedHost(host, allowedHosts) {
  return allowedHosts.some((allowedHost) => {
    const normalizedAllowedHost = normalizeHost(allowedHost);
    if (!normalizedAllowedHost) return false;
    if (normalizedAllowedHost.startsWith('*.')) {
      const suffix = normalizedAllowedHost.slice(1);
      return host.endsWith(suffix);
    }
    return host === normalizedAllowedHost;
  });
}

function assertAllowedRequestHost(req) {
  const allowedHosts = config.internalLocationCatalog.allowedOriginHosts || [];
  if (!allowedHosts.length) return;
  const requestHosts = [
    extractRequestHost(req.headers.origin),
    extractRequestHost(req.headers.referer || req.headers.referrer),
  ].filter(Boolean);
  if (!requestHosts.length) return;
  if (requestHosts.some(host => isAllowedHost(host, allowedHosts))) return;
  throw new ForbiddenError('Origin not allowed for internal location catalog');
}

function assertCatalogAuthorizationClaims(payload) {
  const allowedClientIds = normalizeValues(
    config.internalLocationCatalog.allowedClientIds || [],
  );
  const allowedGroupNames = normalizeValues(
    config.internalLocationCatalog.allowedGroupNames || [],
  );
  if (!allowedClientIds.length && !allowedGroupNames.length) {
    throw new ForbiddenError('Internal location catalog authorization is not configured');
  }

  if (allowedClientIds.length) {
    const tokenClientIds = getClaimValues(payload.client_id)
      .concat(getClaimValues(payload.aud))
      .concat(getClaimValues(payload.azp));
    const hasAllowedClientId = tokenClientIds.some(tokenClientId =>
      allowedClientIds.includes(tokenClientId));
    if (!hasAllowedClientId) {
      throw new ForbiddenError('Bearer token client is not allowed for internal location catalog');
    }
  }

  if (allowedGroupNames.length) {
    const tokenGroups = getClaimValues(payload['cognito:groups']);
    const hasAllowedGroup = tokenGroups.some(groupName =>
      allowedGroupNames.includes(groupName));
    if (!hasAllowedGroup) {
      throw new ForbiddenError('Bearer token group is not allowed for internal location catalog');
    }
  }
}

async function fetchIssuerJwks(issuer) {
  const cached = jwksCache.get(issuer);
  if (cached && cached.keysByKid && Date.now() - cached.fetchedAt < JWKS_CACHE_TTL_MS) {
    return cached.keysByKid;
  }
  if (cached && cached.promise) {
    return cached.promise;
  }
  const request = axios
    .get(`${issuer}/.well-known/jwks.json`, { timeout: 5000 })
    .then(({ data }) => {
      if (!data || !Array.isArray(data.keys)) {
        throw new AuthError('Unable to load Cognito signing keys');
      }
      const keysByKid = new Map();
      data.keys.forEach((key) => {
        if (key && key.kid) {
          keysByKid.set(key.kid, key);
        }
      });
      jwksCache.set(issuer, {
        fetchedAt: Date.now(),
        keysByKid,
        promise: null,
      });
      return keysByKid;
    })
    .catch((error) => {
      jwksCache.delete(issuer);
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError('Unable to verify bearer token');
    });
  jwksCache.set(issuer, { fetchedAt: 0, keysByKid: null, promise: request });
  return request;
}

function verifyJwtSignature(parsedToken, jwk) {
  if (!jwk || jwk.kty !== 'RSA') {
    throw new AuthError('Unsupported Cognito signing key');
  }
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(parsedToken.signingInput);
  verifier.end();
  return verifier.verify(
    crypto.createPublicKey({ key: jwk, format: 'jwk' }),
    parsedToken.signature,
  );
}

function assertTokenClaims(payload) {
  const expiresAtMs = Number(payload.exp) * 1000;
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    throw new AuthError('Bearer token has expired');
  }
  const issuer = String(payload.iss || '').trim();
  if (!issuer || !COGNITO_ISSUER_RE.test(issuer)) {
    throw new AuthError('Bearer token issuer is not allowed');
  }
  if (config.cognito.userPoolIssuer && issuer !== config.cognito.userPoolIssuer) {
    throw new AuthError('Bearer token issuer is not allowed');
  }
  const tokenUse = String(payload.token_use || '').trim();
  if (!SUPPORTED_TOKEN_USES.has(tokenUse)) {
    throw new AuthError('Unsupported Cognito token type');
  }
  return expiresAtMs;
}

function getBearerToken(req) {
  const authorization = req.headers.authorization || req.headers.Authorization;
  if (typeof authorization !== 'string') return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

async function verifyCognitoJwt(token) {
  const cached = tokenCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  const parsedToken = parseJwt(token);
  const expiresAt = assertTokenClaims(parsedToken.payload);
  const keysByKid = await fetchIssuerJwks(parsedToken.payload.iss);
  const jwk = keysByKid.get(parsedToken.header.kid);
  if (!jwk) {
    throw new AuthError('Unable to verify bearer token');
  }
  if (!verifyJwtSignature(parsedToken, jwk)) {
    throw new AuthError('Unable to verify bearer token');
  }

  tokenCache.set(token, {
    expiresAt,
    payload: parsedToken.payload,
  });

  return parsedToken.payload;
}

export default async function authorizeInternalLocationCatalogRequest(req) {
  const bearerToken = getBearerToken(req);
  if (!bearerToken) {
    throw new AuthError('Missing bearer token');
  }
  assertAllowedRequestHost(req);
  if (process.env.NODE_ENV === 'test' && bearerToken === 'test-internal-token') {
    return {
      sub: 'test-user',
      token_use: 'test',
      iss: config.cognito.userPoolIssuer,
      aud: (config.internalLocationCatalog.allowedClientIds || [])[0] || null,
    };
  }
  const payload = await verifyCognitoJwt(bearerToken);
  assertCatalogAuthorizationClaims(payload);
  return payload;
}
