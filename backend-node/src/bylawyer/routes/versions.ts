import { randomUUID } from 'crypto';
import express, { Router, type Router as RouterType } from 'express';
import { prisma } from '../../db/prisma.js';
import type { Prisma, Section } from '../../generated/prisma/client.js';
import { largeJson } from '../../middleware/largeJson.js';
import { validate } from '../../middleware/validate.js';
import { uuidParam, docIdParam } from '../../schemas/common.js';
import {
  createVersionBody,
  updateVersionBody,
  diffParams,
  importVersionBody,
  isLongTextWithoutHeadings,
  NO_HEADINGS,
  type ImportedSection,
  type ImportVersionBody,
} from '../../schemas/versions.js';
import { diffSections } from '../services/versionDiff.js';
import {
  DOCX_LIMIT,
  DOCX_TOO_LARGE,
  DOCX_TYPES,
  DocxTooLargeError,
  NOT_A_DOCX,
  NO_FILE,
  docxToText,
} from '../services/docxText.js';
import { logger } from '../../middleware/logger.js';
import { fromParam, requireRole } from '../../orgs/requireRole.js';
import { orgOfDocument, orgOfVersion } from '../../orgs/resolvers.js';
import { ApiError } from '../../middleware/apiError.js';
import { recordAudit } from '../services/audit.js';
import { currentVersionOnly, versionDeleteProblem } from '../services/versionRules.js';

export const versionsRouter: RouterType = Router();

const byDocument = fromParam('docId', orgOfDocument);
const byVersion = fromParam('id', orgOfVersion);

// Build nested section tree from flat list
function buildSectionTree(sections: Section[], parentId: string | null = null): any[] {
  const result = sections
    .filter((s) => s.parentId === parentId)
    .sort((a, b) => a.position - b.position)
    .map((section) => ({
      id: section.id,
      versionId: section.versionId,
      parentId: section.parentId,
      position: section.position,
      numberLabel: section.numberLabel,
      title: section.title,
      content: section.content,
      annotation: section.annotation,
      children: buildSectionTree(sections, section.id),
    }));

  return result;
}

// Render full text from sections
function renderFullText(sections: Section[], parentId: string | null = null, depth = 0): string {
  const lines: string[] = [];
  const indent = '  '.repeat(depth);

  sections
    .filter((s) => s.parentId === parentId)
    .sort((a, b) => a.position - b.position)
    .forEach((section) => {
      if (section.numberLabel) lines.push(`${indent}${section.numberLabel}`);
      if (section.title) lines.push(`${indent}${section.title}`);
      if (section.content) {
        section.content.split('\n').forEach((line) => {
          lines.push(`${indent}${line}`);
        });
      }
      lines.push('');
      lines.push(renderFullText(sections, section.id, depth + 1));
    });

  return lines.join('\n');
}

// Render markdown from sections
function renderMarkdown(sections: Section[], parentId: string | null = null, depth = 0): string {
  const lines: string[] = [];
  const headingPrefix = '#'.repeat(Math.min(depth + 1, 6));

  sections
    .filter((s) => s.parentId === parentId)
    .sort((a, b) => a.position - b.position)
    .forEach((section) => {
      const headingParts: string[] = [];
      if (section.numberLabel) headingParts.push(section.numberLabel);
      if (section.title) headingParts.push(section.title);

      if (headingParts.length > 0) {
        lines.push(`${headingPrefix} ${headingParts.join(' - ')}`);
        lines.push('');
      }

      if (section.content) {
        lines.push(section.content);
        lines.push('');
      }

      const childContent = renderMarkdown(sections, section.id, depth + 1);
      if (childContent.trim()) {
        lines.push(childContent);
      }
    });

  return lines.join('\n');
}

/**
 * An imported tree as rows for one createMany: ids made here, so each child names its parent,
 * and positions in the order given. Empty labels, titles and content are saved as none.
 */
function importedRows(
  versionId: string,
  sections: ImportedSection[],
  parentId: string | null = null,
): Prisma.SectionCreateManyInput[] {
  return sections.flatMap((section, position) => {
    const id = randomUUID();
    return [
      {
        id,
        versionId,
        parentId,
        position,
        numberLabel: section.numberLabel?.trim() || null,
        title: section.title?.trim() || null,
        content: section.content.trim() || null,
      },
      ...importedRows(versionId, section.children, id),
    ];
  });
}

