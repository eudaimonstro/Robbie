import type { MeetingAction } from '../../types/index.js';
import {
  applyMotionOutcome,
  processOutcomeResult,
  restoreReconsideredMotion,
} from '../../utils/motionOutcomeHelper.js';
import type { ActionHandler } from './types.js';

export const consentHandler: ActionHandler = (state, action, log) => {
  switch (action.type) {
    case 'REQUEST_UNANIMOUS_CONSENT': {
      const typedAction = action as Extract<MeetingAction, { type: 'REQUEST_UNANIMOUS_CONSENT' }>;
      return {
        ...state,
        unanimousConsentPending: true,
        meetingLog: log(typedAction.timestamp, 'Chair: "Is there any objection?"'),
      };
    }

    case 'OBJECT_TO_CONSENT': {
      const typedAction = action as Extract<MeetingAction, { type: 'OBJECT_TO_CONSENT' }>;
      return {
        ...state,
        unanimousConsentPending: false,
        meetingLog: log(
          typedAction.timestamp,
          `${typedAction.objector} objects. Motion requires a vote.`,
        ),
      };
    }

    case 'UNANIMOUS_CONSENT_PASSED': {
      const typedAction = action as Extract<MeetingAction, { type: 'UNANIMOUS_CONSENT_PASSED' }>;
      const newStack = state.motionStack.slice(0, -1);
      const outcome = applyMotionOutcome(state, typedAction.timestamp);

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

      // Handle reconsider: bring the motion back as it was
      const restored = outcome.reconsideredMotionId
        ? restoreReconsideredMotion(state, outcome.reconsideredMotionId)
        : null;
      const reconsideredLog = restored
        ? `\n[RECONSIDERED] Motion brought back for new vote: "${restored.motion.text}"`
        : '';

      const processed = processOutcomeResult(
        outcome,
        state.suspendedRules,
        workingStack,
        restored?.motion ?? null,
      );

      return {
        ...state,
        unanimousConsentPending: false,
        currentMotion: processed.finalCurrentMotion,
        motionStack: processed.finalStack,
        suspendedRules: processed.suspendedRules,
        tabledMotions: outcome.tabledMotions,
        agendaAdopted: outcome.agendaAdopted,
        agendaObjection: outcome.agendaObjection,
        agenda: outcome.agenda,
        completedMotions: restored?.completedMotions ?? state.completedMotions,
        debatePositions: {},
        // Debate on the decided question is over; none of it carries to the next one
        speakerQueue: [],
        recognizedSpeaker: null,
        speakerTimerEnd: null,
        lastSpeakerStance: null,
        dividedQuestionParts,
        meetingLog: log(
          typedAction.timestamp,
          `Motion CARRIED by unanimous consent.${processed.suspensionLog}${processed.restoredLog}${processed.objectionLog}${reconsideredLog}${divideLog}`,
        ),
      };
    }

    default:
      // This handler only receives its specific actions from the main reducer
      return state;
  }
};
