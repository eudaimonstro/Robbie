import type { MeetingAction, Member } from '@robbie-bylawyer/shared/types';
import type { SocketData } from '@robbie-bylawyer/shared/types/socket';
import { generateId, generateTimestamp } from '@robbie-bylawyer/shared/utils';

/** The ID field each item-creating action assigns to its new item */
const CREATED_ID_FIELDS: Partial<Record<MeetingAction['type'], string>> = {
  MAKE_MOTION: 'motionId',
  ADD_AGENDA_ITEM: 'itemId',
  NOMINATE: 'nominationId',
  START_ELECTION: 'electionId',
  ASK_INQUIRY: 'inquiryId',
};

/**
 * Enrich action with server-authoritative values
 * This prevents clients from spoofing their identity
 */
export function enrichAction(
  action: MeetingAction,
  socketData: SocketData,
  members: readonly Member[] = [],
): MeetingAction {
  const enriched = { ...action } as MeetingAction & Record<string, unknown>;
  // The member's current name: the login token keeps the name given at sign-in, so a member
  // renamed since would otherwise be stamped with the old one
  const name = members.find((m) => m.id === socketData.userId)?.name ?? socketData.name;

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

  // Who seconded, so the validator can stop a mover seconding their own motion
  if (enriched.type === 'SECOND_MOTION') {
    enriched.seconderId = socketData.userId;
  }

  // Proxy-related IDs - CRITICAL: prevents impersonation attacks
  if ('castById' in enriched) {
    enriched.castById = socketData.userId;
  }
  // GRANT_PROXY.grantedBy is not overwritten: only a chair or admin may send it (see
  // permissionGuard), granting on behalf of the absent member it names
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
    enriched.mover = name;
  }
  if ('seconder' in enriched) {
    enriched.seconder = name;
  }
  if ('objector' in enriched) {
    enriched.objector = name;
  }
  if ('askedBy' in enriched) {
    enriched.askedBy = name;
  }
  if ('nominatedBy' in enriched) {
    enriched.nominatedBy = name;
  }
  if ('answeredBy' in enriched) {
    enriched.answeredBy = name;
  }

  // The person marked present comes from the organization's roster, never from a client
  if (enriched.type === 'MARK_PRESENT') {
    delete enriched.member;
  }

  // Server generates timestamps using shared utility for consistency
  if ('timestamp' in enriched) {
    enriched.timestamp = generateTimestamp();
  }

  // Server generates the ID of a new item using shared utility to prevent collisions. Actions
  // that refer to an existing item (DECLINE_NOMINATION, ANSWER_INQUIRY) keep the client's ID.
  const createdIdField = CREATED_ID_FIELDS[enriched.type];
  if (createdIdField && createdIdField in enriched) {
    enriched[createdIdField] = generateId();
  }

  return enriched as MeetingAction;
}
