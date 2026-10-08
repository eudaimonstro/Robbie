import type { CompletedMotion, MeetingAction, Votes } from '../../types/index.js';
import {
  LOG_QUORUM_WARNING,
  logDivisionCalled,
  logRollCallVote,
} from '../../constants/logMessages.js';
import { NO_VOTES, addVotes, calculateVoteResult } from '../../utils/voteCalculator.js';
import { decide } from './decisions.js';
import { decisionContext, quorumNow } from './records.js';

const floorCounted = (votes: Votes) => votes.yea + votes.nay + votes.abstain > 0;
import type { ActionHandler } from './types.js';

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
        proxyVotes: [], // Reset proxy votes for new vote
        divisionCalled: false,
        meetingLog: logEntries,
      };
    }

    case 'CAST_VOTE': {
      const typedAction = action as Extract<MeetingAction, { type: 'CAST_VOTE' }>;
      // A voice vote is counted in the room, not on devices
      if (state.votingMethod === 'voice') return state;

      // Check if voter is chair
      const voter = state.members.find((m) => m.id === typedAction.voterId);
      const isChair = voter?.role === 'chair';

      // Chair can only vote on ballot votes or when it affects outcome
      if (isChair && state.votingMethod !== 'ballot' && !typedAction.isChairDecidingVote) {
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
      return {
        ...state,
        votingMethod: 'standard',
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
      // The result counts the device votes and the chair's floor tally together
      const floorVotes = state.floorVotes ?? NO_VOTES;
      const voteCalc = calculateVoteResult(
        addVotes(state.votes, floorVotes),
        state.currentMotion?.vote || 'majority',
      );
      const { yea, nay } = voteCalc;
      const isBallot = state.votingMethod === 'ballot';

      // Special handling for Appeal. The question is "Shall the decision of the chair be
      // sustained?" (YEA = sustain). RONR: a majority or a tie sustains the chair, so the
      // chair is overturned only by a majority against.
      const isAppeal = state.currentMotion?.type === 'appeal';
      const passed = isAppeal ? nay <= yea : voteCalc.passed;

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
      // way, in person or by proxy.
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
        voterChoices: isBallot ? {} : state.voterChoices,
        timestamp: typedAction.timestamp,
        reconsidered: false,
        reconsiderable: decided.reconsidered,
        deviceVotes: state.votes,
        floorVotes,
        method: state.votingMethod,
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
        floorCounted(floorVotes) && state.votingMethod !== 'voice'
          ? ` On devices ${state.votes.yea} to ${state.votes.nay}, in the room ${floorVotes.yea} to ${floorVotes.nay}.`
          : '';

      return {
        ...state,
        votingOpen: false,
        voteTimerEnd: null,
        divisionCalled: false,
        ...(isBallot && { voterChoices: {}, proxyVotes: [] }),
        defeatedMotions,
        ...outcome.state,
        meetingLog: log(
          typedAction.timestamp,
          `Vote: Yea ${yea}, Nay ${nay}. ${voteResultText}.${partsLog}${outcome.log}`,
        ),
      };
    }

    default:
      // This handler only receives its specific actions from the main reducer
      return state;
  }
};
