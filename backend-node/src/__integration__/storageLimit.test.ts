import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import { prisma } from '../db/prisma.js';
import { getFullPath } from '../bylawyer/services/fileStorage.js';
import { resetDatabase } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { call } from './helpers.js';

const MB = 1024 * 1024;

function upload(f: Fixture, size: number, target = `packetId=${f.packet.id}`) {
  return call('post', `/api/attachments/upload?${target}`, {
    cookie: f.users.secretary.cookie,
    headers: {
      'Content-Type': 'text/plain',
      'X-Filename': 'big.txt',
      'X-Robbie-Code': f.packet.code,
    },
    body: Buffer.alloc(size, 'a'),
  });
}

/** A record of a file of this size on an agenda item (no file on disk: only the size counts) */
function fillWith(f: Fixture, sizeBytes: number) {
  return prisma.attachment.create({
    data: {
      type: 'uploaded_file',
      displayName: 'Archive',
      sizeBytes,
      agendaItemId: f.item,
      storagePath: null,
    },
  });
}

/** The files stored under a meeting code */
async function filesUnder(code: string): Promise<string[]> {
  return fs.readdir(getFullPath(code)).catch(() => []);
}

describe('organization storage limit', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });
  afterEach(() => {
    delete process.env.ORG_STORAGE_LIMIT_MB;
  });

  it("refuses an upload past the organization's 500 MB with 413 and says why", async () => {
    // The fixture's 7-byte file on the packet, and this on an agenda item, leave 10 bytes
    await fillWith(f, 500 * MB - 7 - 10);
    const before = await filesUnder(f.packet.code);

    const refused = await upload(f, 11);
    expect(refused.status).toBe(413);
    expect(refused.body).toEqual({
      error:
        'This organization has used its 500 MB of storage for files. Remove some files to add more.',
    });
    // Neither a record nor a file is left
    expect(await prisma.attachment.count({ where: { displayName: 'big.txt' } })).toBe(0);
    expect(await filesUnder(f.packet.code)).toEqual(before);

    // Up to the limit itself is fine
    expect((await upload(f, 10, `agendaItemId=${f.item}`)).status).toBe(201);
  });

  it('refuses a full organization before writing the file', async () => {
    await fillWith(f, 500 * MB - 7);
    // A meeting folder that can't be written to: storing the file would fail with a 500
    const meetingDir = getFullPath(f.packet.code);
    await fs.chmod(meetingDir, 0o555);
    try {
      expect((await upload(f, 10)).status).toBe(413);
    } finally {
      await fs.chmod(meetingDir, 0o755);
    }
  });

  it('lets only one of two uploads at once take the last of the space', async () => {
    await fillWith(f, 500 * MB - 7 - 10);
    const before = await filesUnder(f.packet.code);

    const results = await Promise.all([upload(f, 8), upload(f, 8)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 413]);
    expect(await prisma.attachment.count({ where: { displayName: 'big.txt' } })).toBe(1);
    // The refused upload's file is gone too
    expect((await filesUnder(f.packet.code)).length).toBe(before.length + 1);
  });

  it('deletes the stored file when recording it fails', async () => {
    const before = await filesUnder(f.packet.code);
    const failing = vi.spyOn(prisma, '$transaction').mockRejectedValueOnce(new Error('down'));
    try {
      const res = await upload(f, 100);
      expect(res.status).toBe(500);
    } finally {
      failing.mockRestore();
    }
    expect(await filesUnder(f.packet.code)).toEqual(before);
  });

  it("counts only the organization's own files", async () => {
    await prisma.attachment.create({
      data: {
        type: 'uploaded_file',
        displayName: 'Elsewhere',
        sizeBytes: 500 * MB,
        meetingPacketId: f.packetB.id,
      },
    });
    expect((await upload(f, 1000)).status).toBe(201);
  });

  it('takes its limit from ORG_STORAGE_LIMIT_MB, and records who uploaded', async () => {
    process.env.ORG_STORAGE_LIMIT_MB = '1';
    const first = await upload(f, 600 * 1024);
    expect(first.status).toBe(201);
    // Recorded for a report about the file, and never sent
    const stored = await prisma.attachment.findUniqueOrThrow({ where: { id: first.body.id } });
    expect(stored.uploadedBy).toBe(f.users.secretary.email);
    expect(first.body).not.toHaveProperty('uploadedBy');
    expect(first.body).not.toHaveProperty('storagePath');

    const second = await upload(f, 600 * 1024);
    expect(second.status).toBe(413);
    expect(second.body.error).toMatch(/used its 1 MB of storage/);

    // A removed file frees its space
    await call('delete', `/api/attachments/${first.body.id}`, { cookie: f.users.secretary.cookie });
    expect((await upload(f, 600 * 1024)).status).toBe(201);
  });
});
