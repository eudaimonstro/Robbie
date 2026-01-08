import { Router, type Router as RouterType } from 'express';
import crypto from 'crypto';
import { prisma } from '../index.js';

export const documentsRouter: RouterType = Router();

// List documents for an organization
documentsRouter.get('/organizations/:orgId/documents', async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.params.orgId }
    });

    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const documents = await prisma.document.findMany({
      where: { organizationId: req.params.orgId },
      orderBy: { title: 'asc' }
    });

    res.json(documents);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list documents' });
  }
});

// Create document
documentsRouter.post('/organizations/:orgId/documents', async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.params.orgId }
    });

    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const doc = await prisma.document.create({
      data: {
        organizationId: req.params.orgId,
        title: req.body.title,
        docType: req.body.doc_type || req.body.docType
      }
    });

    res.status(201).json(doc);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create document' });
  }
});

// Get document by ID
documentsRouter.get('/documents/:id', async (req, res) => {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: req.params.id }
    });

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json(doc);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get document' });
  }
});

// Update document
documentsRouter.put('/documents/:id', async (req, res) => {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: req.params.id }
    });

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const updated = await prisma.document.update({
      where: { id: req.params.id },
      data: req.body
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update document' });
  }
});

// Delete document
documentsRouter.delete('/documents/:id', async (req, res) => {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: req.params.id }
    });

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    await prisma.document.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// Get document at date
documentsRouter.get('/documents/:id/at-date', async (req, res) => {
  try {
    const targetDate = new Date(req.query.date as string);

    const doc = await prisma.document.findUnique({
      where: { id: req.params.id },
      include: { versions: true }
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
      version_id: effectiveVersion.id,
      version_number: effectiveVersion.versionNumber
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get document at date' });
  }
});

// Enable sharing
documentsRouter.post('/documents/:id/share', async (req, res) => {
  try {
    let doc = await prisma.document.findUnique({
      where: { id: req.params.id }
    });

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const shareToken = doc.shareToken || crypto.randomBytes(32).toString('base64url');

    doc = await prisma.document.update({
      where: { id: req.params.id },
      data: { shareToken, shareEnabled: true }
    });

    res.json({
      share_token: doc.shareToken,
      share_enabled: doc.shareEnabled,
      share_url: `/share/${doc.shareToken}`
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to enable sharing' });
  }
});

// Disable sharing
documentsRouter.delete('/documents/:id/share', async (req, res) => {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: req.params.id }
    });

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    await prisma.document.update({
      where: { id: req.params.id },
      data: { shareEnabled: false }
    });

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to disable sharing' });
  }
});

// Regenerate share token
documentsRouter.post('/documents/:id/share/regenerate', async (req, res) => {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: req.params.id }
    });

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const shareToken = crypto.randomBytes(32).toString('base64url');

    const updated = await prisma.document.update({
      where: { id: req.params.id },
      data: { shareToken, shareEnabled: true }
    });

    res.json({
      share_token: updated.shareToken,
      share_enabled: updated.shareEnabled,
      share_url: `/share/${updated.shareToken}`
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to regenerate share token' });
  }
});

// Get share status
documentsRouter.get('/documents/:id/share', async (req, res) => {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: req.params.id }
    });

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (!doc.shareToken) {
      return res.json(null);
    }

    res.json({
      share_token: doc.shareToken,
      share_enabled: doc.shareEnabled,
      share_url: `/share/${doc.shareToken}`
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get share status' });
  }
});
