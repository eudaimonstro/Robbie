import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { prisma } from '../db/prisma.js';
import { captureEmailsForTests } from '../auth/emailService.js';
import { findSession } from '../auth/sessionService.js';
import { SignInError, requestSignInCode, verifySignInCode } from '../auth/signInService.js';
import { getFullPath, storeFile } from '../bylawyer/services/fileStorage.js';
import {
  ReportError,
  preserveAttachment,
  preserveRoot,
  setSuspended,
  type PreservationManifest,
} from '../abuse/reportHandling.js';
import { resetDatabase } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { call, signIn } from './helpers.js';
import { socketAuth } from '../socket/socketAuth.js';

/** What the socket handshake answers for a session token */
async function handshake(token: string): Promise<Error | undefined> {
  let result: Error | undefined;
  const socket = { handshake: { auth: { token }, headers: {} }, data: {} };
  await socketAuth()(socket as never, (error?: Error) => {
    result = error;
  });
  return result;
}

const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');

describe('handleReport: preserving an attachment', () => {
  let f: Fixture;
  let root: string;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'robbie-preserved-'));
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  /** An uploaded file on an agenda item, recorded with its uploader */
  async function uploaded(data: Buffer) {
    const stored = await storeFile(f.packet.code, 'report me.pdf', 'application/pdf', data);
    if (!stored.success) throw new Error(stored.error);
    return prisma.attachment.create({
      data: {
        type: 'uploaded_file',
        filename: stored.file.filename,
        mimeType: stored.file.mimeType,
        sizeBytes: stored.file.sizeBytes,
        storagePath: stored.file.storagePath,
        displayName: 'Pool rules',
        agendaItemId: f.item,
        uploadedBy: f.users.secretary.email,
        uploadedAt: new Date('2026-10-01T12:00:00Z'),
      },
    });
  }

  it('copies the file with its hash, writes the manifest, then removes the row and the file', async () => {
    const data = Buffer.from('%PDF-1.4 reported');
    const attachment = await uploaded(data);
    const original = getFullPath(attachment.storagePath!);
    const now = new Date('2026-10-08T15:30:00.000Z');

    const result = await preserveAttachment(attachment.id, 'NCMEC report 123', { root, now });

    expect(path.dirname(result.folder)).toBe(root);
    const copy = path.join(result.folder, path.basename(attachment.storagePath!));
    expect(sha256(await fs.readFile(copy))).toBe(sha256(data));
    expect((await fs.stat(copy)).mode & 0o777).toBe(0o600);
    expect((await fs.stat(result.folder)).mode & 0o777).toBe(0o700);

    const manifest = JSON.parse(
      await fs.readFile(path.join(result.folder, 'manifest.json'), 'utf8'),
    ) as PreservationManifest;
    expect(manifest).toEqual(result.manifest);
    expect(manifest).toEqual({
      attachmentId: attachment.id,
      displayName: 'Pool rules',
      filename: 'report_me.pdf',
      storagePath: attachment.storagePath,
      mimeType: 'application/pdf',
      sizeBytes: data.length,
      sha256: sha256(data),
      uploadedBy: f.users.secretary.email,
      uploadedAt: '2026-10-01T12:00:00.000Z',
      organization: { id: f.orgA.id, name: 'Org A' },
      packet: { id: f.packet.id, title: expect.any(String), meetingCode: f.packet.code },
      agendaItem: { id: f.item, title: 'Reports' },
      preservedAt: '2026-10-08T15:30:00.000Z',
      keepUntil: '2027-10-08T15:30:00.000Z',
      preservedFile: path.basename(attachment.storagePath!),
      note: 'NCMEC report 123',
    });

    expect(await prisma.attachment.findUnique({ where: { id: attachment.id } })).toBeNull();
    await expect(fs.access(original)).rejects.toThrow();
    // The organization's other files stay
    expect(await prisma.attachment.findUnique({ where: { id: f.upload } })).not.toBeNull();
  });

  it('changes nothing on a dry run', async () => {
    const attachment = await uploaded(Buffer.from('%PDF-1.4 kept'));
    const result = await preserveAttachment(attachment.id, 'checking', { root, dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.manifest.organization.name).toBe('Org A');
    expect(await fs.readdir(root)).toEqual([]);
    expect(await prisma.attachment.findUnique({ where: { id: attachment.id } })).not.toBeNull();
    await expect(fs.access(getFullPath(attachment.storagePath!))).resolves.toBeUndefined();
  });

  it('still records and removes an attachment whose file is already gone', async () => {
    const attachment = await uploaded(Buffer.from('%PDF-1.4 gone'));
    await fs.rm(getFullPath(attachment.storagePath!));
    const result = await preserveAttachment(attachment.id, 'gone', { root });
    expect(result.manifest).toMatchObject({ sha256: null, preservedFile: null });
    expect(await fs.readdir(result.folder)).toEqual(['manifest.json']);
    expect(await prisma.attachment.findUnique({ where: { id: attachment.id } })).toBeNull();
  });

  it('refuses a linked document, an unknown id and a folder inside the uploads', async () => {
    await expect(preserveAttachment(f.linked, 'x', { root })).rejects.toBeInstanceOf(ReportError);
    await expect(
      preserveAttachment('00000000-0000-4000-8000-000000000000', 'x', { root }),
    ).rejects.toThrow(/No attachment/);
    const inside = path.join(path.dirname(getFullPath(f.packet.code)), 'preserved');
    await expect(preserveAttachment(f.upload, 'x', { root: inside })).rejects.toThrow(
      /outside the uploads directory/,
    );
    expect(await prisma.attachment.findUnique({ where: { id: f.upload } })).not.toBeNull();
  });

  it('defaults to PRESERVE_DIR', () => {
    expect(preserveRoot()).toBe(path.resolve(process.env.PRESERVE_DIR!));
  });
});

