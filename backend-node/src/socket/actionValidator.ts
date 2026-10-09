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
  acclamationCandidates,
  countBallot,
  electedTo,
  floorOpenForDebate,
  headcountBaseHolds,
  isBoardMeeting,
  motionOutOfOrder,
  smallBoard,
  takesPart,
  motionThreshold,
  remainingNominees,
  winnersOf,
  moverClaimsFloor,
  pendingNotOffered,
  textAmendmentProblem,
  wasMotionDefeated,
  type OutOfOrder,
} from '@robbie-bylawyer/shared/utils';
import { ACTOR_FIELDS } from './actionEnricher.js';
import { checkPermission, isServerOnly, membersMaySend } from './permissionGuard.js';

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

/** What doesn't apply in a board meeting: the room's count (directors take part in person) */
const NOT_IN_A_BOARD_MEETING: ReadonlyMap<MeetingAction['type'], string> = new Map<
  MeetingAction['type'],
  string
>([
  ['SET_HEADCOUNT', 'Nobody is counted in the room in a board meeting: mark the directors present'],
]);

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

/**
 * Without a quorum the meeting can only adjourn or recess (RONR 40:6): anything else (a vote, an
 * adoption by consent, the agenda, a ballot) goes ahead only once the chair confirms it, knowing
 * it is not valid business. Null when it may go ahead.
 */
function quorumConfirmed(
  state: MeetingState,
  confirmed: boolean | undefined,
  question: string,
): ValidationResult | null {
  if (attendanceSummary(state).hasQuorum || confirmed) return null;
  if (state.currentMotion && NO_QUORUM_NEEDED.has(state.currentMotion.type)) return null;
  return {
    valid: false,
    error: `There is no quorum. Business done now is not valid. ${question}`,
    errorCode: 'NO_QUORUM',
  };
}

/** A pending motion Robbie no longer offers, from a live meeting saved earlier, isn't put */
function notOffered(state: MeetingState): ValidationResult | null {
  const reason = pendingNotOffered(state);
  return reason ? { valid: false, error: reason, errorCode: 'MOTION_NOT_OFFERED' } : null;
}

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

/** In a board meeting a mover or seconder from the floor is a director by their account */
const NAME_A_DIRECTOR: ValidationResult = {
  valid: false,
  error: 'Name the director: mark them present if they have no phone',
  errorCode: 'BOARD_MEETING',
};

/**
 * In a board meeting, more votes than directors: device voters and hands in the room together
 * (a director votes once, on a device or in the room)
 */
function moreVotesThanDirectors(state: MeetingState, devices: number): boolean {
  if (!state.board) return false;
  const floor = state.floorVotes ?? NO_VOTES;
  return devices + floor.yea + floor.nay + floor.abstain > state.board.directors;
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
  // In a board meeting only the directors move and second
  if (!takesPart(named)) {
    return {
      valid: false,
      error:
        as === 'mover'
          ? 'Only the directors make motions in a board meeting'
          : 'Only the directors second motions in a board meeting',
      errorCode: 'PERMISSION_DENIED',
    };
  }
  // The presiding officer doesn't move or second (RONR): the chair, or the admin presiding;
  // in a small board they do, as any director (RONR 49:21)
  if ((named.role === 'chair' || named.id === recordedBy) && !smallBoard(state)) {
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
  'ELECT_BY_ACCLAMATION',
]);

