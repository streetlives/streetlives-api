import { createHash } from 'crypto';
import config from '../config';
import memoryDriver from './photo-storage-memory';

export class PhotoStorageUnavailableError extends Error {
  constructor(message = 'Location photo storage is not configured') {
    super(message);
    this.name = 'PhotoStorageUnavailableError';
  }
}

const EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const SUPPORTED_CONTENT_TYPES = Object.keys(EXTENSIONS);

// Resolved per call rather than at import, so a test can flip the environment
// between cases without the answer being frozen by module load order.
const resolveDriverName = () => {
  const { driver, bucket } = config.locationPhotos;
  if (driver) return driver;
  return bucket ? 's3' : 'none';
};

const getDriver = () => {
  const name = resolveDriverName();

  if (name === 'memory') return memoryDriver;

  if (name === 's3') {
    /* eslint-disable global-require */
    return require('./photo-storage-s3').default;
    /* eslint-enable global-require */
  }

  return null;
};

/**
 * Both halves are required: a bucket with no public base URL would store
 * objects nobody can read.
 */
export const isConfigured = () => {
  const { bucket, publicBaseUrl, driver } = config.locationPhotos;
  if (!publicBaseUrl) return false;
  return driver === 'memory' || Boolean(bucket);
};

export const hashPhoto = buffer => createHash('sha256').update(buffer).digest('hex');

/**
 * The digest is in the key, so replacing a photo always yields a different URL
 * and the CDN never needs an invalidation. The extension comes from the
 * detected content type, never from the filename the client supplied.
 */
export const buildObjectKey = ({ locationId, sha256, contentType }) => {
  const extension = EXTENSIONS[contentType];
  if (!extension) {
    throw new Error(`Unsupported content type: ${contentType}`);
  }

  return `${config.locationPhotos.keyPrefix}/${locationId}/${sha256}.${extension}`;
};

export const buildPublicUrl = (key) => {
  const { publicBaseUrl } = config.locationPhotos;
  if (!publicBaseUrl || !key) return null;

  return `${publicBaseUrl.replace(/\/+$/, '')}/${key}`;
};

export const putPhoto = async (params) => {
  const driver = getDriver();
  if (!driver) throw new PhotoStorageUnavailableError();

  return driver.putPhoto(params);
};

/**
 * Best effort by design. A failed delete leaves an unreferenced object, which
 * is invisible; surfacing the error would fail a request whose real work has
 * already been committed.
 */
export const deletePhoto = async (key) => {
  const driver = getDriver();
  if (!driver || !key) return;

  try {
    await driver.deletePhoto(key);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`Failed to delete location photo object ${key}`, err);
  }
};

export const getBucketName = () => config.locationPhotos.bucket || 'memory';

export default {
  PhotoStorageUnavailableError,
  SUPPORTED_CONTENT_TYPES,
  isConfigured,
  hashPhoto,
  buildObjectKey,
  buildPublicUrl,
  putPhoto,
  deletePhoto,
  getBucketName,
};
