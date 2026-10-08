import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initialState, meetingReducer } from '@robbie-bylawyer/shared/reducer';
import type { MeetingAction, MeetingState } from '@robbie-bylawyer/shared/types';
import type { StateUpdatePayload } from '@robbie-bylawyer/shared/types/socket';
import {
  BROADCAST_WINDOW_MS,
  emitState,
  flushBroadcasts,
  forgetBroadcasts,
  publicState,
  slimUpdate,
  tailStart,
} from '../socket/statePublisher.js';

/** An io recording each update sent to the meeting's room */
function recorder() {
  const sent: StateUpdatePayload[] = [];
  const io = {
    sockets: { adapter: { rooms: new Map() }, sockets: new Map() },
    to: () => ({
      emit: (_event: string, payload: StateUpdatePayload) => sent.push(payload),
      except: () => ({ emit: (_event: string, payload: StateUpdatePayload) => sent.push(payload) }),
    }),
  };
  return { io: io as never, sent };
}

/**
 * What a client does with an update (useSocketConnection's mergeStateUpdate, restated): the
 * tails after its own entries, its own text for what didn't change; null when it can't
 */
function merge(mine: MeetingState, myVersion: number, update: StateUpdatePayload) {
  if (!update.tails && !update.unchanged) return update.state;
  if ((update.baseVersion ?? 0) > myVersion) return null;
  const next = { ...update.state };
  for (const [field, start] of Object.entries(update.tails ?? {})) {
    const key = field as 'meetingLog' | 'completedMotions';
    if (start > mine[key].length) return null;
    (next as Record<string, unknown>)[key] = [...mine[key].slice(0, start), ...update.state[key]];
  }
  for (const field of update.unchanged ?? []) {
    (next as unknown as Record<string, unknown>)[field] = mine[field];
  }
  return next;
}

const member = (id: number) => ({
  id,
  name: `Member ${id}`,
  role: 'member' as const,
  present: true,
  presentBy: 'device' as const,
});

/** A meeting in session with a motion before it and a vote open */
function voting(): MeetingState {
  let state: MeetingState = {
    ...initialState,
    meetingCode: 'TEST01',
    minutesFromPreviousMeeting: '# Minutes of the September meeting',
    previousMinutesId: 'minutes-1',
  };
  const actions: MeetingAction[] = [
    ...[1, 2, 3, 4].map((id) => ({
      type: 'ADD_MEMBER' as const,
      member: member(id),
      timestamp: '',
    })),
    { type: 'START_MEETING', timestamp: '7:00 PM' },
    {
      type: 'MAKE_MOTION',
      motionType: 'mainMotion',
      text: 'Resurface the pool',
      mover: 'Member 2',
      moverId: 2,
      motionId: 10,
      timestamp: '7:01 PM',
    },
    { type: 'SECOND_MOTION', seconder: 'Member 3', seconderId: 3, timestamp: '7:01 PM' },
    { type: 'OPEN_VOTING', voteTimerEnd: null, timestamp: '7:02 PM' },
  ];
  for (const action of actions) state = meetingReducer(state, action);
  return state;
}

describe('tailStart', () => {
  it('is where the new entries start when the old ones are unchanged', () => {
    const a = { n: 1 };
    const b = { n: 2 };
    expect(tailStart([a], [a, b])).toBe(1);
    expect(tailStart([a, b], [a, b])).toBe(2);
  });

  it('is 0 (send it whole) when an earlier entry changed, the array shrank, or nothing was sent', () => {
    const a = { n: 1 };
    expect(tailStart([a], [{ ...a }, { n: 2 }])).toBe(0);
    expect(tailStart([a, { n: 2 }], [a])).toBe(0);
    expect(tailStart(undefined, [a])).toBe(0);
    expect(tailStart([], [a])).toBe(0);
  });
});

describe('slimUpdate', () => {
  it('sends the log as the lines added since the last update, and the same minutes not at all', () => {
    const before = voting();
    const after = meetingReducer(before, { type: 'CAST_VOTE', vote: 'yea', voterId: 2 });
    const closed = meetingReducer(after, { type: 'CLOSE_VOTING', timestamp: '7:05 PM' });
    const sent = { version: 7, state: before };

    const slim = slimUpdate({ state: closed, stateVersion: 9 }, sent);

    expect(slim.baseVersion).toBe(7);
    expect(slim.tails).toEqual({ meetingLog: before.meetingLog.length });
    expect(slim.state.meetingLog).toEqual(closed.meetingLog.slice(before.meetingLog.length));
    // Nothing was decided before: the record goes whole (one motion)
    expect(slim.state.completedMotions).toEqual(closed.completedMotions);
    // The members, the agenda and the attendance are as they were: left out, as the minutes are
    expect(slim.unchanged).toEqual([
      'members',
      'agenda',
      'attendedIds',
      'minutesFromPreviousMeeting',
    ]);
    expect(slim.state.members).toEqual([]);
    expect(slim.state.minutesFromPreviousMeeting).toBe('');
    // Everything else is as it is
    expect(slim.state.votes).toEqual(closed.votes);
  });

  it('sends a history whole when an entry before its tail changed', () => {
    const state = voting();
    const record = { ...state.completedMotions[0], id: 1 } as MeetingState['completedMotions'][0];
    const decided = { ...state, completedMotions: [record] };
    const reconsidered = { ...decided, completedMotions: [{ ...record, reconsidered: true }] };
    const sent = { version: 3, state: decided };

    const slim = slimUpdate({ state: reconsidered, stateVersion: 4 }, sent);

    expect(slim.tails?.completedMotions).toBeUndefined();
    expect(slim.state.completedMotions).toEqual(reconsidered.completedMotions);
  });
});

