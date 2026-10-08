import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';
import {
  buildManifest,
  parseReportArgs,
  preserveRoot,
  sha256OfFile,
  type AttachmentRecord,
} from '../abuse/reportHandling.js';

const ID = '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b';

describe('parseReportArgs', () => {
  it('reads an attachment with its note, and a dry run', () => {
    expect(parseReportArgs(['--attachment', ID, '--note', ' NCMEC report 42 '])).toEqual({
      command: {
        kind: 'attachment',
        attachmentId: ID,
        note: 'NCMEC report 42',
        dryRun: false,
        missingOk: false,
      },
    });
    expect(
      parseReportArgs(['--attachment', ID.toUpperCase(), '--note', 'x', '--dry-run']).command,
    ).toEqual({ kind: 'attachment', attachmentId: ID, note: 'x', dryRun: true, missingOk: false });
  });

  it('reads --missing-ok with an attachment only', () => {
    expect(
      parseReportArgs(['--attachment', ID, '--note', 'x', '--missing-ok']).command,
    ).toMatchObject({ missingOk: true });
    expect(parseReportArgs(['--attachment', ID, '--note', 'x']).command).toMatchObject({
      missingOk: false,
    });
    expect(parseReportArgs(['--suspend', 'a@b.org', '--missing-ok']).error).toBe(
      '--missing-ok goes with --attachment only',
    );
  });

  it('reads a suspension and its reversal, with the email normalized', () => {
    expect(parseReportArgs(['--suspend', ' Ann@Example.ORG '])).toEqual({
      command: { kind: 'suspend', email: 'ann@example.org', dryRun: false },
    });
    expect(parseReportArgs(['--unsuspend', 'ann@example.org', '--dry-run']).command).toEqual({
      kind: 'unsuspend',
      email: 'ann@example.org',
      dryRun: true,
    });
  });

  it('wants exactly one action', () => {
    const one = 'Give exactly one of --attachment, --suspend and --unsuspend';
    expect(parseReportArgs([]).error).toBe(one);
    expect(parseReportArgs(['--dry-run']).error).toBe(one);
    expect(parseReportArgs(['--suspend', 'a@b.org', '--unsuspend', 'a@b.org']).error).toBe(one);
    expect(parseReportArgs(['--attachment', ID, '--suspend', 'a@b.org']).error).toBe(one);
  });

  it('refuses a bad id, a missing note, a stray note and a bad email', () => {
    expect(parseReportArgs(['--attachment', '../etc', '--note', 'x']).error).toMatch(/UUID/);
    expect(parseReportArgs(['--attachment', ID]).error).toMatch(/--note is required/);
    expect(parseReportArgs(['--attachment', ID, '--note', '  ']).error).toMatch(/--note/);
    expect(parseReportArgs(['--suspend', 'a@b.org', '--note', 'x']).error).toBe(
      '--note goes with --attachment only',
    );
    expect(parseReportArgs(['--suspend', 'not-an-email']).error).toBe(
      'Not an email address: not-an-email',
    );
  });

  it('refuses unknown options and stray words', () => {
    expect(parseReportArgs(['--delete', ID]).error).toMatch(/Unknown option/);
    expect(parseReportArgs(['--suspend', 'a@b.org', 'extra']).error).toMatch(/positional/i);
  });
});

const organization = { id: 'org-1', name: 'Maple Grove HOA' };
const packet = { id: 'packet-1', title: 'Annual meeting', robbieCode: 'MAPLE1', organization };

function attachment(overrides: Partial<AttachmentRecord> = {}): AttachmentRecord {
  return {
    id: ID,
    type: 'uploaded_file',
    displayName: 'Budget',
    filename: 'budget.pdf',
    storagePath: `MAPLE1/${ID}.pdf`,
    mimeType: 'application/pdf',
    sizeBytes: 1234,
    uploadedBy: 'pat@example.org',
    uploadedAt: new Date('2026-10-01T12:00:00Z'),
    meetingPacket: packet,
    agendaItem: null,
    ...overrides,
  };
}

describe('buildManifest', () => {
  const details = {
    sha256: 'ab'.repeat(32),
    preservedFile: `${ID}.pdf`,
    preservedAt: new Date('2028-02-29T10:00:00Z'),
    note: 'Report 7',
  };

  it('records the file, where it was, who uploaded it, and how long to keep it', () => {
    expect(buildManifest(attachment(), details)).toEqual({
      attachmentId: ID,
      displayName: 'Budget',
      filename: 'budget.pdf',
      storagePath: `MAPLE1/${ID}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: 1234,
      sha256: 'ab'.repeat(32),
      uploadedBy: 'pat@example.org',
      uploadedAt: '2026-10-01T12:00:00.000Z',
      organization: { id: 'org-1', name: 'Maple Grove HOA' },
      packet: { id: 'packet-1', title: 'Annual meeting', meetingCode: 'MAPLE1' },
      agendaItem: null,
      preservedAt: '2028-02-29T10:00:00.000Z',
      // One year on from a 29 February
      keepUntil: '2029-03-01T10:00:00.000Z',
      preservedFile: `${ID}.pdf`,
      fileMissing: false,
      note: 'Report 7',
    });
  });

  it('names the agenda item and its packet for a file on an item', () => {
    const manifest = buildManifest(
      attachment({ meetingPacket: null, agendaItem: { id: 'item-1', title: 'Pool', packet } }),
      details,
    );
    expect(manifest.agendaItem).toEqual({ id: 'item-1', title: 'Pool' });
    expect(manifest.packet).toEqual({
      id: 'packet-1',
      title: 'Annual meeting',
      meetingCode: 'MAPLE1',
    });
  });
});

describe('preserved files', () => {
  let dir: string;
  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'robbie-report-'));
  });
  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('hashes a file as bytes', async () => {
    const data = Buffer.from([0, 255, 1, 2, 3]);
    const file = path.join(dir, 'f.bin');
    await fs.writeFile(file, data);
    expect(await sha256OfFile(file)).toBe(createHash('sha256').update(data).digest('hex'));
  });

  it('go to PRESERVE_DIR, else beside the uploads', () => {
    expect(preserveRoot({ PRESERVE_DIR: '/data/preserved' })).toBe('/data/preserved');
    const uploads = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'));
    expect(preserveRoot({})).toBe(path.join(path.dirname(uploads), 'preserved'));
  });
});
