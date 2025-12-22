import type { MeetingState, MeetingAction } from '../../types/index.js';
import { MOTIONS } from '../../constants/motions.js';
import {
  LOG_MOTION_FAILED_NO_SECOND,
  logMotionMade,
  logMotionSeconded,
  logMotionWithdrawn,
  logMotionModified
} from '../../constants/logMessages.js';
import { isRuleSuspended, markSingleActionComplete } from '../../utils/ruleSuspensionHelper.js';
import type { ActionHandler } from './types.js';

export const motionHandler: ActionHandler = (state, action, log) => {
  switch (action.type) {
    case 'MAKE_MOTION': {
      const typedAction = action as Extract<MeetingAction, { type: 'MAKE_MOTION' }>;
      const motionDef = MOTIONS[typedAction.motionType];
      const motion = {
        ...motionDef,
        id: typedAction.motionId,
        type: typedAction.motionType,
        text: typedAction.text,
        mover: typedAction.mover,
        moverId: typedAction.moverId,
        secondedBy: null,
        status: "pending" as const,
        isAgendaAdoption: typedAction.motionType === 'adoptAgenda',
        agendaAmendment: typedAction.agendaAmendment || null,
        ruleSuspension: typedAction.ruleSuspension || null,
        moverHasSpoken: false,
        tabledMotionId: typedAction.tabledMotionId,
        reconsideredMotionId: typedAction.reconsideredMotionId,
        dividedParts: typedAction.dividedParts
      };

      // Check if second requirement is suspended
      const secondSuspended = isRuleSuspended(state, 'second-requirement');

      if (motion.needsSecond && !secondSuspended) {
        return {
          ...state,
          pendingSecond: motion,
          // Clear lastChairRuling for non-Appeal motions
          lastChairRuling: typedAction.motionType === 'appeal' ? state.lastChairRuling : null,
          meetingLog: log(typedAction.timestamp, logMotionMade(typedAction.mover, typedAction.text, motion.name))
        };
      }

      // If second was bypassed due to suspension, note it in the log
      const bypassedSecond = motion.needsSecond && secondSuspended;
      const logMessage = bypassedSecond
        ? `${typedAction.mover} moves: "${typedAction.text}" (${motion.name}). [Second requirement suspended - motion proceeds directly]`
        : `${typedAction.mover} raises ${motion.name}.`;

      // Auto-complete single-action suspension when used
      const updatedSuspensions = bypassedSecond
        ? markSingleActionComplete(state, 'second-requirement')
        : state.suspendedRules;

      return {
        ...state,
        currentMotion: motion,
        motionStack: [...state.motionStack, motion],
        suspendedRules: updatedSuspensions,
        lastChairRuling: typedAction.motionType === 'appeal' ? state.lastChairRuling : null,
        meetingLog: log(typedAction.timestamp, logMessage)
      };
    }

    case 'SECOND_MOTION': {
      const typedAction = action as Extract<MeetingAction, { type: 'SECOND_MOTION' }>;
      if (!state.pendingSecond) return state;

      const seconded = { ...state.pendingSecond, secondedBy: typedAction.seconder, status: "active" as const };
      return {
        ...state,
        pendingSecond: null,
        currentMotion: seconded,
        motionStack: [...state.motionStack, seconded],
        meetingLog: log(typedAction.timestamp, logMotionSeconded(typedAction.seconder))
      };
    }

    case 'DECLINE_SECOND': {
      const typedAction = action as Extract<MeetingAction, { type: 'DECLINE_SECOND' }>;
      return {
        ...state,
        pendingSecond: null,
        meetingLog: log(typedAction.timestamp, LOG_MOTION_FAILED_NO_SECOND)
      };
    }

    case 'WITHDRAW_MOTION': {
      const typedAction = action as Extract<MeetingAction, { type: 'WITHDRAW_MOTION' }>;
      // Motion can be withdrawn if it's pending a second or is the current motion
      const motionToWithdraw = state.pendingSecond || state.currentMotion;
      if (!motionToWithdraw) {
        return state;
      }
      if (motionToWithdraw.moverId !== typedAction.requesterId) {
        return state; // Only the mover can withdraw their motion
      }

      if (state.pendingSecond) {
        // Motion not yet seconded - can be withdrawn freely
        return {
          ...state,
          pendingSecond: null,
          meetingLog: log(typedAction.timestamp, logMotionWithdrawn(state.pendingSecond.mover))
        };
      }

      // Motion is already seconded - remove from stack
      const newStack = state.motionStack.slice(0, -1);
      const previousMotion = newStack.length > 0 ? newStack[newStack.length - 1] : null;

      return {
        ...state,
        currentMotion: previousMotion,
        motionStack: newStack,
        votingOpen: false,
        unanimousConsentPending: false,
        speakerQueue: [],
        recognizedSpeaker: null,
        debatePositions: {},
        meetingLog: log(typedAction.timestamp, logMotionWithdrawn(motionToWithdraw.mover))
      };
    }

    case 'MODIFY_MOTION': {
      const typedAction = action as Extract<MeetingAction, { type: 'MODIFY_MOTION' }>;
      // Motion maker can modify their motion before debate begins
      const motionToModify = state.pendingSecond || state.currentMotion;
      if (!motionToModify) {
        return state;
      }
      if (motionToModify.moverId !== typedAction.requesterId) {
        return state; // Only the mover can modify their motion
      }
      // Cannot modify after debate has begun (someone has spoken)
      if (state.currentMotion && state.currentMotion.moverHasSpoken) {
        return state;
      }

      const modifiedMotion = {
        ...motionToModify,
        text: typedAction.newText
      };

      if (state.pendingSecond) {
        return {
          ...state,
          pendingSecond: modifiedMotion,
          meetingLog: log(typedAction.timestamp, logMotionModified(motionToModify.mover, typedAction.newText))
        };
      }

      // Motion is current - update in stack too
      const newStack = [...state.motionStack.slice(0, -1), modifiedMotion];
      return {
        ...state,
        currentMotion: modifiedMotion,
        motionStack: newStack,
        meetingLog: log(typedAction.timestamp, logMotionModified(motionToModify.mover, typedAction.newText))
      };
    }

    default:
      // This handler only receives its specific actions from the main reducer
      return state;
  }
};
