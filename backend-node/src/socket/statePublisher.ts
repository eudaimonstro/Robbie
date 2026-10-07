import type { Server } from 'socket.io';
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  StateUpdatePayload,
} from '@robbie-bylawyer/shared/types/socket';

type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/**
 * The state as clients may see it: who voted which way stays on the server for a secret
 * ballot, while it is open and in the record of each one decided. Every state sent to a
 * client goes through here.
 */
export function publicState(state: MeetingState): MeetingState {
  const openBallot = state.votingOpen && state.votingMethod === 'ballot';
  const ballotChoices = (state.completedMotions ?? []).some(
    (m) => m.method === 'ballot' && Object.keys(m.voterChoices).length > 0,
  );
  if (!openBallot && !ballotChoices) return state;
  return {
    ...state,
    voterChoices: openBallot ? {} : state.voterChoices,
    completedMotions: ballotChoices
      ? state.completedMotions.map((m) => (m.method === 'ballot' ? { ...m, voterChoices: {} } : m))
      : state.completedMotions,
  };
}

/** Send a meeting's new state to everyone in it */
export function emitState(io: TypedServer, meetingCode: string, update: StateUpdatePayload): void {
  io.to(`meeting:${meetingCode}`).emit('STATE_UPDATE', {
    ...update,
    state: publicState(update.state),
  });
}
