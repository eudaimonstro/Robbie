import { Router, type Router as RouterType } from 'express';
import crypto from 'crypto';
import { prisma } from '../../db/prisma.js';
import { validate } from '../../middleware/validate.js';
import { uuidParam, orgIdParam } from '../../schemas/common.js';
import {
  createDocumentBody,
  updateDocumentBody,
  atDateQuery,
  searchQuery,
} from '../../schemas/documents.js';
import { searchOrganization } from '../services/search.js';
import { getPagination, paginatedResponse } from '../../middleware/pagination.js';
import { logger } from '../../middleware/logger.js';
import { fromParam, requireRole } from '../../orgs/requireRole.js';
import { orgOfDocument, orgOfOrganization } from '../../orgs/resolvers.js';

export const documentsRouter: RouterType = Router();

const byOrganization = fromParam('orgId', orgOfOrganization);
const byDocument = fromParam('id', orgOfDocument);

// Document responses leave out the share token: only an admin sees it, through the share routes
const withoutShareToken = { shareToken: true } as const;

// List documents for an organization
documentsRouter.get(
  '/organizations/:orgId/documents',
  validate({ params: orgIdParam }),
  requireRole('viewer', byOrganization),
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
            omit: withoutShareToken,
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
        omit: withoutShareToken,
        orderBy: { title: 'asc' },
      });

      res.json(documents);
    } catch (error) {
      logger.error({ err: error }, 'Failed to list documents');
      res.status(500).json({ error: 'Failed to list documents' });
    }
  },
);

/**
 * GET /api/organizations/:orgId/search?q=
 * Sections of the current version of each of the organization's documents whose label, title
 * or content has the query, in any case: at most 20, each with the text around the match
 */
documentsRouter.get(
  '/organizations/:orgId/search',
  validate({ params: orgIdParam, query: searchQuery }),
  requireRole('viewer', byOrganization),
  async (req, res) => {
    try {
      const query = String(req.query.q);
      res.json({ query, results: await searchOrganization(req.org!.id, query) });
    } catch (error) {
      logger.error({ err: error }, 'Failed to search');
      res.status(500).json({ error: 'Failed to search' });
    }
  },
);

// Create document
documentsRouter.post(
  '/organizations/:orgId/documents',
  validate({ params: orgIdParam, body: createDocumentBody }),
  requireRole('secretary', byOrganization),
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
documentsRouter.get(
  '/documents/:id',
  validate({ params: uuidParam }),
  requireRole('viewer', byDocument),
  async (req, res) => {
    try {
      const doc = await prisma.document.findUnique({
        where: { id: req.params.id },
        omit: withoutShareToken,
      });

      if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
      }

      res.json(doc);
    } catch (error) {
      logger.error({ err: error }, 'Failed to get document');
      res.status(500).json({ error: 'Failed to get document' });
    }
  },
);

// Update document
documentsRouter.put(
  '/documents/:id',
  validate({ params: uuidParam, body: updateDocumentBody }),
  requireRole('secretary', byDocument),
  async (req, res) => {
    try {
      const doc = await prisma.document.findUnique({
        where: { id: req.params.id },
      });

      if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
      }

      // Map the accepted fields explicitly: the schema takes doc_type or docType, and Prisma
      // knows only docType (passing the body through made doc_type a 500)
      const updated = await prisma.document.update({
        where: { id: req.params.id },
        data: {
          title: req.body.title,
          docType: req.body.doc_type ?? req.body.docType,
        },
        omit: withoutShareToken,
      });

      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, 'Failed to update document');
      res.status(500).json({ error: 'Failed to update document' });
    }
  },
);

// Delete document
documentsRouter.delete(
  '/documents/:id',
  validate({ params: uuidParam }),
  requireRole('secretary', byDocument),
  async (req, res) => {
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
  },
);

// Get document at date
documentsRouter.get(
  '/documents/:id/at-date',
  validate({ params: uuidParam, query: atDateQuery }),
  requireRole('viewer', byDocument),
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
documentsRouter.post(
  '/documents/:id/share',
  validate({ params: uuidParam }),
  requireRole('admin', byDocument),
  async (req, res) => {
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
  },
);

// Disable sharing
documentsRouter.delete(
  '/documents/:id/share',
  validate({ params: uuidParam }),
  requireRole('admin', byDocument),
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
  requireRole('admin', byDocument),
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
documentsRouter.get(
  '/documents/:id/share',
  validate({ params: uuidParam }),
  requireRole('admin', byDocument),
  async (req, res) => {
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
  },
);
