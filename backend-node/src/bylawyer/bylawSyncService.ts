/**
 * Bylaw Sync Service
 *
 * Handles synchronization of passed bylaw amendment motions from Robbie to Bylawyer.
 * This is called after CLOSE_VOTING actions when a bylawAmendment motion is voted on.
 *
 * Uses direct Prisma calls instead of HTTP since both run in the same server.
 */

import type { MeetingState, MeetingAction, CompletedMotion } from '@robbie-bylawyer/shared/types';
import type { ChangeType, AmendmentStatus } from '../generated/prisma/client.js';
import { NO_VOTES } from '@robbie-bylawyer/shared/utils';
import { prisma } from '../db/prisma.js';
import { AmendmentService } from './services/amendmentService.js';
import { logger } from '../middleware/logger.js';

interface SyncResult {
  success: boolean;
  amendmentId?: string;
  applied?: boolean;
  error?: string;
}

/**
 * Check if we should sync a bylaw amendment after a vote closes.
 * Called after CLOSE_VOTING action is processed.
 */
export async function checkAndSyncBylawAmendment(
  meetingCode: string,
  action: MeetingAction,
  previousState: MeetingState,
  newState: MeetingState,
): Promise<SyncResult | null> {
  // Only process CLOSE_VOTING actions
  if (action.type !== 'CLOSE_VOTING') {
    return null;
  }

  // Check if the voted-on motion was a bylawAmendment
  const votedMotion = previousState.currentMotion;
  if (!votedMotion || votedMotion.type !== 'bylawAmendment') {
    return null;
  }

  // Check if the motion had bylaw amendment data
  if (!votedMotion.bylawAmendment) {
    logger.warn({ motionId: votedMotion.id }, 'bylawAmendment motion missing bylawAmendment data');
    return null;
  }

  // Find the completed motion in the new state to determine if it passed: the latest record,
  // since a motion voted on again after reconsideration is recorded again with its id
  const completedMotion = newState.completedMotions.filter((cm) => cm.id === votedMotion.id).at(-1);

  if (!completedMotion) {
    // Motion wasn't completed (might have been tabled or something)
    logger.info({ motionId: votedMotion.id }, 'Motion not in completedMotions, skipping sync');
    return null;
  }

  // The meeting's packet records its organization (see POST /api/bylawyer/link-meeting)
  const packet = await prisma.meetingPacket.findUnique({
    where: { robbieCode: meetingCode },
    select: { organizationId: true },
  });

  if (!packet) {
    logger.info({ meetingCode }, 'Meeting not linked to an organization, skipping sync');
    return null;
  }

  // Only a document of the meeting's organization can be amended from it
  const document = await prisma.document.findUnique({
    where: { id: votedMotion.bylawAmendment.documentId },
    select: { organizationId: true, currentVersionId: true },
  });

  if (document?.organizationId !== packet.organizationId) {
    logger.warn(
      { meetingCode, documentId: votedMotion.bylawAmendment.documentId },
      "Motion's document is not in the meeting's organization, skipping sync",
    );
    return null;
  }

  // The target section must be in the document's current version, as for a change added
  // through POST /api/amendments/:id/changes
  const { targetSectionId } = votedMotion.bylawAmendment;
  if (targetSectionId) {
    const section = document.currentVersionId
      ? await prisma.section.findFirst({
          where: { id: targetSectionId, versionId: document.currentVersionId },
          select: { id: true },
        })
      : null;
    if (!section) {
      logger.warn(
        { meetingCode, documentId: votedMotion.bylawAmendment.documentId, targetSectionId },
        "Motion's section is not in the document's current version, skipping sync",
      );
      return null;
    }
  }

  // Sync the motion to Bylawyer
  return syncMotionToBylawyer(meetingCode, votedMotion, completedMotion, previousState);
}

/**
 * Sync a completed bylaw amendment motion to Bylawyer.
 * Uses direct Prisma calls instead of HTTP.
 */
