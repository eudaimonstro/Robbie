import { Router, type RequestHandler, type Router as RouterType } from 'express';
import { prisma } from '../../db/prisma.js';
import type { AmendmentStatus, Prisma } from '../../generated/prisma/client.js';
import {
  AmendmentService,
  AmendmentAppliedError,
  AmendmentConflictError,
} from '../services/amendmentService.js';
import { validate, type RouteParams } from '../../middleware/validate.js';
import { uuidParam, docIdParam, orgIdParam } from '../../schemas/common.js';
import {
  createAmendmentBody,
  updateAmendmentBody,
  createAmendmentChangeBody,
  applyAmendmentQuery,
  organizationAmendmentsQuery,
} from '../../schemas/amendments.js';
import { getPagination, paginatedResponse } from '../../middleware/pagination.js';
import { logger } from '../../middleware/logger.js';
import { sectionLabel } from '@robbie-bylawyer/shared/utils';
import { fromParam, requireRole } from '../../orgs/requireRole.js';
import {
  orgOfAmendment,
  orgOfAmendmentChange,
  orgOfDocument,
  orgOfOrganization,
} from '../../orgs/resolvers.js';
import { canEditAmendment, roleNeeded } from '../../orgs/roles.js';

export const amendmentsRouter: RouterType = Router();

const byDocument = fromParam('docId', orgOfDocument);
const byAmendment = fromParam('id', orgOfAmendment);
const byChange = fromParam('id', orgOfAmendmentChange);
const byOrganization = fromParam('orgId', orgOfOrganization);
const NEEDS_SECRETARY = roleNeeded('secretary');

/**
 * Hold the amendment's row until the transaction ends and answer whether it is still a draft.
 * A status change (propose, withdraw) waits for the lock, so a draft edit made under it can't
 * land after the amendment left draft.
 */
async function lockDraft(tx: Prisma.TransactionClient, amendmentId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ status: string }>>`
    SELECT status FROM "Amendment" WHERE id = ${amendmentId} FOR UPDATE`;
  return rows[0]?.status === 'draft';
}

/**
 * Change an amendment's status only if it is still in one of `from`, so a status change since
 * the caller's read can't be overtaken (a propose can't bring back a withdrawn amendment).
 * Answers the amendment with its changes, or null if it had left `from`.
 */
async function transition(
  id: string,
  from: AmendmentStatus[],
  data: Prisma.AmendmentUpdateManyMutationInput,
) {
  const { count } = await prisma.amendment.updateMany({
    where: { id, status: { in: from } },
    data,
  });
  if (count === 0) return null;
  return prisma.amendment.findUniqueOrThrow({ where: { id }, include: { changes: true } });
}

/**
 * GET /api/organizations/:orgId/amendments?status=draft,proposed
 * The amendments to all of the organization's documents, newest first, with their changes: of
 * the statuses listed, or all of them
 */
amendmentsRouter.get(
  '/organizations/:orgId/amendments',
  validate({ params: orgIdParam, query: organizationAmendmentsQuery }),
  requireRole('viewer', byOrganization),
  async (req, res) => {
    try {
      const statuses = (req.query as { status?: AmendmentStatus[] }).status;
      const amendments = await prisma.amendment.findMany({
        where: {
          document: { organizationId: req.org!.id },
          ...(statuses ? { status: { in: statuses } } : {}),
        },
        include: { changes: true },
        orderBy: { createdAt: 'desc' },
      });
      res.json(amendments);
    } catch (error) {
      logger.error({ err: error }, "Failed to list the organization's amendments");
      res.status(500).json({ error: 'Failed to list amendments' });
    }
  },
);

