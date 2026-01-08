import { Router, type Router as RouterType } from 'express';
import { prisma } from '../../db/prisma.js';
import type { Section } from '@prisma/client';

export const versionsRouter: RouterType = Router();

// Build nested section tree from flat list
function buildSectionTree(sections: Section[], parentId: string | null = null): any[] {
  const result = sections
    .filter(s => s.parentId === parentId)
    .sort((a, b) => a.position - b.position)
    .map(section => ({
      id: section.id,
      version_id: section.versionId,
      parent_id: section.parentId,
      position: section.position,
      number_label: section.numberLabel,
      title: section.title,
      content: section.content,
      annotation: section.annotation,
      children: buildSectionTree(sections, section.id)
    }));

  return result;
}

// Render full text from sections
function renderFullText(sections: Section[], parentId: string | null = null, depth = 0): string {
  const lines: string[] = [];
  const indent = '  '.repeat(depth);

  sections
    .filter(s => s.parentId === parentId)
    .sort((a, b) => a.position - b.position)
    .forEach(section => {
      if (section.numberLabel) lines.push(`${indent}${section.numberLabel}`);
      if (section.title) lines.push(`${indent}${section.title}`);
      if (section.content) {
        section.content.split('\n').forEach(line => {
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
    .filter(s => s.parentId === parentId)
    .sort((a, b) => a.position - b.position)
    .forEach(section => {
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
versionsRouter.get('/documents/:docId/versions', async (req, res) => {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: req.params.docId }
    });

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const versions = await prisma.version.findMany({
      where: { documentId: req.params.docId },
      orderBy: { versionNumber: 'desc' }
    });

    res.json(versions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list versions' });
  }
});

// Create version
versionsRouter.post('/documents/:docId/versions', async (req, res) => {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: req.params.docId }
    });

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Get next version number
    const lastVersion = await prisma.version.findFirst({
      where: { documentId: req.params.docId },
      orderBy: { versionNumber: 'desc' }
    });
    const versionNumber = (lastVersion?.versionNumber || 0) + 1;

    // Create new version
    const newVersion = await prisma.version.create({
      data: {
        documentId: req.params.docId,
        versionNumber,
        effectiveDate: req.body.effective_date ? new Date(req.body.effective_date) : null,
        adoptedAt: req.body.adopted_at ? new Date(req.body.adopted_at) : null,
        notes: req.body.notes
      }
    });

    // Clone sections from current version if exists
    if (doc.currentVersionId) {
      const oldSections = await prisma.section.findMany({
        where: { versionId: doc.currentVersionId }
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
              annotation: section.annotation
            }
          });
          idMap[section.id] = newSection.id;
        }

        // Second pass: fix parent references
        for (const section of oldSections) {
          if (section.parentId) {
            await prisma.section.update({
              where: { id: idMap[section.id] },
              data: { parentId: idMap[section.parentId] }
            });
          }
        }
      }
    }

    // Update document's current version
    await prisma.document.update({
      where: { id: req.params.docId },
      data: { currentVersionId: newVersion.id }
    });

    res.status(201).json(newVersion);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create version' });
  }
});

// Get version by ID
versionsRouter.get('/versions/:id', async (req, res) => {
  try {
    const version = await prisma.version.findUnique({
      where: { id: req.params.id }
    });

    if (!version) {
      return res.status(404).json({ error: 'Version not found' });
    }

    res.json(version);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get version' });
  }
});

// Get version tree
versionsRouter.get('/versions/:id/tree', async (req, res) => {
  try {
    const version = await prisma.version.findUnique({
      where: { id: req.params.id },
      include: { sections: true }
    });

    if (!version) {
      return res.status(404).json({ error: 'Version not found' });
    }

    res.json(buildSectionTree(version.sections));
  } catch (error) {
    res.status(500).json({ error: 'Failed to get version tree' });
  }
});

