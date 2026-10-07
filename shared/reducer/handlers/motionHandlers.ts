import type {
  MeetingAction,
  MeetingLogEntry,
  MeetingState,
  MotionDetails,
} from '../../types/index.js';
import { MOTIONS } from '../../constants/motions.js';
import { A_MEMBER_IN_THE_ROOM, PUT_BY_CHAIR } from '../../constants/floor.js';
import {
  LOG_MOTION_FAILED_NO_SECOND,
  logFloorMotionMade,
  logMotionMade,
  logMotionSeconded,
  logMotionWithdrawn,
  logMotionModified,
  logQuestionPut,
  logSecondedFromFloor,
} from '../../constants/logMessages.js';
import { isRuleSuspended, markSingleActionComplete } from '../../utils/ruleSuspensionHelper.js';
import type { ActionHandler } from './types.js';

type Log = (timestamp: string, msg: string) => MeetingLogEntry[];

/** A motion being made: by a member on a device, from the floor, or put by the chair */
interface NewMotion extends MotionDetails {
  motionType: string;
  text: string;
  mover: string;
  moverId: number;
  motionId: number;
  timestamp: string;
  fromFloor?: boolean;
  putByChair?: boolean;
}

/** The motion is made: it awaits a second, or is the pending question at once */
function makeMotion(state: MeetingState, made: NewMotion, log: Log): MeetingState {
  const motionDef = MOTIONS[made.motionType];
  const motion = {
    ...motionDef,
    id: made.motionId,
    type: made.motionType,
    text: made.text,
    mover: made.mover,
    moverId: made.moverId,
    secondedBy: null,
    status: 'pending' as const,
    isAgendaAdoption: made.motionType === 'adoptAgenda',
    agendaAmendment: made.agendaAmendment || null,
    ruleSuspension: made.ruleSuspension || null,
    bylawAmendment: made.bylawAmendment || null,
    moverHasSpoken: false,
    tabledMotionId: made.tabledMotionId,
    reconsideredMotionId: made.reconsideredMotionId,
    dividedParts: made.dividedParts,
    ...(made.fromFloor && { fromFloor: true }),
    ...(made.putByChair && { putByChair: true }),
  };
  // Clear lastChairRuling for non-Appeal motions
  const lastChairRuling = made.motionType === 'appeal' ? state.lastChairRuling : null;

  // Check if second requirement is suspended
  const secondSuspended = isRuleSuspended(state, 'second-requirement');

  if (motion.needsSecond && !secondSuspended) {
    const message = made.putByChair
      ? logQuestionPut(made.text, motion.name)
      : made.fromFloor
        ? logFloorMotionMade(made.mover, made.text, motion.name)
        : logMotionMade(made.mover, made.text, motion.name);
    return {
      ...state,
      pendingSecond: motion,
      lastChairRuling,
      meetingLog: log(made.timestamp, message),
    };
  }

  // If second was bypassed due to suspension, note it in the log
  const bypassedSecond = motion.needsSecond && secondSuspended;
  const moves = made.putByChair
    ? 'The chair puts the question'
    : `${made.mover} moves${made.fromFloor ? ' from the floor' : ''}`;
  const logMessage = bypassedSecond
    ? `${moves}: "${made.text}" (${motion.name}). [Second requirement suspended - motion proceeds directly]`
    : made.putByChair
      ? `The chair puts the question: "${made.text}" (${motion.name}).`
      : `${made.mover} raises ${motion.name}${made.fromFloor ? ' from the floor' : ''}.`;

  // Auto-complete single-action suspension when used
  const updatedSuspensions = bypassedSecond
    ? markSingleActionComplete(state, 'second-requirement')
    : state.suspendedRules;

  // With no second to wait for, the motion is the pending question at once, as a seconded
  // motion is (objection to consideration, for one, requires an active motion)
  const activeMotion = { ...motion, status: 'active' as const };
  return {
    ...state,
    currentMotion: activeMotion,
    motionStack: [...state.motionStack, activeMotion],
    suspendedRules: updatedSuspensions,
    lastChairRuling,
    meetingLog: log(made.timestamp, logMessage),
  };
}

