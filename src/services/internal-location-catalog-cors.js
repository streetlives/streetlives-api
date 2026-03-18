import cors from 'cors';
import config from '../config';

export const exposedHeaders = [
  'Pagination-Count',
  'Total-Count',
  'Page-Number',
  'Page-Size',
  'Has-More',
  'Next-Page',
];

function normalizeHost(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '');
}

function normalizeOriginPattern(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\/$/, '');
}

function extractRequestOrigin(value) {
  if (!value) return null;
  const rawValue = String(value).trim();
  if (!rawValue) return null;
  if (rawValue.toLowerCase() === 'null') return 'null';
  try {
    const parsedUrl = new URL(rawValue);
    if (!parsedUrl.protocol || !parsedUrl.host) {
      return null;
    }
    return `${parsedUrl.protocol}//${parsedUrl.host}`.toLowerCase();
  } catch (error) {
    return normalizeOriginPattern(rawValue);
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

function isAllowedOrigin(origin, allowedOriginPatterns) {
  return allowedOriginPatterns.some((allowedOriginPattern) => {
    const normalizedAllowedOriginPattern = normalizeOriginPattern(allowedOriginPattern);
    if (!normalizedAllowedOriginPattern) return false;
    if (normalizedAllowedOriginPattern.endsWith('*')) {
      return origin.startsWith(normalizedAllowedOriginPattern.slice(0, -1));
    }
    return origin === normalizedAllowedOriginPattern;
  });
}

// Browser origin allowlists are only used for CORS responses.
export function isAllowedInternalLocationCatalogOrigin(value) {
  const allowedHosts = config.internalLocationCatalog.allowedOriginHosts || [];
  const allowedOriginPatterns = config.internalLocationCatalog.allowedOriginPatterns || [];
  if (!allowedHosts.length && !allowedOriginPatterns.length) return true;

  const requestOrigin = extractRequestOrigin(value);
  if (!requestOrigin) return false;

  try {
    const parsedOrigin = new URL(requestOrigin);
    if (['http:', 'https:'].includes(parsedOrigin.protocol)) {
      return isAllowedHost(parsedOrigin.hostname, allowedHosts)
        || isAllowedOrigin(requestOrigin, allowedOriginPatterns);
    }
  } catch (error) {
    return isAllowedOrigin(requestOrigin, allowedOriginPatterns);
  }

  return isAllowedOrigin(requestOrigin, allowedOriginPatterns);
}

export const publicApiCors = cors({ exposedHeaders });

export const internalLocationCatalogCors = cors({
  exposedHeaders,
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }
    callback(null, isAllowedInternalLocationCatalogOrigin(origin));
  },
});
