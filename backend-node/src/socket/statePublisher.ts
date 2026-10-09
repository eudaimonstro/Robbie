import type { Server } from 'socket.io';
import type { MeetingRole, MeetingState } from '@robbie-bylawyer/shared/types';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  StateTailField,
  StateUnchangedField,
  StateUpdatePayload,
} from '@robbie-bylawyer/shared/types/socket';
import { NO_VOTES } from '@robbie-bylawyer/shared/utils';

type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/** Whether a secret ballot on a motion is open */
function ballotOpen(state: MeetingState): boolean {
  return state.votingOpen && state.votingMethod === 'ballot';
}

/** Who presides, and so sees the tellers' count of an open election's paper ballots */
const presides = (role: MeetingRole) => role === 'chair' || role === 'admin';

/**
 * The state as a client in this role may see it. A secret ballot stays secret: while one is
 * open, the running totals and each member's choice stay on the server, and only who has voted
 * (`voters`, for the count of ballots received) and the chair's own tellers' count go out; the
 * record of a decided ballot keeps no choices. An election's running count stays on the server
 * while its ballot is open, and the tellers' count of its paper ballots goes only to the chair
 * and admins who enter it (not to members, guests or the display, which joins as a guest) until
 * the ballot closes. The previous meeting's minutes are for members: a guest (a display too) is
 * told only that there are minutes to approve (`previousMinutesId`), not what they say. Every
 * state sent to a client goes through here.
 */
export function publicState(state: MeetingState, role: MeetingRole): MeetingState {
  const openBallot = ballotOpen(state);
  const ballotChoices = (state.completedMotions ?? []).some(
    (m) => m.method === 'ballot' && Object.keys(m.voterChoices).length > 0,
  );
  const openElection = !!state.currentElection?.votingInProgress;
  const hideMinutes = role === 'guest' && !!state.minutesFromPreviousMeeting;
  // What a declared voice vote's division would put back stays on the server
  const voiceUndo = !!state.voiceVote?.undo;
  if (!openBallot && !ballotChoices && !openElection && !hideMinutes && !voiceUndo) return state;
  return {
    ...state,
    ...(hideMinutes && { minutesFromPreviousMeeting: '' }),
    ...(voiceUndo && {
      voiceVote: { motionId: state.voiceVote!.motionId, passed: state.voiceVote!.passed },
    }),
    ...(openBallot && { votes: NO_VOTES, voterChoices: {} }),
    ...(ballotChoices && {
      completedMotions: state.completedMotions.map((m) =>
        m.method === 'ballot' ? { ...m, voterChoices: {} } : m,
      ),
    }),
    ...(openElection && {
      currentElection: {
        ...state.currentElection!,
        ballotResults: {},
        ...(!presides(role) && {
          floorBallots: {},
          floorWriteIns: {},
          floorBlank: 0,
          floorIllegal: 0,
          floorBallotCount: 0,
        }),
      },
    }),
  };
}

/**
 * A state update as a client in this role may see it: the public state, and who just voted
 * kept out
 */
export function publicUpdate(update: StateUpdatePayload, role: MeetingRole): StateUpdatePayload {
  const { triggeredBy } = update;
  const justVoted =
    triggeredBy && ballotOpen(update.state) && triggeredBy.actionType === 'CAST_VOTE';
  return {
    ...update,
    state: publicState(update.state, role),
    ...(justVoted && { triggeredBy: { actionType: triggeredBy.actionType, userId: 0 } }),
  };
}

/** The sockets in a room whose role is one of these now (the server's own sockets: one process) */
function socketsWithRole(io: TypedServer, room: string, roles: MeetingRole[]): string[] {
  const ids = io.sockets.adapter.rooms.get(room) ?? new Set<string>();
  return [...ids].filter((id) => {
    const role = io.sockets.sockets.get(id)?.data.role;
    return !!role && roles.includes(role);
  });
}

/**
 * At most one update per meeting in this window: the first change after a quiet moment goes out
 * at once, and the changes within the window after it go out together at its end, as the latest
 * state. A vote of 150 phones over three seconds is a dozen updates to each phone, not 150.
 */
export const BROADCAST_WINDOW_MS = 250;

/** What a meeting's room was last sent (the server's state, before publicState), for the next */
export interface SentUpdate {
  version: number;
  state: MeetingState;
}

