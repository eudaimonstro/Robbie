/**
 * Robbie Integration Router
 *
 * Handles synchronization between Robbie (parliamentary procedure app) and Bylawyer.
 * When bylaw amendment motions pass in Robbie, they are synced here as amendments.
 */

import { Router, type Router as RouterType } from 'express';
import { prisma } from '../../db/prisma.js';
import { AmendmentService } from '../services/amendmentService.js';
import type { ChangeType, AmendmentStatus } from '@prisma/client';
import { validate } from '../../middleware/validate.js';
import { syncMotionBody, syncStatusParams } from '../../schemas/robbie.js';
import { logger } from '../../middleware/logger.js';

export const robbieRouter: RouterType = Router();

/**
 * Request body for syncing a motion from Robbie
 */
interface SyncMotionRequest {
  meetingCode: string;
  motionId: number;
  motionText: string;
  passed: boolean;
  timestamp: string;
  voteData: {
    yeaCount: number;
    nayCount: number;
    abstainCount: number;
    voterChoices?: Record<string, string>;
    voteRequirement?: string;
  };
  bylawAmendment: {
    documentId: string;
    documentTitle?: string;
    changeType: 'add' | 'modify' | 'delete' | 'renumber';
    targetSectionId?: string;
    targetSectionLabel?: string;
    newContent?: string;
    newNumberLabel?: string;
    newTitle?: string;
    parentSectionId?: string;
  };
}

/**
 * POST /api/robbie/sync-motion
 *
 * Sync a passed bylaw amendment motion from Robbie to Bylawyer.
 * Creates an amendment with status 'passed' and optionally applies it.
 */
