// Runs in each test file before its imports: point the app at the integration database
process.env.DATABASE_URL = process.env.INTEGRATION_DATABASE_URL;
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
delete process.env.ENABLE_TEST_AUTH;
