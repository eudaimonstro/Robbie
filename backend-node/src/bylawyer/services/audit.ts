/**
 * The audit record of what was deleted from an organization's records, and by whom
 * (AuditEntry). Entries are only ever added.
 */

import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../db/prisma.js';

/** The destructive actions recorded */
export type AuditAction = 'document.delete' | 'version.delete' | 'organization.delete';

export interface AuditRecord {
  organizationId: string;
  actorId: number;
  action: AuditAction;
  targetId: string;
  /** What the target was, as it was before (a title, a version number, counts) */
  details: Prisma.InputJsonObject;
}

/** Record an action, in the transaction that does it when given one */
export async function recordAudit(
  entry: AuditRecord,
  tx: Prisma.TransactionClient = prisma,
): Promise<void> {
  await tx.auditEntry.create({ data: entry });
}
