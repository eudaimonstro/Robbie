/**
 * Server-side action validation
 * Pre-validates actions before they're applied to the reducer
 * Returns meaningful error codes instead of silent failures
 */

import type { MeetingState, MeetingAction, MotionDetails } from '@robbie-bylawyer/shared/types';
import type { ActionErrorCode } from '@robbie-bylawyer/shared/types/socket';
import {
  DISPLAYABLE_STAGES,
  MAX_FLOOR_NAME_LENGTH,
  MOTIONS,
} from '@robbie-bylawyer/shared/constants';
import {
  BYLAW_WORDING_FIXED,
  NO_VOTES,
  addVotes,
  attendanceSummary,
  awaitingRuling,
  canChairVoteDecide,
  floorOpenForDebate,
  motionOutOfOrder,
  moverClaimsFloor,
  textAmendmentProblem,
  wasMotionDefeated,
  type OutOfOrder,
} from '@robbie-bylawyer/shared/utils';
import { ACTOR_FIELDS } from './actionEnricher.js';
import { checkPermission, isServerOnly } from './permissionGuard.js';

/** The most people the chair can count in the room without an account */
export const MAX_HEADCOUNT = 100_000;

/** The largest count the chair can enter for one choice in a floor tally or floor ballot */
export const MAX_FLOOR_COUNT = 1_000_000;

/** The longest corrections to the previous minutes the chair can enter */
export const MAX_CORRECTIONS_LENGTH = 2000;

/** The longest explanation the chair can give with a ruling (it goes in the minutes) */
export const MAX_RULING_EXPLANATION_LENGTH = 2000;

/** The voting methods (see VotingMethod) */
const VOTING_METHODS = ['standard', 'voice', 'ballot', 'rollcall'];

/** Whether the member with this id is in the meeting as a guest */
function isGuest(state: MeetingState, memberId: number): boolean {
  return state.members.some((m) => m.id === memberId && m.role === 'guest');
}

/** Whether the member with this id presides: the chair, or an admin */
function isPresiding(state: MeetingState, memberId: number | undefined): boolean {
  const role = state.members.find((m) => m.id === memberId)?.role;
  return role === 'chair' || role === 'admin';
}

/**
 * Why the member with this id can't vote now, or null when they can: they must be in the meeting
 * and present. Checked against the state the vote is applied to, so a member marked absent a
 * moment before isn't counted.
 */
function checkVoterPresent(state: MeetingState, voterId: number): ValidationResult | null {
  const voter = state.members.find((m) => m.id === voterId);
  if (!voter) {
    return {
      valid: false,
      error: 'You are not a member of this meeting',
      errorCode: 'NOT_A_MEMBER',
    };
  }
  if (!voter.present) {
    return { valid: false, error: 'You must be present to vote', errorCode: 'NOT_PRESENT' };
  }
  return null;
}

/** Whether an election is under way: nominations open or closed, or a ballot */
function isElectionUnderway(state: MeetingState): boolean {
  return state.nominationsOpen || !!state.currentNominationPosition || !!state.currentElection;
}

/** A count the chair enters: a whole number from 0 */
function isCount(value: unknown): boolean {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_FLOOR_COUNT;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  errorCode?: ActionErrorCode;
}

/** A motion being made, by a member on a device or from the floor */
type NewMotion = Pick<
  Extract<MeetingAction, { type: 'MAKE_MOTION' }>,
  'motionType' | 'text' | keyof MotionDetails
>;

/** What a meeting without a quorum may still do (RONR 40:6): adjourn, or recess to find one */
const NO_QUORUM_NEEDED: ReadonlySet<string> = new Set(['adjourn', 'recess']);

/** The error code for each kind of reason a motion is out of order */
const OUT_OF_ORDER_CODES: Record<OutOfOrder['kind'], ActionErrorCode> = {
  unknown: 'UNKNOWN_MOTION_TYPE',
  'not-offered': 'MOTION_NOT_OFFERED',
  'not-in-session': 'MEETING_NOT_ACTIVE',
  adjourning: 'ADJOURNMENT_CARRIED',
  recess: 'IN_RECESS',
  'point-pending': 'POINT_OF_ORDER_PENDING',
  voting: 'VOTING_IN_PROGRESS',
  'awaiting-second': 'MOTION_PRECEDENCE_VIOLATION',
  election: 'ELECTION_IN_PROGRESS',
  agenda: 'AGENDA_NOT_ADOPTED',
  'agenda-adopted': 'AGENDA_ALREADY_ADOPTED',
  'debate-closed': 'DEBATE_CLOSED',
  precedence: 'MOTION_PRECEDENCE_VIOLATION',
};

/** The chair rules on a point of order before anything else happens */
const POINT_PENDING: ValidationResult = {
  valid: false,
  error: 'The chair rules on the point of order first',
  errorCode: 'POINT_OF_ORDER_PENDING',
};

/**
 * Whether a motion is in order now (motionOutOfOrder in shared, which the screens use too), with
 * the words and details it needs, and not renewing a defeated one. The same for every way a
 * motion is made.
 */
function validateMotionInOrder(state: MeetingState, action: NewMotion): ValidationResult {
  if (!state.meetingActive) {
    return { valid: false, error: 'Meeting is not active', errorCode: 'MEETING_NOT_ACTIVE' };
  }
  // Validate motion text length
  if (action.text && action.text.length > 500) {
    return {
      valid: false,
      error: 'Motion text exceeds 500 character limit',
      errorCode: 'INVALID_ACTION',
    };
  }
  const definition = MOTIONS[action.motionType];
  if (!definition) {
    return {
      valid: false,
      error: `Unknown motion type: ${action.motionType}`,
      errorCode: 'UNKNOWN_MOTION_TYPE',
    };
  }
  const outOfOrder = motionOutOfOrder(state, action.motionType);
  if (outOfOrder) {
    return {
      valid: false,
      error: outOfOrder.reason,
      errorCode: OUT_OF_ORDER_CODES[outOfOrder.kind],
    };
  }
  // Motions whose effect depends on details: without them the motion could be adopted and
  // then do nothing
  const missingDetails =
    (action.motionType === 'bylawAmendment' &&
      !(action.bylawAmendment?.documentId && action.bylawAmendment?.changeType)) ||
    (action.motionType === 'amendAgenda' && !action.agendaAmendment?.action) ||
    (action.motionType === 'postponeDefinite' &&
      !(
        action.postponeTo?.kind === 'next-meeting' ||
        (action.postponeTo?.kind === 'later' && action.postponeTo.when.trim())
      )) ||
    (action.motionType === 'referCommittee' && !action.referTo?.trim());
  if (missingDetails) {
    return {
      valid: false,
      error: `${definition.name} needs details this request did not include`,
      errorCode: 'INVALID_ACTION',
    };
  }
  // An amendment says what it changes, and the words it strikes or inserts after are there: what
  // is adopted is applied to the words beneath it
  const amendmentProblem = textAmendmentCheck(state, action);
  if (amendmentProblem) {
    return { valid: false, error: amendmentProblem, errorCode: 'INVALID_ACTION' };
  }
  // Block renewal of substantially similar defeated motions (by subject matter for main motions)
  if (wasMotionDefeated(state, action.motionType, action.text, action.bylawAmendment)) {
    return {
      valid: false,
      error: 'A substantially similar motion was already defeated this meeting',
      errorCode: 'MOTION_RENEWAL_BLOCKED',
    };
  }
  return { valid: true };
}

