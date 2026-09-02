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
