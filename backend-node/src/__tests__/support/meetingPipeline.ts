/**
 * A meeting driven through the server's pipeline, for tests of the meeting's rules: each action
 * is checked against the sender's role (checkPermission), stamped with who sent it and when
 * (enrichAction), validated against the state (validateAction) and applied (meetingReducer), as
 * handleDispatchAction does, without the socket, the rate limit or the database.
 */
import { initialState, meetingReducer } from '@robbie-bylawyer/shared/reducer';
import type {
  MeetingAction,
  MeetingRole,
  MeetingState,
  Member,
  MotionDetails,
} from '@robbie-bylawyer/shared/types';
import {
  attendanceSummary,
  formatMinutesAsMarkdown,
  generateMeetingMinutes,
} from '@robbie-bylawyer/shared/utils';
import { checkPermission } from '../../socket/permissionGuard.js';
import { enrichAction } from '../../socket/actionEnricher.js';
import { validateAction, type ValidationResult } from '../../socket/actionValidator.js';

/** The people in the meeting: Dana chairs, Pat is an admin, four members, Sam a guest */
export const PEOPLE = {
  dana: { id: 1, name: 'Dana Okafor', role: 'chair' },
  pat: { id: 2, name: 'Pat Lee', role: 'admin' },
  alice: { id: 3, name: 'Alice Brennan', role: 'member' },
  ben: { id: 4, name: 'Ben Whitaker', role: 'member' },
  carl: { id: 5, name: 'Carl Moss', role: 'member' },
  eve: { id: 6, name: 'Eve Park', role: 'member' },
  sam: { id: 7, name: 'Sam Ortiz', role: 'guest' },
} as const satisfies Record<string, { id: number; name: string; role: MeetingRole }>;

export type Person = keyof typeof PEOPLE;

/** An action as a client sends it: the fields the server sets may be left out */
export type Sent = { type: MeetingAction['type'] } & Record<string, unknown>;

/** Thrown when the server refuses an action a test expected it to take */
export class Refused extends Error {
  constructor(
    readonly who: Person,
    readonly action: Sent,
    readonly result: ValidationResult | { valid: false; error: string; errorCode: string },
  ) {
    super(`${who} ${action.type} refused: ${result.errorCode} ${result.error}`);
  }
}

let clock = 0;

/** The server's answer to one action from one person: the new state, or why it was refused */
export function attempt(
  state: MeetingState,
  who: Person,
  action: Sent,
): { state: MeetingState; result: ValidationResult } {
  const person = PEOPLE[who];
  if (!checkPermission(person.role, action.type)) {
    return {
      state,
      result: { valid: false, error: 'Permission denied', errorCode: 'PERMISSION_DENIED' },
    };
  }
  const minute = String(clock++ % 60).padStart(2, '0');
  const sent = { timestamp: `7:${minute}:00 PM`, ...action } as unknown as MeetingAction;
  const enriched = enrichAction(
    sent,
    {
      userId: person.id,
      name: person.name,
      role: person.role,
      email: `${who}@example.com`,
      sessionId: 's',
      meetingCode: state.meetingCode,
    },
    state.members,
  );
  // The action handler marks a vote opened without a quorum
  const marked =
    enriched.type === 'OPEN_VOTING' && !attendanceSummary(state).hasQuorum
      ? ({ ...enriched, withoutQuorum: true } as MeetingAction)
      : enriched;
  const result = validateAction(state, marked);
  return { state: result.valid ? meetingReducer(state, marked) : state, result };
}

/** One action from one person, which the server must take */
export function act(state: MeetingState, who: Person, action: Sent): MeetingState {
  const { state: next, result } = attempt(state, who, action);
  if (!result.valid) throw new Refused(who, action, result);
  return next;
}

/** Why the server refuses an action, or null when it takes it */
export function refusal(state: MeetingState, who: Person, action: Sent): ValidationResult | null {
  const { result } = attempt(state, who, action);
  return result.valid ? null : result;
}

/** Everyone present on a device, the agenda loaded, quorum 3 */
export function gathered(fields: Partial<MeetingState> = {}): MeetingState {
  let state: MeetingState = {
    ...initialState,
    meetingCode: 'MAPLE1',
    title: 'Annual meeting',
    organizationId: 'org',
    quorum: 3,
  };
  for (const person of Object.values(PEOPLE)) {
    const member: Member = { ...person, present: true, presentBy: 'device' };
    state = meetingReducer(state, { type: 'ADD_MEMBER', member, timestamp: '7:00:00 PM' });
  }
  state = meetingReducer(state, {
    type: 'RELOAD_AGENDA',
    agenda: [
      { id: 101, title: 'Call to order', status: 'pending' },
      { id: 102, title: 'New business', status: 'pending' },
      { id: 103, title: 'Adjournment', status: 'pending' },
    ],
    timestamp: '7:00:00 PM',
  });
  return { ...state, ...fields };
}

/** Called to order, the agenda adopted, and New business called */
export function inSession(fields: Partial<MeetingState> = {}): MeetingState {
  let state = gathered(fields);
  state = act(state, 'dana', { type: 'START_MEETING' });
  state = act(state, 'dana', { type: 'ADOPT_AGENDA' });
  return act(state, 'dana', { type: 'CALL_AGENDA_ITEM', id: 102 });
}

/** A motion made on a phone */
export function move(
  state: MeetingState,
  who: Person,
  motionType: string,
  text: string,
  details: MotionDetails = {},
): MeetingState {
  return act(state, who, { type: 'MAKE_MOTION', motionType, text, motionId: 1, ...details });
}

/** The motion awaiting a second, seconded on a phone */
export function second(state: MeetingState, who: Person): MeetingState {
  return act(state, who, { type: 'SECOND_MOTION' });
}

/** Moved and seconded */
export function moved(
  state: MeetingState,
  who: Person,
  motionType: string,
  text: string,
  seconder: Person,
  details: MotionDetails = {},
): MeetingState {
  return second(move(state, who, motionType, text, details), seconder);
}

/** The chair opens the vote, people vote on their phones, and the chair closes it */
export function vote(
  state: MeetingState,
  votes: Partial<Record<Person, 'yea' | 'nay' | 'abstain'>>,
  open: Record<string, unknown> = {},
): MeetingState {
  let next = act(state, 'dana', { type: 'OPEN_VOTING', voteTimerEnd: null, ...open });
  for (const [who, choice] of Object.entries(votes)) {
    next = act(next, who as Person, { type: 'CAST_VOTE', vote: choice, voterId: 0 });
  }
  return act(next, 'dana', { type: 'CLOSE_VOTING' });
}

/** Everyone but the chair votes yes */
export const ALL_YES = { pat: 'yea', alice: 'yea', ben: 'yea', carl: 'yea', eve: 'yea' } as const;

/** The minutes of the meeting as the secretary's draft has them */
export function minutesOf(state: MeetingState): string {
  return formatMinutesAsMarkdown(generateMeetingMinutes(state), {
    organizationName: 'Maple Grove HOA',
    timeZone: 'America/Chicago',
    title: 'Annual meeting',
    location: 'Clubhouse',
    scheduledFor: '2026-10-20T23:00:00Z',
    calledToOrderAt: '2026-10-20T23:02:00Z',
    adjournedAt: null,
    voters: Object.values(PEOPLE)
      .filter((p) => p.role !== 'guest')
      .map((p) => ({ id: p.id, name: p.name })),
  });
}
