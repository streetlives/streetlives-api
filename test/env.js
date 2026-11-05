process.env.DATABASE_NAME = process.env.DATABASE_NAME || 'test';
process.env.DATABASE_USER = process.env.DATABASE_USER || 'streetlives';
process.env.DATABASE_PASSWORD = process.env.DATABASE_PASSWORD || 'password';
process.env.DATABASE_HOST = process.env.DATABASE_HOST || 'localhost';
process.env.DATABASE_PORT = process.env.DATABASE_PORT || '5432';
process.env.DATABASE_LOGGING = process.env.DATABASE_LOGGING || 'false';
// The production default of 1 (RDS Proxy pinning avoidance) would serialize
// requests at the pool level and mask races between concurrent transactions.
process.env.DATABASE_POOL_MAX = process.env.DATABASE_POOL_MAX || '5';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key-placeholder';
// Photo uploads go to an in-process fake rather than S3, so the suite needs no
// AWS credentials and no network. It is a real driver module, not a jest mock,
// so the controller path under test is the one production runs.
process.env.LOCATION_PHOTO_STORAGE_DRIVER =
  process.env.LOCATION_PHOTO_STORAGE_DRIVER || 'memory';
process.env.LOCATION_PHOTO_PUBLIC_BASE_URL =
  process.env.LOCATION_PHOTO_PUBLIC_BASE_URL || 'https://photos.test.invalid';
