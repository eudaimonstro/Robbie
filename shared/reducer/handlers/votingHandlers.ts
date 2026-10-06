import type { MeetingAction } from '../../types/index.js';
import { LOG_QUORUM_WARNING, logRollCallVote } from '../../constants/logMessages.js';
import {
  applyMotionOutcome,
  processOutcomeResult,
  restoreReconsideredMotion,
} from '../../utils/motionOutcomeHelper.js';
import { calculateVoteResult } from '../../utils/voteCalculator.js';
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
        proxyVotes: [], // Reset proxy votes for new vote
        meetingLog: logEntries,
      };
    }

    case 'CAST_VOTE': {
      const typedAction = action as Extract<MeetingAction, { type: 'CAST_VOTE' }>;
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

    case 'CLOSE_VOTING': {
      const typedAction = action as Extract<MeetingAction, { type: 'CLOSE_VOTING' }>;
      const voteCalc = calculateVoteResult(state.votes, state.currentMotion?.vote || 'majority');
      const { yea, nay } = voteCalc;
      const newStack = state.motionStack.slice(0, -1);

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

      // Apply motion outcome if passed (Appeals don't have outcomes to apply)
      const outcome =
        passed && !isAppeal
          ? applyMotionOutcome(state, typedAction.timestamp)
          : {
              tabledMotions: state.tabledMotions,
              agendaAdopted: state.agendaAdopted,
              agendaObjection: state.agendaObjection,
              agenda: state.agenda,
              newSuspension: null,
              restoredMotion: null,
              objectionKilledMotion: null,
              reconsideredMotionId: null,
              dividedParts: null,
              dividedMainMotion: null,
            };

      // Handle reconsider: bring the motion back as it was
      const restored = outcome.reconsideredMotionId
        ? restoreReconsideredMotion(state, outcome.reconsideredMotionId)
        : null;
      const reconsideredMotion = restored?.motion ?? null;
      const updatedCompletedMotions = restored?.completedMotions ?? state.completedMotions;

      const reconsideredLog = reconsideredMotion
        ? `\n[RECONSIDERED] Motion brought back for new vote: "${reconsideredMotion.text}"`
        : '';

      // Handle divide the question
      let dividedQuestionParts = state.dividedQuestionParts;
      let divideLog = '';
      let workingStack = newStack;
      if (outcome.dividedParts && outcome.dividedMainMotion) {
        workingStack = workingStack.filter((m) => m.id !== outcome.dividedMainMotion!.id);

        const firstPart = outcome.dividedParts[0];
        const firstPartMotion = {
          ...outcome.dividedMainMotion,
          id: firstPart.id,
          text: firstPart.text,
          status: 'active' as const,
          moverHasSpoken: false,
        };
        workingStack = [...workingStack, firstPartMotion];
        dividedQuestionParts = outcome.dividedParts.slice(1);

        divideLog = `\n[DIVIDED] Original motion split into ${outcome.dividedParts.length} parts. Now considering: "${firstPart.text}"`;
      }

      const processed = processOutcomeResult(
        outcome,
        state.suspendedRules,
        workingStack,
        reconsideredMotion,
      );

      // Save completed motion for potential reconsideration
      const completedMotions =
        state.currentMotion && state.currentMotion.reconsidered
          ? [
              ...updatedCompletedMotions,
              {
                id: state.currentMotion.id,
                type: state.currentMotion.type,
                name: state.currentMotion.name,
                text: state.currentMotion.text,
                mover: state.currentMotion.mover,
                moverId: state.currentMotion.moverId,
                passed,
                voterChoices: state.voterChoices,
                timestamp: typedAction.timestamp,
                reconsidered: false,
              },
            ]
          : updatedCompletedMotions;

      return {
        ...state,
        votingOpen: false,
        voteTimerEnd: null,
        currentMotion: processed.finalCurrentMotion,
        motionStack: processed.finalStack,
        defeatedMotions,
        completedMotions,
        suspendedRules: processed.suspendedRules,
        tabledMotions: outcome.tabledMotions,
        agendaAdopted: outcome.agendaAdopted,
        agendaObjection: outcome.agendaObjection,
        agenda: outcome.agenda,
        lastChairRuling: isAppeal ? null : state.lastChairRuling,
        debatePositions: {},
        // Debate on the decided question is over; none of it carries to the next one
        speakerQueue: [],
        recognizedSpeaker: null,
        speakerTimerEnd: null,
        lastSpeakerStance: null,
        dividedQuestionParts,
        meetingLog: log(
          typedAction.timestamp,
          `Vote: Yea ${yea}, Nay ${nay}. ${voteResultText}.${processed.suspensionLog}${processed.restoredLog}${processed.objectionLog}${reconsideredLog}${divideLog}`,
        ),
      };
    }

    default:
      // This handler only receives its specific actions from the main reducer
      return state;
  }
};
