import type { MeetingAction } from '../../types/index.js';
import { logChairRuled } from '../../constants/logMessages.js';
import type { ActionHandler } from './types.js';

export const ruleSuspensionHandler: ActionHandler = (state, action, log) => {
  switch (action.type) {
    case 'SUSPEND_RULE_APPROVED': {
      const typedAction = action as Extract<MeetingAction, { type: 'SUSPEND_RULE_APPROVED' }>;
      return {
        ...state,
        suspendedRules: [...state.suspendedRules, typedAction.suspension],
        meetingLog: log(
          typedAction.timestamp,
          `[RULE SUSPENDED] ${typedAction.suspension.rule}: ${typedAction.suspension.purpose}`,
        ),
      };
    }

    case 'RESTORE_RULE': {
      const typedAction = action as Extract<MeetingAction, { type: 'RESTORE_RULE' }>;
      const suspension = state.suspendedRules.find((s) => s.id === typedAction.suspensionId);
      const updatedRules = state.suspendedRules.filter((s) => s.id !== typedAction.suspensionId);

      return {
        ...state,
        suspendedRules: updatedRules,
        meetingLog: suspension
          ? log(
              typedAction.timestamp,
              `[RULE RESTORED] ${suspension.rule} restored to normal enforcement`,
            )
          : state.meetingLog,
      };
    }

    case 'CHAIR_RULING': {
      const typedAction = action as Extract<MeetingAction, { type: 'CHAIR_RULING' }>;
      // Handle chair's ruling on motions that don't require a vote
      if (!state.currentMotion) return state;

      const motionText = state.currentMotion.text;
      const rulingText =
        typedAction.ruling === 'sustain'
          ? `The point is well taken.`
          : typedAction.ruling === 'overrule'
            ? `The point is not well taken.`
            : typedAction.ruling === 'allow'
              ? `The request is granted.`
              : `The request is denied.`;

      const logMessage = logChairRuled(rulingText, typedAction.explanation, motionText);

      // Store this ruling so it can be appealed
      const lastChairRuling = {
        ruling: rulingText,
        motionText,
        timestamp: typedAction.timestamp,
      };

      // The ruling disposes of the point; the motion it interrupted is pending again
      const motionStack = state.motionStack.slice(0, -1);
      return {
        ...state,
        currentMotion: motionStack.at(-1) ?? null,
        motionStack,
        lastChairRuling,
        meetingLog: log(typedAction.timestamp, logMessage),
      };
    }

    default:
      // This handler only receives its specific actions from the main reducer
      return state;
  }
};
