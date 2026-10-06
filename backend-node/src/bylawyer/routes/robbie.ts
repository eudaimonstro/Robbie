/**
 * Robbie Integration Router
 *
 * Read-only views of amendments synced from live meetings. The sync itself runs in the socket
 * layer (bylawSyncService) when a vote closes; no HTTP route syncs.
 */

import { Router, type Router as RouterType } from 'express';
import { prisma } from '../../db/prisma.js';
import { validate } from '../../middleware/validate.js';
import { amendmentIdParam, syncStatusParams } from '../../schemas/robbie.js';
import { logger } from '../../middleware/logger.js';
import { fromParam, requireRole } from '../../orgs/requireRole.js';
import { orgOfAmendment, orgOfPacketCode } from '../../orgs/resolvers.js';

export const robbieRouter: RouterType = Router();

/**
 * GET /api/robbie/meetings/:amendmentId
 *
 * Get linked Robbie meeting details for an amendment.
 * Returns the meeting code and vote data if the amendment was synced from Robbie.
 */
robbieRouter.get(
  '/meetings/:amendmentId',
  validate({ params: amendmentIdParam }),
  requireRole('viewer', fromParam('amendmentId', orgOfAmendment)),
  async (req, res) => {
    try {
      const amendment = await prisma.amendment.findUnique({
        where: { id: req.params.amendmentId },
        select: {
          id: true,
          robbieMeetingCode: true,
          robbieMotionId: true,
          robbieVoteData: true,
          status: true,
          decidedAt: true,
        },
      });

      if (!amendment) {
        return res.status(404).json({ error: 'Amendment not found' });
      }

      if (!amendment.robbieMeetingCode) {
        return res.json({
          linked: false,
          message: 'This amendment was not synced from a Robbie meeting',
        });
      }

      const voteData = amendment.robbieVoteData as any;

      res.json({
        linked: true,
        meetingCode: amendment.robbieMeetingCode,
        motionId: amendment.robbieMotionId,
        voteResult: amendment.status,
        votedAt: amendment.decidedAt,
        vote: voteData
          ? {
              yeaCount: voteData.yeaCount,
              nayCount: voteData.nayCount,
              abstainCount: voteData.abstainCount,
              voteRequirement: voteData.voteRequirement,
              voterChoices: voteData.voterChoices,
            }
          : null,
        robbieUrl: `http://localhost:5173/meeting/${amendment.robbieMeetingCode}`,
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Error getting Robbie meeting details');
      res.status(500).json({
        error: 'Failed to get meeting details',
      });
    }
  },
);

/**
 * GET /api/robbie/sync-status/:meetingCode/:motionId
 *
 * Check if a specific motion has been synced into the meeting's organization.
 */
robbieRouter.get(
  '/sync-status/:meetingCode/:motionId',
  validate({ params: syncStatusParams }),
  requireRole('viewer', fromParam('meetingCode', orgOfPacketCode)),
  async (req, res) => {
    try {
      const { meetingCode, motionId } = req.params;

      const amendment = await prisma.amendment.findFirst({
        where: {
          robbieMeetingCode: meetingCode,
          robbieMotionId: parseInt(motionId, 10),
          // Only the meeting's organization's amendments
          document: { organizationId: req.org!.id },
        },
        select: {
          id: true,
          status: true,
          resultingVersionId: true,
        },
      });

      if (!amendment) {
        return res.json({
          synced: false,
        });
      }

      res.json({
        synced: true,
        amendmentId: amendment.id,
        status: amendment.status,
        applied: !!amendment.resultingVersionId,
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Error checking sync status');
      res.status(500).json({
        error: 'Failed to check sync status',
      });
    }
  },
);
