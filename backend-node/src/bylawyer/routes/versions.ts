import { Router, type Router as RouterType } from 'express';
import { prisma } from '../../db/prisma.js';
import type { Section } from '../../generated/prisma/client.js';
import { validate } from '../../middleware/validate.js';
import { uuidParam, docIdParam } from '../../schemas/common.js';
import { createVersionBody, updateVersionBody, diffParams } from '../../schemas/versions.js';
import { logger } from '../../middleware/logger.js';

export const versionsRouter: RouterType = Router();

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

// List versions for a document
versionsRouter.get(
  '/documents/:docId/versions',
  validate({ params: docIdParam }),
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

// Create version
versionsRouter.post(
  '/documents/:docId/versions',
  validate({ params: docIdParam, body: createVersionBody }),
  async (req, res) => {
    try {
      const doc = await prisma.document.findUnique({
        where: { id: req.params.docId },
      });

      if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
      }

      // Get next version number
      const lastVersion = await prisma.version.findFirst({
        where: { documentId: req.params.docId },
        orderBy: { versionNumber: 'desc' },
      });
      const versionNumber = (lastVersion?.versionNumber || 0) + 1;

      const effectiveDateInput = req.body.effective_date ?? req.body.effectiveDate;
      const adoptedAtInput = req.body.adopted_at ?? req.body.adoptedAt;

      // Create new version
      const newVersion = await prisma.version.create({
        data: {
          documentId: req.params.docId,
          versionNumber,
          effectiveDate: effectiveDateInput ? new Date(effectiveDateInput) : null,
          adoptedAt: adoptedAtInput ? new Date(adoptedAtInput) : null,
          notes: req.body.notes,
        },
      });

      // Clone sections from current version if exists
      if (doc.currentVersionId) {
        const oldSections = await prisma.section.findMany({
          where: { versionId: doc.currentVersionId },
        });

        if (oldSections.length > 0) {
          const idMap: Record<string, string> = {};

          // First pass: create all sections without parent references
          for (const section of oldSections) {
            const newSection = await prisma.section.create({
              data: {
                versionId: newVersion.id,
                parentId: null,
                position: section.position,
                numberLabel: section.numberLabel,
                title: section.title,
                content: section.content,
                annotation: section.annotation,
              },
            });
            idMap[section.id] = newSection.id;
          }

          // Second pass: fix parent references
          for (const section of oldSections) {
            if (section.parentId) {
              await prisma.section.update({
                where: { id: idMap[section.id] },
                data: { parentId: idMap[section.parentId] },
              });
            }
          }
        }
      }

      // Update document's current version
      await prisma.document.update({
        where: { id: req.params.docId },
        data: { currentVersionId: newVersion.id },
      });

      res.status(201).json(newVersion);
    } catch (error) {
      logger.error({ err: error }, 'Failed to create version');
      res.status(500).json({ error: 'Failed to create version' });
    }
  },
);

// Get version by ID
versionsRouter.get('/versions/:id', validate({ params: uuidParam }), async (req, res) => {
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
});

// Get version tree
versionsRouter.get('/versions/:id/tree', validate({ params: uuidParam }), async (req, res) => {
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
});

// Get version text
versionsRouter.get('/versions/:id/text', validate({ params: uuidParam }), async (req, res) => {
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
});

// Diff versions
versionsRouter.get(
  '/versions/:id/diff/:otherId',
  validate({ params: diffParams }),
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

      if (!version1 || !version2) {
        return res.status(404).json({ error: 'Version not found' });
      }

      // Compute structured diff
      const changes: any[] = [];

      // Build lookup by number_label
      const oldByLabel: Record<string, Section> = {};
      const newByLabel: Record<string, Section> = {};

      version1.sections.forEach((s) => {
        if (s.numberLabel) oldByLabel[s.numberLabel] = s;
      });

      version2.sections.forEach((s) => {
        if (s.numberLabel) newByLabel[s.numberLabel] = s;
      });

      const matchedOld = new Set<string>();
      const matchedNew = new Set<string>();

      // Match by number_label
      for (const [label, oldSection] of Object.entries(oldByLabel)) {
        if (newByLabel[label]) {
          const newSection = newByLabel[label];
          matchedOld.add(oldSection.id);
          matchedNew.add(newSection.id);

          const contentChanged =
            oldSection.content !== newSection.content || oldSection.title !== newSection.title;

          if (contentChanged) {
            changes.push({
              type: 'modify',
              sectionId: newSection.id,
              oldNumberLabel: oldSection.numberLabel,
              newNumberLabel: newSection.numberLabel,
              oldTitle: oldSection.title,
              newTitle: newSection.title,
              oldContent: oldSection.content,
              newContent: newSection.content,
            });
          }
        }
      }

      // Deleted sections
      version1.sections.forEach((section) => {
        if (!matchedOld.has(section.id)) {
          changes.push({
            type: 'delete',
            sectionId: section.id,
            oldNumberLabel: section.numberLabel,
            oldTitle: section.title,
            oldContent: section.content,
          });
        }
      });

      // Added sections
      version2.sections.forEach((section) => {
        if (!matchedNew.has(section.id)) {
          changes.push({
            type: 'add',
            sectionId: section.id,
            newNumberLabel: section.numberLabel,
            newTitle: section.title,
            newContent: section.content,
          });
        }
      });

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

// Update version
versionsRouter.put(
  '/versions/:id',
  validate({ params: uuidParam, body: updateVersionBody }),
  async (req, res) => {
    try {
      const version = await prisma.version.findUnique({
        where: { id: req.params.id },
      });

      if (!version) {
        return res.status(404).json({ error: 'Version not found' });
      }

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
    } catch (error) {
      logger.error({ err: error }, 'Failed to update version');
      res.status(500).json({ error: 'Failed to update version' });
    }
  },
);

// Delete version
versionsRouter.delete('/versions/:id', validate({ params: uuidParam }), async (req, res) => {
  try {
    const version = await prisma.version.findUnique({
      where: { id: req.params.id },
    });

    if (!version) {
      return res.status(404).json({ error: 'Version not found' });
    }

    // Update document's current version if needed
    const doc = await prisma.document.findFirst({
      where: { currentVersionId: version.id },
    });

    if (doc) {
      const otherVersion = await prisma.version.findFirst({
        where: {
          documentId: doc.id,
          id: { not: version.id },
        },
        orderBy: { versionNumber: 'desc' },
      });

      await prisma.document.update({
        where: { id: doc.id },
        data: { currentVersionId: otherVersion?.id || null },
      });
    }

    await prisma.version.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    logger.error({ err: error }, 'Failed to delete version');
    res.status(500).json({ error: 'Failed to delete version' });
  }
});

// Export as markdown
versionsRouter.get(
  '/versions/:id/export/markdown',
  validate({ params: uuidParam }),
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

      const filename = `${docTitle.replace(/ /g, '_')}_v${version.versionNumber}.md`;

      res.setHeader('Content-Type', 'text/markdown');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(content);
    } catch (error) {
      logger.error({ err: error }, 'Failed to export version');
      res.status(500).json({ error: 'Failed to export version' });
    }
  },
);