interface Channel {
  /** The window after the last update; null while the meeting is quiet */
  timer: ReturnType<typeof setTimeout> | null;
  /** The latest update waiting for the window to end */
  pending: { io: TypedServer; update: StateUpdatePayload } | null;
  sent: SentUpdate | null;
  /** When the room was last sent anything */
  sentAt: number;
}

const channels = new Map<string, Channel>();
const TAIL_FIELDS: readonly StateTailField[] = ['meetingLog', 'completedMotions'];

/**
 * Where a history array's new entries start: the length of what the room has, when that is
 * still the start of the array entry for entry (the reducer keeps the entries it doesn't change,
 * so they are the same objects); 0 when anything before it changed (a record corrected, say),
 * and the whole array goes out again
 */
export function tailStart(
  previous: readonly unknown[] | undefined,
  current: readonly unknown[],
): number {
  if (!previous || previous.length === 0 || previous.length > current.length) return 0;
  for (let i = previous.length - 1; i >= 0; i--) {
    if (previous[i] !== current[i]) return 0;
  }
  return previous.length;
}

/**
 * The fields an update leaves out while they are the same object as in the room's last update:
 * they change only when someone arrives or leaves, or the agenda changes, and are most of an
 * update's size (150 members are 13 KB). The reducer never puts an old array back, so the same
 * object means the same content for every client at or after the last update.
 */
const SAME_OBJECT_FIELDS = ['members', 'agenda', 'attendedIds'] as const;

/**
 * An update as it goes to a room that was last sent `sent`: the meeting log and the record of
 * decided motions as what was added since (StateUpdatePayload.tails), and the members, the agenda,
 * the attendance and the previous minutes left out while they are unchanged. The rest of the
 * state goes in every update, so a client that applies it has the whole meeting; all of it comes
 * with the join (and REQUEST_STATE).
 */
export function slimUpdate(
  update: StateUpdatePayload,
  sent: SentUpdate | null,
): StateUpdatePayload {
  if (!sent) return update;
  const state: MeetingState = { ...update.state };
  const tails: NonNullable<StateUpdatePayload['tails']> = {};
  for (const field of TAIL_FIELDS) {
    const start = tailStart(sent.state[field], update.state[field]);
    if (start === 0) continue;
    tails[field] = start;
    if (field === 'meetingLog') state.meetingLog = update.state.meetingLog.slice(start);
    else state.completedMotions = update.state.completedMotions.slice(start);
  }
  const unchanged: StateUnchangedField[] = [];
  for (const field of SAME_OBJECT_FIELDS) {
    if (update.state[field] !== sent.state[field]) continue;
    unchanged.push(field);
    if (field === 'members') state.members = [];
    else if (field === 'agenda') state.agenda = [];
    else state.attendedIds = [];
  }
  if (
    state.minutesFromPreviousMeeting &&
    state.minutesFromPreviousMeeting === sent.state.minutesFromPreviousMeeting
  ) {
    state.minutesFromPreviousMeeting = '';
    unchanged.push('minutesFromPreviousMeeting');
  }
  const hasTails = Object.keys(tails).length > 0;
  if (!hasTails && unchanged.length === 0) return update;
  return {
    ...update,
    state,
    baseVersion: sent.version,
    ...(hasTails && { tails }),
    ...(unchanged.length > 0 && { unchanged }),
  };
}

/**
 * Send an update to everyone in the meeting, each audience's copy serialized once, by role at
 * the time of sending: while the previous minutes' text is in the update, guests are sent the
 * state without it; while an election's ballot is open, only the chair and admins are sent the
 * tellers' count of its paper ballots
 */
function deliver(io: TypedServer, meetingCode: string, update: StateUpdatePayload): void {
  const room = `meeting:${meetingCode}`;
  const hideMinutes = !!update.state.minutesFromPreviousMeeting;
  const hidePaper = !!update.state.currentElection?.votingInProgress;
  if (!hideMinutes && !hidePaper) {
    io.to(room).emit('STATE_UPDATE', publicUpdate(update, 'member'));
    return;
  }
  const guests = hideMinutes ? socketsWithRole(io, room, ['guest']) : [];
  const presiding = hidePaper ? socketsWithRole(io, room, ['chair', 'admin']) : [];
  io.to(room)
    .except([...guests, ...presiding])
    .emit('STATE_UPDATE', publicUpdate(update, 'member'));
  if (guests.length > 0) io.to(guests).emit('STATE_UPDATE', publicUpdate(update, 'guest'));
  if (presiding.length > 0) {
    io.to(presiding).emit('STATE_UPDATE', publicUpdate(update, 'chair'));
  }
}