/** Why an amendment can't apply to the words it amends, or null (or for another motion) */
function textAmendmentCheck(state: MeetingState, action: NewMotion): string | null {
  if (action.motionType !== 'amend' && action.motionType !== 'amendAmendment') return null;
  const change = action.textAmendment;
  if (!change) return 'Say what the amendment changes: words to insert, strike or replace';
  const pending = state.currentMotion;
  if (!pending) return null;
  if (action.motionType === 'amend') return textAmendmentProblem(pending.text, change);
  // A secondary amendment changes the words the primary amendment inserts
  if (!pending.textAmendment || pending.textAmendment.form === 'strike') {
    return 'The amendment inserts no words to amend';
  }
  return textAmendmentProblem(pending.textAmendment.insert, change);
}

/** A person the chair names from the floor as mover or seconder: a member present, not a guest */
function checkFloorMember(
  state: MeetingState,
  memberId: number,
  recordedBy: number | undefined,
  as: 'mover' | 'seconder',
): ValidationResult {
  const named = state.members.find((m) => m.id === memberId);
  if (!named) {
    return {
      valid: false,
      error: `The ${as} is not in this meeting`,
      errorCode: 'MEMBER_NOT_FOUND',
    };
  }
  if (named.role === 'guest') {
    return {
      valid: false,
      error: as === 'mover' ? 'Guests cannot make motions' : 'Guests cannot second motions',
      errorCode: 'PERMISSION_DENIED',
    };
  }
  // The presiding officer doesn't move or second (RONR): the chair, or the admin presiding
  if (named.role === 'chair' || named.id === recordedBy) {
    return {
      valid: false,
      error:
        as === 'mover' ? 'The chair does not move motions' : 'The chair does not second motions',
      errorCode: 'INVALID_ACTION',
    };
  }
  if (!named.present) {
    return { valid: false, error: `The ${as} is not present`, errorCode: 'NOT_PRESENT' };
  }
  return { valid: true };
}

/** A name the chair types for someone in the room; empty when none is required */
function checkFloorName(name: unknown, required: boolean): ValidationResult {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (required && !trimmed) {
    return {
      valid: false,
      error: 'Enter the name of the person who made the motion',
      errorCode: 'NAME_REQUIRED',
    };
  }
  if (name !== undefined && typeof name !== 'string') {
    return { valid: false, error: 'A name must be text', errorCode: 'INVALID_ACTION' };
  }
  if (trimmed.length > MAX_FLOOR_NAME_LENGTH) {
    return {
      valid: false,
      error: `A name can be at most ${MAX_FLOOR_NAME_LENGTH} characters`,
      errorCode: 'INVALID_ACTION',
    };
  }
  return { valid: true };
}

/**
 * What waits while a point of order is before the chair: the business it interrupted, and its
 * vote. Only the ruling (CHAIR_RULING) settles it; the chair can still adjourn.
 */
const WAITS_FOR_RULING: ReadonlySet<MeetingAction['type']> = new Set<MeetingAction['type']>([
  'SECOND_MOTION',
  'SECOND_FROM_FLOOR',
  'DECLINE_SECOND',
  'OPEN_VOTING',
  'CAST_VOTE',
  'SET_FLOOR_TALLY',
  'CLOSE_VOTING',
  'REQUEST_UNANIMOUS_CONSENT',
  'UNANIMOUS_CONSENT_PASSED',
  'OBJECT_TO_CONSENT',
  'WITHDRAW_MOTION',
  'MODIFY_MOTION',
  'RAISE_HAND',
  'RECOGNIZE_SPEAKER',
  'CALL_AGENDA_ITEM',
  'COMPLETE_AGENDA_ITEM',
  'OPEN_NOMINATIONS',
  'CLOSE_NOMINATIONS',
  'START_ELECTION',
  'CLOSE_ELECTION',
  'DECLARE_ELECTED',
]);

/** What can happen in a recess: the chair resumes or adjourns; the room's count is kept */
const IN_RECESS_ALLOWED: ReadonlySet<MeetingAction['type']> = new Set<MeetingAction['type']>([
  'RESUME_MEETING',
  'END_MEETING',
  'MARK_PRESENT',
  'MARK_ABSENT',
  'SET_HEADCOUNT',
  'SET_QUORUM',
  'LOWER_HAND',
  'ASK_INQUIRY',
  'ANSWER_INQUIRY',
  'SET_SPEAKER_TIME_LIMIT',
  'SET_VOTE_TIME_LIMIT',
  'SET_VOTING_METHOD',
  'SET_AUTO_YIELD',
  'SET_MEMBER_ROLE',
]);

/** What can happen once an adjournment has carried: the chair declares the meeting adjourned */
const ADJOURNING_ALLOWED: ReadonlySet<MeetingAction['type']> = new Set<MeetingAction['type']>([
  'END_MEETING',
  'MARK_PRESENT',
  'MARK_ABSENT',
  'SET_HEADCOUNT',
  'LOWER_HAND',
  'SET_MEMBER_ROLE',
]);

/** Business from the floor is recorded by the chair or an admin presiding */
const NOT_PRESIDING: ValidationResult = {
  valid: false,
  error: 'Only the chair records business from the floor',
  errorCode: 'PERMISSION_DENIED',
};

/**
 * Validate an action before applying it to the reducer
 * Returns meaningful errors instead of letting the reducer silently fail
 */
