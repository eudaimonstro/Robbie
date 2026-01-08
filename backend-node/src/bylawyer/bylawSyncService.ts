/**
 * Bylaw Sync Service
 *
 * Handles synchronization of passed bylaw amendment motions from Robbie to Bylawyer.
 * This is called after CLOSE_VOTING actions when a bylawAmendment motion is voted on.
 *
 * Uses direct Prisma calls instead of HTTP since both run in the same server.
 */

import type { MeetingState, MeetingAction, CompletedMotion } from '@robbie-bylawyer/shared/types';
import type { ChangeType, AmendmentStatus } from '@prisma/client';
import { getStorage } from '../db/meetingStorage.js';
import { prisma } from '../db/prisma.js';
import { AmendmentService } from './services/amendmentService.js';

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
  newState: MeetingState
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
    console.warn(`[BYLAW_SYNC] bylawAmendment motion ${votedMotion.id} missing bylawAmendment data`);
    return null;
  }

  // Find the completed motion in the new state to determine if it passed
  const completedMotion = newState.completedMotions.find(
    cm => cm.id === votedMotion.id
  );

  if (!completedMotion) {
    // Motion wasn't completed (might have been tabled or something)
    console.log(`[BYLAW_SYNC] Motion ${votedMotion.id} not in completedMotions, skipping sync`);
    return null;
  }

  // Check if meeting is linked to a Bylawyer organization
  const storage = getStorage();
  const orgId = await storage.getBylawyerOrgId(meetingCode);

  if (!orgId) {
    console.log(`[BYLAW_SYNC] Meeting ${meetingCode} not linked to Bylawyer org, skipping sync`);
    return null;
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
  previousState: MeetingState
): Promise<SyncResult> {
  try {
    const bylawAmendment = votedMotion.bylawAmendment!;

    console.log(`[BYLAW_SYNC] Syncing motion ${votedMotion.id} to Bylawyer (passed: ${completedMotion.passed})`);

    // Check if this motion has already been synced
    const existingAmendment = await prisma.amendment.findFirst({
      where: {
        robbieMeetingCode: meetingCode,
        robbieMotionId: votedMotion.id
      }
    });

    if (existingAmendment) {
      console.log(`[BYLAW_SYNC] Motion ${votedMotion.id} already synced`);
      return {
        success: true,
        amendmentId: existingAmendment.id,
        applied: !!existingAmendment.resultingVersionId
      };
    }

    // Verify the document exists
    const document = await prisma.document.findUnique({
      where: { id: bylawAmendment.documentId }
    });

    if (!document) {
      console.error(`[BYLAW_SYNC] Document not found: ${bylawAmendment.documentId}`);
      return {
        success: false,
        error: `Document not found: ${bylawAmendment.documentId}`
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
      'add': 'add',
      'modify': 'modify',
      'delete': 'delete',
      'renumber': 'renumber'
    };

    // Build vote data
    const voteData = {
      yeaCount: previousState.votes.yea,
      nayCount: previousState.votes.nay,
      abstainCount: previousState.votes.abstain,
      voterChoices: completedMotion.voterChoices,
      voteRequirement: votedMotion.vote
    };

    // Create the amendment with Robbie tracking data
    const amendment = await prisma.amendment.create({
      data: {
        documentId: bylawAmendment.documentId,
        title,
        description: votedMotion.text,
        status,
        proposedAt: new Date(completedMotion.timestamp),
        decidedAt: new Date(completedMotion.timestamp),
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
            position: 0
          }
        }
      },
      include: {
        changes: true
      }
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
        console.error('[BYLAW_SYNC] Failed to auto-apply amendment:', applyError.message);
      }
    }

    console.log(`[BYLAW_SYNC] Sync successful:`, {
      amendmentId: amendment.id,
      applied
    });

    return {
      success: true,
      amendmentId: amendment.id,
      applied
    };
  } catch (error: any) {
    console.error(`[BYLAW_SYNC] Sync error:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Check if a motion has been synced to Bylawyer.
 */
export async function checkSyncStatus(
  meetingCode: string,
  motionId: number
): Promise<{ synced: boolean; amendmentId?: string; applied?: boolean }> {
  try {
    const amendment = await prisma.amendment.findFirst({
      where: {
        robbieMeetingCode: meetingCode,
        robbieMotionId: motionId
      },
      select: {
        id: true,
        status: true,
        resultingVersionId: true
      }
    });

    if (!amendment) {
      return { synced: false };
    }

    return {
      synced: true,
      amendmentId: amendment.id,
      applied: !!amendment.resultingVersionId
    };
  } catch (error) {
    console.error('[BYLAW_SYNC] Error checking sync status:', error);
    return { synced: false };
  }
}
