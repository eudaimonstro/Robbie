import type { MeetingAction } from '@robbie/shared/types';
import type { SocketData } from '@robbie/shared/types/socket';

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

  // Server generates timestamps
  if ('timestamp' in enriched) {
    enriched.timestamp = new Date().toLocaleTimeString();
  }

  // Server generates IDs
  if ('motionId' in enriched) {
    enriched.motionId = Date.now();
  }
  if ('nominationId' in enriched) {
    enriched.nominationId = Date.now();
  }
  if ('inquiryId' in enriched) {
    enriched.inquiryId = Date.now();
  }
  if ('electionId' in enriched) {
    enriched.electionId = Date.now();
  }
  if ('itemId' in enriched) {
    enriched.itemId = Date.now();
  }

  return enriched as MeetingAction;
}
