import type { MeetingAction } from '../../types/index.js';
import { MOTIONS } from '../../constants/motions.js';
import { LOG_QUORUM_WARNING, logRollCallVote } from '../../constants/logMessages.js';
import { applyMotionOutcome, processOutcomeResult } from '../../utils/motionOutcomeHelper.js';
import { calculateVoteResult } from '../../utils/voteCalculator.js';
import { generateId } from '../../utils/idGenerators.js';
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
      const { passed, yea, nay } = voteCalc;
      const newStack = state.motionStack.slice(0, -1);

      // Special handling for Appeal
      const isAppeal = state.currentMotion?.type === 'appeal';

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

      // Handle reconsider - reconstruct motion from completed motions
      let reconsideredMotion: (typeof state.tabledMotions)[0] | null = null;
      let updatedCompletedMotions = state.completedMotions;
      if (outcome.reconsideredMotionId) {
        const completedMotion = state.completedMotions.find(
          (cm) => cm.id === outcome.reconsideredMotionId,
        );
        if (completedMotion) {
          reconsideredMotion = {
            id: generateId(),
            type: completedMotion.type,
            name: completedMotion.name,
            text: completedMotion.text,
            mover: state.currentMotion?.mover || 'Unknown',
            moverId: state.currentMotion?.moverId || 0,
            secondedBy: null,
            status: 'active' as const,
            precedence: MOTIONS[completedMotion.type]?.precedence || 1,
            category: MOTIONS[completedMotion.type]?.category || 'main',
            interrupt: MOTIONS[completedMotion.type]?.interrupt || false,
            needsSecond: MOTIONS[completedMotion.type]?.needsSecond || true,
            debatable: MOTIONS[completedMotion.type]?.debatable || true,
            amendable: MOTIONS[completedMotion.type]?.amendable || true,
            reconsidered: MOTIONS[completedMotion.type]?.reconsidered || false,
            vote: MOTIONS[completedMotion.type]?.vote || 'majority',
            phrase: MOTIONS[completedMotion.type]?.phrase || '',
            help: MOTIONS[completedMotion.type]?.help || '',
            whenToUse: MOTIONS[completedMotion.type]?.whenToUse || '',
            moverHasSpoken: false,
          };
          updatedCompletedMotions = state.completedMotions.map((cm) =>
            cm.id === outcome.reconsideredMotionId ? { ...cm, reconsidered: true } : cm,
          );
        }
      }

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