// List versions for a document
versionsRouter.get(
  '/documents/:docId/versions',
  validate({ params: docIdParam }),
  requireRole('viewer', byDocument),
  async (req, res) => {
    try {
      const doc = await prisma.document.findUnique({
        where: { id: req.params.docId },
      });

      if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
      }

      const versions = await prisma.version.findMany({
        where: { documentId: req.params.docId },
        orderBy: { versionNumber: 'desc' },
      });

      res.json(versions);
    } catch (error) {
      logger.error({ err: error }, 'Failed to list versions');
      res.status(500).json({ error: 'Failed to list versions' });
    }
  },
);

/**
 * Hold the document's row until the transaction ends, so versions of one document are numbered
 * one at a time (applying an amendment takes the same lock)
 */
async function lockDocument(tx: Prisma.TransactionClient, documentId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Document" WHERE id = ${documentId} FOR UPDATE`;
}

/** The next version number of a document, under its lock */
async function nextVersionNumber(
  tx: Prisma.TransactionClient,
  documentId: string,
): Promise<number> {
  const last = await tx.version.findFirst({
    where: { documentId },
    orderBy: { versionNumber: 'desc' },
    select: { versionNumber: true },
  });
  return (last?.versionNumber ?? 0) + 1;
}

/** The current version's sections as rows of a new version: new ids, the same tree */
function copiedRows(sections: Section[], versionId: string): Prisma.SectionCreateManyInput[] {
  const ids = new Map(sections.map((section) => [section.id, randomUUID()]));
  return sections.map((section) => ({
    id: ids.get(section.id)!,
    versionId,
    parentId: section.parentId ? (ids.get(section.parentId) ?? null) : null,
    position: section.position,
    numberLabel: section.numberLabel,
    title: section.title,
    content: section.content,
    annotation: section.annotation,
  }));
}

/**
 * POST /api/documents/:docId/versions
 * A new current version, starting as a copy of the current one: the version, its sections and
 * the document's current version in one transaction, under the document's lock
 */
versionsRouter.post(
  '/documents/:docId/versions',
  validate({ params: docIdParam, body: createVersionBody }),
  requireRole('secretary', byDocument),
  async (req, res) => {
    const documentId = req.params.docId;
    const effectiveDateInput = req.body.effective_date ?? req.body.effectiveDate;
    const adoptedAtInput = req.body.adopted_at ?? req.body.adoptedAt;

    const version = await prisma.$transaction(async (tx) => {
      await lockDocument(tx, documentId);
      const doc = await tx.document.findUnique({
        where: { id: documentId },
        select: { currentVersionId: true },
      });
      if (!doc) throw ApiError.notFound('Document not found');

      const created = await tx.version.create({
        data: {
          documentId,
          versionNumber: await nextVersionNumber(tx, documentId),
          effectiveDate: effectiveDateInput ? new Date(effectiveDateInput) : null,
          adoptedAt: adoptedAtInput ? new Date(adoptedAtInput) : null,
          notes: req.body.notes,
        },
      });
      if (doc.currentVersionId) {
        const current = await tx.section.findMany({ where: { versionId: doc.currentVersionId } });
        await tx.section.createMany({ data: copiedRows(current, created.id) });
      }
      await tx.document.update({
        where: { id: documentId },
        data: { currentVersionId: created.id },
      });
      return created;
    });
    res.status(201).json(version);
  },
);

/**
 * POST /api/documents/:docId/import/docx
 * A Word document as text for the bylaws parser. The body is the raw file (at most 5 MB), read
 * from memory and never stored. It is read only after the role is checked, so nobody below a
 * secretary can make the server read it, and refused (400) when it would unpack too large.
 */
