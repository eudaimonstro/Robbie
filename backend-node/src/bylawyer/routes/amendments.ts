import { Router, type Router as RouterType } from 'express';
import { prisma } from '../../db/prisma.js';
import { AmendmentService } from '../services/amendmentService.js';

export const amendmentsRouter: RouterType = Router();

// List amendments for a document
amendmentsRouter.get('/documents/:docId/amendments', async (req, res) => {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: req.params.docId }
    });

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const amendments = await prisma.amendment.findMany({
      where: { documentId: req.params.docId },
      include: { changes: true },
      orderBy: { createdAt: 'desc' }
    });

    res.json(amendments);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list amendments' });
  }
});

// Create amendment
amendmentsRouter.post('/documents/:docId/amendments', async (req, res) => {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: req.params.docId }
    });

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const amendment = await prisma.amendment.create({
      data: {
        documentId: req.params.docId,
        title: req.body.title,
        description: req.body.description
      },
      include: { changes: true }
    });

    res.status(201).json(amendment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create amendment' });
  }
});

// Get amendment by ID
amendmentsRouter.get('/amendments/:id', async (req, res) => {
  try {
    const amendment = await prisma.amendment.findUnique({
      where: { id: req.params.id },
      include: { changes: true }
    });

    if (!amendment) {
      return res.status(404).json({ error: 'Amendment not found' });
    }

    res.json(amendment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get amendment' });
  }
});

// Update amendment
amendmentsRouter.put('/amendments/:id', async (req, res) => {
  try {
    const amendment = await prisma.amendment.findUnique({
      where: { id: req.params.id }
    });

    if (!amendment) {
      return res.status(404).json({ error: 'Amendment not found' });
    }

    if (amendment.status !== 'draft') {
      return res.status(400).json({ error: 'Can only update draft amendments' });
    }

    const updated = await prisma.amendment.update({
      where: { id: req.params.id },
      data: {
        title: req.body.title ?? amendment.title,
        description: req.body.description ?? amendment.description
      },
      include: { changes: true }
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update amendment' });
  }
});

// Delete amendment
amendmentsRouter.delete('/amendments/:id', async (req, res) => {
  try {
    const amendment = await prisma.amendment.findUnique({
      where: { id: req.params.id }
    });

    if (!amendment) {
      return res.status(404).json({ error: 'Amendment not found' });
    }

    if (amendment.status !== 'draft') {
      return res.status(400).json({ error: 'Can only delete draft amendments' });
    }

    await prisma.amendment.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete amendment' });
  }
});

// Propose amendment
amendmentsRouter.post('/amendments/:id/propose', async (req, res) => {
  try {
    const amendment = await prisma.amendment.findUnique({
      where: { id: req.params.id }
    });

    if (!amendment) {
      return res.status(404).json({ error: 'Amendment not found' });
    }

    if (amendment.status !== 'draft') {
      return res.status(400).json({ error: 'Can only propose draft amendments' });
    }

    const updated = await prisma.amendment.update({
      where: { id: req.params.id },
      data: {
        status: 'proposed',
        proposedAt: new Date()
      },
      include: { changes: true }
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to propose amendment' });
  }
});

// Withdraw amendment
amendmentsRouter.post('/amendments/:id/withdraw', async (req, res) => {
  try {
    const amendment = await prisma.amendment.findUnique({
      where: { id: req.params.id }
    });

    if (!amendment) {
      return res.status(404).json({ error: 'Amendment not found' });
    }

    if (!['draft', 'proposed'].includes(amendment.status)) {
      return res.status(400).json({ error: 'Cannot withdraw this amendment' });
    }

    const updated = await prisma.amendment.update({
      where: { id: req.params.id },
      data: {
        status: 'withdrawn',
        decidedAt: new Date()
      },
      include: { changes: true }
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to withdraw amendment' });
  }
});

// Pass amendment
amendmentsRouter.post('/amendments/:id/pass', async (req, res) => {
  try {
    const amendment = await prisma.amendment.findUnique({
      where: { id: req.params.id }
    });

    if (!amendment) {
      return res.status(404).json({ error: 'Amendment not found' });
    }

    if (amendment.status !== 'proposed') {
      return res.status(400).json({ error: 'Can only pass proposed amendments' });
    }

    const updated = await prisma.amendment.update({
      where: { id: req.params.id },
      data: {
        status: 'passed',
        decidedAt: new Date()
      },
      include: { changes: true }
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to pass amendment' });
  }
});

// Fail amendment
amendmentsRouter.post('/amendments/:id/fail', async (req, res) => {
  try {
    const amendment = await prisma.amendment.findUnique({
      where: { id: req.params.id }
    });

    if (!amendment) {
      return res.status(404).json({ error: 'Amendment not found' });
    }

    if (amendment.status !== 'proposed') {
      return res.status(400).json({ error: 'Can only fail proposed amendments' });
    }

    const updated = await prisma.amendment.update({
      where: { id: req.params.id },
      data: {
        status: 'failed',
        decidedAt: new Date()
      },
      include: { changes: true }
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fail amendment' });
  }
});

// Table amendment
amendmentsRouter.post('/amendments/:id/table', async (req, res) => {
  try {
    const amendment = await prisma.amendment.findUnique({
      where: { id: req.params.id }
    });

    if (!amendment) {
      return res.status(404).json({ error: 'Amendment not found' });
    }

    if (amendment.status !== 'proposed') {
      return res.status(400).json({ error: 'Can only table proposed amendments' });
    }

    const updated = await prisma.amendment.update({
      where: { id: req.params.id },
      data: { status: 'tabled' },
      include: { changes: true }
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to table amendment' });
  }
});

// Untable amendment
amendmentsRouter.post('/amendments/:id/untable', async (req, res) => {
  try {
    const amendment = await prisma.amendment.findUnique({
      where: { id: req.params.id }
    });

    if (!amendment) {
      return res.status(404).json({ error: 'Amendment not found' });
    }

    if (amendment.status !== 'tabled') {
      return res.status(400).json({ error: 'Can only untable tabled amendments' });
    }

    const updated = await prisma.amendment.update({
      where: { id: req.params.id },
      data: { status: 'proposed' },
      include: { changes: true }
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to untable amendment' });
  }
});

// List amendment changes
amendmentsRouter.get('/amendments/:id/changes', async (req, res) => {
  try {
    const amendment = await prisma.amendment.findUnique({
      where: { id: req.params.id }
    });

    if (!amendment) {
      return res.status(404).json({ error: 'Amendment not found' });
    }

    const changes = await prisma.amendmentChange.findMany({
      where: { amendmentId: req.params.id },
      orderBy: { position: 'asc' }
    });

    res.json(changes);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list amendment changes' });
  }
});

// Add amendment change
amendmentsRouter.post('/amendments/:id/changes', async (req, res) => {
  try {
    const amendment = await prisma.amendment.findUnique({
      where: { id: req.params.id },
      include: { changes: true }
    });

    if (!amendment) {
      return res.status(404).json({ error: 'Amendment not found' });
    }

    if (amendment.status !== 'draft') {
      return res.status(400).json({ error: 'Can only add changes to draft amendments' });
    }

    const maxPosition = amendment.changes.length > 0
      ? Math.max(...amendment.changes.map(c => c.position))
      : -1;

    const change = await prisma.amendmentChange.create({
      data: {
        amendmentId: req.params.id,
        changeType: req.body.change_type || req.body.changeType,
        targetSectionId: req.body.target_section_id || req.body.targetSectionId,
        newContent: req.body.new_content || req.body.newContent,
        newNumberLabel: req.body.new_number_label || req.body.newNumberLabel,
        newTitle: req.body.new_title || req.body.newTitle,
        position: maxPosition + 1
      }
    });

    res.status(201).json(change);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add amendment change' });
  }
});

// Delete amendment change
amendmentsRouter.delete('/changes/:id', async (req, res) => {
  try {
    const change = await prisma.amendmentChange.findUnique({
      where: { id: req.params.id }
    });

    if (!change) {
      return res.status(404).json({ error: 'Change not found' });
    }

    const amendment = await prisma.amendment.findUnique({
      where: { id: change.amendmentId }
    });

    if (amendment?.status !== 'draft') {
      return res.status(400).json({ error: 'Can only modify draft amendments' });
    }

    await prisma.amendmentChange.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete amendment change' });
  }
});

// Alternate delete endpoint
amendmentsRouter.delete('/amendment-changes/:id', async (req, res) => {
  try {
    const change = await prisma.amendmentChange.findUnique({
      where: { id: req.params.id }
    });

    if (!change) {
      return res.status(404).json({ error: 'Change not found' });
    }

    const amendment = await prisma.amendment.findUnique({
      where: { id: change.amendmentId }
    });

    if (amendment?.status !== 'draft') {
      return res.status(400).json({ error: 'Can only modify draft amendments' });
    }

    await prisma.amendmentChange.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete amendment change' });
  }
});

// Apply amendment
amendmentsRouter.post('/amendments/:id/apply', async (req, res) => {
  try {
    const amendment = await prisma.amendment.findUnique({
      where: { id: req.params.id },
      include: { changes: true }
    });

    if (!amendment) {
      return res.status(404).json({ error: 'Amendment not found' });
    }

    if (amendment.status !== 'passed') {
      return res.status(400).json({
        error: `Can only apply passed amendments. Current status: ${amendment.status}`
      });
    }

    if (amendment.resultingVersionId) {
      return res.status(400).json({ error: 'Amendment has already been applied' });
    }

    const effectiveDate = req.query.effective_date
      ? new Date(req.query.effective_date as string)
      : undefined;

    const service = new AmendmentService();
    const newVersion = await service.applyAmendment(amendment, effectiveDate);

    res.json({
      version: {
        id: newVersion.id,
        document_id: newVersion.documentId,
        version_number: newVersion.versionNumber,
        effective_date: newVersion.effectiveDate?.toISOString() || null,
        adopted_at: newVersion.adoptedAt?.toISOString() || null,
        notes: newVersion.notes,
        created_at: newVersion.createdAt.toISOString()
      }
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to apply amendment' });
  }
});

// Preview amendment
amendmentsRouter.get('/amendments/:id/preview', async (req, res) => {
  try {
    const amendment = await prisma.amendment.findUnique({
      where: { id: req.params.id },
      include: { changes: true }
    });

    if (!amendment) {
      return res.status(404).json({ error: 'Amendment not found' });
    }

    const service = new AmendmentService();
    const previewTree = await service.previewAmendment(amendment);

    res.json({
      amendment_id: amendment.id,
      amendment_title: amendment.title,
      sections: previewTree
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to preview amendment' });
  }
});
