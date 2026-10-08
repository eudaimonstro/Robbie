import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { prisma } from '../db/prisma.js';
import { captureEmailsForTests } from '../auth/emailService.js';
import { findSession } from '../auth/sessionService.js';
import {
  SUSPENDED_ANSWER_DELAY_MS,
  SignInError,
  requestSignInCode,
  verifySignInCode,
} from '../auth/signInService.js';
import { getFullPath, storeFile } from '../bylawyer/services/fileStorage.js';
import {
  ReportError,
  preserveAttachment,
  preserveRoot,
  readManifest,
  recordReport,
  restoreAttachment,
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

    const result = await preserveAttachment(
      attachment.id,
      { kind: 'csam', note: 'NCMEC report 123' },
      { root, now },
    );

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
      keepAtLeastUntil: '2027-10-08T15:30:00.000Z',
      keepUntil: null,
      reportedAt: null,
      reportId: null,
      retention: expect.any(String),
      preservedFile: path.basename(attachment.storagePath!),
      fileMissing: false,
      kind: 'csam',
      note: 'NCMEC report 123',
      description: null,
      restoredAt: null,
      restoreNote: null,
      restoredStoragePath: null,
    });

    expect(await prisma.attachment.findUnique({ where: { id: attachment.id } })).toBeNull();
    await expect(fs.access(original)).rejects.toThrow();
    // The organization's other files stay
    expect(await prisma.attachment.findUnique({ where: { id: f.upload } })).not.toBeNull();
  });

  it('changes nothing on a dry run', async () => {
    const attachment = await uploaded(Buffer.from('%PDF-1.4 kept'));
    const result = await preserveAttachment(
      attachment.id,
      { kind: 'other', note: 'checking' },
      { root, dryRun: true },
    );
    expect(result.dryRun).toBe(true);
    expect(result.manifest.organization.name).toBe('Org A');
    expect(await fs.readdir(root)).toEqual([]);
    expect(await prisma.attachment.findUnique({ where: { id: attachment.id } })).not.toBeNull();
    await expect(fs.access(getFullPath(attachment.storagePath!))).resolves.toBeUndefined();
  });

  it('refuses an attachment whose file is gone, unless told the file may be missing', async () => {
    const attachment = await uploaded(Buffer.from('%PDF-1.4 gone'));
    await fs.rm(getFullPath(attachment.storagePath!));
    await expect(
      preserveAttachment(attachment.id, { kind: 'other', note: 'gone' }, { root }),
    ).rejects.toThrow(/missing.*--missing-ok/s);
    expect(await fs.readdir(root)).toEqual([]);
    expect(await prisma.attachment.findUnique({ where: { id: attachment.id } })).not.toBeNull();

    const result = await preserveAttachment(
      attachment.id,
      { kind: 'other', note: 'gone' },
      { root, missingOk: true },
    );
    expect(result.manifest).toMatchObject({ sha256: null, preservedFile: null, fileMissing: true });
    expect(await fs.readdir(result.folder)).toEqual(['manifest.json']);
    expect(await prisma.attachment.findUnique({ where: { id: attachment.id } })).toBeNull();
  });

  it('treats only a missing file as gone: another error stops it, changing nothing', async () => {
    const attachment = await uploaded(Buffer.from('%PDF-1.4 locked'));
    const meetingDir = path.dirname(getFullPath(attachment.storagePath!));
    await fs.chmod(meetingDir, 0o000);
    try {
      await expect(
        preserveAttachment(attachment.id, { kind: 'other', note: 'x' }, { root, missingOk: true }),
      ).rejects.toMatchObject({ code: 'EACCES' });
    } finally {
      await fs.chmod(meetingDir, 0o755);
    }
    expect(await fs.readdir(root)).toEqual([]);
    expect(await prisma.attachment.findUnique({ where: { id: attachment.id } })).not.toBeNull();
  });

  it('refuses a stored path that is not a regular file', async () => {
    const attachment = await uploaded(Buffer.from('%PDF-1.4 link'));
    const original = getFullPath(attachment.storagePath!);
    await fs.rm(original);
    await fs.symlink('/etc/hostname', original);
    try {
      await expect(
        preserveAttachment(attachment.id, { kind: 'other', note: 'x' }, { root }),
      ).rejects.toThrow(/not a regular file/);
    } finally {
      await fs.rm(original);
    }
    expect(await fs.readdir(root)).toEqual([]);
  });

  it('deletes the original before the record, and a run after a failed delete finishes', async () => {
    const data = Buffer.from('%PDF-1.4 stuck');
    const attachment = await uploaded(data);
    const original = getFullPath(attachment.storagePath!);
    const meetingDir = path.dirname(original);

    // The original can't be deleted: the record stays with it, and the copy is kept
    await fs.chmod(meetingDir, 0o555);
    try {
      await expect(
        preserveAttachment(attachment.id, { kind: 'other', note: 'x' }, { root }),
      ).rejects.toThrow(/couldn't be deleted.*run the same command again/is);
    } finally {
      await fs.chmod(meetingDir, 0o755);
    }
    expect(await prisma.attachment.findUnique({ where: { id: attachment.id } })).not.toBeNull();
    await expect(fs.access(original)).resolves.toBeUndefined();
    const [folder] = await fs.readdir(root);

    // Again: the earlier copy is used, not a second one
    const again = await preserveAttachment(attachment.id, { kind: 'other', note: 'x' }, { root });
    expect(again.resumed).toBe(true);
    expect(again.folder).toBe(path.join(root, folder));
    expect(await fs.readdir(root)).toEqual([folder]);
    expect(await prisma.attachment.findUnique({ where: { id: attachment.id } })).toBeNull();
    await expect(fs.access(original)).rejects.toThrow();
  });

  it('finishes a removal whose record survived the file', async () => {
    const attachment = await uploaded(Buffer.from('%PDF-1.4 half'));
    const first = await preserveAttachment(attachment.id, { kind: 'other', note: 'x' }, { root });
    // As if deleting the record had failed after the file went
    const { id, ...row } = attachment;
    await prisma.attachment.create({ data: { id, ...row } });

    const again = await preserveAttachment(attachment.id, { kind: 'other', note: 'x' }, { root });
    expect(again).toMatchObject({ resumed: true, folder: first.folder });
    expect(await fs.readdir(root)).toEqual([path.basename(first.folder)]);
    expect(await prisma.attachment.findUnique({ where: { id: attachment.id } })).toBeNull();
  });

  it('refuses a linked document, an unknown id and a folder inside the uploads', async () => {
    await expect(
      preserveAttachment(f.linked, { kind: 'other', note: 'x' }, { root }),
    ).rejects.toBeInstanceOf(ReportError);
    await expect(
      preserveAttachment(
        '00000000-0000-4000-8000-000000000000',
        { kind: 'other', note: 'x' },
        { root },
      ),
    ).rejects.toThrow(/No attachment/);
    const inside = path.join(path.dirname(getFullPath(f.packet.code)), 'preserved');
    await expect(
      preserveAttachment(f.upload, { kind: 'other', note: 'x' }, { root: inside }),
    ).rejects.toThrow(/outside the uploads directory/);
    expect(await prisma.attachment.findUnique({ where: { id: f.upload } })).not.toBeNull();
  });

  it('records the CyberTipline report, and keeps the folder a year from it', async () => {
    const attachment = await uploaded(Buffer.from('%PDF-1.4 reported'));
    const now = new Date('2026-10-08T15:30:00.000Z');
    const { folder, manifest } = await preserveAttachment(
      attachment.id,
      { kind: 'csam', note: 'CSAM report' },
      {
        root,
        now,
      },
    );

    const reportedAt = new Date('2026-10-09T14:00:00.000Z');
    const dry = await recordReport(path.basename(folder), reportedAt, '1234567', {
      root,
      dryRun: true,
      now: reportedAt,
    });
    expect(dry.manifest.keepUntil).toBe('2027-10-09T14:00:00.000Z');
    expect(await readManifest(folder)).toEqual(manifest);

    const result = await recordReport(folder, reportedAt, '1234567', { root, now: reportedAt });
    expect(result.previous).toBeNull();
    expect(await readManifest(folder)).toEqual({
      ...manifest,
      reportedAt: '2026-10-09T14:00:00.000Z',
      reportId: '1234567',
      keepUntil: '2027-10-09T14:00:00.000Z',
    });
    // Replaced in one rename: no temporary file is left, and the copy is untouched
    expect((await fs.readdir(folder)).sort()).toEqual(
      ['manifest.json', manifest.preservedFile!].sort(),
    );
    expect(((await fs.stat(path.join(folder, 'manifest.json'))).mode & 0o777).toString(8)).toBe(
      '600',
    );

    // A correction says what it replaced
    const corrected = await recordReport(folder, reportedAt, '7654321', { root, now: reportedAt });
    expect(corrected.previous).toEqual({
      reportId: '1234567',
      reportedAt: reportedAt.toISOString(),
    });
  });

  it('refuses a report in the future, or a folder outside the preserved files', async () => {
    const attachment = await uploaded(Buffer.from('%PDF-1.4 x'));
    const { folder } = await preserveAttachment(
      attachment.id,
      { kind: 'other', note: 'x' },
      { root },
    );
    const now = new Date('2026-10-09T00:00:00Z');
    await expect(
      recordReport(folder, new Date('2026-10-10T00:00:00Z'), '1', { root, now }),
    ).rejects.toThrow(/in the future/);
    await expect(recordReport('../elsewhere', now, '1', { root, now })).rejects.toThrow(
      /not a folder in/,
    );
    await expect(recordReport('nothing-here', now, '1', { root, now })).rejects.toThrow(
      /No manifest/,
    );
  });

  it('restores a file removed after a copyright notice, under a new name', async () => {
    const data = Buffer.from('%PDF-1.4 disputed');
    const attachment = await uploaded(data);
    await prisma.attachment.update({
      where: { id: attachment.id },
      data: { description: 'The 2026 rules' },
    });
    const { folder, manifest } = await preserveAttachment(
      attachment.id,
      { kind: 'copyright', note: 'DMCA notice from Acme, 2026-10-08' },
      { root },
    );
    expect(manifest).toMatchObject({ kind: 'copyright', description: 'The 2026 rules' });

    const now = new Date('2026-10-22T16:00:00.000Z');
    const dry = await restoreAttachment(path.basename(folder), 'Counter-notice 1', {
      root,
      dryRun: true,
      now,
    });
    expect(dry.dryRun).toBe(true);
    expect(await prisma.attachment.findUnique({ where: { id: attachment.id } })).toBeNull();

    const result = await restoreAttachment(folder, 'Counter-notice 1', { root, now });
    const restored = await prisma.attachment.findUniqueOrThrow({ where: { id: attachment.id } });
    expect(restored).toMatchObject({
      type: 'uploaded_file',
      displayName: 'Pool rules',
      description: 'The 2026 rules',
      filename: 'report_me.pdf',
      mimeType: 'application/pdf',
      sizeBytes: data.length,
      agendaItemId: f.item,
      meetingPacketId: null,
      uploadedBy: f.users.secretary.email,
    });
    // A new name, chosen by the server, in the meeting's folder
    expect(restored.storagePath).not.toBe(attachment.storagePath);
    expect(restored.storagePath).toMatch(new RegExp(`^${f.packet.code}/[0-9a-f-]{36}\\.pdf$`));
    expect(sha256(await fs.readFile(getFullPath(restored.storagePath!)))).toBe(sha256(data));

    // The manifest says so, and the preserved copy stays
    expect(await readManifest(folder)).toEqual({
      ...manifest,
      restoredAt: '2026-10-22T16:00:00.000Z',
      restoreNote: 'Counter-notice 1',
      restoredStoragePath: restored.storagePath,
    });
    expect(result.manifest.restoredAt).toBe('2026-10-22T16:00:00.000Z');
    await expect(fs.access(path.join(folder, manifest.preservedFile!))).resolves.toBeUndefined();

    // Members can download it again
    const download = await call('get', `/api/attachments/${attachment.id}/download`, {
      cookie: f.users.viewer.cookie,
    });
    expect(download.status).toBe(200);

    await expect(restoreAttachment(folder, 'again', { root })).rejects.toThrow(/already restored/);
  });

  it('never restores what is marked as child sexual abuse material', async () => {
    const preserve = async (kind: 'csam' | 'other', note: string) =>
      (await preserveAttachment((await uploaded(Buffer.from(note))).id, { kind, note }, { root }))
        .folder;

    const csam = await preserve('csam', 'Report from a member');
    await expect(restoreAttachment(csam, 'x', { root })).rejects.toThrow(/CSAM.*never restored/s);

    const byNote = await preserve('other', 'NCMEC CyberTipline report pending');
    await expect(restoreAttachment(byNote, 'x', { root })).rejects.toThrow(/never restored/);

    const reported = await preserve('other', 'odd file');
    await recordReport(reported, new Date(), '99', { root });
    await expect(restoreAttachment(reported, 'x', { root })).rejects.toThrow(/never restored/);

    // A manifest from before --kind can't be told apart
    const old = await preserve('other', 'from before');
    const { kind: _kind, ...withoutKind } = await readManifest(old);
    await fs.writeFile(path.join(old, 'manifest.json'), JSON.stringify(withoutKind));
    await expect(restoreAttachment(old, 'x', { root })).rejects.toThrow(/no --kind/);
    expect(await prisma.attachment.count({ where: { displayName: 'Pool rules' } })).toBe(0);
  });

  it('refuses to restore where the agenda item is gone, or from a changed copy', async () => {
    const first = await preserveAttachment(
      (await uploaded(Buffer.from('%PDF-1.4 one'))).id,
      { kind: 'copyright', note: 'x' },
      { root },
    );
    const second = await preserveAttachment(
      (await uploaded(Buffer.from('%PDF-1.4 two'))).id,
      { kind: 'copyright', note: 'x' },
      { root },
    );
    await fs.chmod(path.join(second.folder, second.manifest.preservedFile!), 0o600);
    await fs.appendFile(path.join(second.folder, second.manifest.preservedFile!), 'tampered');
    await expect(restoreAttachment(second.folder, 'x', { root })).rejects.toThrow(
      /doesn't match its manifest/,
    );

    await prisma.meetingAgendaItem.delete({ where: { id: f.item } });
    await expect(restoreAttachment(first.folder, 'x', { root })).rejects.toThrow(
      /agenda item .*Reports.* no longer exists/,
    );
    expect((await readManifest(first.folder)).restoredAt).toBeNull();
    // Nothing was copied back
    expect(await prisma.attachment.count({ where: { displayName: 'Pool rules' } })).toBe(0);
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

  it("answers a suspended account's code request in about a send's time", async () => {
    await signIn('ann@example.org');
    await setSuspended('ann@example.org', true);
    const started = Date.now();
    await requestSignInCode('ann@example.org');
    expect(Date.now() - started).toBeGreaterThanOrEqual(SUSPENDED_ANSWER_DELAY_MS.min - 5);
    expect(outbox).toEqual([]);
  });

  it('answers a suspended account as a failed send when sending fails', async () => {
    await signIn('ann@example.org');
    await setSuspended('ann@example.org', true);
    const failed = { status: 502, message: "We couldn't send the email. Try again." };

    // Production without an email provider can't send to anyone
    process.env.NODE_ENV = 'production';
    try {
      await expect(requestSignInCode('bob@example.org')).rejects.toMatchObject(failed);
      await expect(requestSignInCode('ann@example.org')).rejects.toMatchObject(failed);
    } finally {
      process.env.NODE_ENV = 'test';
    }
    // The provider's last send failed: so does the suspended account's, until one succeeds
    await expect(requestSignInCode('ann@example.org')).rejects.toMatchObject(failed);
    await requestSignInCode('carol@example.org');
    await expect(requestSignInCode('ann@example.org')).resolves.toBeUndefined();
    expect(outbox.map((m) => m.to)).toEqual(['carol@example.org']);
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
