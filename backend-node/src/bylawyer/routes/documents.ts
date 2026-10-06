import { Router, type Router as RouterType } from 'express';
import crypto from 'crypto';
import { prisma } from '../../db/prisma.js';
import { validate } from '../../middleware/validate.js';
import { uuidParam, orgIdParam } from '../../schemas/common.js';
import { createDocumentBody, updateDocumentBody, atDateQuery } from '../../schemas/documents.js';
import { getPagination, paginatedResponse } from '../../middleware/pagination.js';
import { logger } from '../../middleware/logger.js';

export const documentsRouter: RouterType = Router();

// List documents for an organization
documentsRouter.get(
  '/organizations/:orgId/documents',
  validate({ params: orgIdParam }),
  async (req, res) => {
    try {
      const org = await prisma.organization.findUnique({
        where: { id: req.params.orgId },
      });

      if (!org) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      const where = { organizationId: req.params.orgId };

      if (req.query.page) {
        const pagination = getPagination(req);
        const [documents, total] = await Promise.all([
          prisma.document.findMany({
            where,
            orderBy: { title: 'asc' },
            skip: pagination.skip,
            take: pagination.limit,
          }),
          prisma.document.count({ where }),
        ]);
        return res.json(paginatedResponse(documents, total, pagination));
      }

      const documents = await prisma.document.findMany({
        where,
        orderBy: { title: 'asc' },
      });

      res.json(documents);
    } catch (error) {
      logger.error({ err: error }, 'Failed to list documents');
      res.status(500).json({ error: 'Failed to list documents' });
    }
  },
);

// Create document
documentsRouter.post(
  '/organizations/:orgId/documents',
  validate({ params: orgIdParam, body: createDocumentBody }),
  async (req, res) => {
    try {
      const org = await prisma.organization.findUnique({
        where: { id: req.params.orgId },
      });

      if (!org) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      const doc = await prisma.document.create({
        data: {
          organizationId: req.params.orgId,
          title: req.body.title,
          docType: req.body.doc_type || req.body.docType,
        },
      });

      res.status(201).json(doc);
    } catch (error) {
      logger.error({ err: error }, 'Failed to create document');
      res.status(500).json({ error: 'Failed to create document' });
    }
  },
);

// Get document by ID
documentsRouter.get('/documents/:id', validate({ params: uuidParam }), async (req, res) => {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: req.params.id },
    });

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json(doc);
  } catch (error) {
    logger.error({ err: error }, 'Failed to get document');
    res.status(500).json({ error: 'Failed to get document' });
  }
});

// Update document
documentsRouter.put(
  '/documents/:id',
  validate({ params: uuidParam, body: updateDocumentBody }),
  async (req, res) => {
    try {
      const doc = await prisma.document.findUnique({
        where: { id: req.params.id },
      });

      if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
      }

      const updated = await prisma.document.update({
        where: { id: req.params.id },
        data: req.body,
      });

      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, 'Failed to update document');
      res.status(500).json({ error: 'Failed to update document' });
    }
  },
);

// Delete document
documentsRouter.delete('/documents/:id', validate({ params: uuidParam }), async (req, res) => {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: req.params.id },
    });

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    await prisma.document.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    logger.error({ err: error }, 'Failed to delete document');
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// Get document at date
documentsRouter.get(
  '/documents/:id/at-date',
  validate({ params: uuidParam, query: atDateQuery }),
  async (req, res) => {
    try {
      const targetDate = new Date(req.query.date as string);

      const doc = await prisma.document.findUnique({
        where: { id: req.params.id },
        include: { versions: true },
      });

      if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
      }

      let effectiveVersion = null;
      for (const version of doc.versions) {
        if (version.effectiveDate && version.effectiveDate <= targetDate) {
          if (!effectiveVersion || version.effectiveDate > effectiveVersion.effectiveDate!) {
            effectiveVersion = version;
          }
        }
      }

      if (!effectiveVersion) {
        return res.status(404).json({ error: 'No version effective on that date' });
      }

      res.json({
        versionId: effectiveVersion.id,
        versionNumber: effectiveVersion.versionNumber,
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to get document at date');
      res.status(500).json({ error: 'Failed to get document at date' });
    }
  },
);

// Enable sharing
documentsRouter.post('/documents/:id/share', validate({ params: uuidParam }), async (req, res) => {
  try {
    let doc = await prisma.document.findUnique({
      where: { id: req.params.id },
    });

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const shareToken = doc.shareToken || crypto.randomBytes(32).toString('base64url');

    doc = await prisma.document.update({
      where: { id: req.params.id },
      data: { shareToken, shareEnabled: true },
    });

    res.json({
      shareToken: doc.shareToken,
      shareEnabled: doc.shareEnabled,
      shareUrl: `/share/${doc.shareToken}`,
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to enable sharing');
    res.status(500).json({ error: 'Failed to enable sharing' });
  }
});

// Disable sharing
documentsRouter.delete(
  '/documents/:id/share',
  validate({ params: uuidParam }),
  async (req, res) => {
    try {
      const doc = await prisma.document.findUnique({
        where: { id: req.params.id },
      });

      if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
      }

      await prisma.document.update({
        where: { id: req.params.id },
        data: { shareEnabled: false },
      });

      res.status(204).send();
    } catch (error) {
      logger.error({ err: error }, 'Failed to disable sharing');
      res.status(500).json({ error: 'Failed to disable sharing' });
    }
  },
);

// Regenerate share token
documentsRouter.post(
  '/documents/:id/share/regenerate',
  validate({ params: uuidParam }),
  async (req, res) => {
    try {
      const doc = await prisma.document.findUnique({
        where: { id: req.params.id },
      });

      if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
      }

      const shareToken = crypto.randomBytes(32).toString('base64url');

      const updated = await prisma.document.update({
        where: { id: req.params.id },
        data: { shareToken, shareEnabled: true },
      });

      res.json({
        shareToken: updated.shareToken,
        shareEnabled: updated.shareEnabled,
        shareUrl: `/share/${updated.shareToken}`,
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to regenerate share token');
      res.status(500).json({ error: 'Failed to regenerate share token' });
    }
  },
);

// Get share status
documentsRouter.get('/documents/:id/share', validate({ params: uuidParam }), async (req, res) => {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: req.params.id },
    });

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (!doc.shareToken) {
      return res.json(null);
    }

    res.json({
      shareToken: doc.shareToken,
      shareEnabled: doc.shareEnabled,
      shareUrl: `/share/${doc.shareToken}`,
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get share status');
    res.status(500).json({ error: 'Failed to get share status' });
  }
});