/** The motion awaiting a second is seconded, and becomes the pending question */
function second(
  state: MeetingState,
  secondedBy: string,
  timestamp: string,
  message: string,
  log: Log,
) {
  if (!state.pendingSecond) return state;
  const seconded = { ...state.pendingSecond, secondedBy, status: 'active' as const };
  return {
    ...state,
    pendingSecond: null,
    currentMotion: seconded,
    motionStack: [...state.motionStack, seconded],
    meetingLog: log(timestamp, message),
  };
}

export const motionHandler: ActionHandler = (state, action, log) => {
  switch (action.type) {
    case 'MAKE_MOTION': {
      const {
        type: _type,
        putByChair,
        ...made
      } = action as Extract<MeetingAction, { type: 'MAKE_MOTION' }>;
      // A question the chair puts from the agenda has no mover
      return putByChair
        ? makeMotion(state, { ...made, mover: PUT_BY_CHAIR, moverId: 0, putByChair }, log)
        : makeMotion(state, made, log);
    }

    case 'MAKE_FLOOR_MOTION': {
      const {
        type: _type,
        moverName,
        moverMemberId,
        recordedBy: _recordedBy,
        ...made
      } = action as Extract<MeetingAction, { type: 'MAKE_FLOOR_MOTION' }>;
      // The member named, as the meeting has them, or else the name the chair typed
      const named =
        moverMemberId !== undefined ? state.members.find((m) => m.id === moverMemberId) : undefined;
      return makeMotion(
        state,
        {
          ...made,
          mover: named?.name ?? moverName.trim(),
          moverId: named?.id ?? 0,
          fromFloor: true,
        },
        log,
      );
    }

    case 'SECOND_MOTION': {
      const typedAction = action as Extract<MeetingAction, { type: 'SECOND_MOTION' }>;
      return second(
        state,
        typedAction.seconder,
        typedAction.timestamp,
        logMotionSeconded(typedAction.seconder),
        log,
      );
    }

    case 'SECOND_FROM_FLOOR': {
      const typedAction = action as Extract<MeetingAction, { type: 'SECOND_FROM_FLOOR' }>;
      const named =
        typedAction.seconderMemberId !== undefined
          ? state.members.find((m) => m.id === typedAction.seconderMemberId)
          : undefined;
      const seconder = named?.name ?? (typedAction.seconderName?.trim() || null);
      return second(
        state,
        seconder ?? A_MEMBER_IN_THE_ROOM,
        typedAction.timestamp,
        logSecondedFromFloor(seconder),
        log,
      );
    }

    case 'DECLINE_SECOND': {
      const typedAction = action as Extract<MeetingAction, { type: 'DECLINE_SECOND' }>;
      return {
        ...state,
        pendingSecond: null,
        meetingLog: log(typedAction.timestamp, LOG_MOTION_FAILED_NO_SECOND),
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
          meetingLog: log(typedAction.timestamp, logMotionWithdrawn(state.pendingSecond.mover)),
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
        meetingLog: log(typedAction.timestamp, logMotionWithdrawn(motionToWithdraw.mover)),
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
      // Cannot modify after debate on this motion has begun (a motion awaiting a second
      // hasn't been debated, whatever is happening on the motion below it)
      if (motionToModify.moverHasSpoken) {
        return state;
      }

      const modifiedMotion = {
        ...motionToModify,
        text: typedAction.newText,
      };

      if (state.pendingSecond) {
        return {
          ...state,
          pendingSecond: modifiedMotion,
          meetingLog: log(
            typedAction.timestamp,
            logMotionModified(motionToModify.mover, typedAction.newText),
          ),
        };
      }

      // Motion is current - update in stack too
      const newStack = [...state.motionStack.slice(0, -1), modifiedMotion];
      return {
        ...state,
        currentMotion: modifiedMotion,
        motionStack: newStack,
        meetingLog: log(
          typedAction.timestamp,
          logMotionModified(motionToModify.mover, typedAction.newText),
        ),
      };
    }

    default:
      // This handler only receives its specific actions from the main reducer
      return state;
  }
};