// List amendments for a document
amendmentsRouter.get(
  '/documents/:docId/amendments',
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
  requireRole('member', byDocument),
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
          createdById: req.user!.id,
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
amendmentsRouter.get(
  '/amendments/:id',
  validate({ params: uuidParam }),
  requireRole('viewer', byAmendment),
  async (req, res) => {
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
  },
);

// Update amendment
amendmentsRouter.put(
  '/amendments/:id',
  validate({ params: uuidParam, body: updateAmendmentBody }),
  requireRole('member', byAmendment),
  async (req, res) => {
    try {
      const amendment = await prisma.amendment.findUnique({
        where: { id: req.params.id },
      });

      if (!amendment) {
        return res.status(404).json({ error: 'Amendment not found' });
      }

      if (!canEditAmendment(req.org!.role, req.user!.id, amendment)) {
        return res.status(403).json({ error: NEEDS_SECRETARY });
      }

      // Written only if still a draft, so a status change since the read can't be overtaken
      const { count } = await prisma.amendment.updateMany({
        where: { id: req.params.id, status: 'draft' },
        data: { title: req.body.title, description: req.body.description },
      });
      if (count === 0) {
        return res.status(400).json({ error: 'Can only update draft amendments' });
      }

      const updated = await prisma.amendment.findUniqueOrThrow({
        where: { id: req.params.id },
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
amendmentsRouter.delete(
  '/amendments/:id',
  validate({ params: uuidParam }),
  requireRole('member', byAmendment),
  async (req, res) => {
    try {
      const amendment = await prisma.amendment.findUnique({
        where: { id: req.params.id },
      });

      if (!amendment) {
        return res.status(404).json({ error: 'Amendment not found' });
      }

      if (!canEditAmendment(req.org!.role, req.user!.id, amendment)) {
        return res.status(403).json({ error: NEEDS_SECRETARY });
      }

      // Deleted only if still a draft, so a status change since the read can't be overtaken
      const { count } = await prisma.amendment.deleteMany({
        where: { id: req.params.id, status: 'draft' },
      });
      if (count === 0) {
        return res.status(400).json({ error: 'Can only delete draft amendments' });
      }
      res.status(204).send();
    } catch (error) {
      logger.error({ err: error }, 'Failed to delete amendment');
      res.status(500).json({ error: 'Failed to delete amendment' });
    }
  },
);

// Propose amendment
amendmentsRouter.post(
  '/amendments/:id/propose',
  validate({ params: uuidParam }),
  requireRole('secretary', byAmendment),
  async (req, res) => {
    try {
      const amendment = await prisma.amendment.findUnique({
        where: { id: req.params.id },
      });

      if (!amendment) {
        return res.status(404).json({ error: 'Amendment not found' });
      }

      const updated = await transition(req.params.id, ['draft'], {
        status: 'proposed',
        proposedAt: new Date(),
      });
      if (!updated) {
        return res.status(400).json({ error: 'Can only propose draft amendments' });
      }

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
  requireRole('secretary', byAmendment),
  async (req, res) => {
    try {
      const amendment = await prisma.amendment.findUnique({
        where: { id: req.params.id },
      });

      if (!amendment) {
        return res.status(404).json({ error: 'Amendment not found' });
      }

      const updated = await transition(req.params.id, ['draft', 'proposed'], {
        status: 'withdrawn',
        decidedAt: new Date(),
      });
      if (!updated) {
        return res.status(400).json({ error: 'Cannot withdraw this amendment' });
      }

      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, 'Failed to withdraw amendment');
      res.status(500).json({ error: 'Failed to withdraw amendment' });
    }
  },
);

// Pass amendment
amendmentsRouter.post(
  '/amendments/:id/pass',
  validate({ params: uuidParam }),
  requireRole('secretary', byAmendment),
  async (req, res) => {
    try {
      const amendment = await prisma.amendment.findUnique({
        where: { id: req.params.id },
      });

      if (!amendment) {
        return res.status(404).json({ error: 'Amendment not found' });
      }

      const updated = await transition(req.params.id, ['proposed'], {
        status: 'passed',
        decidedAt: new Date(),
      });
      if (!updated) {
        return res.status(400).json({ error: 'Can only pass proposed amendments' });
      }

      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, 'Failed to pass amendment');
      res.status(500).json({ error: 'Failed to pass amendment' });
    }
  },
);

// Fail amendment
amendmentsRouter.post(
  '/amendments/:id/fail',
  validate({ params: uuidParam }),
  requireRole('secretary', byAmendment),
  async (req, res) => {
    try {
      const amendment = await prisma.amendment.findUnique({
        where: { id: req.params.id },
      });

      if (!amendment) {
        return res.status(404).json({ error: 'Amendment not found' });
      }

      const updated = await transition(req.params.id, ['proposed'], {
        status: 'failed',
        decidedAt: new Date(),
      });
      if (!updated) {
        return res.status(400).json({ error: 'Can only fail proposed amendments' });
      }

      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, 'Failed to fail amendment');
      res.status(500).json({ error: 'Failed to fail amendment' });
    }
  },
);

// Table amendment
amendmentsRouter.post(
  '/amendments/:id/table',
  validate({ params: uuidParam }),
  requireRole('secretary', byAmendment),
  async (req, res) => {
    try {
      const amendment = await prisma.amendment.findUnique({
        where: { id: req.params.id },
      });

      if (!amendment) {
        return res.status(404).json({ error: 'Amendment not found' });
      }

      const updated = await transition(req.params.id, ['proposed'], { status: 'tabled' });
      if (!updated) {
        return res.status(400).json({ error: 'Can only table proposed amendments' });
      }

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
  requireRole('secretary', byAmendment),
  async (req, res) => {
    try {
      const amendment = await prisma.amendment.findUnique({
        where: { id: req.params.id },
      });

      if (!amendment) {
        return res.status(404).json({ error: 'Amendment not found' });
      }

      const updated = await transition(req.params.id, ['tabled'], { status: 'proposed' });
      if (!updated) {
        return res.status(400).json({ error: 'Can only untable tabled amendments' });
      }

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
  requireRole('viewer', byAmendment),
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
  requireRole('member', byAmendment),
  async (req, res) => {
    try {
      const amendment = await prisma.amendment.findUnique({
        where: { id: req.params.id },
      });

      if (!amendment) {
        return res.status(404).json({ error: 'Amendment not found' });
      }

      if (!canEditAmendment(req.org!.role, req.user!.id, amendment)) {
        return res.status(403).json({ error: NEEDS_SECRETARY });
      }

      if (amendment.status !== 'draft') {
        return res.status(400).json({ error: 'Can only add changes to draft amendments' });
      }

      // The sections a change names must be in the document's current version, so in this
      // organization. parentSectionId is checked too, though only targetSectionId is stored.
      const sectionIds = [
        req.body.target_section_id || req.body.targetSectionId,
        req.body.parent_section_id || req.body.parentSectionId,
      ].filter((id): id is string => Boolean(id));
      let sections: Array<{ id: string; numberLabel: string | null; title: string | null }> = [];
      if (sectionIds.length > 0) {
        const document = await prisma.document.findUnique({
          where: { id: amendment.documentId },
          select: { currentVersionId: true },
        });
        sections = document?.currentVersionId
          ? await prisma.section.findMany({
              where: { id: { in: sectionIds }, versionId: document.currentVersionId },
              select: { id: true, numberLabel: true, title: true },
            })
          : [];
        if (sections.length !== new Set(sectionIds).size) {
          return res.status(404).json({ error: 'Section not found' });
        }
      }
      // The section named as it is now, which outlives its id once a version is applied
      const targetSectionId = req.body.target_section_id || req.body.targetSectionId;
      const target = sections.find((s) => s.id === targetSectionId);

      const change = await prisma.$transaction(async (tx) => {
        if (!(await lockDraft(tx, req.params.id))) {
          return null;
        }
        const { _max } = await tx.amendmentChange.aggregate({
          where: { amendmentId: req.params.id },
          _max: { position: true },
        });
        return tx.amendmentChange.create({
          data: {
            amendmentId: req.params.id,
            changeType: req.body.change_type || req.body.changeType,
            targetSectionId,
            targetLabel: target ? sectionLabel(target) : null,
            newContent: req.body.new_content || req.body.newContent,
            newNumberLabel: req.body.new_number_label || req.body.newNumberLabel,
            newTitle: req.body.new_title || req.body.newTitle,
            position: (_max.position ?? -1) + 1,
          },
        });
      });
      if (!change) {
        return res.status(400).json({ error: 'Can only add changes to draft amendments' });
      }

      res.status(201).json(change);
    } catch (error) {
      logger.error({ err: error }, 'Failed to add amendment change');
      res.status(500).json({ error: 'Failed to add amendment change' });
    }
  },
);

// Delete amendment change
const deleteChange: RequestHandler<RouteParams> = async (req, res) => {
  try {
    const change = await prisma.amendmentChange.findUnique({
      where: { id: req.params.id },
      include: { amendment: true },
    });

    if (!change) {
      return res.status(404).json({ error: 'Change not found' });
    }

    if (!canEditAmendment(req.org!.role, req.user!.id, change.amendment)) {
      return res.status(403).json({ error: NEEDS_SECRETARY });
    }

    const result = await prisma.$transaction(async (tx) => {
      if (!(await lockDraft(tx, change.amendmentId))) {
        return 'not draft';
      }
      const { count } = await tx.amendmentChange.deleteMany({ where: { id: req.params.id } });
      return count === 0 ? 'gone' : 'deleted';
    });
    if (result === 'not draft') {
      return res.status(400).json({ error: 'Can only modify draft amendments' });
    }
    if (result === 'gone') {
      return res.status(404).json({ error: 'Change not found' });
    }
    res.status(204).send();
  } catch (error) {
    logger.error({ err: error }, 'Failed to delete amendment change');
    res.status(500).json({ error: 'Failed to delete amendment change' });
  }
};

amendmentsRouter.delete(
  '/changes/:id',
  validate({ params: uuidParam }),
  requireRole('member', byChange),
  deleteChange,
);

// Alternate delete endpoint
amendmentsRouter.delete(
  '/amendment-changes/:id',
  validate({ params: uuidParam }),
  requireRole('member', byChange),
  deleteChange,
);

// Apply amendment
amendmentsRouter.post(
  '/amendments/:id/apply',
  validate({ params: uuidParam, query: applyAmendmentQuery }),
  requireRole('secretary', byAmendment),
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
      if (error instanceof AmendmentAppliedError) {
        return res.status(400).json({ error: error.message });
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
  requireRole('viewer', byAmendment),
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