export function validateAction(state: MeetingState, action: MeetingAction): ValidationResult {
  // Nothing changes once the meeting has adjourned, except calling it to order again; the
  // server still records who joins and leaves
  if (
    state.meetingStage === 'adjourned' &&
    action.type !== 'START_MEETING' &&
    !isServerOnly(action.type)
  ) {
    return { valid: false, error: 'The meeting has adjourned', errorCode: 'MEETING_NOT_ACTIVE' };
  }

  // The role a socket carries can be stale (a membership removed since it joined, a recovered
  // socket), so the state's role decides: a sender the meeting has as a guest can't take part
  const actorField = ACTOR_FIELDS[action.type]?.id;
  const actorId = actorField ? (action as Record<string, unknown>)[actorField] : undefined;
  if (
    typeof actorId === 'number' &&
    !checkPermission('guest', action.type) &&
    isGuest(state, actorId)
  ) {
    return {
      valid: false,
      error: 'Guests can follow the meeting but not take part in this',
      errorCode: 'PERMISSION_DENIED',
    };
  }

  // In a recess nothing happens but the chair resuming (or adjourning) and the count of the
  // room; once an adjournment has carried, only the chair's declaring it
  if (state.recess && !isServerOnly(action.type) && !IN_RECESS_ALLOWED.has(action.type)) {
    return {
      valid: false,
      error: 'The meeting is in recess: the chair resumes it first',
      errorCode: 'IN_RECESS',
    };
  }
  if (
    state.adjournmentCarried &&
    !isServerOnly(action.type) &&
    !ADJOURNING_ALLOWED.has(action.type)
  ) {
    return {
      valid: false,
      error: 'The meeting has voted to adjourn: the chair declares it adjourned',
      errorCode: 'ADJOURNMENT_CARRIED',
    };
  }
  if (awaitingRuling(state) && WAITS_FOR_RULING.has(action.type)) return POINT_PENDING;

  switch (action.type) {
    case 'START_MEETING':
      if (state.meetingActive) {
        return {
          valid: false,
          error: 'Meeting is already active',
          errorCode: 'MEETING_ALREADY_ACTIVE',
        };
      }
      return { valid: true };

    case 'END_MEETING':
      if (!state.meetingActive) {
        return { valid: false, error: 'Meeting is not active', errorCode: 'MEETING_NOT_ACTIVE' };
      }
      // The console offers no Adjourn while a vote or an election's ballot is open: the vote is
      // closed (or the election set aside) first, so no ballot is left undecided
      if (state.votingOpen || state.currentElection?.votingInProgress) {
        return {
          valid: false,
          error: 'Close the vote before adjourning',
          errorCode: 'VOTING_IN_PROGRESS',
        };
      }
      return { valid: true };

    case 'MAKE_MOTION':
      // A question the chair puts from the agenda is recorded with no mover: only the chair
      // puts one
      if (action.putByChair && !isPresiding(state, action.moverId)) {
        return {
          valid: false,
          error: 'Only the chair puts a question to the meeting',
          errorCode: 'PERMISSION_DENIED',
        };
      }
      // The chair puts the agenda's question; any other motion has a mover
      if (action.putByChair && action.motionType !== 'mainMotion') {
        return {
          valid: false,
          error: 'Only a main question is put by the chair',
          errorCode: 'INVALID_ACTION',
        };
      }
      return validateMotionInOrder(state, action);

    case 'MAKE_FLOOR_MOTION': {
      if (action.recordedBy !== undefined && !isPresiding(state, action.recordedBy)) {
        return NOT_PRESIDING;
      }
      // The mover is the member named, or else the name typed
      const mover =
        action.moverMemberId !== undefined
          ? checkFloorMember(state, action.moverMemberId, action.recordedBy, 'mover')
          : checkFloorName(action.moverName, true);
      if (!mover.valid) return mover;
      return validateMotionInOrder(state, action);
    }

    case 'SECOND_MOTION':
      if (!state.pendingSecond) {
        return {
          valid: false,
          error: 'No motion pending a second',
          errorCode: 'NO_PENDING_SECOND',
        };
      }
      // RONR: the mover can't second their own motion
      if (action.seconderId !== undefined && action.seconderId === state.pendingSecond.moverId) {
        return {
          valid: false,
          error: 'You cannot second your own motion',
          errorCode: 'INVALID_ACTION',
        };
      }
      return { valid: true };

    case 'SECOND_FROM_FLOOR': {
      if (action.recordedBy !== undefined && !isPresiding(state, action.recordedBy)) {
        return NOT_PRESIDING;
      }
      if (!state.pendingSecond) {
        return {
          valid: false,
          error: 'No motion pending a second',
          errorCode: 'NO_PENDING_SECOND',
        };
      }
      if (action.seconderMemberId !== undefined) {
        const seconder = checkFloorMember(
          state,
          action.seconderMemberId,
          action.recordedBy,
          'seconder',
        );
        if (!seconder.valid) return seconder;
        // RONR: the mover can't second their own motion
        if (action.seconderMemberId === state.pendingSecond.moverId) {
          return {
            valid: false,
            error: 'The mover cannot second their own motion',
            errorCode: 'INVALID_ACTION',
          };
        }
        return { valid: true };
      }
      // A typed name, or none: "a member in the room"
      return checkFloorName(action.seconderName, false);
    }

    case 'DECLINE_SECOND':
      if (!state.pendingSecond) {
        return {
          valid: false,
          error: 'No motion pending a second',
          errorCode: 'NO_PENDING_SECOND',
        };
      }
      return { valid: true };

    case 'OPEN_VOTING':
      if (!state.currentMotion) {
        return { valid: false, error: 'No motion to vote on', errorCode: 'NO_CURRENT_MOTION' };
      }
      if (state.votingOpen) {
        return { valid: false, error: 'Voting is already open', errorCode: 'VOTING_ALREADY_OPEN' };
      }
      // A privileged motion made during an election waits for the election's ballot to close
      if (state.currentElection?.votingInProgress) {
        return { valid: false, error: 'A ballot is open', errorCode: 'VOTING_IN_PROGRESS' };
      }
      // Without a quorum the meeting can only adjourn or recess (RONR 40:6): anything else is put
      // only once the chair confirms it, knowing it is not valid business
      if (
        !attendanceSummary(state).hasQuorum &&
        !NO_QUORUM_NEEDED.has(state.currentMotion.type) &&
        !action.confirmedWithoutQuorum
      ) {
        return {
          valid: false,
          error: 'There is no quorum. Business done now is not valid. Open the vote anyway?',
          errorCode: 'NO_QUORUM',
        };
      }
      return { valid: true };

    case 'CAST_VOTE': {
      const notVoting = checkVoterPresent(state, action.voterId);
      if (notVoting) return notVoting;
      if (!state.votingOpen) {
        return { valid: false, error: 'Voting is not open', errorCode: 'VOTING_NOT_OPEN' };
      }
      if (state.votingMethod === 'voice') {
        return {
          valid: false,
          error: 'This is a voice vote: the chair counts it in the room',
          errorCode: 'VOTING_METHOD',
        };
      }
      // A member who has voted may change the vote until the result is announced (RONR); the
      // reducer moves the count from the old choice to the new one
      // The chair votes only when the vote would
      // change the result. That is checked here, not taken from the client's flag.
      {
        const voter = state.members.find((m) => m.id === action.voterId);
        // On a secret ballot the chair votes like any member (RONR)
        if (voter?.role === 'chair' && state.votingMethod !== 'ballot') {
          // Judge on everyone else's votes, on devices and in the room, leaving out a vote the
          // chair already cast
          const previous = state.voterChoices[action.voterId];
          const deviceVotes = previous
            ? { ...state.votes, [previous]: state.votes[previous] - 1 }
            : state.votes;
          const othersVotes = addVotes(deviceVotes, state.floorVotes);
          const decides =
            action.isChairDecidingVote &&
            canChairVoteDecide(othersVotes, state.currentMotion?.vote ?? 'majority');
          if (!decides) {
            return {
              valid: false,
              error: "The chair votes only when the chair's vote would change the result",
              errorCode: 'CHAIR_CANNOT_VOTE',
            };
          }
        }
      }
      return { valid: true };
    }

    case 'CLOSE_VOTING': {
      if (!state.votingOpen) {
        return { valid: false, error: 'Voting is not open', errorCode: 'VOTING_NOT_OPEN' };
      }
      // A voice vote is counted only in the room: closing it with nothing entered would decide
      // the question on no votes at all
      const floor = state.floorVotes ?? NO_VOTES;
      if (state.votingMethod === 'voice' && floor.yea + floor.nay + floor.abstain === 0) {
        return {
          valid: false,
          error: 'Enter the show of hands before closing',
          errorCode: 'VOTING_METHOD',
        };
      }
      return { valid: true };
    }

    case 'SET_FLOOR_TALLY': {
      if (!state.votingOpen) {
        return { valid: false, error: 'Voting is not open', errorCode: 'VOTING_NOT_OPEN' };
      }
      // The chair's deciding vote was judged on the tally as it stood: a tally entered after
      // it could leave the chair's vote cast where it no longer decides anything
      const chair = state.members.find((m) => m.role === 'chair');
      if (chair && state.votingMethod !== 'ballot' && state.voters.includes(chair.id)) {
        return {
          valid: false,
          error: 'The floor tally must be entered before the chair votes',
          errorCode: 'VOTING_METHOD',
        };
      }
      if (![action.yea, action.nay, action.abstain].every(isCount)) {
        return {
          valid: false,
          error: `Each count must be a whole number from 0 to ${MAX_FLOOR_COUNT}`,
          errorCode: 'INVALID_ACTION',
        };
      }
      return { valid: true };
    }

    case 'SET_VOTING_METHOD':
      if (!VOTING_METHODS.includes(action.method)) {
        return { valid: false, error: 'Unknown voting method', errorCode: 'INVALID_ACTION' };
      }
      // Changing the method of an open vote would change how its votes are counted and shown
      if (state.votingOpen) {
        return {
          valid: false,
          error: 'The voting method cannot change while a vote is in progress',
          errorCode: 'VOTING_IN_PROGRESS',
        };
      }
      return { valid: true };

    case 'WITHDRAW_MOTION': {
      // The motion awaiting a second, or else the immediately pending one
      const motionToWithdraw = state.pendingSecond || state.currentMotion;
      if (!motionToWithdraw) {
        return { valid: false, error: 'No motion to withdraw', errorCode: 'NO_CURRENT_MOTION' };
      }
      if (state.votingOpen) {
        return {
          valid: false,
          error: 'Cannot withdraw motion while voting is in progress',
          errorCode: 'VOTING_IN_PROGRESS',
        };
      }
      if (motionToWithdraw.type === 'withdrawMotion') {
        return {
          valid: false,
          error: 'The request to withdraw is before the meeting',
          errorCode: 'INVALID_STATE',
        };
      }
      // The mover asks on their phone; the chair records the request of a mover in the room,
      // whoever they are (one recorded by a typed name has no account to ask from)
      if (action.fromFloor) {
        if (!isPresiding(state, action.requesterId)) return NOT_PRESIDING;
      } else if (motionToWithdraw.moverId !== action.requesterId) {
        return {
          valid: false,
          error: 'Only the motion maker can withdraw their motion',
          errorCode: 'NOT_MOTION_MAKER',
        };
      }
      // Once stated, the request is put to the meeting as a question of its own
      if (!state.pendingSecond && action.motionId === undefined) {
        return {
          valid: false,
          error: 'The request to withdraw needs an id',
          errorCode: 'INVALID_ACTION',
        };
      }
      return { valid: true };
    }

    case 'TAKE_UP_POSTPONED': {
      if (!state.meetingActive) {
        return { valid: false, error: 'Meeting is not active', errorCode: 'MEETING_NOT_ACTIVE' };
      }
      // Taken up when the floor is clear, as new business is
      if (
        state.currentMotion ||
        state.pendingSecond ||
        state.votingOpen ||
        isElectionUnderway(state)
      ) {
        return {
          valid: false,
          error: 'Settle the pending business first',
          errorCode: 'MOTION_PRECEDENCE_VIOLATION',
        };
      }
      const postponed = (state.postponedMotions ?? []).some(
        (p) => p.motions[0]?.id === action.motionId,
      );
      if (!postponed) {
        return {
          valid: false,
          error: 'That motion is not postponed to later in this meeting',
          errorCode: 'ITEM_NOT_FOUND',
        };
      }
      return { valid: true };
    }

    case 'REQUEST_DIVISION':
      // On a voice vote, before the chair announces it
      if (!state.votingOpen || state.votingMethod !== 'voice') {
        return {
          valid: false,
          error: 'A division is called on a voice vote, before the result is announced',
          errorCode: 'VOTING_METHOD',
        };
      }
      if (action.fromFloor && !isPresiding(state, action.requesterId)) return NOT_PRESIDING;
      return { valid: true };

    case 'RESUME_MEETING':
      if (!state.recess) {
        return { valid: false, error: 'The meeting is not in recess', errorCode: 'INVALID_STATE' };
      }
      return { valid: true };

    case 'MODIFY_MOTION': {
      const motionToModify = state.pendingSecond || state.currentMotion;
      if (!motionToModify) {
        return { valid: false, error: 'No motion to modify', errorCode: 'NO_CURRENT_MOTION' };
      }
      // A bylaw amendment's words come from the change it carries, which is what the room sees
      // and what is applied: the mover withdraws it and moves it again instead
      if (motionToModify.type === 'bylawAmendment') {
        return {
          valid: false,
          error: BYLAW_WORDING_FIXED,
          errorCode: 'INVALID_ACTION',
        };
      }
      // A motion worded from its details (an amendment's change, a postponement, a referral, a
      // recess, a request to withdraw) is changed only by making it again: its words are what
      // adoption applies
      if (
        motionToModify.textAmendment ||
        motionToModify.postponeTo ||
        motionToModify.referTo ||
        motionToModify.recessUntil ||
        motionToModify.type === 'withdrawMotion'
      ) {
        return {
          valid: false,
          error: 'Its words come from what it does: withdraw it and move it again',
          errorCode: 'INVALID_ACTION',
        };
      }
      if (motionToModify.moverId !== action.requesterId) {
        return {
          valid: false,
          error: 'Only the motion maker can modify their motion',
          errorCode: 'NOT_MOTION_MAKER',
        };
      }
      if (state.currentMotion && state.currentMotion.moverHasSpoken) {
        return {
          valid: false,
          error: 'Cannot modify motion after debate has begun - use amendment instead',
          errorCode: 'DEBATE_BEGUN',
        };
      }
      if (state.votingOpen) {
        return {
          valid: false,
          error: 'Cannot modify motion while voting is in progress',
          errorCode: 'VOTING_IN_PROGRESS',
        };
      }
      if (!action.newText || action.newText.trim().length === 0) {
        return {
          valid: false,
          error: 'New motion text cannot be empty',
          errorCode: 'INVALID_ACTION',
        };
      }
      if (action.newText.length > 500) {
        return {
          valid: false,
          error: 'Motion text exceeds 500 character limit',
          errorCode: 'INVALID_ACTION',
        };
      }
      return { valid: true };
    }

    case 'RAISE_HAND': {
      // In session with nothing pending (an open forum, questions on a report), or while a
      // debatable question's debate is open; members may change sides (RONR doesn't forbid it)
      if (state.currentMotion?.debateClosed) {
        return {
          valid: false,
          error: 'Debate is closed: the question is put to the vote',
          errorCode: 'DEBATE_CLOSED',
        };
      }
      if (!floorOpenForDebate(state)) {
        return {
          valid: false,
          error: state.votingOpen
            ? 'A vote is in progress'
            : state.currentMotion
              ? 'The question before the meeting is not debatable'
              : state.pendingSecond
                ? 'The motion is waiting for a second'
                : 'The meeting is not in session',
          errorCode: state.currentMotion ? 'MOTION_NOT_DEBATABLE' : 'NO_CURRENT_MOTION',
        };
      }
      const alreadyInQueue = state.speakerQueue.some((e) => e.member.id === action.member.id);
      if (alreadyInQueue) {
        return { valid: false, error: 'Already in speaker queue', errorCode: 'ALREADY_IN_QUEUE' };
      }
      return { valid: true };
    }

    case 'LOWER_HAND': {
      const inQueue = state.speakerQueue.some((e) => e.member.id === action.member.id);
      if (!inQueue) {
        return { valid: false, error: 'Not in speaker queue', errorCode: 'NOT_IN_QUEUE' };
      }
      return { valid: true };
    }

    case 'RECOGNIZE_SPEAKER': {
      if (state.currentMotion?.debateClosed) {
        return {
          valid: false,
          error: 'Debate is closed: the question is put to the vote',
          errorCode: 'DEBATE_CLOSED',
        };
      }
      const speakerInQueue = state.speakerQueue.some((e) => e.member.id === action.member.id);
      if (!speakerInQueue) {
        return { valid: false, error: 'Member is not in speaker queue', errorCode: 'NOT_IN_QUEUE' };
      }
      if (state.recognizedSpeaker) {
        return {
          valid: false,
          error: 'Another speaker already has the floor',
          errorCode: 'SPEAKER_HAS_FLOOR',
        };
      }
      // The mover speaks first if they have asked to (RONR 42:9); otherwise anyone waiting
      if (moverClaimsFloor(state) && state.currentMotion?.moverId !== action.member.id) {
        return {
          valid: false,
          error: `${state.currentMotion?.mover ?? 'The mover'} moved it and asked to speak: recognize them first`,
          errorCode: 'MOVER_SPEAKS_FIRST',
        };
      }
      return { valid: true };
    }

    case 'YIELD_FLOOR': {
      if (!state.recognizedSpeaker) {
        return { valid: false, error: 'No speaker has the floor', errorCode: 'NO_SPEAKER' };
      }
      // The speaker yields, or the chair ends the speaker's turn
      const yielder = state.members.find((m) => m.id === action.yieldedBy);
      if (
        action.yieldedBy !== undefined &&
        action.yieldedBy !== state.recognizedSpeaker.id &&
        yielder?.role !== 'chair' &&
        yielder?.role !== 'admin'
      ) {
        return {
          valid: false,
          error: 'Only the speaker or the chair can yield the floor',
          errorCode: 'PERMISSION_DENIED',
        };
      }
      return { valid: true };
    }

    case 'ADOPT_AGENDA':
      if (state.agendaAdopted) {
        return {
          valid: false,
          error: 'Agenda is already adopted',
          errorCode: 'AGENDA_ALREADY_ADOPTED',
        };
      }
      return { valid: true };

    case 'AGENDA_OBJECTION':
      if (state.agendaAdopted) {
        return {
          valid: false,
          error: 'Agenda is already adopted',
          errorCode: 'AGENDA_ALREADY_ADOPTED',
        };
      }
      if (state.agendaObjection) {
        return {
          valid: false,
          error: 'Objection already registered',
          errorCode: 'OBJECTION_ALREADY_REGISTERED',
        };
      }
      return { valid: true };

    case 'CALL_AGENDA_ITEM': {
      if (!state.agendaAdopted) {
        return {
          valid: false,
          error: 'Agenda must be adopted first',
          errorCode: 'AGENDA_NOT_ADOPTED',
        };
      }
      const item = state.agenda.find((a) => a.id === action.id);
      if (!item) {
        return { valid: false, error: 'Agenda item not found', errorCode: 'ITEM_NOT_FOUND' };
      }
      if (item.status === 'completed') {
        return {
          valid: false,
          error: 'Agenda item already completed',
          errorCode: 'ITEM_ALREADY_COMPLETED',
        };
      }
      return { valid: true };
    }

    case 'COMPLETE_AGENDA_ITEM':
      if (!state.currentAgendaItem) {
        return { valid: false, error: 'No agenda item is active', errorCode: 'NO_ACTIVE_ITEM' };
      }
      if (state.currentAgendaItem.id !== action.id) {
        return {
          valid: false,
          error: 'Cannot complete a different agenda item',
          errorCode: 'WRONG_AGENDA_ITEM',
        };
      }
      return { valid: true };

    case 'REQUEST_UNANIMOUS_CONSENT':
      if (!state.currentMotion) {
        return { valid: false, error: 'No motion on the floor', errorCode: 'NO_CURRENT_MOTION' };
      }
      // Asked on the question before the meeting: not while a vote is open or a motion waits
      // for a second, and not on an appeal, which the members decide by a vote
      if (state.votingOpen) {
        return {
          valid: false,
          error: 'A vote is in progress',
          errorCode: 'VOTING_IN_PROGRESS',
        };
      }
      if (state.pendingSecond) {
        return {
          valid: false,
          error: 'A motion is waiting for a second',
          errorCode: 'MOTION_PRECEDENCE_VIOLATION',
        };
      }
      if (state.currentMotion.type === 'appeal') {
        return {
          valid: false,
          error: 'An appeal is decided by a vote',
          errorCode: 'INVALID_ACTION',
        };
      }
      if (state.unanimousConsentPending) {
        return {
          valid: false,
          error: 'Unanimous consent already pending',
          errorCode: 'CONSENT_ALREADY_PENDING',
        };
      }
      return { valid: true };

    case 'OBJECT_TO_CONSENT':
      if (!state.unanimousConsentPending) {
        return {
          valid: false,
          error: 'No unanimous consent request pending',
          errorCode: 'NO_CONSENT_PENDING',
        };
      }
      // An objection from the floor is recorded by the chair for someone in the room
      if (action.fromFloor) {
        if (!isPresiding(state, action.objectorId)) return NOT_PRESIDING;
        const name = checkFloorName(action.floorObjector, false);
        if (!name.valid) return name;
      }
      return { valid: true };

    case 'UNANIMOUS_CONSENT_PASSED':
      // Only the question the chair asked about is adopted without objection
      if (
        !state.unanimousConsentPending ||
        !state.currentMotion ||
        (state.consentMotionId != null && state.consentMotionId !== state.currentMotion.id)
      ) {
        return {
          valid: false,
          error: 'No unanimous consent request pending',
          errorCode: 'NO_CONSENT_PENDING',
        };
      }
      return { valid: true };

    case 'APPROVE_MINUTES':
      if (state.minutesApproved) {
        return {
          valid: false,
          error: 'Minutes are already approved',
          errorCode: 'MINUTES_ALREADY_APPROVED',
        };
      }
      if (
        action.corrections !== undefined &&
        (typeof action.corrections !== 'string' ||
          action.corrections.length > MAX_CORRECTIONS_LENGTH)
      ) {
        return {
          valid: false,
          error: `Corrections can be at most ${MAX_CORRECTIONS_LENGTH} characters`,
          errorCode: 'INVALID_ACTION',
        };
      }
      return { valid: true };

    case 'OPEN_NOMINATIONS':
      if (state.nominationsOpen) {
        return {
          valid: false,
          error: 'Nominations are already open',
          errorCode: 'NOMINATIONS_ALREADY_OPEN',
        };
      }
      // An election takes the floor once the question before the meeting is settled
      if (state.currentMotion || state.pendingSecond) {
        return {
          valid: false,
          error: 'Finish the pending question first',
          errorCode: 'INVALID_STATE',
        };
      }
      return { valid: true };

    case 'NOMINATE': {
      // A nomination from the floor is recorded by the chair, not sent by a member
      if (action.fromFloor && !isPresiding(state, action.nominatorId)) {
        return {
          valid: false,
          error: 'Only the chair records a nomination from the floor',
          errorCode: 'PERMISSION_DENIED',
        };
      }
      if (!state.nominationsOpen) {
        return {
          valid: false,
          error: 'Nominations are not open',
          errorCode: 'NOMINATIONS_NOT_OPEN',
        };
      }
      if (state.currentNominationPosition !== action.position) {
        return {
          valid: false,
          error: 'Nominations are for a different position',
          errorCode: 'WRONG_POSITION',
        };
      }
      // Check if already nominated. A nominee from outside the meeting has no member ID (0),
      // so they are told apart by name.
      const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
      const alreadyNominated = state.nominations.some(
        (n) =>
          n.position === action.position &&
          !n.declined &&
          (action.nomineeId
            ? n.nomineeId === action.nomineeId
            : !n.nomineeId && sameName(n.nomineeName, action.nomineeName)),
      );
      if (alreadyNominated) {
        return {
          valid: false,
          error: 'Member is already nominated for this position',
          errorCode: 'ALREADY_NOMINATED',
        };
      }
      if (action.nomineeId && isGuest(state, action.nomineeId)) {
        return {
          valid: false,
          error: 'Guests cannot be nominated',
          errorCode: 'INVALID_ACTION',
        };
      }
      return { valid: true };
    }

    case 'DECLINE_NOMINATION': {
      const nomination = state.nominations.find((n) => n.id === action.nominationId);
      if (!nomination) {
        return { valid: false, error: 'Nomination not found', errorCode: 'NOMINATION_NOT_FOUND' };
      }
      if (nomination.declined) {
        return {
          valid: false,
          error: 'Nomination is already declined',
          errorCode: 'NOMINATION_ALREADY_DECLINED',
        };
      }
      // The nominee declines, or the chair for them (a nominee from outside the meeting, say)
      if (
        action.declinedBy !== undefined &&
        action.declinedBy !== nomination.nomineeId &&
        !isPresiding(state, action.declinedBy)
      ) {
        return {
          valid: false,
          error: 'Only the nominee or the chair can decline this nomination',
          errorCode: 'PERMISSION_DENIED',
        };
      }
      return { valid: true };
    }

    case 'CLOSE_NOMINATIONS':
      if (!state.nominationsOpen) {
        return {
          valid: false,
          error: 'Nominations are not open',
          errorCode: 'NOMINATIONS_NOT_OPEN',
        };
      }
      return { valid: true };

    case 'START_ELECTION':
      if (state.currentElection) {
        return {
          valid: false,
          error: 'An election is already in progress',
          errorCode: 'ELECTION_IN_PROGRESS',
        };
      }
      // A ballot on a motion and a ballot for an office at once would mix up the voting
      if (state.votingOpen) {
        return {
          valid: false,
          error: 'No election can start while a vote is in progress',
          errorCode: 'VOTING_IN_PROGRESS',
        };
      }
      // A ballot with no candidate can't elect anyone, and nothing would end it: the chair
      // reopens nominations or sets the election aside
      if (!state.nominations.some((n) => n.position === action.position && !n.declined)) {
        return {
          valid: false,
          error: 'Nobody has been nominated',
          errorCode: 'INVALID_STATE',
        };
      }
      return { valid: true };

    case 'SET_ASIDE_ELECTION':
      if (!isElectionUnderway(state)) {
        return { valid: false, error: 'No election to set aside', errorCode: 'NO_ELECTION' };
      }
      return { valid: true };

    case 'CAST_BALLOT': {
      const notVoting = checkVoterPresent(state, action.voterId);
      if (notVoting) return notVoting;
      if (!state.currentElection) {
        return { valid: false, error: 'No election in progress', errorCode: 'NO_ELECTION' };
      }
      if (!state.currentElection.votingInProgress) {
        return {
          valid: false,
          error: 'Election voting is not open',
          errorCode: 'ELECTION_VOTING_NOT_OPEN',
        };
      }
      if (state.currentElection.votersWhoVoted.includes(action.voterId)) {
        return {
          valid: false,
          error: 'You have already voted in this election',
          errorCode: 'ALREADY_VOTED_ELECTION',
        };
      }
      return { valid: true };
    }

    case 'SET_FLOOR_BALLOTS': {
      if (!state.currentElection) {
        return { valid: false, error: 'No election in progress', errorCode: 'NO_ELECTION' };
      }
      if (!state.currentElection.votingInProgress) {
        return {
          valid: false,
          error: 'Election voting is not open',
          errorCode: 'ELECTION_VOTING_NOT_OPEN',
        };
      }
      const counts =
        typeof action.counts === 'object' && action.counts !== null && !Array.isArray(action.counts)
          ? Object.entries(action.counts)
          : null;
      if (
        !counts ||
        counts.length > 100 ||
        counts.some(([name, count]) => !name.trim() || name.length > 200 || !isCount(count))
      ) {
        return {
          valid: false,
          error: `Give each candidate's ballots as a whole number from 0 to ${MAX_FLOOR_COUNT}`,
          errorCode: 'INVALID_ACTION',
        };
      }
      return { valid: true };
    }

    case 'CLOSE_ELECTION':
      if (!state.currentElection) {
        return { valid: false, error: 'No election in progress', errorCode: 'NO_ELECTION' };
      }
      if (!state.currentElection.votingInProgress) {
        return {
          valid: false,
          error: 'Election voting is not open',
          errorCode: 'ELECTION_VOTING_NOT_OPEN',
        };
      }
      return { valid: true };

    case 'DECLARE_ELECTED':
      if (!state.currentElection) {
        return { valid: false, error: 'No election in progress', errorCode: 'NO_ELECTION' };
      }
      return { valid: true };

    case 'ASK_INQUIRY':
      if (!state.meetingActive) {
        return { valid: false, error: 'Meeting is not active', errorCode: 'MEETING_NOT_ACTIVE' };
      }
      if (action.question && action.question.length > 500) {
        return {
          valid: false,
          error: 'Question exceeds 500 character limit',
          errorCode: 'INVALID_ACTION',
        };
      }
      return { valid: true };

    case 'ANSWER_INQUIRY': {
      const inquiry = state.inquiries.find((i) => i.id === action.inquiryId);
      if (!inquiry) {
        return { valid: false, error: 'Inquiry not found', errorCode: 'INQUIRY_NOT_FOUND' };
      }
      if (inquiry.answer) {
        return {
          valid: false,
          error: 'Inquiry is already answered',
          errorCode: 'INQUIRY_ALREADY_ANSWERED',
        };
      }
      if (action.answer && action.answer.length > 1000) {
        return {
          valid: false,
          error: 'Answer exceeds 1000 character limit',
          errorCode: 'INVALID_ACTION',
        };
      }
      return { valid: true };
    }

    case 'SET_MEMBER_ROLE': {
      const targetMember = state.members.find((m) => m.id === action.targetMemberId);
      if (!targetMember) {
        return { valid: false, error: 'Member not found', errorCode: 'MEMBER_NOT_FOUND' };
      }
      if (targetMember.role === 'guest') {
        return {
          valid: false,
          error: 'A guest cannot take the chair',
          errorCode: 'INVALID_ACTION',
        };
      }
      if (targetMember.role === action.newRole) {
        return {
          valid: false,
          error: `Member is already a ${action.newRole}`,
          errorCode: 'ROLE_UNCHANGED',
        };
      }
      // The new chair needs a screen to run the meeting: someone marked present in the room
      // without a device can't (a present member without presentBy is from an older state, on
      // a device)
      if (
        action.newRole === 'chair' &&
        !(targetMember.present && targetMember.presentBy !== 'chair')
      ) {
        return {
          valid: false,
          error: 'The new chair needs to be present on a device',
          errorCode: 'NOT_PRESENT',
        };
      }
      return { valid: true };
    }

    case 'SET_MEMBER_PRESENCE': {
      const member = state.members.find((m) => m.id === action.memberId);
      if (!member) {
        return { valid: false, error: 'Member not found', errorCode: 'MEMBER_NOT_FOUND' };
      }
      return { valid: true };
    }

    case 'ADD_MEMBER': {
      const existingMember = state.members.find((m) => m.id === action.member.id);
      if (existingMember) {
        return { valid: false, error: 'Member already exists', errorCode: 'MEMBER_EXISTS' };
      }
      return { valid: true };
    }

    case 'PRESENT_COMMITTEE_REPORT': {
      const report = state.committeeReports.find((r) => r.id === action.reportId);
      if (!report) {
        return { valid: false, error: 'Report not found', errorCode: 'REPORT_NOT_FOUND' };
      }
      if (report.presented) {
        return {
          valid: false,
          error: 'Report is already presented',
          errorCode: 'REPORT_ALREADY_PRESENTED',
        };
      }
      return { valid: true };
    }

    case 'RESTORE_RULE': {
      const suspension = state.suspendedRules.find((s) => s.id === action.suspensionId);
      if (!suspension) {
        return {
          valid: false,
          error: 'Rule suspension not found',
          errorCode: 'SUSPENSION_NOT_FOUND',
        };
      }
      return { valid: true };
    }

    case 'CHAIR_RULING':
      // The chair rules on a point of order, which takes no vote. A motion is decided by a vote
      // or by unanimous consent, never by a ruling, which would take it off the floor with no
      // record of its fate.
      if (!awaitingRuling(state)) {
        return {
          valid: false,
          error: 'There is no point of order to rule on',
          errorCode: 'INVALID_STATE',
        };
      }
      // Out of order: the point is well taken, about a motion awaiting a second or beneath it
      if (
        action.outOfOrder &&
        (action.ruling !== 'sustain' ||
          state.currentMotion?.type !== 'pointOrder' ||
          (!state.pendingSecond && state.motionStack.length < 2))
      ) {
        return {
          valid: false,
          error: 'Only a point of order well taken rules a pending motion out of order',
          errorCode: 'INVALID_ACTION',
        };
      }
      if (
        action.explanation !== undefined &&
        (typeof action.explanation !== 'string' ||
          action.explanation.length > MAX_RULING_EXPLANATION_LENGTH)
      ) {
        return {
          valid: false,
          error: `An explanation can be at most ${MAX_RULING_EXPLANATION_LENGTH} characters`,
          errorCode: 'INVALID_ACTION',
        };
      }
      // The reducer handles context-specific validation
      return { valid: true };

    // Proxy voting actions - block modifications during voting to prevent race conditions
    case 'SET_PROXY_SETTINGS':
      if (state.votingOpen) {
        return {
          valid: false,
          error: 'Cannot change proxy settings while voting is in progress',
          errorCode: 'VOTING_IN_PROGRESS',
        };
      }
      return { valid: true };

    case 'GRANT_PROXY': {
      if (!state.allowProxyVoting) {
        return {
          valid: false,
          error: 'Proxy voting is not enabled',
          errorCode: 'PROXY_VOTING_DISABLED',
        };
      }
      if (state.votingOpen) {
        return {
          valid: false,
          error: 'Cannot grant proxy while voting is in progress',
          errorCode: 'VOTING_IN_PROGRESS',
        };
      }
      if (action.grantedBy === action.grantedTo) {
        return {
          valid: false,
          error: 'Cannot grant proxy to yourself',
          errorCode: 'CANNOT_PROXY_SELF',
        };
      }
      const grantingMember = state.members.find((m) => m.id === action.grantedBy);
      if (!grantingMember) {
        return { valid: false, error: 'Granting member not found', errorCode: 'MEMBER_NOT_FOUND' };
      }
      const receivingMember = state.members.find((m) => m.id === action.grantedTo);
      if (!receivingMember) {
        return { valid: false, error: 'Receiving member not found', errorCode: 'MEMBER_NOT_FOUND' };
      }
      if (grantingMember.role === 'guest' || receivingMember.role === 'guest') {
        return {
          valid: false,
          error: 'Guests cannot hold or grant proxies',
          errorCode: 'INVALID_ACTION',
        };
      }
      if (!receivingMember.present) {
        return {
          valid: false,
          error: 'Proxy receiver must be present',
          errorCode: 'RECEIVER_NOT_PRESENT',
        };
      }
      // Check max proxies limit (0 = unlimited)
      if (state.maxProxiesPerMember > 0) {
        const currentProxyCount = state.proxies.filter(
          (p) => p.grantedTo === action.grantedTo,
        ).length;
        if (currentProxyCount >= state.maxProxiesPerMember) {
          return {
            valid: false,
            error: `Member already holds maximum ${state.maxProxiesPerMember} proxies`,
            errorCode: 'MAX_PROXIES_REACHED',
          };
        }
      }
      // Check if granting member already has an active proxy
      const existingProxy = state.proxies.find((p) => p.grantedBy === action.grantedBy);
      if (existingProxy) {
        return {
          valid: false,
          error: 'Member already has an active proxy',
          errorCode: 'PROXY_ALREADY_GRANTED',
        };
      }
      return { valid: true };
    }

    case 'REVOKE_PROXY': {
      if (state.votingOpen) {
        return {
          valid: false,
          error: 'Cannot revoke proxy while voting is in progress',
          errorCode: 'VOTING_IN_PROGRESS',
        };
      }
      const proxy = state.proxies.find((p) => p.id === action.proxyId);
      if (!proxy) {
        return { valid: false, error: 'Proxy not found', errorCode: 'PROXY_NOT_FOUND' };
      }
      return { valid: true };
    }

    case 'CAST_PROXY_VOTE': {
      if (!state.allowProxyVoting) {
        return {
          valid: false,
          error: 'Proxy voting is not enabled',
          errorCode: 'PROXY_VOTING_DISABLED',
        };
      }
      if (!state.votingOpen) {
        return { valid: false, error: 'Voting is not open', errorCode: 'VOTING_NOT_OPEN' };
      }
      if (state.votingMethod === 'voice') {
        return {
          valid: false,
          error: 'This is a voice vote: the chair counts it in the room',
          errorCode: 'VOTING_METHOD',
        };
      }
      // Verify the caster has proxy authority for this member
      const proxy = state.proxies.find(
        (p) => p.grantedBy === action.forMemberId && p.grantedTo === action.castById,
      );
      if (!proxy) {
        return {
          valid: false,
          error: 'No proxy authority for this member',
          errorCode: 'NO_PROXY_AUTHORITY',
        };
      }
      // A proxy may cast or change the member's vote, but not replace one cast in person
      const votedInPerson =
        state.voters.includes(action.forMemberId) &&
        !state.proxyVotes.some((pv) => pv.memberId === action.forMemberId);
      if (votedInPerson) {
        return {
          valid: false,
          error: 'This member has already voted in person',
          errorCode: 'ALREADY_VOTED',
        };
      }
      return { valid: true };
    }

    // Member-initiated proxy request actions - also blocked during voting
    case 'REQUEST_PROXY': {
      if (!state.allowProxyVoting) {
        return {
          valid: false,
          error: 'Proxy voting is not enabled',
          errorCode: 'PROXY_VOTING_DISABLED',
        };
      }
      if (!state.allowMemberProxyGrant) {
        return {
          valid: false,
          error: 'Member proxy requests are not enabled',
          errorCode: 'MEMBER_PROXY_DISABLED',
        };
      }
      if (state.votingOpen) {
        return {
          valid: false,
          error: 'Cannot request proxy while voting is in progress',
          errorCode: 'VOTING_IN_PROGRESS',
        };
      }
      if (action.requestedBy === action.requestedFor) {
        return {
          valid: false,
          error: 'Cannot request yourself as proxy holder',
          errorCode: 'CANNOT_PROXY_SELF',
        };
      }
      const requestingMember = state.members.find((m) => m.id === action.requestedBy);
      if (!requestingMember) {
        return {
          valid: false,
          error: 'Requesting member not found',
          errorCode: 'MEMBER_NOT_FOUND',
        };
      }
      const designatedHolder = state.members.find((m) => m.id === action.requestedFor);
      if (!designatedHolder) {
        return {
          valid: false,
          error: 'Designated proxy holder not found',
          errorCode: 'MEMBER_NOT_FOUND',
        };
      }
      if (designatedHolder.role === 'guest') {
        return {
          valid: false,
          error: 'Guests cannot hold proxies',
          errorCode: 'INVALID_ACTION',
        };
      }
      // Check for existing pending request
      const existingRequest = state.pendingProxyRequests.find(
        (r) => r.requestedBy === action.requestedBy && r.status === 'pending',
      );
      if (existingRequest) {
        return {
          valid: false,
          error: 'You already have a pending proxy request',
          errorCode: 'REQUEST_PENDING',
        };
      }
      // Check for existing active proxy
      const existingProxy = state.proxies.find((p) => p.grantedBy === action.requestedBy);
      if (existingProxy) {
        return {
          valid: false,
          error: 'You already have an active proxy',
          errorCode: 'PROXY_ALREADY_GRANTED',
        };
      }
      return { valid: true };
    }

    case 'ACCEPT_PROXY': {
      if (state.votingOpen) {
        return {
          valid: false,
          error: 'Cannot accept proxy while voting is in progress',
          errorCode: 'VOTING_IN_PROGRESS',
        };
      }
      const request = state.pendingProxyRequests.find((r) => r.id === action.requestId);
      if (!request) {
        return { valid: false, error: 'Proxy request not found', errorCode: 'REQUEST_NOT_FOUND' };
      }
      if (request.status !== 'pending') {
        return {
          valid: false,
          error: 'Request is no longer pending',
          errorCode: 'REQUEST_NOT_PENDING',
        };
      }
      if (action.acceptedBy !== undefined && action.acceptedBy !== request.requestedFor) {
        return {
          valid: false,
          error: 'Only the member asked can accept this request',
          errorCode: 'PERMISSION_DENIED',
        };
      }
      // Check max proxies limit
      if (state.maxProxiesPerMember > 0) {
        const currentCount = state.proxies.filter(
          (p) => p.grantedTo === request.requestedFor,
        ).length;
        if (currentCount >= state.maxProxiesPerMember) {
          return {
            valid: false,
            error: `You already hold maximum ${state.maxProxiesPerMember} proxies`,
            errorCode: 'MAX_PROXIES_REACHED',
          };
        }
      }
      return { valid: true };
    }

    case 'DECLINE_PROXY': {
      if (state.votingOpen) {
        return {
          valid: false,
          error: 'Cannot decline proxy while voting is in progress',
          errorCode: 'VOTING_IN_PROGRESS',
        };
      }
      const request = state.pendingProxyRequests.find((r) => r.id === action.requestId);
      if (!request) {
        return { valid: false, error: 'Proxy request not found', errorCode: 'REQUEST_NOT_FOUND' };
      }
      if (request.status !== 'pending') {
        return {
          valid: false,
          error: 'Request is no longer pending',
          errorCode: 'REQUEST_NOT_PENDING',
        };
      }
      if (action.declinedBy !== undefined && action.declinedBy !== request.requestedFor) {
        return {
          valid: false,
          error: 'Only the member asked can decline this request',
          errorCode: 'PERMISSION_DENIED',
        };
      }
      return { valid: true };
    }

    case 'CANCEL_PROXY_REQUEST': {
      if (state.votingOpen) {
        return {
          valid: false,
          error: 'Cannot cancel proxy request while voting is in progress',
          errorCode: 'VOTING_IN_PROGRESS',
        };
      }
      const request = state.pendingProxyRequests.find((r) => r.id === action.requestId);
      if (!request) {
        return { valid: false, error: 'Proxy request not found', errorCode: 'REQUEST_NOT_FOUND' };
      }
      if (request.status !== 'pending') {
        return {
          valid: false,
          error: 'Request is no longer pending',
          errorCode: 'REQUEST_NOT_PENDING',
        };
      }
      // The member who asked cancels, or the chair (for a member who has left, say)
      if (
        action.canceledBy !== undefined &&
        action.canceledBy !== request.requestedBy &&
        !isPresiding(state, action.canceledBy)
      ) {
        return {
          valid: false,
          error: 'Only the member who asked or the chair can cancel this request',
          errorCode: 'PERMISSION_DENIED',
        };
      }
      return { valid: true };
    }

    // Roll call actions
    case 'START_ROLL_CALL':
      if (state.rollCall?.inProgress) {
        return {
          valid: false,
          error: 'Roll call is already in progress',
          errorCode: 'INVALID_STATE',
        };
      }
      return { valid: true };

    case 'RESPOND_ROLL_CALL': {
      if (!state.rollCall?.inProgress) {
        return {
          valid: false,
          error: 'Roll call is not in progress',
          errorCode: 'ROLL_CALL_NOT_IN_PROGRESS',
        };
      }
      const member = state.members.find((m) => m.id === action.memberId);
      if (!member) {
        return { valid: false, error: 'Member not found', errorCode: 'MEMBER_NOT_FOUND' };
      }
      return { valid: true };
    }

    case 'COMPLETE_ROLL_CALL':
      if (!state.rollCall?.inProgress) {
        return {
          valid: false,
          error: 'Roll call is not in progress',
          errorCode: 'ROLL_CALL_NOT_IN_PROGRESS',
        };
      }
      return { valid: true };

    case 'MARK_ABSENT': {
      const memberToMark = state.members.find((m) => m.id === action.memberId);
      if (!memberToMark) {
        return { valid: false, error: 'Member not found', errorCode: 'MEMBER_NOT_FOUND' };
      }
      return { valid: true };
    }

    // Settings actions
    case 'SET_AUTO_YIELD':
      // Always valid - chair setting
      return { valid: true };

    case 'SET_MEETING_STAGE': {
      const { stage } = action;
      if (!state.meetingActive) {
        return { valid: false, error: 'Meeting is not active', errorCode: 'MEETING_NOT_ACTIVE' };
      }
      // Starting and adjourning the meeting set the other stages
      if (!DISPLAYABLE_STAGES.some((s) => s.stage === stage)) {
        return { valid: false, error: 'Unknown meeting stage', errorCode: 'INVALID_ACTION' };
      }
      return { valid: true };
    }

    case 'SET_QUORUM':
      if (!Number.isInteger(action.quorum) || action.quorum < 1) {
        return {
          valid: false,
          error: 'Quorum must be a whole number of at least 1',
          errorCode: 'INVALID_ACTION',
        };
      }
      return { valid: true };

    // Attendance
    case 'MARK_PRESENT': {
      // The server fills in member from the organization's roster (see attendanceActions.ts)
      if (!action.member || action.member.id !== action.userId) {
        return {
          valid: false,
          error: "That person isn't in the organization",
          errorCode: 'NOT_A_MEMBER',
        };
      }
      const existing = state.members.find((m) => m.id === action.userId);
      if (existing?.present && existing.presentBy === 'chair') {
        return {
          valid: false,
          error: `${existing.name} is already marked present`,
          errorCode: 'INVALID_STATE',
        };
      }
      return { valid: true };
    }

    case 'SET_HEADCOUNT': {
      if (!Number.isInteger(action.count) || action.count < 0 || action.count > MAX_HEADCOUNT) {
        return {
          valid: false,
          error: `The headcount must be a whole number from 0 to ${MAX_HEADCOUNT}`,
          errorCode: 'INVALID_ACTION',
        };
      }
      const names = Array.isArray(action.names) ? action.names : null;
      if (
        !names ||
        names.some((n) => typeof n !== 'string' || n.trim().length > 100) ||
        names.filter((n) => n.trim().length > 0).length > action.count
      ) {
        return {
          valid: false,
          error: 'Give at most one name for each person counted, each up to 100 characters',
          errorCode: 'INVALID_ACTION',
        };
      }
      return { valid: true };
    }

    case 'RELOAD_AGENDA':
      // Once the meeting starts, the agenda is changed in the meeting
      if (state.meetingActive || state.meetingStage !== 'not-started') {
        return {
          valid: false,
          error: 'The meeting has started; change the agenda in the meeting',
          errorCode: 'MEETING_ALREADY_ACTIVE',
        };
      }
      return { valid: true };

    case 'REFRESH_MEMBERS':
    case 'SET_MEETING_INFO':
      // Server-only, from the organization's roster and the packet
      return { valid: true };

    case 'REORDER_AGENDA': {
      const inAgenda = (index: number) =>
        Number.isInteger(index) && index >= 0 && index < state.agenda.length;
      if (!inAgenda(action.fromIndex) || !inAgenda(action.toIndex)) {
        return {
          valid: false,
          error: 'The agenda has changed; reload and try again',
          errorCode: 'ITEM_NOT_FOUND',
        };
      }
      return { valid: true };
    }

    // Actions that are always valid if meeting is active
    case 'ADD_AGENDA_ITEM':
    case 'REMOVE_AGENDA_ITEM':
    case 'SET_SPEAKER_TIME_LIMIT':
    case 'SET_VOTE_TIME_LIMIT':
    case 'ADVANCE_MEETING_STAGE':
    case 'SET_PREVIOUS_MINUTES':
    case 'ADD_COMMITTEE_REPORT':
      return { valid: true };

    case 'SUSPEND_RULE_APPROVED':
      return {
        valid: false,
        error:
          "Suspend the rules isn't offered in Robbie: the meeting follows its rules as they are",
        errorCode: 'MOTION_NOT_OFFERED',
      };

    default: {
      // Every action type needs a case above; this fails to compile if one is missing
      const unhandled: never = action;
      void unhandled;
      // Unknown action type from a client - reject for safety
      return { valid: false, error: 'Unknown action type', errorCode: 'INVALID_ACTION' };
    }
  }
}