describe('handleReport: suspending an account', () => {
  let outbox: Array<{ to: string; code: string }>;
  beforeEach(async () => {
    await resetDatabase();
    outbox = captureEmailsForTests();
  });

  async function signInByCode(email: string) {
    await call('post', '/api/auth/request-code', { body: { email } }).expect(200);
    const code = outbox.at(-1)!.code;
    return call('post', '/api/auth/verify', { body: { email, code } });
  }

  it('ends the sessions, refuses sign-in and existing tokens, and unsuspend restores', async () => {
    const ann = await signIn('ann@example.org', { name: 'Ann' });
    const token = ann.cookie.slice('session='.length);
    // A code requested before the suspension can't be used after it
    await requestSignInCode('ann@example.org');
    const earlierCode = outbox.at(-1)!.code;

    const dry = await setSuspended('Ann@Example.org', true, { dryRun: true });
    expect(dry).toMatchObject({ unchanged: false, sessionsEnded: 1, dryRun: true });
    expect(await prisma.session.count()).toBe(1);

    const result = await setSuspended('Ann@Example.org', true);
    expect(result).toMatchObject({ email: 'ann@example.org', unchanged: false, sessionsEnded: 1 });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'ann@example.org' } });
    expect(user.suspendedAt).toBeInstanceOf(Date);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);

    // The old token is refused
    expect((await call('get', '/api/auth/me', { cookie: ann.cookie })).status).toBe(401);
    expect(await findSession(token)).toBeNull();

    // A request for a code answers as for any address, but nothing is sent
    const sent = outbox.length;
    const request = await call('post', '/api/auth/request-code', {
      body: { email: 'ann@example.org' },
    });
    expect(request.status).toBe(200);
    expect(request.body).toEqual({ success: true });
    expect(outbox.length).toBe(sent);

    // The earlier code gets a wrong code's answer
    const verify = await call('post', '/api/auth/verify', {
      body: { email: 'ann@example.org', code: earlierCode },
    });
    expect(verify.status).toBe(401);
    expect(verify.body).toEqual({ error: 'That code is wrong or has expired' });

    // Suspending again changes nothing, and a session that slipped in is still refused
    const slipped = await signIn('ann@example.org');
    expect((await call('get', '/api/auth/me', { cookie: slipped.cookie })).status).toBe(401);
    expect((await handshake(slipped.cookie.slice('session='.length)))?.message).toBe(
      'Not signed in',
    );
    expect(await setSuspended('ann@example.org', true)).toMatchObject({
      unchanged: true,
      sessionsEnded: 1,
    });

    expect(await setSuspended('ann@example.org', false)).toMatchObject({
      unchanged: false,
      suspendedAt: null,
    });
    const back = await signInByCode('ann@example.org');
    expect(back.status).toBe(200);
    expect(back.body.user).toMatchObject({ email: 'ann@example.org' });
    const restored = await signIn('ann@example.org');
    expect(await handshake(restored.cookie.slice('session='.length))).toBeUndefined();
  });

  it('refuses the test code for a suspended account', async () => {
    await signIn('ben@example.org');
    await setSuspended('ben@example.org', true);
    process.env.ENABLE_TEST_AUTH = 'true';
    try {
      await expect(verifySignInCode('ben@example.org', '000000')).rejects.toMatchObject({
        status: 401,
      });
      await expect(verifySignInCode('ben@example.org', '000000')).rejects.toBeInstanceOf(
        SignInError,
      );
    } finally {
      delete process.env.ENABLE_TEST_AUTH;
    }
  });

  it('refuses an unknown account', async () => {
    await expect(setSuspended('nobody@example.org', true)).rejects.toThrow(
      'No account for nobody@example.org',
    );
  });
});