versionsRouter.post(
  '/documents/:docId/import/docx',
  validate({ params: docIdParam }),
  requireRole('secretary', byDocument),
  express.raw({ type: DOCX_TYPES, limit: DOCX_LIMIT }),
  async (req, res) => {
    // express.raw leaves no Buffer for an empty body or a type it doesn't read
    const file: unknown = req.body;
    if (!Buffer.isBuffer(file) || file.length === 0) {
      return res.status(400).json({ error: NO_FILE });
    }
    try {
      res.json({ text: await docxToText(file) });
    } catch (error) {
      if (error instanceof DocxTooLargeError) {
        logger.warn('A Word document would unpack too large to read');
        return res.status(400).json({ error: DOCX_TOO_LARGE });
      }
      logger.warn({ err: error }, 'A Word document could not be read');
      res.status(400).json({ error: NOT_A_DOCX });
    }
  },
);

/**
 * POST /api/documents/:docId/versions/import
 * A new version from parsed sections, made current: the version and every section in one
 * transaction, so a failed import leaves nothing behind.
 * Body: { effectiveDate?, notes?, sections: ImportedSection[] }
 */
versionsRouter.post(
  '/documents/:docId/versions/import',
  validate({ params: docIdParam }),
  requireRole('secretary', byDocument),
  // Read only now, after the role check (see largeJson)
  largeJson,
  (req, res, next) => {
    if (isLongTextWithoutHeadings(req.body)) return res.status(400).json({ error: NO_HEADINGS });
    next();
  },
  validate({ body: importVersionBody }),
  async (req, res) => {
    try {
      const documentId = req.params.docId;
      const { effectiveDate, notes, sections } = req.body as ImportVersionBody;
      const version = await prisma.$transaction(async (tx) => {
        await lockDocument(tx, documentId);
        const created = await tx.version.create({
          data: {
            documentId,
            versionNumber: await nextVersionNumber(tx, documentId),
            effectiveDate: effectiveDate ? new Date(effectiveDate) : null,
            notes: notes?.trim() || null,
          },
        });
        const rows = importedRows(created.id, sections);
        await tx.section.createMany({ data: rows });
        await tx.document.update({
          where: { id: documentId },
          data: { currentVersionId: created.id },
        });
        return { ...created, sectionCount: rows.length };
      });
      res.status(201).json(version);
    } catch (error) {
      logger.error({ err: error }, 'Failed to import a version');
      res.status(500).json({ error: 'Failed to import the version' });
    }
  },
);

// Get version by ID
versionsRouter.get(
  '/versions/:id',
  validate({ params: uuidParam }),
  requireRole('viewer', byVersion),
  async (req, res) => {
    try {
      const version = await prisma.version.findUnique({
        where: { id: req.params.id },
      });

      if (!version) {
        return res.status(404).json({ error: 'Version not found' });
      }

      res.json(version);
    } catch (error) {
      logger.error({ err: error }, 'Failed to get version');
      res.status(500).json({ error: 'Failed to get version' });
    }
  },
);

// Get version tree
versionsRouter.get(
  '/versions/:id/tree',
  validate({ params: uuidParam }),
  requireRole('viewer', byVersion),
  async (req, res) => {
    try {
      const version = await prisma.version.findUnique({
        where: { id: req.params.id },
        include: { sections: true },
      });

      if (!version) {
        return res.status(404).json({ error: 'Version not found' });
      }

      res.json(buildSectionTree(version.sections));
    } catch (error) {
      logger.error({ err: error }, 'Failed to get version tree');
      res.status(500).json({ error: 'Failed to get version tree' });
    }
  },
);

// Get version text
versionsRouter.get(
  '/versions/:id/text',
  validate({ params: uuidParam }),
  requireRole('viewer', byVersion),
  async (req, res) => {
    try {
      const version = await prisma.version.findUnique({
        where: { id: req.params.id },
        include: { sections: true },
      });

      if (!version) {
        return res.status(404).json({ error: 'Version not found' });
      }

      res.json({ text: renderFullText(version.sections) });
    } catch (error) {
      logger.error({ err: error }, 'Failed to get version text');
      res.status(500).json({ error: 'Failed to get version text' });
    }
  },
);