robbieRouter.post('/sync-motion', validate({ body: syncMotionBody }), async (req, res) => {
  try {
    const body = req.body as SyncMotionRequest;

    // Validate required fields
    if (!body.meetingCode || !body.motionId || !body.bylawAmendment?.documentId) {
      return res.status(400).json({
        error: 'Missing required fields: meetingCode, motionId, bylawAmendment.documentId'
      });
    }

    // Check if this motion has already been synced
    const existingAmendment = await prisma.amendment.findFirst({
      where: {
        robbieMeetingCode: body.meetingCode,
        robbieMotionId: body.motionId
      }
    });

    if (existingAmendment) {
      return res.status(409).json({
        error: 'Motion already synced',
        amendmentId: existingAmendment.id,
        amendment: existingAmendment
      });
    }

    // Verify the document exists
    const document = await prisma.document.findUnique({
      where: { id: body.bylawAmendment.documentId }
    });

    if (!document) {
      return res.status(404).json({
        error: 'Document not found',
        documentId: body.bylawAmendment.documentId
      });
    }

    // Build amendment title from motion text or bylaw amendment details
    const title = body.bylawAmendment.documentTitle
      ? `Amendment to ${body.bylawAmendment.documentTitle}`
      : body.motionText.length > 100
        ? body.motionText.substring(0, 97) + '...'
        : body.motionText;

    // Determine amendment status based on vote result
    const status: AmendmentStatus = body.passed ? 'passed' : 'failed';

    // Map change type
    const changeTypeMap: Record<string, ChangeType> = {
      'add': 'add',
      'modify': 'modify',
      'delete': 'delete',
      'renumber': 'renumber'
    };

    // Create the amendment with Robbie tracking data
    const amendment = await prisma.amendment.create({
      data: {
        documentId: body.bylawAmendment.documentId,
        title,
        description: body.motionText,
        status,
        proposedAt: new Date(body.timestamp),
        decidedAt: new Date(body.timestamp),
        robbieMeetingCode: body.meetingCode,
        robbieMotionId: body.motionId,
        robbieVoteData: body.voteData as any,
        changes: {
          create: {
            changeType: changeTypeMap[body.bylawAmendment.changeType] || 'modify',
            targetSectionId: body.bylawAmendment.targetSectionId,
            newContent: body.bylawAmendment.newContent,
            newNumberLabel: body.bylawAmendment.newNumberLabel,
            newTitle: body.bylawAmendment.newTitle,
            position: 0
          }
        }
      },
      include: {
        changes: true
      }
    });

    // If the motion passed, automatically apply the amendment to create a new version
    let newVersion = null;
    if (body.passed) {
      try {
        const service = new AmendmentService();
        newVersion = await service.applyAmendment(amendment);
      } catch (applyError: any) {
        // Log but don't fail - the amendment is still created
        logger.error({ err: applyError }, 'Failed to auto-apply amendment');
      }
    }

    res.status(201).json({
      success: true,
      amendment: {
        id: amendment.id,
        title: amendment.title,
        status: amendment.status,
        documentId: amendment.documentId,
        robbieMeetingCode: amendment.robbieMeetingCode,
        robbieMotionId: amendment.robbieMotionId,
        changes: amendment.changes
      },
      newVersion: newVersion ? {
        id: newVersion.id,
        versionNumber: newVersion.versionNumber,
        effectiveDate: newVersion.effectiveDate
      } : null,
      applied: !!newVersion
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Error syncing motion from Robbie');
    res.status(500).json({
      error: 'Failed to sync motion',
      details: error.message
    });
  }
});

/**
 * GET /api/robbie/meetings/:amendmentId
 *
 * Get linked Robbie meeting details for an amendment.
 * Returns the meeting code and vote data if the amendment was synced from Robbie.
 */
robbieRouter.get('/meetings/:amendmentId', async (req, res) => {
  try {
    const amendment = await prisma.amendment.findUnique({
      where: { id: req.params.amendmentId },
      select: {
        id: true,
        robbieMeetingCode: true,
        robbieMotionId: true,
        robbieVoteData: true,
        status: true,
        decidedAt: true
      }
    });

    if (!amendment) {
      return res.status(404).json({ error: 'Amendment not found' });
    }

    if (!amendment.robbieMeetingCode) {
      return res.json({
        linked: false,
        message: 'This amendment was not synced from a Robbie meeting'
      });
    }

    const voteData = amendment.robbieVoteData as any;

    res.json({
      linked: true,
      meetingCode: amendment.robbieMeetingCode,
      motionId: amendment.robbieMotionId,
      voteResult: amendment.status,
      votedAt: amendment.decidedAt,
      vote: voteData ? {
        yeaCount: voteData.yeaCount,
        nayCount: voteData.nayCount,
        abstainCount: voteData.abstainCount,
        voteRequirement: voteData.voteRequirement,
        voterChoices: voteData.voterChoices
      } : null,
      robbieUrl: `http://localhost:5173/meeting/${amendment.robbieMeetingCode}`
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Error getting Robbie meeting details');
    res.status(500).json({
      error: 'Failed to get meeting details',
      details: error.message
    });
  }
});

/**
 * GET /api/robbie/amendments
 *
 * List all amendments that were synced from Robbie.
 */
robbieRouter.get('/amendments', async (req, res) => {
  try {
    const amendments = await prisma.amendment.findMany({
      where: {
        robbieMeetingCode: { not: null }
      },
      include: {
        document: {
          select: { id: true, title: true }
        },
        changes: true
      },
      orderBy: { decidedAt: 'desc' }
    });

    res.json(amendments.map(a => ({
      id: a.id,
      title: a.title,
      status: a.status,
      document: a.document,
      robbieMeetingCode: a.robbieMeetingCode,
      robbieMotionId: a.robbieMotionId,
      decidedAt: a.decidedAt,
      changes: a.changes
    })));
  } catch (error: any) {
    logger.error({ err: error }, 'Error listing Robbie amendments');
    res.status(500).json({
      error: 'Failed to list amendments',
      details: error.message
    });
  }
});

/**
 * GET /api/robbie/sync-status/:meetingCode/:motionId
 *
 * Check if a specific motion has been synced.
 */
robbieRouter.get('/sync-status/:meetingCode/:motionId', validate({ params: syncStatusParams }), async (req, res) => {
  try {
    const { meetingCode, motionId } = req.params;

    const amendment = await prisma.amendment.findFirst({
      where: {
        robbieMeetingCode: meetingCode,
        robbieMotionId: parseInt(motionId, 10)
      },
      select: {
        id: true,
        status: true,
        resultingVersionId: true
      }
    });

    if (!amendment) {
      return res.json({
        synced: false
      });
    }

    res.json({
      synced: true,
      amendmentId: amendment.id,
      status: amendment.status,
      applied: !!amendment.resultingVersionId
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Error checking sync status');
    res.status(500).json({
      error: 'Failed to check sync status',
      details: error.message
    });
  }
});
