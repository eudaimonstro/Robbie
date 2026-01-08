import type { MeetingAction } from '@robbie-bylawyer/shared/types';
import type { SocketData } from '@robbie-bylawyer/shared/types/socket';
import { generateId, generateTimestamp } from '@robbie-bylawyer/shared/utils';

/**
 * Enrich action with server-authoritative values
 * This prevents clients from spoofing their identity
 */
export function enrichAction(action: MeetingAction, socketData: SocketData): MeetingAction {
  const enriched = { ...action } as MeetingAction & Record<string, unknown>;

  // Override any user-related IDs with authenticated values
  if ('voterId' in enriched) {
    enriched.voterId = socketData.userId;
  }
  if ('moverId' in enriched) {
    enriched.moverId = socketData.userId;
  }
  if ('askerId' in enriched) {
    enriched.askerId = socketData.userId;
  }
  if ('nominatorId' in enriched) {
    enriched.nominatorId = socketData.userId;
  }

  // Proxy-related IDs - CRITICAL: prevents impersonation attacks
  if ('castById' in enriched) {
    enriched.castById = socketData.userId;
  }
  if ('grantedBy' in enriched) {
    enriched.grantedBy = socketData.userId;
  }
  if ('requestedBy' in enriched) {
    enriched.requestedBy = socketData.userId;
  }
  if ('revokedBy' in enriched) {
    enriched.revokedBy = socketData.userId;
  }
  if ('acceptedBy' in enriched) {
    enriched.acceptedBy = socketData.userId;
  }
  if ('declinedBy' in enriched) {
    enriched.declinedBy = socketData.userId;
  }
  if ('cancelledBy' in enriched) {
    enriched.cancelledBy = socketData.userId;
  }

  // Override names with authenticated values
  if ('mover' in enriched) {
    enriched.mover = socketData.name;
  }
  if ('seconder' in enriched) {
    enriched.seconder = socketData.name;
  }
  if ('objector' in enriched) {
    enriched.objector = socketData.name;
  }
  if ('askedBy' in enriched) {
    enriched.askedBy = socketData.name;
  }
  if ('nominatedBy' in enriched) {
    enriched.nominatedBy = socketData.name;
  }
  if ('answeredBy' in enriched) {
    enriched.answeredBy = socketData.name;
  }

  // Server generates timestamps using shared utility for consistency
  if ('timestamp' in enriched) {
    enriched.timestamp = generateTimestamp();
  }

  // Server generates IDs using shared utility to prevent collisions
  if ('motionId' in enriched) {
    enriched.motionId = generateId();
  }
  if ('nominationId' in enriched) {
    enriched.nominationId = generateId();
  }
  if ('inquiryId' in enriched) {
    enriched.inquiryId = generateId();
  }
  if ('electionId' in enriched) {
    enriched.electionId = generateId();
  }
  if ('itemId' in enriched) {
    enriched.itemId = generateId();
  }

  return enriched as MeetingAction;
}