describe('emitState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    forgetBroadcasts();
  });
  afterEach(() => {
    forgetBroadcasts();
    vi.useRealTimers();
  });

  it('sends the first change after a quiet moment at once, whole', () => {
    const { io, sent } = recorder();
    const state = voting();
    emitState(io, 'TEST01', { state, stateVersion: 8 });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual({ state: publicState(state, 'member'), stateVersion: 8 });
  });

  it('sends the changes within the window together, as the latest state, at its end', () => {
    const { io, sent } = recorder();
    let state = voting();
    let version = 8;
    emitState(io, 'TEST01', { state, stateVersion: version });

    // 40 votes over the next 200 ms
    for (let id = 1; id <= 40; id++) {
      vi.advanceTimersByTime(5);
      state = meetingReducer(state, { type: 'CAST_VOTE', vote: 'yea', voterId: (id % 4) + 1 });
      emitState(io, 'TEST01', { state, stateVersion: ++version });
    }
    expect(sent).toHaveLength(1);

    vi.advanceTimersByTime(BROADCAST_WINDOW_MS);
    expect(sent).toHaveLength(2);
    expect(sent[1].stateVersion).toBe(version);

    // Quiet again after a window with nothing new: the next change goes out at once
    vi.advanceTimersByTime(BROADCAST_WINDOW_MS);
    state = meetingReducer(state, { type: 'CLOSE_VOTING', timestamp: '7:05 PM' });
    emitState(io, 'TEST01', { state, stateVersion: ++version });
    expect(sent).toHaveLength(3);
    expect(sent[2].stateVersion).toBe(version);
  });

  it('sends a decision at once, with no wait behind the votes before it', () => {
    const { io, sent } = recorder();
    let state = voting();
    emitState(io, 'TEST01', { state, stateVersion: 8 });
    state = meetingReducer(state, { type: 'CAST_VOTE', vote: 'yea', voterId: 2 });
    emitState(io, 'TEST01', { state, stateVersion: 9 });
    expect(sent).toHaveLength(1);

    state = meetingReducer(state, { type: 'CLOSE_VOTING', timestamp: '7:05 PM' });
    emitState(io, 'TEST01', { state, stateVersion: 10 }, { immediate: true });
    expect(sent.map((u) => u.stateVersion)).toEqual([8, 10]);

    // The vote waiting went with it: nothing more at the end of the window
    vi.advanceTimersByTime(BROADCAST_WINDOW_MS);
    expect(sent).toHaveLength(2);
  });

  it('keeps the latest state when an older one arrives late in the window', () => {
    const { io, sent } = recorder();
    const state = voting();
    emitState(io, 'TEST01', { state, stateVersion: 8 });
    emitState(io, 'TEST01', { state, stateVersion: 10 });
    emitState(io, 'TEST01', { state, stateVersion: 9 });
    vi.advanceTimersByTime(BROADCAST_WINDOW_MS);
    expect(sent.map((u) => u.stateVersion)).toEqual([8, 10]);
  });

  it("rebuilds the public state on a client from the room's updates", () => {
    const { io, sent } = recorder();
    let state = voting();
    let version = 8;
    // The client joined with the whole state
    let mine = publicState(state, 'member');
    let myVersion = version;
    emitState(io, 'TEST01', { state, stateVersion: version });

    const actions: MeetingAction[] = [
      { type: 'CAST_VOTE', vote: 'yea', voterId: 2 },
      { type: 'CAST_VOTE', vote: 'nay', voterId: 3 },
      { type: 'CLOSE_VOTING', timestamp: '7:05 PM' },
      {
        type: 'MAKE_MOTION',
        motionType: 'mainMotion',
        text: 'Repaint the clubhouse',
        mover: 'Member 4',
        moverId: 4,
        motionId: 11,
        timestamp: '7:06 PM',
      },
      { type: 'DECLINE_SECOND', timestamp: '7:07 PM' },
      { type: 'ADD_MEMBER', member: member(5), timestamp: '7:07 PM' },
      { type: 'SET_MEMBER_PRESENCE', memberId: 3, present: false, timestamp: '7:07 PM' },
      { type: 'START_MEETING', timestamp: '7:08 PM' },
    ];
    for (const action of actions) {
      state = meetingReducer(state, action);
      emitState(io, 'TEST01', { state, stateVersion: ++version });
      vi.advanceTimersByTime(BROADCAST_WINDOW_MS / 2);
    }
    flushBroadcasts();

    for (const update of sent.slice(1)) {
      const merged = merge(mine, myVersion, update);
      expect(merged).not.toBeNull();
      mine = merged!;
      myVersion = update.stateVersion;
    }
    expect(myVersion).toBe(version);
    expect(mine).toEqual(publicState(state, 'member'));
    // The later updates carried only what was added
    expect(sent.slice(1).every((u) => u.tails?.meetingLog !== undefined)).toBe(true);
  });

  it('sends a whole state for a meeting opened again under the same code', () => {
    const { io, sent } = recorder();
    const state = voting();
    emitState(io, 'TEST01', { state, stateVersion: 40 });
    vi.advanceTimersByTime(BROADCAST_WINDOW_MS * 2);
    const reopened = { ...initialState, meetingCode: 'TEST01' };
    emitState(io, 'TEST01', { state: reopened, stateVersion: 1 });
    expect(sent[1]).toEqual({ state: reopened, stateVersion: 1 });
  });
});