// Get version text
versionsRouter.get('/versions/:id/text', async (req, res) => {
  try {
    const version = await prisma.version.findUnique({
      where: { id: req.params.id },
      include: { sections: true }
    });

    if (!version) {
      return res.status(404).json({ error: 'Version not found' });
    }

    res.json({ text: renderFullText(version.sections) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get version text' });
  }
});

// Diff versions
versionsRouter.get('/versions/:id/diff/:otherId', async (req, res) => {
  try {
    const version1 = await prisma.version.findUnique({
      where: { id: req.params.id },
      include: { sections: true }
    });

    const version2 = await prisma.version.findUnique({
      where: { id: req.params.otherId },
      include: { sections: true }
    });

    if (!version1 || !version2) {
      return res.status(404).json({ error: 'Version not found' });
    }

    // Compute structured diff
    const changes: any[] = [];

    // Build lookup by number_label
    const oldByLabel: Record<string, Section> = {};
    const newByLabel: Record<string, Section> = {};

    version1.sections.forEach(s => {
      if (s.numberLabel) oldByLabel[s.numberLabel] = s;
    });

    version2.sections.forEach(s => {
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

        const contentChanged = oldSection.content !== newSection.content ||
          oldSection.title !== newSection.title;

        if (contentChanged) {
          changes.push({
            type: 'modify',
            section_id: newSection.id,
            old_number_label: oldSection.numberLabel,
            new_number_label: newSection.numberLabel,
            old_title: oldSection.title,
            new_title: newSection.title,
            old_content: oldSection.content,
            new_content: newSection.content
          });
        }
      }
    }

    // Deleted sections
    version1.sections.forEach(section => {
      if (!matchedOld.has(section.id)) {
        changes.push({
          type: 'delete',
          section_id: section.id,
          old_number_label: section.numberLabel,
          old_title: section.title,
          old_content: section.content
        });
      }
    });

    // Added sections
    version2.sections.forEach(section => {
      if (!matchedNew.has(section.id)) {
        changes.push({
          type: 'add',
          section_id: section.id,
          new_number_label: section.numberLabel,
          new_title: section.title,
          new_content: section.content
        });
      }
    });

    res.json({
      old_version_id: req.params.id,
      new_version_id: req.params.otherId,
      changes
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to diff versions' });
  }
});

// Update version
versionsRouter.put('/versions/:id', async (req, res) => {
  try {
    const version = await prisma.version.findUnique({
      where: { id: req.params.id }
    });

    if (!version) {
      return res.status(404).json({ error: 'Version not found' });
    }

    const updated = await prisma.version.update({
      where: { id: req.params.id },
      data: {
        effectiveDate: req.body.effective_date ? new Date(req.body.effective_date) : version.effectiveDate,
        adoptedAt: req.body.adopted_at ? new Date(req.body.adopted_at) : version.adoptedAt,
        notes: req.body.notes ?? version.notes
      }
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update version' });
  }
});

// Delete version
versionsRouter.delete('/versions/:id', async (req, res) => {
  try {
    const version = await prisma.version.findUnique({
      where: { id: req.params.id }
    });

    if (!version) {
      return res.status(404).json({ error: 'Version not found' });
    }

    // Update document's current version if needed
    const doc = await prisma.document.findFirst({
      where: { currentVersionId: version.id }
    });

    if (doc) {
      const otherVersion = await prisma.version.findFirst({
        where: {
          documentId: doc.id,
          id: { not: version.id }
        },
        orderBy: { versionNumber: 'desc' }
      });

      await prisma.document.update({
        where: { id: doc.id },
        data: { currentVersionId: otherVersion?.id || null }
      });
    }

    await prisma.version.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete version' });
  }
});

// Export as markdown
versionsRouter.get('/versions/:id/export/markdown', async (req, res) => {
  try {
    const version = await prisma.version.findUnique({
      where: { id: req.params.id },
      include: { sections: true, document: true }
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
    res.status(500).json({ error: 'Failed to export version' });
  }
});
