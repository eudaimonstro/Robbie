import { Router, type Router as RouterType } from 'express';
import { prisma } from '../../db/prisma.js';
import { AmendmentService, AmendmentConflictError } from '../services/amendmentService.js';
import { validate } from '../../middleware/validate.js';
import { uuidParam, docIdParam } from '../../schemas/common.js';
import {
  createAmendmentBody,
  updateAmendmentBody,
  createAmendmentChangeBody,
  applyAmendmentQuery,
} from '../../schemas/amendments.js';
import { getPagination, paginatedResponse } from '../../middleware/pagination.js';
import { logger } from '../../middleware/logger.js';

export const amendmentsRouter: RouterType = Router();

// List amendments for a document
amendmentsRouter.get(
  '/documents/:docId/amendments',
  validate({ params: docIdParam }),
  async (req, res) => {
    try {
      const doc = await prisma.document.findUnique({
        where: { id: req.params.docId },
      });

      if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
      }

      const where = { documentId: req.params.docId };

      if (req.query.page) {
        const pagination = getPagination(req);
        const [amendments, total] = await Promise.all([
          prisma.amendment.findMany({
            where,
            include: { changes: true },
            orderBy: { createdAt: 'desc' },
            skip: pagination.skip,
            take: pagination.limit,
          }),
          prisma.amendment.count({ where }),
        ]);
        return res.json(paginatedResponse(amendments, total, pagination));
      }

      const amendments = await prisma.amendment.findMany({
        where,
        include: { changes: true },
        orderBy: { createdAt: 'desc' },
      });

      res.json(amendments);
    } catch (error) {
      logger.error({ err: error }, 'Failed to list amendments');
      res.status(500).json({ error: 'Failed to list amendments' });
    }
  },
);

// Create amendment
amendmentsRouter.post(
  '/documents/:docId/amendments',
  validate({ params: docIdParam, body: createAmendmentBody }),
  async (req, res) => {
    try {
      const doc = await prisma.document.findUnique({
        where: { id: req.params.docId },
      });

      if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
      }

      const amendment = await prisma.amendment.create({
        data: {
          documentId: req.params.docId,
          title: req.body.title,
          description: req.body.description,
        },
        include: { changes: true },
      });

      res.status(201).json(amendment);
    } catch (error) {
      logger.error({ err: error }, 'Failed to create amendment');
      res.status(500).json({ error: 'Failed to create amendment' });
    }
  },
);

// Get amendment by ID
amendmentsRouter.get('/amendments/:id', validate({ params: uuidParam }), async (req, res) => {
  try {
    const amendment = await prisma.amendment.findUnique({
      where: { id: req.params.id },
      include: { changes: true },
    });

    if (!amendment) {
      return res.status(404).json({ error: 'Amendment not found' });
    }

    res.json(amendment);
  } catch (error) {
    logger.error({ err: error }, 'Failed to get amendment');
    res.status(500).json({ error: 'Failed to get amendment' });
  }
});

// Update amendment
amendmentsRouter.put(
  '/amendments/:id',
  validate({ params: uuidParam, body: updateAmendmentBody }),
  async (req, res) => {
    try {
      const amendment = await prisma.amendment.findUnique({
        where: { id: req.params.id },
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
          description: req.body.description ?? amendment.description,
        },
        include: { changes: true },
      });

      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, 'Failed to update amendment');
      res.status(500).json({ error: 'Failed to update amendment' });
    }
  },
);

// Delete amendment
amendmentsRouter.delete('/amendments/:id', validate({ params: uuidParam }), async (req, res) => {
  try {
    const amendment = await prisma.amendment.findUnique({
      where: { id: req.params.id },
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
    logger.error({ err: error }, 'Failed to delete amendment');
    res.status(500).json({ error: 'Failed to delete amendment' });
  }
});

// Propose amendment
amendmentsRouter.post(
  '/amendments/:id/propose',
  validate({ params: uuidParam }),
  async (req, res) => {
    try {
      const amendment = await prisma.amendment.findUnique({
        where: { id: req.params.id },
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
          proposedAt: new Date(),
        },
        include: { changes: true },
      });

      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, 'Failed to propose amendment');
      res.status(500).json({ error: 'Failed to propose amendment' });
    }
  },
);

