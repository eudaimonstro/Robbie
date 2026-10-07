import type { Server } from 'socket.io';
import type { MeetingState } from '@robbie-bylawyer/shared/types';
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
 * The state as clients may see it. A secret ballot stays secret: while one is open, the
 * running totals, each member's choice and each proxy's choice stay on the server, and only
 * who has voted (`voters`, for the count of ballots received) and the chair's own tellers'
 * count go out; the record of a decided ballot keeps no choices. An election's running count
 * stays on the server while its ballot is open. Every state sent to a client goes through here.
 */
export function publicState(state: MeetingState): MeetingState {
  const openBallot = ballotOpen(state);
  const ballotChoices = (state.completedMotions ?? []).some(
    (m) => m.method === 'ballot' && Object.keys(m.voterChoices).length > 0,
  );
  const openElection = !!state.currentElection?.votingInProgress;
  if (!openBallot && !ballotChoices && !openElection) return state;
  return {
    ...state,
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

/** A state update as clients may see it: the public state, and who just voted kept out */
export function publicUpdate(update: StateUpdatePayload): StateUpdatePayload {
  const { triggeredBy } = update;
  const justVoted =
    triggeredBy &&
    ballotOpen(update.state) &&
    (triggeredBy.actionType === 'CAST_VOTE' || triggeredBy.actionType === 'CAST_PROXY_VOTE');
  return {
    ...update,
    state: publicState(update.state),
    ...(justVoted && { triggeredBy: { actionType: triggeredBy.actionType, userId: 0 } }),
  };
}

/** Send a meeting's new state to everyone in it */
export function emitState(io: TypedServer, meetingCode: string, update: StateUpdatePayload): void {
  io.to(`meeting:${meetingCode}`).emit('STATE_UPDATE', publicUpdate(update));
}
