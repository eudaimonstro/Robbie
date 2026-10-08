/**
 * A document's versions are its history: only the current version changes (its sections and
 * details, by the secretary), and earlier versions stay as they were adopted. A version is
 * deleted only by an admin, never the current one, and never one an adopted amendment made.
 */

import type { RequestHandler } from 'express';
import { prisma } from '../../db/prisma.js';
import type { RouteParams } from '../../middleware/validate.js';
import { ApiError } from '../../middleware/apiError.js';

/** The answer when an earlier version would be changed */
export const EARLIER_VERSION =
  'Only the current version can be changed. Earlier versions are the record.';
/** The answer when the current version would be deleted */
export const CURRENT_VERSION = "The current version can't be deleted";
/** The answer when a version an adopted amendment made would be deleted */
export const ADOPTED_VERSION = "A version made by an adopted amendment can't be deleted";

/** Whether the version is its document's current version; null when there is no such version */
export async function isCurrentVersion(versionId: string): Promise<boolean | null> {
  const version = await prisma.version.findUnique({
    where: { id: versionId },
    select: { id: true, document: { select: { currentVersionId: true } } },
  });
  if (!version) return null;
  return version.document.currentVersionId === version.id;
}

/** The version a section belongs to, or null when there is no such section */
async function versionOfSection(sectionId: string): Promise<string | null> {
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    select: { versionId: true },
  });
  return section?.versionId ?? null;
}

/**
 * Refuse (409) a change to an earlier version. After the role check, so outsiders still get
 * 404: `param` names the version (`versionId`) or, with `section`, a section of it. A version or
 * section that doesn't exist is left to the handler's 404.
 */
export function currentVersionOnly(
  param: string,
  through: 'version' | 'section' = 'version',
): RequestHandler<RouteParams> {
  return async (req, _res, next) => {
    const id = req.params[param];
    const versionId = through === 'section' ? await versionOfSection(id) : id;
    if (versionId && (await isCurrentVersion(versionId)) === false) {
      throw ApiError.conflict(EARLIER_VERSION);
    }
    next();
  };
}

/** Why the version can't be deleted, or null when it can */
export async function versionDeleteProblem(
  version: { id: string; documentId: string },
  currentVersionId: string | null,
): Promise<string | null> {
  if (currentVersionId === version.id) return CURRENT_VERSION;
  const adopted = await prisma.amendment.count({
    where: { resultingVersionId: version.id, status: 'passed' },
  });
  return adopted > 0 ? ADOPTED_VERSION : null;
}
