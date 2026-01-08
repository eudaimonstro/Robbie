import { Router, type Router as RouterType } from 'express';
import { prisma } from '../../db/prisma.js';
import type { Section } from '@prisma/client';

export const publicRouter: RouterType = Router();

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

// Get shared document by token
publicRouter.get('/share/:token', async (req, res) => {
  try {
    const doc = await prisma.document.findUnique({
      where: { shareToken: req.params.token },
      include: {
        organization: true,
        versions: {
          orderBy: { versionNumber: 'desc' }
        }
      }
    });

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (!doc.shareEnabled) {
      return res.status(403).json({ error: 'Sharing is disabled for this document' });
    }

    // Get current version with sections
    let currentVersion = null;
    if (doc.currentVersionId) {
      currentVersion = await prisma.version.findUnique({
        where: { id: doc.currentVersionId },
        include: { sections: true }
      });
    }

    res.json({
      document: {
        id: doc.id,
        title: doc.title,
        doc_type: doc.docType,
        organization: {
          id: doc.organization.id,
          name: doc.organization.name,
          slug: doc.organization.slug
        }
      },
      versions: doc.versions.map(v => ({
        id: v.id,
        version_number: v.versionNumber,
        effective_date: v.effectiveDate?.toISOString() || null,
        adopted_at: v.adoptedAt?.toISOString() || null,
        notes: v.notes
      })),
      current_version: currentVersion ? {
        id: currentVersion.id,
        version_number: currentVersion.versionNumber,
        effective_date: currentVersion.effectiveDate?.toISOString() || null,
        adopted_at: currentVersion.adoptedAt?.toISOString() || null,
        notes: currentVersion.notes,
        sections: buildSectionTree(currentVersion.sections)
      } : null
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get shared document' });
  }
});

// Get specific version of shared document
publicRouter.get('/share/:token/versions/:versionId', async (req, res) => {
  try {
    const doc = await prisma.document.findUnique({
      where: { shareToken: req.params.token }
    });

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (!doc.shareEnabled) {
      return res.status(403).json({ error: 'Sharing is disabled for this document' });
    }

    const version = await prisma.version.findUnique({
      where: { id: req.params.versionId },
      include: { sections: true }
    });

    if (!version || version.documentId !== doc.id) {
      return res.status(404).json({ error: 'Version not found' });
    }

    res.json({
      id: version.id,
      version_number: version.versionNumber,
      effective_date: version.effectiveDate?.toISOString() || null,
      adopted_at: version.adoptedAt?.toISOString() || null,
      notes: version.notes,
      sections: buildSectionTree(version.sections)
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get version' });
  }
});

// Search shared document
publicRouter.get('/share/:token/search', async (req, res) => {
  try {
    const doc = await prisma.document.findUnique({
      where: { shareToken: req.params.token }
    });

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (!doc.shareEnabled) {
      return res.status(403).json({ error: 'Sharing is disabled for this document' });
    }

    const query = (req.query.q as string)?.toLowerCase();
    if (!query) {
      return res.json({ results: [] });
    }

    // Search in current version
    if (!doc.currentVersionId) {
      return res.json({ results: [] });
    }

    const sections = await prisma.section.findMany({
      where: { versionId: doc.currentVersionId }
    });

    const results = sections
      .filter(s => {
        return (
          (s.content?.toLowerCase().includes(query)) ||
          (s.title?.toLowerCase().includes(query)) ||
          (s.numberLabel?.toLowerCase().includes(query))
        );
      })
      .map(s => ({
        id: s.id,
        number_label: s.numberLabel,
        title: s.title,
        content_preview: s.content?.substring(0, 200) || null
      }));

    res.json({ results });
  } catch (error) {
    res.status(500).json({ error: 'Failed to search document' });
  }
});
