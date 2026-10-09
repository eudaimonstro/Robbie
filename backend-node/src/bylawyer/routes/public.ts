import { Router, type Router as RouterType } from 'express';
import { prisma } from '../../db/prisma.js';
import { logger } from '../../middleware/logger.js';
import { buildSharedSectionTree } from '../services/sectionTree.js';
import { validate } from '../../middleware/validate.js';
import { shareParams, shareSearchQuery, shareVersionParams } from '../../schemas/public.js';

export const publicRouter: RouterType = Router();

// Get shared document by token
// Each route checks its token, version and query (400 for a malformed one, not a 500)
publicRouter.get('/share/:token', validate({ params: shareParams }), async (req, res) => {
  try {
    const doc = await prisma.document.findUnique({
      where: { shareToken: req.params.token },
      include: {
        organization: true,
        versions: {
          orderBy: { versionNumber: 'desc' },
        },
      },
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
        include: { sections: true },
      });
    }

    res.json({
      document: {
        id: doc.id,
        title: doc.title,
        docType: doc.docType,
        organization: {
          id: doc.organization.id,
          name: doc.organization.name,
          slug: doc.organization.slug,
        },
      },
      versions: doc.versions.map((v) => ({
        id: v.id,
        versionNumber: v.versionNumber,
        effectiveDate: v.effectiveDate?.toISOString() || null,
        adoptedAt: v.adoptedAt?.toISOString() || null,
        notes: v.notes,
      })),
      currentVersion: currentVersion
        ? {
            id: currentVersion.id,
            versionNumber: currentVersion.versionNumber,
            effectiveDate: currentVersion.effectiveDate?.toISOString() || null,
            adoptedAt: currentVersion.adoptedAt?.toISOString() || null,
            notes: currentVersion.notes,
            sections: buildSharedSectionTree(currentVersion.sections),
          }
        : null,
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get shared document');
    res.status(500).json({ error: 'Failed to get shared document' });
  }
});

// Get specific version of shared document
publicRouter.get(
  '/share/:token/versions/:versionId',
  validate({ params: shareVersionParams }),
  async (req, res) => {
    try {
      const doc = await prisma.document.findUnique({
        where: { shareToken: req.params.token },
      });

      if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
      }

      if (!doc.shareEnabled) {
        return res.status(403).json({ error: 'Sharing is disabled for this document' });
      }

      const version = await prisma.version.findUnique({
        where: { id: req.params.versionId },
        include: { sections: true },
      });

      if (!version || version.documentId !== doc.id) {
        return res.status(404).json({ error: 'Version not found' });
      }

      res.json({
        id: version.id,
        versionNumber: version.versionNumber,
        effectiveDate: version.effectiveDate?.toISOString() || null,
        adoptedAt: version.adoptedAt?.toISOString() || null,
        notes: version.notes,
        sections: buildSharedSectionTree(version.sections),
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to get version');
      res.status(500).json({ error: 'Failed to get version' });
    }
  },
);

// Search shared document
publicRouter.get(
  '/share/:token/search',
  validate({ params: shareParams, query: shareSearchQuery }),
  async (req, res) => {
    try {
      const doc = await prisma.document.findUnique({
        where: { shareToken: req.params.token },
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
        where: { versionId: doc.currentVersionId },
      });

      const results = sections
        .filter((s) => {
          return (
            s.content?.toLowerCase().includes(query) ||
            s.title?.toLowerCase().includes(query) ||
            s.numberLabel?.toLowerCase().includes(query)
          );
        })
        .map((s) => ({
          id: s.id,
          numberLabel: s.numberLabel,
          title: s.title,
          contentPreview: s.content?.substring(0, 200) || null,
        }));

      res.json({ results });
    } catch (error) {
      logger.error({ err: error }, 'Failed to search document');
      res.status(500).json({ error: 'Failed to search document' });
    }
  },
);
