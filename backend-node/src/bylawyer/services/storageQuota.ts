/**
 * The storage each organization may use for uploaded files: ORG_STORAGE_LIMIT_MB megabytes
 * (500 by default) across its packets and agenda items
 */

import type { Prisma } from '../../generated/prisma/client.js';

export const DEFAULT_ORG_STORAGE_LIMIT_MB = 500;

/**
 * The limit in megabytes: ORG_STORAGE_LIMIT_MB when it is a positive whole number, else the
 * default (startupCheck refuses a bad value in production). Read on each upload.
 */
export function orgStorageLimitMb(env: NodeJS.ProcessEnv = process.env): number {
  const value = env.ORG_STORAGE_LIMIT_MB?.trim();
  return value && /^[1-9]\d*$/.test(value) ? Number(value) : DEFAULT_ORG_STORAGE_LIMIT_MB;
}

/** Whether ORG_STORAGE_LIMIT_MB is unset or a positive whole number */
export function isValidOrgStorageLimit(value: string | undefined): boolean {
  return value === undefined || value.trim() === '' || /^[1-9]\d*$/.test(value.trim());
}

/** The refusal when an upload would take an organization past its limit */
export function storageFullMessage(limitMb: number): string {
  return `This organization has used its ${limitMb} MB of storage for files. Remove some files to add more.`;
}

/** The bytes of the files uploaded to an organization's packets and agenda items */
export async function orgStorageUsed(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<number> {
  const { _sum } = await tx.attachment.aggregate({
    where: {
      type: 'uploaded_file',
      OR: [{ meetingPacket: { organizationId } }, { agendaItem: { packet: { organizationId } } }],
    },
    _sum: { sizeBytes: true },
  });
  return _sum.sizeBytes ?? 0;
}