// Diff versions
versionsRouter.get(
  '/versions/:id/diff/:otherId',
  validate({ params: diffParams }),
  requireRole('viewer', byVersion),
  async (req, res) => {
    try {
      const version1 = await prisma.version.findUnique({
        where: { id: req.params.id },
        include: { sections: true },
      });

      const version2 = await prisma.version.findUnique({
        where: { id: req.params.otherId },
        include: { sections: true },
      });

      // The other version must be of the same document (so in the same organization); any
      // other version is treated as not found
      if (!version1 || !version2 || version2.documentId !== version1.documentId) {
        return res.status(404).json({ error: 'Version not found' });
      }

      // Compute structured diff
      const changes = diffSections(version1.sections, version2.sections);

      res.json({
        oldVersionId: req.params.id,
        newVersionId: req.params.otherId,
        changes,
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to diff versions');
      res.status(500).json({ error: 'Failed to diff versions' });
    }
  },
);

/**
 * PUT /api/versions/:id
 * The current version's dates and notes. An earlier version is the record (409).
 */
versionsRouter.put(
  '/versions/:id',
  validate({ params: uuidParam, body: updateVersionBody }),
  requireRole('secretary', byVersion),
  currentVersionOnly('id'),
  async (req, res) => {
    const version = await prisma.version.findUnique({ where: { id: req.params.id } });
    if (!version) throw ApiError.notFound('Version not found');

    const effectiveDateInput = req.body.effective_date ?? req.body.effectiveDate;
    const adoptedAtInput = req.body.adopted_at ?? req.body.adoptedAt;
    const updated = await prisma.version.update({
      where: { id: req.params.id },
      data: {
        effectiveDate: effectiveDateInput ? new Date(effectiveDateInput) : version.effectiveDate,
        adoptedAt: adoptedAtInput ? new Date(adoptedAtInput) : version.adoptedAt,
        notes: req.body.notes ?? version.notes,
      },
    });
    res.json(updated);
  },
);

/**
 * DELETE /api/versions/:id
 * Delete an earlier version (admin): never the current one, and never one an adopted amendment
 * made (409). The audit record keeps who deleted it and what it was.
 */
versionsRouter.delete(
  '/versions/:id',
  validate({ params: uuidParam }),
  requireRole('admin', byVersion),
  async (req, res) => {
    const versionId = req.params.id;
    await prisma.$transaction(async (tx) => {
      const found = await tx.version.findUnique({
        where: { id: versionId },
        select: { documentId: true },
      });
      if (!found) throw ApiError.notFound('Version not found');
      await lockDocument(tx, found.documentId);
      const version = await tx.version.findUniqueOrThrow({
        where: { id: versionId },
        include: {
          document: { select: { title: true, currentVersionId: true } },
          _count: { select: { sections: true } },
        },
      });
      const problem = await versionDeleteProblem(version, version.document.currentVersionId);
      if (problem) throw ApiError.conflict(problem);

      await tx.version.delete({ where: { id: versionId } });
      await recordAudit(
        {
          organizationId: req.org!.id,
          actorId: req.user!.id,
          action: 'version.delete',
          targetId: versionId,
          details: {
            documentId: version.documentId,
            title: version.document.title,
            versionNumber: version.versionNumber,
            sections: version._count.sections,
          },
        },
        tx,
      );
    });
    res.status(204).send();
  },
);

// Export as markdown
versionsRouter.get(
  '/versions/:id/export/markdown',
  validate({ params: uuidParam }),
  requireRole('viewer', byVersion),
  async (req, res) => {
    try {
      const version = await prisma.version.findUnique({
        where: { id: req.params.id },
        include: { sections: true, document: true },
      });

      if (!version) {
        return res.status(404).json({ error: 'Version not found' });
      }

      const docTitle = version.document?.title || 'Document';
      let content = `# ${docTitle}\n\n`;
      content += `*Version ${version.versionNumber}*\n\n`;
      if (version.effectiveDate) {
        content += `*Effective: ${version.effectiveDate.toISOString().split('T')[0]}*\n\n`;
      }
      content += '---\n\n';
      content += renderMarkdown(version.sections);

      // res.attachment writes the name for any title: an ASCII fallback, and the whole name
      // encoded as RFC 5987 filename* (a curly apostrophe or a quote used to make this a 500)
      res.attachment(`${docTitle.replace(/ /g, '_')}_v${version.versionNumber}.md`);
      res.type('text/markdown');
      res.send(content);
    } catch (error) {
      logger.error({ err: error }, 'Failed to export version');
      res.status(500).json({ error: 'Failed to export version' });
    }
  },
);
