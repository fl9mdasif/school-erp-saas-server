// Runs before every test file. Environment must be set before any app module imports env.ts.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_MONGO_URI ?? 'mongodb://127.0.0.1:27017/test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-0123456789abcdef';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-0123456789abcdef';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.SUPER_ADMIN_EMAIL = 'owner@test.local';
process.env.SUPER_ADMIN_PASS = 'OwnerPass123!';
process.env.CORS_ORIGINS = 'http://localhost:3000';
