/**
 * Bylaw Sync Service
 *
 * Records a bylaw amendment decided in a live meeting in the organization's documents, and
 * applies it when it carries. Called after CLOSE_VOTING (a vote) and UNANIMOUS_CONSENT_PASSED
 * (adopted by unanimous consent) with the state the action was applied to and the state it
 * produced.
 *
 * What is applied is the change on the decided motion's record: the text the room saw on the
 * question card and adopted, never what a device sent. A motion that moved a proposed amendment
 * marks that amendment decided (and applies it) instead of creating another.
 */

import type {
  BylawAmendment,
  CompletedMotion,
  MeetingAction,
  MeetingState,
} from '@robbie-bylawyer/shared/types';
import type { AmendmentStatus, ChangeType, Prisma } from '../generated/prisma/client.js';
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

/** The record of the bylaw amendment this action decided, with its change, or null */
function decidedBylawAmendment(
  appliedTo: MeetingState,
  newState: MeetingState,
): (CompletedMotion & { bylawAmendment: BylawAmendment }) | null {
  // The records the action added (a decision adds one; reconsideration only marks the old one)
  const added = newState.completedMotions.slice(appliedTo.completedMotions.length);
  const record = added.filter((r) => r.type === 'bylawAmendment').at(-1);
  if (!record) return null;
  if (!record.bylawAmendment) {
    logger.warn({ motionId: record.id }, 'bylawAmendment motion missing bylawAmendment data');
    return null;
  }
  return record as CompletedMotion & { bylawAmendment: BylawAmendment };
}

/**
 * The earlier decision of the same bylaw amendment, when this one decides it again after a
 * motion to reconsider: the record the reconsideration marked, with the same change
 */
function reconsideredRecord(
  newState: MeetingState,
  record: CompletedMotion & { bylawAmendment: BylawAmendment },
): CompletedMotion | null {
  const change = JSON.stringify(record.bylawAmendment);
  return (
    newState.completedMotions
      .filter(
        (r) =>
          r.reconsidered &&
          r.id !== record.id &&
          r.type === 'bylawAmendment' &&
          JSON.stringify(r.bylawAmendment) === change,
      )
      .at(-1) ?? null
  );
}

/**
 * Check if we should sync a bylaw amendment after it is decided: on a vote (CLOSE_VOTING) or by
 * unanimous consent (UNANIMOUS_CONSENT_PASSED). Called after the action is applied, with the
 * state it was applied to.
 */
export async function checkAndSyncBylawAmendment(
  meetingCode: string,
  action: MeetingAction,
  appliedTo: MeetingState,
  newState: MeetingState,
): Promise<SyncResult | null> {
  if (action.type !== 'CLOSE_VOTING' && action.type !== 'UNANIMOUS_CONSENT_PASSED') {
    return null;
  }
  const record = decidedBylawAmendment(appliedTo, newState);
  if (!record) return null;
  const change = record.bylawAmendment;

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
    where: { id: change.documentId },
    select: { organizationId: true, currentVersionId: true },
  });
  if (document?.organizationId !== packet.organizationId) {
    logger.warn(
      { meetingCode, documentId: change.documentId },
      "Motion's document is not in the meeting's organization, skipping sync",
    );
    return null;
  }

  // Already synced: the same decision handled again
  const existing = await prisma.amendment.findFirst({
    where: { robbieMeetingCode: meetingCode, robbieMotionId: record.id },
  });
  if (existing) {
    logger.info({ motionId: record.id }, 'Motion already synced');
    return { success: true, amendmentId: existing.id, applied: !!existing.resultingVersionId };
  }

  // A decision reversed on reconsideration after it was applied can't be undone here: the
  // version it made stays, and a secretary restores the section from the earlier version
  const earlier = reconsideredRecord(newState, record);
  if (earlier?.passed && !record.passed) {
    const applied = await prisma.amendment.findFirst({
      where: {
        robbieMeetingCode: meetingCode,
        robbieMotionId: earlier.id,
        resultingVersionId: { not: null },
      },
      select: { id: true },
    });
    if (applied) {
      logger.error(
        { meetingCode, motionId: record.id, amendmentId: applied.id },
        'A reconsidered bylaw amendment failed after it was applied; the bylaws still have it',
      );
      return { success: false, amendmentId: applied.id, error: 'Already applied' };
    }
  }

  // The section changed, or the one an added section goes under, must still be in the
  // document's current version (the motion was checked when it was made; the bylaws may have
  // changed since)
  const sectionId = change.changeType === 'add' ? change.parentSectionId : change.targetSectionId;
  if (sectionId) {
    const section = document.currentVersionId
      ? await prisma.section.findFirst({
          where: { id: sectionId, versionId: document.currentVersionId },
          select: { id: true },
        })
      : null;
    if (!section) {
      logger.warn(
        { meetingCode, documentId: change.documentId, sectionId },
        "Motion's section is not in the document's current version, skipping sync",
      );
      return null;
    }
  }

  return syncMotionToBylawyer(meetingCode, record, appliedTo, earlier);
}

/**
 * The change as Bylawyer keeps it: for an added section, its target is the section it goes
 * under
 */
function changeData(change: BylawAmendment) {
  const changeType: ChangeType = change.changeType;
  return {
    changeType,
    targetSectionId:
      (change.changeType === 'add' ? change.parentSectionId : change.targetSectionId) ?? null,
    newContent: change.newContent ?? null,
    newNumberLabel: change.newNumberLabel ?? null,
    newTitle: change.newTitle ?? null,
    position: 0,
    // The section as the room saw it named, which outlives the section's id once applied
    targetLabel:
      (change.changeType === 'add' ? change.parentSectionLabel : change.targetSectionLabel) ?? null,
  };
}

