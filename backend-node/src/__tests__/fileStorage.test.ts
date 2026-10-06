import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

// Point the store at a fresh directory before the module reads UPLOAD_DIR
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'robbie-uploads-'));
const uploads = path.join(root, 'uploads');
process.env.UPLOAD_DIR = uploads;
const storage = await import('../bylawyer/services/fileStorage.js');

const pdf = Buffer.from('%PDF-1.4 test');

describe('file storage paths', () => {
  beforeAll(async () => {
    await fs.mkdir(uploads, { recursive: true });
    await fs.writeFile(path.join(root, 'outside.txt'), 'keep me');
  });

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('stores a file under the meeting code', async () => {
    const result = await storage.storeFile('ABC123', 'agenda.pdf', 'application/pdf', pdf);
    expect(result.success).toBe(true);
    if (result.success) expect(result.file.storagePath.startsWith('ABC123')).toBe(true);
  });

  it('refuses a meeting code that would leave the uploads directory', async () => {
    for (const code of ['..', '../x', '/etc', 'a/b']) {
      const result = await storage.storeFile(code, 'agenda.pdf', 'application/pdf', pdf);
      expect(result.success).toBe(false);
    }
  });

  it('refuses to read, resolve or delete a path outside the uploads directory', async () => {
    await expect(storage.readFile('../outside.txt')).rejects.toThrow(/outside/);
    expect(() => storage.getFullPath('../outside.txt')).toThrow(/outside/);
    await expect(storage.deleteFile('../outside.txt')).rejects.toThrow(/outside/);
    expect(await fs.readFile(path.join(root, 'outside.txt'), 'utf8')).toBe('keep me');
  });

  it('never removes anything outside the uploads directory when cleaning up', async () => {
    await storage.cleanupMeetingFiles('..');
    expect(await fs.readFile(path.join(root, 'outside.txt'), 'utf8')).toBe('keep me');
  });
});