// Withdraw amendment
amendmentsRouter.post(
  '/amendments/:id/withdraw',
  validate({ params: uuidParam }),
  async (req, res) => {
    try {
      const amendment = await prisma.amendment.findUnique({
        where: { id: req.params.id },
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
          decidedAt: new Date(),
        },
        include: { changes: true },
      });

      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, 'Failed to withdraw amendment');
      res.status(500).json({ error: 'Failed to withdraw amendment' });
    }
  },
);

// Pass amendment
amendmentsRouter.post('/amendments/:id/pass', validate({ params: uuidParam }), async (req, res) => {
  try {
    const amendment = await prisma.amendment.findUnique({
      where: { id: req.params.id },
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
        decidedAt: new Date(),
      },
      include: { changes: true },
    });

    res.json(updated);
  } catch (error) {
    logger.error({ err: error }, 'Failed to pass amendment');
    res.status(500).json({ error: 'Failed to pass amendment' });
  }
});

// Fail amendment
amendmentsRouter.post('/amendments/:id/fail', validate({ params: uuidParam }), async (req, res) => {
  try {
    const amendment = await prisma.amendment.findUnique({
      where: { id: req.params.id },
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
        decidedAt: new Date(),
      },
      include: { changes: true },
    });

    res.json(updated);
  } catch (error) {
    logger.error({ err: error }, 'Failed to fail amendment');
    res.status(500).json({ error: 'Failed to fail amendment' });
  }
});

// Table amendment
amendmentsRouter.post(
  '/amendments/:id/table',
  validate({ params: uuidParam }),
  async (req, res) => {
    try {
      const amendment = await prisma.amendment.findUnique({
        where: { id: req.params.id },
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
        include: { changes: true },
      });

      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, 'Failed to table amendment');
      res.status(500).json({ error: 'Failed to table amendment' });
    }
  },
);

// Untable amendment
amendmentsRouter.post(
  '/amendments/:id/untable',
  validate({ params: uuidParam }),
  async (req, res) => {
    try {
      const amendment = await prisma.amendment.findUnique({
        where: { id: req.params.id },
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
        include: { changes: true },
      });

      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, 'Failed to untable amendment');
      res.status(500).json({ error: 'Failed to untable amendment' });
    }
  },
);

// List amendment changes
amendmentsRouter.get(
  '/amendments/:id/changes',
  validate({ params: uuidParam }),
  async (req, res) => {
    try {
      const amendment = await prisma.amendment.findUnique({
        where: { id: req.params.id },
      });

      if (!amendment) {
        return res.status(404).json({ error: 'Amendment not found' });
      }

      const changes = await prisma.amendmentChange.findMany({
        where: { amendmentId: req.params.id },
        orderBy: { position: 'asc' },
      });

      res.json(changes);
    } catch (error) {
      logger.error({ err: error }, 'Failed to list amendment changes');
      res.status(500).json({ error: 'Failed to list amendment changes' });
    }
  },
);

// Add amendment change
amendmentsRouter.post(
  '/amendments/:id/changes',
  validate({ params: uuidParam, body: createAmendmentChangeBody }),
  async (req, res) => {
    try {
      const amendment = await prisma.amendment.findUnique({
        where: { id: req.params.id },
        include: { changes: true },
      });

      if (!amendment) {
        return res.status(404).json({ error: 'Amendment not found' });
      }

      if (amendment.status !== 'draft') {
        return res.status(400).json({ error: 'Can only add changes to draft amendments' });
      }

      const maxPosition =
        amendment.changes.length > 0 ? Math.max(...amendment.changes.map((c) => c.position)) : -1;

      const change = await prisma.amendmentChange.create({
        data: {
          amendmentId: req.params.id,
          changeType: req.body.change_type || req.body.changeType,
          targetSectionId: req.body.target_section_id || req.body.targetSectionId,
          newContent: req.body.new_content || req.body.newContent,
          newNumberLabel: req.body.new_number_label || req.body.newNumberLabel,
          newTitle: req.body.new_title || req.body.newTitle,
          position: maxPosition + 1,
        },
      });

      res.status(201).json(change);
    } catch (error) {
      logger.error({ err: error }, 'Failed to add amendment change');
      res.status(500).json({ error: 'Failed to add amendment change' });
    }
  },
);

