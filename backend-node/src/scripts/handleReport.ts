/**
 * Act on a report of illegal or abusive content (docs/deploy.md, "Handling a report"): preserve
 * and remove an uploaded file, or suspend or restore an account.
 *
 * Usage: npm run report -w backend-node -- --attachment <id> --note <text> [--dry-run]
 *        npm run report -w backend-node -- --suspend <email> [--dry-run]
 *        npm run report -w backend-node -- --unsuspend <email> [--dry-run]
 * In the image: docker compose exec app node dist/scripts/handleReport.js ...
 *
 * It never prints or opens a file's contents.
 */

/* eslint-disable no-console -- CLI output */
import 'dotenv/config';
import { prisma } from '../db/prisma.js';
import {
  ReportError,
  USAGE,
  parseReportArgs,
  preserveAttachment,
  recordReport,
  restoreAttachment,
  setSuspended,
  type ReportCommand,
} from '../abuse/reportHandling.js';

const parsed = parseReportArgs(process.argv.slice(2));
if (!parsed.command) {
  console.error(parsed.error);
  console.error(USAGE);
  process.exit(1);
}

async function run(command: ReportCommand): Promise<void> {
  const dry = command.dryRun ? 'Dry run, nothing changed. ' : '';

  if (command.action === 'attachment') {
    const { folder, manifest, resumed } = await preserveAttachment(
      command.attachmentId,
      { kind: command.kind, note: command.note },
      { dryRun: command.dryRun, missingOk: command.missingOk },
    );
    const where = manifest.packet.title ?? manifest.packet.meetingCode;
    console.log(`${dry}Attachment ${manifest.attachmentId} ("${manifest.displayName}")`);
    console.log(`  Organization: ${manifest.organization.name} (${manifest.organization.id})`);
    console.log(`  Meeting: ${where} (packet ${manifest.packet.id})`);
    console.log(`  Uploaded by ${manifest.uploadedBy ?? 'unknown'} at ${manifest.uploadedAt}`);
    console.log(`  ${manifest.mimeType ?? 'unknown type'}, ${manifest.sizeBytes ?? '?'} bytes`);
    console.log(`  SHA-256: ${manifest.sha256 ?? 'none: the file was already gone from disk'}`);
    console.log(`  Kind: ${manifest.kind}`);
    if (command.dryRun) {
      console.log(
        resumed
          ? `Already preserved in ${folder}; would finish removing it from Robbie.`
          : `Would preserve it in ${folder} and remove it from Robbie.`,
      );
      return;
    }
    console.log(
      resumed
        ? `Already preserved in ${folder}; now removed from Robbie.`
        : `Preserved in ${folder} (the file and manifest.json), and removed from Robbie.`,
    );
    console.log(
      `Keep that folder and its manifest at least until ${manifest.keepAtLeastUntil.slice(0, 10)}. ` +
        'If you report it to the NCMEC CyberTipline, the year runs from the report: record it ' +
        'with --record-report <folder> --reported-at <date> --report-id <number>, and keep the ' +
        'folder until a year after the report or until law enforcement releases it, whichever ' +
        'is later (18 U.S.C. 2258A(h), as amended by the REPORT Act). Restrict access to it, and ' +
        'never copy it off the server except as law enforcement directs.',
    );
    return;
  }

  if (command.action === 'restore') {
    const { folder, manifest, target } = await restoreAttachment(command.folder, command.note, {
      dryRun: command.dryRun,
    });
    const place = target.agendaItemId
      ? `agenda item ${target.agendaItemId} of packet ${target.packetId}`
      : `packet ${target.packetId}`;
    console.log(
      `${dry}${command.dryRun ? 'Would restore' : 'Restored'} attachment ` +
        `${manifest.attachmentId} ("${manifest.displayName}") from ${folder} to ${place}.`,
    );
    if (!command.dryRun) {
      console.log(
        `Its file is ${manifest.restoredStoragePath} in the uploads; the preserved copy stays.`,
      );
    }
    return;
  }

  if (command.action === 'record-report') {
    const { folder, manifest, previous } = await recordReport(
      command.folder,
      command.reportedAt,
      command.reportId,
      { dryRun: command.dryRun },
    );
    if (previous) {
      console.log(
        `${dry}Replacing the report recorded before: ${previous.reportId ?? 'no number'}, ` +
          `${previous.reportedAt ?? 'no date'}.`,
      );
    }
    console.log(
      `${dry}${command.dryRun ? 'Would record' : 'Recorded'} CyberTipline report ` +
        `${manifest.reportId}, submitted ${manifest.reportedAt}, in ${folder}.`,
    );
    console.log(
      `Keep the folder until ${manifest.keepUntil!.slice(0, 10)} (a year after the report) or ` +
        'until law enforcement releases it, whichever is later.',
    );
    return;
  }

  const suspend = command.action === 'suspend';
  const result = await setSuspended(command.email, suspend, { dryRun: command.dryRun });
  if (command.dryRun) {
    const state = result.unchanged
      ? `is already ${suspend ? 'suspended' : 'not suspended'}`
      : `would be ${suspend ? 'suspended' : 'able to sign in again'}`;
    const sessions = suspend ? `; ${result.sessionsEnded} session(s) would end` : '';
    console.log(`${dry}${result.email} ${state}${sessions}.`);
    return;
  }
  if (suspend) {
    const state = result.unchanged ? 'was already suspended' : 'is suspended';
    console.log(`${result.email} ${state}; ${result.sessionsEnded} session(s) ended.`);
    console.log(
      'They can no longer sign in. The server closes their open meeting connections within a ' +
        'minute.',
    );
  } else {
    console.log(`${result.email} ${result.unchanged ? 'was not suspended' : 'can sign in again'}.`);
  }
}

try {
  await run(parsed.command);
} catch (error) {
  console.error(error instanceof ReportError ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