function send(
  io: TypedServer,
  meetingCode: string,
  channel: Channel,
  update: StateUpdatePayload,
): void {
  // A lower version than the room was sent is another meeting under this code (deleted and
  // opened again) or an update overtaken by a later one: it goes out whole
  const sent = channel.sent && update.stateVersion >= channel.sent.version ? channel.sent : null;
  const slim = slimUpdate(update, sent);
  channel.sent = { version: update.stateVersion, state: update.state };
  channel.sentAt = Date.now();
  deliver(io, meetingCode, slim);
}

function openWindow(meetingCode: string, channel: Channel): void {
  const timer = setTimeout(() => {
    channel.timer = null;
    const next = channel.pending;
    channel.pending = null;
    if (!next) return;
    send(next.io, meetingCode, channel, next.update);
    openWindow(meetingCode, channel);
  }, BROADCAST_WINDOW_MS);
  timer.unref?.();
  channel.timer = timer;
}

/**
 * Send a meeting's new state to everyone in it: at once after a quiet moment, otherwise with the
 * other changes of the window (BROADCAST_WINDOW_MS), as the latest state. `immediate` (the chair's
 * actions and other decisions, which come one at a time) goes out at once, with whatever was
 * waiting, and starts a new window, so a result is never held back behind a vote's last ballots.
 * Clients ignore a state older than the one they have. Every state sent to a client goes through
 * publicState.
 */
export function emitState(
  io: TypedServer,
  meetingCode: string,
  update: StateUpdatePayload,
  options: { immediate?: boolean } = {},
): void {
  forgetIdleChannels();
  let channel = channels.get(meetingCode);
  if (!channel) {
    channel = { timer: null, pending: null, sent: null, sentAt: Date.now() };
    channels.set(meetingCode, channel);
  }
  if (channel.timer && !options.immediate) {
    if (!channel.pending || update.stateVersion >= channel.pending.update.stateVersion) {
      channel.pending = { io, update };
    }
    return;
  }
  if (channel.timer) clearTimeout(channel.timer);
  // A later state waiting goes instead (it includes this one)
  const waiting = channel.pending;
  channel.pending = null;
  const latest =
    waiting && waiting.update.stateVersion > update.stateVersion ? waiting : { io, update };
  send(latest.io, meetingCode, channel, latest.update);
  openWindow(meetingCode, channel);
}

/** A meeting's room sent nothing for this long is forgotten (its next update goes whole) */
const IDLE_CHANNEL_MS = 60 * 60 * 1000;
let lastIdleCheck = Date.now();

/** Let go of the rooms of meetings quiet for an hour, at most once every ten minutes */
function forgetIdleChannels(): void {
  const now = Date.now();
  if (now - lastIdleCheck < 10 * 60 * 1000) return;
  lastIdleCheck = now;
  for (const [code, channel] of channels) {
    if (!channel.timer && now - channel.sentAt > IDLE_CHANNEL_MS) channels.delete(code);
  }
}

/**
 * Send every waiting update now, and let each meeting go quiet (its next change goes out at
 * once): before the server closes, and in tests
 */
export function flushBroadcasts(): void {
  for (const [meetingCode, channel] of channels) {
    if (channel.timer) clearTimeout(channel.timer);
    channel.timer = null;
    const next = channel.pending;
    channel.pending = null;
    if (next) send(next.io, meetingCode, channel, next.update);
  }
}

/**
 * Forget what a meeting's room was sent (its next update goes whole) and anything waiting for
 * it: when the meeting is canceled, and in tests (every meeting, without a code)
 */
export function forgetBroadcasts(meetingCode?: string): void {
  for (const [code, channel] of channels) {
    if (meetingCode !== undefined && code !== meetingCode) continue;
    if (channel.timer) clearTimeout(channel.timer);
    channels.delete(code);
  }
}