// Delete amendment change
amendmentsRouter.delete('/changes/:id', validate({ params: uuidParam }), async (req, res) => {
  try {
    const change = await prisma.amendmentChange.findUnique({
      where: { id: req.params.id },
    });

    if (!change) {
      return res.status(404).json({ error: 'Change not found' });
    }

    const amendment = await prisma.amendment.findUnique({
      where: { id: change.amendmentId },
    });

    if (amendment?.status !== 'draft') {
      return res.status(400).json({ error: 'Can only modify draft amendments' });
    }

    await prisma.amendmentChange.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    logger.error({ err: error }, 'Failed to delete amendment change');
    res.status(500).json({ error: 'Failed to delete amendment change' });
  }
});

// Alternate delete endpoint
amendmentsRouter.delete(
  '/amendment-changes/:id',
  validate({ params: uuidParam }),
  async (req, res) => {
    try {
      const change = await prisma.amendmentChange.findUnique({
        where: { id: req.params.id },
      });

      if (!change) {
        return res.status(404).json({ error: 'Change not found' });
      }

      const amendment = await prisma.amendment.findUnique({
        where: { id: change.amendmentId },
      });

      if (amendment?.status !== 'draft') {
        return res.status(400).json({ error: 'Can only modify draft amendments' });
      }

      await prisma.amendmentChange.delete({ where: { id: req.params.id } });
      res.status(204).send();
    } catch (error) {
      logger.error({ err: error }, 'Failed to delete amendment change');
      res.status(500).json({ error: 'Failed to delete amendment change' });
    }
  },
);

// Apply amendment
amendmentsRouter.post(
  '/amendments/:id/apply',
  validate({ params: uuidParam, query: applyAmendmentQuery }),
  async (req, res) => {
    try {
      const amendment = await prisma.amendment.findUnique({
        where: { id: req.params.id },
        include: { changes: true },
      });

      if (!amendment) {
        return res.status(404).json({ error: 'Amendment not found' });
      }

      if (amendment.status !== 'passed') {
        return res.status(400).json({
          error: `Can only apply passed amendments. Current status: ${amendment.status}`,
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
          documentId: newVersion.documentId,
          versionNumber: newVersion.versionNumber,
          effectiveDate: newVersion.effectiveDate?.toISOString() || null,
          adoptedAt: newVersion.adoptedAt?.toISOString() || null,
          notes: newVersion.notes,
          createdAt: newVersion.createdAt.toISOString(),
        },
      });
    } catch (error: any) {
      if (error instanceof AmendmentConflictError) {
        return res.status(409).json({ error: error.message });
      }
      // Other failures are logged, not echoed: a database error's text describes the schema
      logger.error({ err: error }, 'Failed to apply amendment');
      res.status(500).json({ error: 'Failed to apply amendment' });
    }
  },
);

// Preview amendment
amendmentsRouter.get(
  '/amendments/:id/preview',
  validate({ params: uuidParam }),
  async (req, res) => {
    try {
      const amendment = await prisma.amendment.findUnique({
        where: { id: req.params.id },
        include: { changes: true },
      });

      if (!amendment) {
        return res.status(404).json({ error: 'Amendment not found' });
      }

      const service = new AmendmentService();
      const previewTree = await service.previewAmendment(amendment);

      res.json({
        amendmentId: amendment.id,
        amendmentTitle: amendment.title,
        sections: previewTree,
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to preview amendment');
      res.status(500).json({ error: 'Failed to preview amendment' });
    }
  },
);
