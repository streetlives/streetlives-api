import config from '../config';

let client = null;
let commands = null;

// The S3 SDK is several megabytes to parse. Requiring it lazily keeps that off
// the cold start of every other route - only the photo endpoints pay it - and
// means a function with no S3 permission and no bucket configured never loads
// it at all.
const load = () => {
  if (!commands) {
    /* eslint-disable global-require */
    const sdk = require('@aws-sdk/client-s3');
    /* eslint-enable global-require */
    commands = sdk;
  }

  if (!client) {
    client = new commands.S3Client({ region: config.locationPhotos.region });
  }

  return { client, commands };
};

export const putPhoto = async ({
  key, body, contentType, locationId, sha256,
}) => {
  const { client: s3, commands: sdk } = load();

  await s3.send(new sdk.PutObjectCommand({
    Bucket: config.locationPhotos.bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    // Safe to cache forever: the key contains a digest of the bytes, so a
    // replacement is always a different URL and never needs an invalidation.
    CacheControl: 'public, max-age=31536000, immutable',
    ContentDisposition: 'inline',
    // S3 verifies this server-side, so a corrupted upload fails the write
    // rather than reaching the CDN.
    ChecksumSHA256: Buffer.from(sha256, 'hex').toString('base64'),
    Metadata: { 'location-id': locationId },
    // No ACL: the buckets use BucketOwnerEnforced, where sending one is an error.
  }));
};

export const deletePhoto = async (key) => {
  const { client: s3, commands: sdk } = load();

  await s3.send(new sdk.DeleteObjectCommand({
    Bucket: config.locationPhotos.bucket,
    Key: key,
  }));
};

export default { putPhoto, deletePhoto };
