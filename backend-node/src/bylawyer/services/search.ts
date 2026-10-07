/**
 * Search across an organization's documents as members read them: the current version of
 * each, never an older one, never another organization's
 */

import { prisma } from '../../db/prisma.js';

/** At most this many results */
export const SEARCH_LIMIT = 20;

/** A section that matched, with the text around the first match */
export interface SearchHit {
  documentId: string;
  documentTitle: string;
  versionId: string;
  sectionId: string;
  numberLabel: string | null;
  title: string | null;
  snippet: string;
}

/**
 * About `radius` characters either side of the first match, on one line, with "..." where the
 * text is cut. Without a match in the text (it was in the label or title), its start.
 */
export function snippetAround(text: string, query: string, radius = 60): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const at = flat.toLowerCase().indexOf(query.toLowerCase());
  if (at < 0) {
    return flat.length > radius * 2 ? `${flat.slice(0, radius * 2).trimEnd()}...` : flat;
  }
  const start = Math.max(0, at - radius);
  const end = Math.min(flat.length, at + query.length + radius);
  return `${start > 0 ? '...' : ''}${flat.slice(start, end).trim()}${end < flat.length ? '...' : ''}`;
}

/**
 * The query as LIKE reads it literally. Prisma's `contains` passes the text into an ILIKE
 * pattern without escaping it, so % and _ would match anything; a backslash (Postgres's escape
 * character for LIKE) makes each of them, and itself, a plain character.
 */
export function escapeLike(query: string): string {
  return query.replace(/[\\%_]/g, '\\$&');
}

/** Sections of the organization's current versions whose label, title or content has `query` */
export async function searchOrganization(
  organizationId: string,
  query: string,
): Promise<SearchHit[]> {
  const documents = await prisma.document.findMany({
    where: { organizationId, currentVersionId: { not: null } },
    select: { id: true, title: true, currentVersionId: true },
  });
  const byVersion = new Map(documents.map((doc) => [doc.currentVersionId!, doc]));
  if (byVersion.size === 0) return [];

  const contains = { contains: escapeLike(query), mode: 'insensitive' as const };
  const sections = await prisma.section.findMany({
    where: {
      versionId: { in: [...byVersion.keys()] },
      OR: [{ numberLabel: contains }, { title: contains }, { content: contains }],
    },
    select: { id: true, versionId: true, numberLabel: true, title: true, content: true },
    orderBy: [{ versionId: 'asc' }, { position: 'asc' }],
    take: SEARCH_LIMIT,
  });

  return sections
    .map((section) => {
      const doc = byVersion.get(section.versionId)!;
      return {
        documentId: doc.id,
        documentTitle: doc.title,
        versionId: section.versionId,
        sectionId: section.id,
        numberLabel: section.numberLabel,
        title: section.title,
        snippet: snippetAround(section.content ?? '', query),
      };
    })
    .sort((a, b) => a.documentTitle.localeCompare(b.documentTitle));
}