async function syncMotionToBylawyer(
  meetingCode: string,
  votedMotion: NonNullable<MeetingState['currentMotion']>,
  completedMotion: CompletedMotion,
  previousState: MeetingState,
): Promise<SyncResult> {
  try {
    const bylawAmendment = votedMotion.bylawAmendment!;

    logger.info(
      { motionId: votedMotion.id, passed: completedMotion.passed },
      'Syncing motion to Bylawyer',
    );

    // Check if this motion has already been synced
    const existingAmendment = await prisma.amendment.findFirst({
      where: {
        robbieMeetingCode: meetingCode,
        robbieMotionId: votedMotion.id,
      },
    });

    if (existingAmendment) {
      logger.info({ motionId: votedMotion.id }, 'Motion already synced');
      return {
        success: true,
        amendmentId: existingAmendment.id,
        applied: !!existingAmendment.resultingVersionId,
      };
    }

    // Verify the document exists
    const document = await prisma.document.findUnique({
      where: { id: bylawAmendment.documentId },
    });

    if (!document) {
      logger.error({ documentId: bylawAmendment.documentId }, 'Document not found for bylaw sync');
      return {
        success: false,
        error: `Document not found: ${bylawAmendment.documentId}`,
      };
    }

    // Build amendment title
    const title = bylawAmendment.documentTitle
      ? `Amendment to ${bylawAmendment.documentTitle}`
      : votedMotion.text.length > 100
        ? votedMotion.text.substring(0, 97) + '...'
        : votedMotion.text;

    // Determine amendment status based on vote result
    const status: AmendmentStatus = completedMotion.passed ? 'passed' : 'failed';

    // Map change type
    const changeTypeMap: Record<string, ChangeType> = {
      add: 'add',
      modify: 'modify',
      delete: 'delete',
      renumber: 'renumber',
    };

    // Build vote data: the device votes and the chair's floor tally, and their total
    const deviceVotes = completedMotion.deviceVotes ?? previousState.votes;
    const floorVotes = completedMotion.floorVotes ?? NO_VOTES;
    const voteData = {
      yeaCount: deviceVotes.yea + floorVotes.yea,
      nayCount: deviceVotes.nay + floorVotes.nay,
      abstainCount: deviceVotes.abstain + floorVotes.abstain,
      deviceVotes,
      floorVotes,
      method: completedMotion.method ?? previousState.votingMethod,
      voterChoices: completedMotion.voterChoices,
      voteRequirement: votedMotion.vote,
    };

    // The motion's timestamp is only a display time of day; the sync runs as the vote closes
    const decidedAt = new Date();

    // Create the amendment with Robbie tracking data
    const amendment = await prisma.amendment.create({
      data: {
        documentId: bylawAmendment.documentId,
        title,
        description: votedMotion.text,
        status,
        proposedAt: decidedAt,
        decidedAt,
        robbieMeetingCode: meetingCode,
        robbieMotionId: votedMotion.id,
        robbieVoteData: voteData as any,
        changes: {
          create: {
            changeType: changeTypeMap[bylawAmendment.changeType] || 'modify',
            targetSectionId: bylawAmendment.targetSectionId,
            newContent: bylawAmendment.newContent,
            newNumberLabel: bylawAmendment.newNumberLabel,
            newTitle: bylawAmendment.newTitle,
            position: 0,
          },
        },
      },
      include: {
        changes: true,
      },
    });

    // If the motion passed, automatically apply the amendment to create a new version
    let applied = false;
    if (completedMotion.passed) {
      try {
        const service = new AmendmentService();
        await service.applyAmendment(amendment);
        applied = true;
      } catch (applyError: any) {
        // Log but don't fail - the amendment is still created
        logger.error({ err: applyError }, 'Failed to auto-apply amendment');
      }
    }

    logger.info({ amendmentId: amendment.id, applied }, 'Bylaw sync successful');

    return {
      success: true,
      amendmentId: amendment.id,
      applied,
    };
  } catch (error: any) {
    logger.error({ err: error }, 'Bylaw sync error');
    return {
      success: false,
      error: error.message,
    };
  }
}
