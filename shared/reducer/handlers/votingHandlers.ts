import type { CompletedMotion, MeetingAction, MeetingState, Votes } from '../../types/index.js';
import {
  LOG_QUORUM_WARNING,
  logDivisionCalled,
  logRollCallVote,
  logVoiceVoteDeclared,
} from '../../constants/logMessages.js';
import {
  NO_VOTES,
  addVotes,
  calculateVoteResult,
  motionThreshold,
} from '../../utils/voteCalculator.js';
import { smallBoard } from '../../utils/attendance.js';
import { decide } from './decisions.js';
import { decisionContext, quorumNow } from './records.js';
import type { ActionHandler } from './types.js';

const floorCounted = (votes: Votes) => votes.yea + votes.nay + votes.abstain > 0;

/**
 * What a declared voice vote's result changed, as it stood before: put back if a member calls
 * for a division. Absent fields are kept as null, so the snapshot survives being stored as JSON.
 */
function snapshot(state: MeetingState, keys: Iterable<string>): Partial<MeetingState> {
  const fields: Record<string, unknown> = {};
  for (const key of keys) fields[key] = state[key as keyof MeetingState] ?? null;
  return fields as Partial<MeetingState>;
}

export const votingHandler: ActionHandler = (state, action, log) => {
  switch (action.type) {
    case 'OPEN_VOTING': {
      const typedAction = action as Extract<MeetingAction, { type: 'OPEN_VOTING' }>;
      let logEntries = log(
        typedAction.timestamp,
        `Chair puts the question: "${state.currentMotion?.text}"`,
      );
      if (typedAction.withoutQuorum) {
        logEntries = [...logEntries, { time: typedAction.timestamp, message: LOG_QUORUM_WARNING }];
      }
      return {
        ...state,
        votingOpen: true,
        voteTimerEnd: typedAction.voteTimerEnd,
        votes: { yea: 0, nay: 0, abstain: 0 },
        voters: [],
        voterChoices: {},
        floorVotes: { yea: 0, nay: 0, abstain: 0 },
        divisionCalled: false,
        // An appeal from a ruling comes before anything else happens
        lastChairRuling: null,
        meetingLog: logEntries,
      };
    }

    case 'CAST_VOTE': {
      const typedAction = action as Extract<MeetingAction, { type: 'CAST_VOTE' }>;
      // A voice vote is counted in the room, not on devices
      if (state.votingMethod === 'voice' && !state.divisionCalled) return state;

      // Check if voter is chair
      const voter = state.members.find((m) => m.id === typedAction.voterId);
      const isChair = voter?.role === 'chair';

      // Chair can only vote on ballot votes or when it affects outcome; the chair of a small
      // board votes like any director (RONR 49:21)
      if (
        isChair &&
        !smallBoard(state) &&
        state.votingMethod !== 'ballot' &&
        !typedAction.isChairDecidingVote
      ) {
        return state;
      }

      // Allow vote changing per Robert's Rules (before vote is announced)
      const previousVote = state.voterChoices[typedAction.voterId];
      const newVotes = { ...state.votes };

      // If changing vote, decrement previous choice
      if (previousVote) {
        newVotes[previousVote]--;
      }

      // Add new vote
      newVotes[typedAction.vote]++;

      // Update voter choices
      const newVoterChoices = { ...state.voterChoices, [typedAction.voterId]: typedAction.vote };

      // Add to voters list if first time voting
      const newVoters = previousVote ? state.voters : [...state.voters, typedAction.voterId];

      // Log roll call votes individually
      const rollCallLog =
        state.votingMethod === 'rollcall' && typedAction.timestamp && voter && !previousVote
          ? log(typedAction.timestamp, logRollCallVote(voter.name, typedAction.vote))
          : state.meetingLog;

      return {
        ...state,
        votes: newVotes,
        voters: newVoters,
        voterChoices: newVoterChoices,
        meetingLog: rollCallLog,
      };
    }

    case 'REQUEST_DIVISION': {
      const typedAction = action as Extract<MeetingAction, { type: 'REQUEST_DIVISION' }>;
      // A member doubts the voice vote: it is retaken as a counted vote, on devices and by the
      // chair's count of the room
      const caller = typedAction.fromFloor
        ? null
        : state.members.find((m) => m.id === typedAction.requesterId)?.name;
      // Right after the chair declared its result (RONR 29:7): the decision is undone and the
      // vote opened again, to be counted
      const declared = !state.votingOpen ? state.voiceVote : null;
      if (declared?.undo) {
        // Hands raised since the declaration stay up, after the ones it took down
        const queue = declared.undo.speakerQueue ?? [];
        const raisedSince = state.speakerQueue.filter(
          (entry) => !queue.some((e) => e.member.id === entry.member.id),
        );
        return {
          ...state,
          ...declared.undo,
          speakerQueue: [...queue, ...raisedSince],
          voiceVote: null,
          voteTimerEnd: null,
          votes: NO_VOTES,
          voters: [],
          voterChoices: {},
          floorVotes: NO_VOTES,
          divisionCalled: true,
          meetingLog: log(typedAction.timestamp, logDivisionCalled(caller ?? null)),
        };
      }
      return {
        ...state,
        // For this vote only: the meeting's way of voting is unchanged
        floorVotes: NO_VOTES,
        divisionCalled: true,
        meetingLog: log(typedAction.timestamp, logDivisionCalled(caller ?? null)),
      };
    }

    case 'SET_FLOOR_TALLY': {
      const typedAction = action as Extract<MeetingAction, { type: 'SET_FLOOR_TALLY' }>;
      return {
        ...state,
        floorVotes: { yea: typedAction.yea, nay: typedAction.nay, abstain: typedAction.abstain },
      };
    }

    case 'CLOSE_VOTING': {
      const typedAction = action as Extract<MeetingAction, { type: 'CLOSE_VOTING' }>;
      // The chair declares a voice vote's result without a count ("The ayes have it"): no votes
      // are recorded, and a member may still call for a division
      const declared = typedAction.declared;
      // The result counts the device votes and the chair's floor tally together
      const floorVotes = declared ? NO_VOTES : (state.floorVotes ?? NO_VOTES);
      const deviceVotes = declared ? NO_VOTES : state.votes;
      const voteCalc = calculateVoteResult(
        addVotes(deviceVotes, floorVotes),
        state.currentMotion ? motionThreshold(state.currentMotion) : 'majority',
      );
      const { yea, nay } = voteCalc;
      const isBallot = state.votingMethod === 'ballot';

      // Special handling for Appeal. The question is "Shall the decision of the chair be
      // sustained?" (YEA = sustain). RONR: a majority or a tie sustains the chair, so the
      // chair is overturned only by a majority against.
      const isAppeal = state.currentMotion?.type === 'appeal';
      const passed = declared ? declared === 'ayes' : isAppeal ? nay <= yea : voteCalc.passed;

      const voteResultText = isAppeal
        ? passed
          ? "Chair's decision SUSTAINED"
          : "Chair's decision OVERTURNED"
        : passed
          ? 'CARRIED'
          : 'FAILED';

      // Track defeated motions for renewal rule enforcement
      const defeatedMotions =
        !passed && state.currentMotion && !isAppeal
          ? [
              ...state.defeatedMotions,
              {
                type: state.currentMotion.type,
                text: state.currentMotion.text,
                timestamp: typedAction.timestamp,
                ...(state.currentMotion.bylawAmendment && {
                  bylawAmendment: state.currentMotion.bylawAmendment,
                }),
              },
            ]
          : state.defeatedMotions;

      // Record every decided motion, with both parts of its vote, who moved and seconded it,
      // and where and when it was decided. A secret ballot keeps no record of who voted which
      // way.
      const decided = state.currentMotion;
      if (!decided) return { ...state, votingOpen: false, voteTimerEnd: null };
      const record: CompletedMotion = {
        id: decided.id,
        type: decided.type,
        name: decided.name,
        text: decided.text,
        mover: decided.mover,
        moverId: decided.moverId,
        passed,
        voterChoices: isBallot || declared ? {} : state.voterChoices,
        timestamp: typedAction.timestamp,
        deviceVotes,
        floorVotes,
        method: state.divisionCalled ? 'standard' : state.votingMethod,
        ...(declared ? { declared } : {}),
        ...(decided.secondedBy ? { seconder: decided.secondedBy } : {}),
        // The change a bylaw amendment proposed: the text adopted (or not), for the sync and
        // the minutes
        ...(decided.bylawAmendment ? { bylawAmendment: decided.bylawAmendment } : {}),
        // The words it was moved with, when amendments changed them: text is what was decided
        ...(decided.originalText ? { originalText: decided.originalText } : {}),
        ...(state.divisionCalled ? { division: true as const } : {}),
        disposition: passed ? 'carried' : 'failed',
        quorumPresent: quorumNow(state),
        ...decisionContext(state, typedAction.at),
      };
      const outcome = decide(state, passed, record, typedAction.timestamp, typedAction.at);

      // Both parts, so the room can check the chair's count
      const partsLog =
        floorCounted(floorVotes) && (state.votingMethod !== 'voice' || state.divisionCalled)
          ? ` On devices ${state.votes.yea} to ${state.votes.nay}, in the room ${floorVotes.yea} to ${floorVotes.nay}.`
          : '';
      const resultLog = declared
        ? logVoiceVoteDeclared(declared, voteResultText)
        : `Vote: Yea ${yea}, Nay ${nay}. ${voteResultText}.${partsLog}`;

      const closed: Partial<MeetingState> = {
        votingOpen: false,
        voteTimerEnd: null,
        divisionCalled: false,
        ...(isBallot && { voterChoices: {} }),
        defeatedMotions,
        ...outcome.state,
      };
      return {
        ...state,
        ...closed,
        // A division may still be called on a declared result: what deciding it changed is kept,
        // to be put back
        voiceVote: declared
          ? {
              motionId: decided.id,
              passed,
              undo: snapshot(state, [
                ...Object.keys(closed),
                'votes',
                'voters',
                'voterChoices',
                'floorVotes',
              ]),
            }
          : null,
        meetingLog: log(typedAction.timestamp, `${resultLog}${outcome.log}`),
      };
    }

    default:
      // This handler only receives its specific actions from the main reducer
      return state;
  }
};