/**
 * The vote as Bylawyer records it: the device votes and the chair's floor tally, and their
 * total, and how the motion was disposed of (no votes at all when adopted by unanimous consent).
 * A record made before the parts were kept is counted from the meeting's votes, unless no vote
 * was taken: the votes left over from an earlier question are not this motion's.
 */
function voteData(record: CompletedMotion, appliedTo: MeetingState): Prisma.InputJsonObject {
  const deviceVotes =
    record.deviceVotes ?? (record.disposition === 'unanimous' ? NO_VOTES : appliedTo.votes);
  const floorVotes = record.floorVotes ?? NO_VOTES;
  const data = {
    yeaCount: deviceVotes.yea + floorVotes.yea,
    nayCount: deviceVotes.nay + floorVotes.nay,
    abstainCount: deviceVotes.abstain + floorVotes.abstain,
    deviceVotes,
    floorVotes,
    method: record.method ?? appliedTo.votingMethod,
    voterChoices: record.voterChoices,
    voteRequirement: appliedTo.currentMotion?.vote,
    disposition: record.disposition ?? (record.passed ? 'carried' : 'failed'),
  };
  // Plain JSON: numbers, strings and objects of them
  return data as unknown as Prisma.InputJsonObject;
}

/**
 * Mark a proposed amendment decided by the motion that moved it, with the text adopted as its
 * change: the proposed amendment, or (on reconsideration) the one an earlier decision of the
 * same motion failed. Null when it is no longer there to decide.
 */
async function decideProposedAmendment(
  meetingCode: string,
  record: CompletedMotion & { bylawAmendment: BylawAmendment },
  appliedTo: MeetingState,
  earlier: CompletedMotion | null,
): Promise<string | null> {
  const change = record.bylawAmendment;
  const amendmentId = change.amendmentId!;
  const status: AmendmentStatus = record.passed ? 'passed' : 'failed';
  return prisma.$transaction(async (tx) => {
    const decidable: Prisma.AmendmentWhereInput[] = [{ status: 'proposed' }];
    if (earlier) {
      decidable.push({
        status: 'failed',
        robbieMeetingCode: meetingCode,
        robbieMotionId: earlier.id,
      });
    }
    const decided = await tx.amendment.updateMany({
      where: { id: amendmentId, documentId: change.documentId, OR: decidable },
      data: {
        status,
        decidedAt: new Date(),
        robbieMeetingCode: meetingCode,
        robbieMotionId: record.id,
        robbieVoteData: voteData(record, appliedTo),
      },
    });
    if (decided.count === 0) return null;
    // What is applied is the text adopted, which is the text moved until the meeting can amend
    // it: the amendment's change is replaced with it
    await tx.amendmentChange.deleteMany({ where: { amendmentId } });
    await tx.amendmentChange.create({ data: { amendmentId, ...changeData(change) } });
    return amendmentId;
  });
}

/**
 * Sync a decided bylaw amendment motion to Bylawyer: the proposed amendment it moved, decided,
 * or a new amendment with the motion's change; applied when it carried.
 */
async function syncMotionToBylawyer(
  meetingCode: string,
  record: CompletedMotion & { bylawAmendment: BylawAmendment },
  appliedTo: MeetingState,
  earlier: CompletedMotion | null,
): Promise<SyncResult> {
  const change = record.bylawAmendment;
  try {
    logger.info({ motionId: record.id, passed: record.passed }, 'Syncing motion to Bylawyer');

    let amendmentId: string;
    if (change.amendmentId) {
      const decided = await decideProposedAmendment(meetingCode, record, appliedTo, earlier);
      if (!decided) {
        logger.warn(
          { meetingCode, motionId: record.id, amendmentId: change.amendmentId },
          'The proposed amendment the motion moved is no longer proposed, skipping sync',
        );
        return { success: false, error: 'The amendment is no longer proposed' };
      }
      amendmentId = decided;
    } else {
      // The motion's timestamp is only a display time of day; the sync runs as it is decided
      const decidedAt = new Date();
      // Titled with the motion's words, which name the section and the change
      const created = await prisma.amendment.create({
        data: {
          documentId: change.documentId,
          title: record.text,
          status: record.passed ? 'passed' : 'failed',
          proposedAt: decidedAt,
          decidedAt,
          robbieMeetingCode: meetingCode,
          robbieMotionId: record.id,
          robbieVoteData: voteData(record, appliedTo),
          changes: { create: changeData(change) },
        },
      });
      amendmentId = created.id;
    }

    // A motion that carried is applied at once, as a new version of the document
    let applied = false;
    if (record.passed) {
      try {
        const amendment = await prisma.amendment.findUniqueOrThrow({
          where: { id: amendmentId },
          include: { changes: true },
        });
        await new AmendmentService().applyAmendment(amendment);
        applied = true;
      } catch (applyError) {
        // Log but don't fail: the amendment is recorded, and a secretary can apply it
        logger.error({ err: applyError }, 'Failed to auto-apply amendment');
      }
    }

    logger.info({ amendmentId, applied }, 'Bylaw sync successful');
    return { success: true, amendmentId, applied };
  } catch (error) {
    logger.error({ err: error }, 'Bylaw sync error');
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