/** What can happen in a recess: the chair resumes or adjourns; the room's count is kept */
const IN_RECESS_ALLOWED: ReadonlySet<MeetingAction['type']> = new Set<MeetingAction['type']>([
  'RESUME_MEETING',
  // A division on the voice vote that carried the recess
  'REQUEST_DIVISION',
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
  // A division on the voice vote that carried the adjournment
  'REQUEST_DIVISION',
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
 * Whether the chair may declare the open voice vote's result without a count: only on a voice
 * vote not divided, on a question decided by a majority of the votes cast, and never on a bylaw
 * amendment, whose record is counted (a vote of two thirds, or of all the members, is counted)
 */
function voiceResultDeclarable(state: MeetingState): ValidationResult {
  if (state.votingMethod !== 'voice' || state.divisionCalled) {
    return {
      valid: false,
      error: 'Only a voice vote is declared without a count',
      errorCode: 'VOTING_METHOD',
    };
  }
  const motion = state.currentMotion;
  const threshold = motion ? motionThreshold(motion) : null;
  const counted = (what: string): ValidationResult => ({
    valid: false,
    error: `${what} is counted: enter the count in the room`,
    errorCode: 'VOTING_METHOD',
  });
  if (threshold?.of === 'members') return counted('A vote of all the voting members');
  if (threshold?.fraction === '2/3') return counted('A vote of two thirds');
  if (motion?.type === 'bylawAmendment') return counted('A bylaw amendment');
  return { valid: true };
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

type BallotAction = Extract<MeetingAction, { type: 'CAST_BALLOT' }>;
type PaperAction = Extract<MeetingAction, { type: 'SET_FLOOR_BALLOTS' }>;
type OpenElection = NonNullable<MeetingState['currentElection']>;

/**
 * Why a device ballot can't be counted, or null: it marks one name or more, no more than the
 * seats, each once, and each a candidate on this ballot (a name written in is paper only)
 */
function ballotProblem(election: OpenElection, action: BallotAction): ValidationResult | null {
  const names = action.candidateNames ?? (action.candidateName ? [action.candidateName] : []);
  const seats = election.seats ?? 1;
  if (names.length === 0) {
    return { valid: false, error: 'Mark a name on the ballot', errorCode: 'INVALID_ACTION' };
  }
  if (names.length > seats) {
    return {
      valid: false,
      error: seats === 1 ? 'Mark one name' : `Mark up to ${seats} names`,
      errorCode: 'INVALID_ACTION',
    };
  }
  if (new Set(names).size !== names.length) {
    return { valid: false, error: 'Mark each name once', errorCode: 'INVALID_ACTION' };
  }
  const candidates = new Set(election.candidates.map((c) => c.name));
  if (names.some((name) => !candidates.has(name))) {
    return {
      valid: false,
      error: 'Vote for a candidate on the ballot',
      errorCode: 'INVALID_ACTION',
    };
  }
  return null;
}

/**
 * Why the tellers' count of paper ballots doesn't add up, or null: marks are for the candidates
 * on the ballot, and names written in are not theirs. With several seats the paper ballots
 * counted are entered (a ballot marks several names, so the marks can't give it), each
 * candidate has no more marks than the legal ballots, and all marks fit on them.
 */
function paperBallotProblem(
  election: OpenElection,
  action: PaperAction,
  elected: string[],
): ValidationResult | null {
  const candidates = new Set(election.candidates.map((c) => c.name));
  if (Object.keys(action.counts).some((name) => !candidates.has(name))) {
    return {
      valid: false,
      error: 'Enter a name not on the ballot as a write-in',
      errorCode: 'INVALID_ACTION',
    };
  }
  const writeIns = Object.keys(action.writeIns ?? {});
  // Elected to one seat, nobody is elected to another by a name written in
  const again = writeIns.find((name) => elected.some((e) => sameName(e, name)));
  if (again) {
    return {
      valid: false,
      error: `${again} has already been elected ${election.position}`,
      errorCode: 'INVALID_ACTION',
    };
  }
  if (writeIns.some((name) => [...candidates].some((c) => sameName(c, name)))) {
    return {
      valid: false,
      error: 'A candidate on the ballot is not a write-in: count them as a candidate',
      errorCode: 'INVALID_ACTION',
    };
  }
  const seats = election.seats ?? 1;
  if (seats === 1) return null;
  const marks = [...Object.values(action.counts), ...Object.values(action.writeIns ?? {})];
  const legal = (action.ballots ?? 0) - (action.illegal ?? 0);
  const total = marks.reduce((sum, count) => sum + count, 0);
  if ((total > 0 || (action.illegal ?? 0) > 0) && !action.ballots) {
    return {
      valid: false,
      error: 'Enter how many paper ballots were counted',
      errorCode: 'INVALID_ACTION',
    };
  }
  if (legal < 0 || marks.some((count) => count > legal) || total > legal * seats) {
    return {
      valid: false,
      error: `The marks don't fit on ${action.ballots ?? 0} paper ballots of up to ${seats} names`,
      errorCode: 'INVALID_ACTION',
    };
  }
  return null;
}

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
  // socket, a director's seat given or taken away), so the state's member decides: a sender the
  // meeting has as a guest or an observer sends only what that role may, and a presiding
  // officer without a vote (a board meeting's, who isn't a director) only what presides
  const actor = ACTOR_FIELDS[action.type];
  const sent = action as Record<string, unknown>;
  const actorId = actor?.id
    ? sent[actor.id]
    : actor?.member
      ? (sent.member as { id?: unknown } | undefined)?.id
      : undefined;
  const sender =
    typeof actorId === 'number' ? state.members.find((m) => m.id === actorId) : undefined;
  if (sender?.role === 'guest' && !checkPermission('guest', action.type)) {
    return {
      valid: false,
      error: 'Guests can follow the meeting but not take part in this',
      errorCode: 'PERMISSION_DENIED',
    };
  }
  if (sender?.role === 'observer' && !checkPermission('observer', action.type)) {
    return {
      valid: false,
      error: "Observers follow a board meeting but don't take part in it",
      errorCode: 'PERMISSION_DENIED',
    };
  }
  // What the presiding officer records for someone in the room (fromFloor) is presiding, and
  // each such case checks that the sender presides
  if (sender?.nonVoting && membersMaySend(action.type) && sent.fromFloor !== true) {
    return {
      valid: false,
      error: 'Only the directors take part in a board meeting: you preside without a vote',
      errorCode: 'PERMISSION_DENIED',
    };
  }

  // A board meeting counts its directors only, in person
  const notForTheBoard = isBoardMeeting(state) ? NOT_IN_A_BOARD_MEETING.get(action.type) : null;
  if (notForTheBoard) {
    return { valid: false, error: notForTheBoard, errorCode: 'BOARD_MEETING' };
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
      if (state.board && state.board.directors === 0) {
        return {
          valid: false,
          error:
            'A board meeting needs its board members: an admin marks them in Settings, Members',
          errorCode: 'NO_DIRECTORS',
        };
      }
      return { valid: true };

    case 'END_MEETING':
      if (!state.meetingActive) {
        return { valid: false, error: 'Meeting is not active', errorCode: 'MEETING_NOT_ACTIVE' };
      }
      // The console offers no Adjourn while a vote or an election's ballot is open: the vote is
      // closed (or the election set aside) first, so no ballot is left undecided. An adjournment
      // that carried is declared whatever is open: what is left is unfinished business.
      if (
        state.votingOpen ||
        (state.currentElection?.votingInProgress && !state.adjournmentCarried)
      ) {
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
      // A board's directors all have accounts: the director is named (marked present first)
      if (state.board && action.moverMemberId === undefined) return NAME_A_DIRECTOR;
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
      if (state.board) return NAME_A_DIRECTOR;
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
      // A motion awaiting a second is settled first: the vote would decide the question beneath
      // it, and the motion would then be seconded onto what is left
      if (state.pendingSecond) {
        return {
          valid: false,
          error: 'A motion is waiting for a second',
          errorCode: 'MOTION_PRECEDENCE_VIOLATION',
        };
      }
      return (
        notOffered(state) ??
        quorumConfirmed(state, action.confirmedWithoutQuorum, 'Open the vote anyway?') ?? {
          valid: true,
        }
      );

    case 'CAST_VOTE': {
      const notVoting = checkVoterPresent(state, action.voterId);
      if (notVoting) return notVoting;
      if (!state.votingOpen) {
        return { valid: false, error: 'Voting is not open', errorCode: 'VOTING_NOT_OPEN' };
      }
      if (state.votingMethod === 'voice' && !state.divisionCalled) {
        return {
          valid: false,
          error: 'This is a voice vote: the chair counts it in the room',
          errorCode: 'VOTING_METHOD',
        };
      }
      // A board's directors vote once each, on a device or in the room: a new vote past the
      // directors not counted yet is refused (a vote changed is no new vote)
      if (
        !(action.voterId in state.voterChoices) &&
        moreVotesThanDirectors(state, state.voters.length + 1)
      ) {
        return {
          valid: false,
          error: `Every one of the ${state.board!.directors} directors has voted, on a device or in the room`,
          errorCode: 'BOARD_MEETING',
        };
      }
      // A member who has voted may change the vote until the result is announced (RONR); the
      // reducer moves the count from the old choice to the new one
      // The chair votes only when the vote would
      // change the result. That is checked here, not taken from the client's flag. The chair of
      // a small board votes like any director (RONR 49:21).
      {
        const voter = state.members.find((m) => m.id === action.voterId);
        // On a secret ballot the chair votes like any member (RONR)
        if (voter?.role === 'chair' && state.votingMethod !== 'ballot' && !smallBoard(state)) {
          // Judge on everyone else's votes, on devices and in the room, leaving out a vote the
          // chair already cast
          const previous = state.voterChoices[action.voterId];
          const deviceVotes = previous
            ? { ...state.votes, [previous]: state.votes[previous] - 1 }
            : state.votes;
          const othersVotes = addVotes(deviceVotes, state.floorVotes);
          const decides =
            action.isChairDecidingVote &&
            canChairVoteDecide(
              othersVotes,
              state.currentMotion ? motionThreshold(state.currentMotion) : 'majority',
            );
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
      if (action.declared) return voiceResultDeclarable(state);
      if (moreVotesThanDirectors(state, state.voters.length)) {
        return {
          valid: false,
          error: `More votes than the ${state.board!.directors} directors: correct the count in the room`,
          errorCode: 'BOARD_MEETING',
        };
      }
      // A voice vote is counted only in the room: closing it with nothing entered would decide
      // the question on no votes at all
      const floor = state.floorVotes ?? NO_VOTES;
      if (
        state.votingMethod === 'voice' &&
        !state.divisionCalled &&
        floor.yea + floor.nay + floor.abstain === 0
      ) {
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
      if (
        chair &&
        !smallBoard(state) &&
        state.votingMethod !== 'ballot' &&
        state.voters.includes(chair.id)
      ) {
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
      // In a board meeting the room is the directors without a phone: no more hands than the
      // directors who haven't voted on a device
      if (state.board) {
        const left = Math.max(0, state.board.directors - state.voters.length);
        if (action.yea + action.nay + action.abstain > left) {
          return {
            valid: false,
            error: `Only ${left} ${left === 1 ? 'director is' : 'directors are'} not voting on a device`,
            errorCode: 'BOARD_MEETING',
          };
        }
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
      // On a voice vote, before the chair announces it, or right after the chair declares its
      // result (RONR 29:7), before other business
      if (!state.voiceVote && (!state.votingOpen || state.votingMethod !== 'voice')) {
        return {
          valid: false,
          error: 'A division is called on a voice vote, before other business comes up',
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
      return (
        quorumConfirmed(state, action.confirmedWithoutQuorum, 'Adopt the agenda anyway?') ?? {
          valid: true,
        }
      );

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
      if (state.currentElection?.votingInProgress) {
        return { valid: false, error: 'A ballot is open', errorCode: 'VOTING_IN_PROGRESS' };
      }
      {
        const refused = notOffered(state);
        if (refused) return refused;
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
      return (
        quorumConfirmed(state, action.confirmedWithoutQuorum, 'Adopt it anyway?') ?? {
          valid: true,
        }
      );

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
      // One election at a time: the one in hand is finished or set aside first. With seats still
      // open after a ballot and nobody awaiting the declaration, its nominations reopen.
      {
        const election = state.currentElection;
        const inHand = election?.position ?? state.currentNominationPosition;
        const between =
          !!election && !election.votingInProgress && winnersOf(election).length === 0;
        if ((election && !between) || (inHand && inHand !== action.position)) {
          return {
            valid: false,
            error: `Finish the election for ${inHand}, or set it aside`,
            errorCode: 'ELECTION_IN_PROGRESS',
          };
        }
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
      // Elected to one seat, a nominee isn't nominated for the next
      const nomineeName = action.nomineeId
        ? (state.members.find((m) => m.id === action.nomineeId)?.name ?? action.nomineeName)
        : action.nomineeName;
      if (electedTo(state, action.position).some((name) => sameName(name, nomineeName))) {
        return {
          valid: false,
          error: `${nomineeName} has already been elected ${action.position}`,
          errorCode: 'ALREADY_NOMINATED',
        };
      }
      // Check if already nominated. A nominee from outside the meeting has no member ID (0),
      // so they are told apart by name.
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
      if (
        action.nomineeId &&
        state.members.some((m) => m.id === action.nomineeId && m.role === 'guest')
      ) {
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

    case 'START_ELECTION': {
      const open = state.currentElection;
      // The next ballot of an election with seats still open, once its winners are declared
      if (
        open &&
        (open.votingInProgress ||
          winnersOf(open).length > 0 ||
          (open.seats ?? 1) < 1 ||
          open.candidates.length === 0)
      ) {
        return {
          valid: false,
          error: open.votingInProgress
            ? 'The ballot is already open'
            : winnersOf(open).length > 0
              ? 'Declare the result of this ballot first'
              : open.candidates.length === 0
                ? 'No candidates are left: reopen nominations, or set the election aside'
                : 'An election is already in progress',
          errorCode: 'ELECTION_IN_PROGRESS',
        };
      }
      const position = open?.position ?? state.currentNominationPosition;
      if (position && action.position !== position) {
        return {
          valid: false,
          error: `The election in hand is for ${position}`,
          errorCode: 'WRONG_POSITION',
        };
      }
      // A motion made during the election (adjourn, recess, a point of order) is settled first
      if (state.currentMotion || state.pendingSecond) {
        return {
          valid: false,
          error: 'Settle the pending motion first',
          errorCode: 'INVALID_STATE',
        };
      }
      const confirmation = quorumConfirmed(
        state,
        action.confirmedWithoutQuorum,
        'Open the ballot anyway?',
      );
      if (confirmation) return confirmation;
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
      if (!open && remainingNominees(state, action.position).length === 0) {
        return {
          valid: false,
          error: 'Nobody has been nominated',
          errorCode: 'INVALID_STATE',
        };
      }
      return { valid: true };
    }

    case 'ELECT_BY_ACCLAMATION': {
      if (!state.meetingActive) {
        return { valid: false, error: 'Meeting is not active', errorCode: 'MEETING_NOT_ACTIVE' };
      }
      if (state.currentMotion || state.pendingSecond || state.votingOpen) {
        return {
          valid: false,
          error: 'Settle the pending motion first',
          errorCode: 'INVALID_STATE',
        };
      }
      if (state.nominationsOpen) {
        return {
          valid: false,
          error: 'Close nominations first',
          errorCode: 'NOMINATIONS_ALREADY_OPEN',
        };
      }
      if (state.currentElection?.votingInProgress) {
        return { valid: false, error: 'The ballot is open', errorCode: 'VOTING_IN_PROGRESS' };
      }
      // RONR 46:40: only when there are no more nominees than seats, and nobody awaits a
      // declaration from a ballot
      if (!acclamationCandidates(state)) {
        return {
          valid: false,
          error: 'Only nominees who are no more than the open seats are elected without a ballot',
          errorCode: 'INVALID_STATE',
        };
      }
      return (
        quorumConfirmed(state, action.confirmedWithoutQuorum, 'Declare them elected anyway?') ?? {
          valid: true,
        }
      );
    }

    case 'SET_ASIDE_ELECTION':
      if (!isElectionUnderway(state)) {
        return { valid: false, error: 'No election to set aside', errorCode: 'NO_ELECTION' };
      }
      // Someone has the vote required: the chair declares the result, which can't be set aside
      if (
        state.currentElection &&
        !state.currentElection.votingInProgress &&
        winnersOf(state.currentElection).length > 0
      ) {
        return { valid: false, error: 'Declare the result first', errorCode: 'INVALID_STATE' };
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
      return ballotProblem(state.currentElection, action) ?? { valid: true };
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
      const writeIns =
        action.writeIns === undefined
          ? []
          : typeof action.writeIns === 'object' &&
              action.writeIns !== null &&
              !Array.isArray(action.writeIns)
            ? Object.entries(action.writeIns)
            : null;
      if (
        !counts ||
        !writeIns ||
        counts.length + writeIns.length > 100 ||
        [...counts, ...writeIns].some(
          ([name, count]) => !name.trim() || name.length > 200 || !isCount(count),
        ) ||
        ![action.blank ?? 0, action.illegal ?? 0, action.ballots ?? 0].every(isCount)
      ) {
        return {
          valid: false,
          error: `Give each candidate's ballots as a whole number from 0 to ${MAX_FLOOR_COUNT}`,
          errorCode: 'INVALID_ACTION',
        };
      }
      // A board's directors vote once each: on a device, or on paper
      if (state.board) {
        const seats = state.currentElection.seats ?? 1;
        const sum = (counts: Record<string, number> | undefined) =>
          Object.values(counts ?? {}).reduce((total, count) => total + count, 0);
        const paper =
          (action.blank ?? 0) +
          (seats > 1
            ? (action.ballots ?? 0)
            : sum(action.counts) + sum(action.writeIns) + (action.illegal ?? 0));
        const left = Math.max(
          0,
          state.board.directors - state.currentElection.votersWhoVoted.length,
        );
        if (paper > left) {
          return {
            valid: false,
            error: `Only ${left} ${left === 1 ? 'director has' : 'directors have'} not voted on a device`,
            errorCode: 'BOARD_MEETING',
          };
        }
      }
      return (
        paperBallotProblem(
          state.currentElection,
          action,
          electedTo(state, state.currentElection.position),
        ) ?? { valid: true }
      );
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
      // A ballot nobody cast decides nothing, as a voice vote with no count doesn't
      if (countBallot(state.currentElection).totals.cast === 0) {
        return {
          valid: false,
          error: 'No ballots have been cast: enter the paper ballots, or set the election aside',
          errorCode: 'INVALID_STATE',
        };
      }
      return { valid: true };

    case 'DECLARE_ELECTED': {
      const election = state.currentElection;
      if (!election) {
        return { valid: false, error: 'No election in progress', errorCode: 'NO_ELECTION' };
      }
      // The result of a closed ballot, and only for who has the vote required on it
      if (election.votingInProgress) {
        return {
          valid: false,
          error: 'Close the ballot before declaring the result',
          errorCode: 'VOTING_IN_PROGRESS',
        };
      }
      if (electedTo(state, election.position).some((n) => sameName(n, action.candidateName))) {
        return {
          valid: false,
          error: `${action.candidateName} has already been elected ${election.position}`,
          errorCode: 'INVALID_ACTION',
        };
      }
      if (!winnersOf(election).includes(action.candidateName)) {
        return {
          valid: false,
          error: `${action.candidateName} does not have the vote required`,
          errorCode: 'INVALID_ACTION',
        };
      }
      return { valid: true };
    }

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
      if (targetMember.role === 'guest' || targetMember.role === 'observer') {
        return {
          valid: false,
          error:
            targetMember.role === 'guest'
              ? 'A guest cannot take the chair'
              : 'An observer cannot take the chair',
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
      // A board meeting's attendance is its directors'
      if (isBoardMeeting(state) && !takesPart(action.member)) {
        return {
          valid: false,
          error: 'Only the directors are marked present in a board meeting',
          errorCode: 'BOARD_MEETING',
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
      if ((action.invites?.length ?? 0) > action.count) {
        return {
          valid: false,
          error: 'Count each person added by email in the headcount',
          errorCode: 'INVALID_ACTION',
        };
      }
      // Made from counts another screen has changed since: the client counts again from these
      if (action.base && !headcountBaseHolds(state, action.base)) {
        return {
          valid: false,
          error: 'The counts changed on another screen. Check them and save again.',
          errorCode: 'HEADCOUNT_CHANGED',
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

    case 'SET_BOARD':
      // Server-only: who votes is settled at the call to order
      if (state.meetingActive || state.meetingStage !== 'not-started') {
        return {
          valid: false,
          error: 'Who votes is settled once the meeting is called to order',
          errorCode: 'MEETING_ALREADY_ACTIVE',
        };
      }
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

    default: {
      // Every action type needs a case above; this fails to compile if one is missing
      const unhandled: never = action;
      void unhandled;
      // Unknown action type from a client - reject for safety
      return { valid: false, error: 'Unknown action type', errorCode: 'INVALID_ACTION' };
    }
  }
}
