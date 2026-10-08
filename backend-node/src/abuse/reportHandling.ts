/**
 * What the operator's handleReport script does (docs/deploy.md, "Handling a report"): preserve
 * and remove a reported file, and suspend or restore an account. The script
 * (src/scripts/handleReport.ts) only parses its arguments and prints.
 *
 * Reported material is never opened, printed or served: the file is hashed and copied as bytes.
 */

import { createHash } from 'node:crypto';
import { createReadStream, constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { prisma } from '../db/prisma.js';
// Not from signInService, which would start the email service in the script
import { normalizeEmail } from '../auth/normalizeEmail.js';
import { deleteFile, getFullPath, uploadRoot } from '../bylawyer/services/fileStorage.js';

export const USAGE = `Usage (from backend-node, or /app/backend-node in the image):
  node dist/scripts/handleReport.js --attachment <id> --note <text> [--missing-ok] [--dry-run]
      Preserve an uploaded file and its record in PRESERVE_DIR, then remove it from Robbie
      (--missing-ok: remove the record even if its file is already gone from disk)
  node dist/scripts/handleReport.js --suspend <email> [--dry-run]
      Suspend the account: no sign-in, every session ended
  node dist/scripts/handleReport.js --unsuspend <email> [--dry-run]
      Lift a suspension`;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ReportCommand =
  | {
      kind: 'attachment';
      attachmentId: string;
      note: string;
      dryRun: boolean;
      missingOk: boolean;
    }
  | { kind: 'suspend' | 'unsuspend'; email: string; dryRun: boolean };

/** The script's arguments as one command, or why they aren't one */
export function parseReportArgs(
  args: string[],
): { command: ReportCommand; error?: undefined } | { command?: undefined; error: string } {
  let values;
  try {
    ({ values } = parseArgs({
      args,
      strict: true,
      allowPositionals: false,
      options: {
        attachment: { type: 'string' },
        suspend: { type: 'string' },
        unsuspend: { type: 'string' },
        note: { type: 'string' },
        'missing-ok': { type: 'boolean', default: false },
        'dry-run': { type: 'boolean', default: false },
      },
    }));
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  const dryRun = values['dry-run'] ?? false;
  const chosen = (['attachment', 'suspend', 'unsuspend'] as const).filter(
    (name) => values[name] !== undefined,
  );
  if (chosen.length !== 1) {
    return { error: 'Give exactly one of --attachment, --suspend and --unsuspend' };
  }

  if (chosen[0] === 'attachment') {
    const attachmentId = values.attachment!.trim();
    if (!UUID_PATTERN.test(attachmentId)) {
      return { error: 'The attachment id is a UUID, as in /api/attachments/<id>/download' };
    }
    const note = values.note?.trim() ?? '';
    if (!note) {
      return { error: '--note is required with --attachment: why it is removed (the report)' };
    }
    const missingOk = values['missing-ok'] ?? false;
    return {
      command: {
        kind: 'attachment',
        attachmentId: attachmentId.toLowerCase(),
        note,
        dryRun,
        missingOk,
      },
    };
  }

  if (values.note !== undefined) {
    return { error: '--note goes with --attachment only' };
  }
  if (values['missing-ok']) {
    return { error: '--missing-ok goes with --attachment only' };
  }
  const email = normalizeEmail(values[chosen[0]]!);
  if (!EMAIL_PATTERN.test(email)) {
    return { error: `Not an email address: ${values[chosen[0]]}` };
  }
  return { command: { kind: chosen[0], email, dryRun } };
}

/**
 * Where preserved files go: PRESERVE_DIR, else a "preserved" folder beside the uploads directory
 * (/data/preserved in the image). The app never serves it.
 */
export function preserveRoot(env: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(env.PRESERVE_DIR || path.join(path.dirname(uploadRoot()), 'preserved'));
}

/** The record kept beside a preserved file, as manifest.json */
export interface PreservationManifest {
  attachmentId: string;
  displayName: string;
  /** The uploader's file name, as stored (sanitized) */
  filename: string | null;
  /** Where the file was in the uploads directory */
  storagePath: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  /** SHA-256 of the file, hex; null when the file was already gone from disk (fileMissing) */
  sha256: string | null;
  /** The uploader's email, as recorded at upload (null for files uploaded before it was) */
  uploadedBy: string | null;
  uploadedAt: string;
  organization: { id: string; name: string };
  packet: { id: string; title: string | null; meetingCode: string };
  /** The agenda item the file was on, if it wasn't on the packet itself */
  agendaItem: { id: string; title: string } | null;
  preservedAt: string;
  /** Keep the file and this record at least until then (18 U.S.C. 2258A(h), one year) */
  keepUntil: string;
  /** The preserved copy's name in this folder; null when the file was already gone */
  preservedFile: string | null;
  /** The file was gone from disk when its record was removed (--missing-ok) */
  fileMissing: boolean;
  note: string;
}

/** The attachment as preserveAttachment reads it */
export interface AttachmentRecord {
  id: string;
  type: string;
  displayName: string;
  filename: string | null;
  storagePath: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedBy: string | null;
  uploadedAt: Date;
  meetingPacket: PacketRecord | null;
  agendaItem: { id: string; title: string; packet: PacketRecord } | null;
}

interface PacketRecord {
  id: string;
  title: string | null;
  robbieCode: string;
  organization: { id: string; name: string };
}

/** One year after a date, by the calendar (a 29 February becomes 1 March) */
function oneYearAfter(date: Date): Date {
  const later = new Date(date);
  later.setUTCFullYear(later.getUTCFullYear() + 1);
  return later;
}

export function buildManifest(
  attachment: AttachmentRecord,
  details: { sha256: string | null; preservedFile: string | null; preservedAt: Date; note: string },
): PreservationManifest {
  const packet = attachment.meetingPacket ?? attachment.agendaItem?.packet;
  if (!packet) throw new Error(`Attachment ${attachment.id} is on no packet`);
  return {
    attachmentId: attachment.id,
    displayName: attachment.displayName,
    filename: attachment.filename,
    storagePath: attachment.storagePath,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    sha256: details.sha256,
    uploadedBy: attachment.uploadedBy,
    uploadedAt: attachment.uploadedAt.toISOString(),
    organization: { id: packet.organization.id, name: packet.organization.name },
    packet: { id: packet.id, title: packet.title, meetingCode: packet.robbieCode },
    agendaItem: attachment.meetingPacket
      ? null
      : { id: attachment.agendaItem!.id, title: attachment.agendaItem!.title },
    preservedAt: details.preservedAt.toISOString(),
    keepUntil: oneYearAfter(details.preservedAt).toISOString(),
    preservedFile: details.preservedFile,
    fileMissing: details.sha256 === null,
    note: details.note,
  };
}

/** SHA-256 of a file, hex, read as a stream of bytes */
export async function sha256OfFile(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

export class ReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReportError';
  }
}

/**
 * Whether a stored file is on disk. Only ENOENT means it is gone: any other error (EACCES,
 * ELOOP, ENOTDIR) is thrown, and anything but a regular file (a symbolic link, a folder) is
 * refused, so a file is never taken for gone, or followed elsewhere, by mistake.
 */
export async function filePresent(file: string): Promise<boolean> {
  let stats;
  try {
    stats = await fs.lstat(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
  if (!stats.isFile()) throw new ReportError(`${file} is not a regular file; nothing changed`);
  return true;
}

/** A preserved folder: its path and its manifest */
export interface PreservedFolder {
  folder: string;
  manifest: PreservationManifest;
}

/** The manifest in a preserved folder */
export async function readManifest(folder: string): Promise<PreservationManifest> {
  return JSON.parse(await fs.readFile(path.join(folder, 'manifest.json'), 'utf8'));
}

/**
 * The latest earlier preservation of an attachment whose copy is intact (its SHA-256 matches its
 * manifest's), or null. A run that stopped after the copy (a failed delete) is finished from it.
 */
async function earlierPreservation(
  root: string,
  attachmentId: string,
): Promise<PreservedFolder | null> {
  let names: string[];
  try {
    names = await fs.readdir(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  for (const name of names
    .filter((n) => n.endsWith(`-${attachmentId}`))
    .sort()
    .reverse()) {
    const folder = path.join(root, name);
    const manifest = await readManifest(folder).catch(() => null);
    if (manifest?.attachmentId !== attachmentId || !manifest.sha256 || !manifest.preservedFile) {
      continue;
    }
    const copy = path.join(folder, manifest.preservedFile);
    if ((await filePresent(copy)) && (await sha256OfFile(copy)) === manifest.sha256) {
      return { folder, manifest };
    }
  }
  return null;
}

export interface PreservationResult {
  /** The folder holding the copy and manifest.json (where it would go, on a dry run) */
  folder: string;
  manifest: PreservationManifest;
  dryRun: boolean;
  /** An earlier run's copy was found and its removal finished, without a new copy */
  resumed: boolean;
}

/**
 * Preserve an uploaded file and remove it from Robbie: copy it into its own folder under the
 * preservation root, check the copy's hash against the original's, write manifest.json beside
 * it, then delete the original file and, last, the attachment's row. Nothing is removed until
 * the copy is checked, and a file is never left without its record: if a delete fails, the same
 * command run again finds the earlier copy and finishes.
 * A file already gone from disk is refused unless missingOk, when the manifest says so.
 */
export async function preserveAttachment(
  attachmentId: string,
  note: string,
  options: { dryRun?: boolean; root?: string; now?: Date; missingOk?: boolean } = {},
): Promise<PreservationResult> {
  const now = options.now ?? new Date();
  const dryRun = options.dryRun ?? false;
  const root = path.resolve(options.root ?? preserveRoot());
  const uploads = uploadRoot();
  if (root === uploads || root.startsWith(uploads + path.sep)) {
    // Files there would go into the nightly uploads backups
    throw new ReportError(`PRESERVE_DIR (${root}) must be outside the uploads directory`);
  }

  const packet = {
    select: {
      id: true,
      title: true,
      robbieCode: true,
      organization: { select: { id: true, name: true } },
    },
  } as const;
  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    include: {
      meetingPacket: packet,
      agendaItem: { select: { id: true, title: true, packet } },
    },
  });
  if (!attachment) throw new ReportError(`No attachment ${attachmentId}`);
  if (attachment.type !== 'uploaded_file' || !attachment.storagePath) {
    throw new ReportError(
      `Attachment ${attachmentId} links a Robbie document; it is not an uploaded file`,
    );
  }
  const storagePath = attachment.storagePath;
  const original = getFullPath(storagePath);
  const onDisk = await filePresent(original);
  const sha256 = onDisk ? await sha256OfFile(original) : null;

  // A run that stopped after its copy: finish it from that copy
  const earlier = await earlierPreservation(root, attachment.id);
  if (earlier && (!onDisk || sha256 === earlier.manifest.sha256)) {
    if (!dryRun) await removeOriginal(attachment.id, onDisk ? storagePath : null, earlier.folder);
    return { ...earlier, dryRun, resumed: true };
  }

  if (!onDisk && !options.missingOk) {
    throw new ReportError(
      `The file of attachment ${attachment.id} (${storagePath}) is missing from the uploads ` +
        'directory, and no earlier copy was found; nothing changed. If it is really gone, run ' +
        'again with --missing-ok to record and remove the attachment without its file.',
    );
  }
  const preservedFile = onDisk ? path.basename(storagePath) : null;
  const manifest = buildManifest(attachment, { sha256, preservedFile, preservedAt: now, note });
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const folder = path.join(root, `${stamp}-${attachment.id}`);
  if (dryRun) return { folder, manifest, dryRun, resumed: false };

  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  // Fails if the folder exists, so nothing earlier is ever overwritten
  await fs.mkdir(folder, { mode: 0o700 });
  if (preservedFile) {
    const copy = path.join(folder, preservedFile);
    await fs.copyFile(original, copy, fsConstants.COPYFILE_EXCL);
    await fs.chmod(copy, 0o600);
    const copied = await sha256OfFile(copy);
    if (copied !== sha256) {
      throw new ReportError(
        `The copy in ${folder} doesn't match the original (SHA-256 ${copied}, not ${sha256}). ` +
          'Nothing was removed; check the disk and run it again.',
      );
    }
  }
  await writeManifest(folder, manifest, 'wx');
  await removeOriginal(attachment.id, onDisk ? storagePath : null, folder);
  return { folder, manifest, dryRun, resumed: false };
}

/** Write a folder's manifest.json: new (flag wx), or replacing it in one rename */
async function writeManifest(
  folder: string,
  manifest: PreservationManifest,
  mode: 'wx' | 'replace',
): Promise<void> {
  const text = JSON.stringify(manifest, null, 2) + '\n';
  const target = path.join(folder, 'manifest.json');
  if (mode === 'wx') {
    await fs.writeFile(target, text, { mode: 0o600, flag: 'wx' });
    return;
  }
  const temporary = path.join(folder, `manifest.json.${process.pid}.tmp`);
  await fs.writeFile(temporary, text, { mode: 0o600, flag: 'wx' });
  await fs.rename(temporary, target);
}

/**
 * Delete the original file, then the attachment's row: a failure leaves the record (with or
 * without its file), never a file without a record, and the same command finishes the job
 */
async function removeOriginal(
  attachmentId: string,
  storagePath: string | null,
  folder: string,
): Promise<void> {
  if (storagePath) {
    try {
      await deleteFile(storagePath);
    } catch (error) {
      throw new ReportError(
        `Preserved in ${folder}, but the original file couldn't be deleted ` +
          `(${error instanceof Error ? error.message : error}). The attachment is still in ` +
          'Robbie: fix that, then run the same command again to finish.',
      );
    }
  }
  try {
    await prisma.attachment.delete({ where: { id: attachmentId } });
  } catch (error) {
    throw new ReportError(
      `Preserved in ${folder} and the file removed, but the attachment's record couldn't be ` +
        `deleted (${error instanceof Error ? error.message : error}). Run the same command ` +
        'again to finish.',
    );
  }
}

export interface SuspensionResult {
  email: string;
  /** The suspension after the change (what it would be, on a dry run) */
  suspendedAt: Date | null;
  /** Whether the account was already in that state */
  unchanged: boolean;
  /** Sessions ended (that would end, on a dry run) */
  sessionsEnded: number;
  dryRun: boolean;
}

/**
 * Suspend an account, or lift its suspension. Suspending ends every session; a suspended user
 * can't sign in (signInService) and their sessions are refused (sessionService). Ending a
 * suspension restores sign-in; the user signs in again.
 */
export async function setSuspended(
  rawEmail: string,
  suspend: boolean,
  options: { dryRun?: boolean; now?: Date } = {},
): Promise<SuspensionResult> {
  const email = normalizeEmail(rawEmail);
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, suspendedAt: true, _count: { select: { sessions: true } } },
  });
  if (!user) throw new ReportError(`No account for ${email}`);

  const unchanged = suspend === Boolean(user.suspendedAt);
  const suspendedAt = suspend ? (user.suspendedAt ?? options.now ?? new Date()) : null;
  const sessionsEnded = suspend ? user._count.sessions : 0;
  if (options.dryRun) return { email, suspendedAt, unchanged, sessionsEnded, dryRun: true };

  if (!unchanged) {
    await prisma.user.update({ where: { id: user.id }, data: { suspendedAt } });
  }
  // Even when already suspended: a session made before the suspension took effect goes too
  const ended = suspend ? await prisma.session.deleteMany({ where: { userId: user.id } }) : null;
  return { email, suspendedAt, unchanged, sessionsEnded: ended?.count ?? 0, dryRun: false };
}
