import type { Server } from 'socket.io';
import type { MeetingRole, MeetingState } from '@robbie-bylawyer/shared/types';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
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

/**
 * The state as a client in this role may see it. A secret ballot stays secret: while one is
 * open, the running totals, each member's choice and each proxy's choice stay on the server,
 * and only who has voted (`voters`, for the count of ballots received) and the chair's own
 * tellers' count go out; the record of a decided ballot keeps no choices. An election's running
 * count stays on the server while its ballot is open. The previous meeting's minutes are for
 * members: a guest (a display too) is told only that there are minutes to approve
 * (`previousMinutesId`), not what they say. Every state sent to a client goes through here.
 */
export function publicState(state: MeetingState, role: MeetingRole): MeetingState {
  const openBallot = ballotOpen(state);
  const ballotChoices = (state.completedMotions ?? []).some(
    (m) => m.method === 'ballot' && Object.keys(m.voterChoices).length > 0,
  );
  const openElection = !!state.currentElection?.votingInProgress;
  const hideMinutes = role === 'guest' && !!state.minutesFromPreviousMeeting;
  if (!openBallot && !ballotChoices && !openElection && !hideMinutes) return state;
  return {
    ...state,
    ...(hideMinutes && { minutesFromPreviousMeeting: '' }),
    ...(openBallot && {
      votes: NO_VOTES,
      voterChoices: {},
      proxyVotes: state.proxyVotes.map(({ memberId, castBy }) => ({ memberId, castBy })),
    }),
    ...(ballotChoices && {
      completedMotions: state.completedMotions.map((m) =>
        m.method === 'ballot' ? { ...m, voterChoices: {} } : m,
      ),
    }),
    ...(openElection && {
      currentElection: { ...state.currentElection!, ballotResults: {} },
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
    triggeredBy &&
    ballotOpen(update.state) &&
    (triggeredBy.actionType === 'CAST_VOTE' || triggeredBy.actionType === 'CAST_PROXY_VOTE');
  return {
    ...update,
    state: publicState(update.state, role),
    ...(justVoted && { triggeredBy: { actionType: triggeredBy.actionType, userId: 0 } }),
  };
}

/** The sockets in a room whose role is guest now (the server's own sockets: one process) */
function guestSockets(io: TypedServer, room: string): string[] {
  const ids = io.sockets.adapter.rooms.get(room) ?? new Set<string>();
  return [...ids].filter((id) => io.sockets.sockets.get(id)?.data.role === 'guest');
}

/**
 * Send a meeting's new state to everyone in it: while the previous minutes are before the
 * meeting, guests are sent the state without their text, by role at the time of sending
 */
export function emitState(io: TypedServer, meetingCode: string, update: StateUpdatePayload): void {
  const room = `meeting:${meetingCode}`;
  if (!update.state.minutesFromPreviousMeeting) {
    io.to(room).emit('STATE_UPDATE', publicUpdate(update, 'member'));
    return;
  }
  const guests = guestSockets(io, room);
  io.to(room).except(guests).emit('STATE_UPDATE', publicUpdate(update, 'member'));
  if (guests.length > 0) io.to(guests).emit('STATE_UPDATE', publicUpdate(update, 'guest'));
}
