import os from 'os';
import path from 'path';

// Runs in each test file before its imports: point the app at the integration database
process.env.DATABASE_URL = process.env.INTEGRATION_DATABASE_URL;
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
delete process.env.ENABLE_TEST_AUTH;
// Uploaded files go to a temporary directory, not the working copy
process.env.UPLOAD_DIR = path.join(os.tmpdir(), 'robbie-integration-uploads');
