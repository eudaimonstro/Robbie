import type {
  MeetingAction,
  MeetingLogEntry,
  MeetingState,
  Motion,
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
  logTakenUp,
  logWithdrawalAsked,
} from '../../constants/logMessages.js';
import { motionTextFromDetails } from '../../utils/motionRules.js';
import { unvotedRecord } from './records.js';
import type { ActionHandler } from './types.js';

type Log = (timestamp: string, msg: string) => MeetingLogEntry[];

/**
 * The queue of people waiting to speak when nothing was pending (an open forum, questions on a
 * report) ends once a question is stated: debate is on the question now
 */
export const FORUM_ENDS: Pick<
  MeetingState,
  'speakerQueue' | 'recognizedSpeaker' | 'speakerTimerEnd' | 'lastSpeakerStance'
> = {
  speakerQueue: [],
  recognizedSpeaker: null,
  speakerTimerEnd: null,
  lastSpeakerStance: null,
};

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
  // A motion with details of its own is worded from them, the same everywhere it is read
  const text = motionTextFromDetails(made.motionType, made) ?? made.text;
  const motion = {
    ...motionDef,
    id: made.motionId,
    type: made.motionType,
    text,
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
    ...(made.textAmendment && { textAmendment: made.textAmendment }),
    ...(made.postponeTo && { postponeTo: made.postponeTo }),
    ...(made.referTo?.trim() && { referTo: made.referTo.trim() }),
    ...(made.recessUntil?.trim() && { recessUntil: made.recessUntil.trim() }),
    ...(made.fromFloor && { fromFloor: true }),
    ...(made.putByChair && { putByChair: true }),
    // An appeal keeps the ruling it appeals from, to put back what the ruling removed
    ...(made.motionType === 'appeal' &&
      state.lastChairRuling && { appealOf: state.lastChairRuling }),
  };
  // Clear lastChairRuling for non-Appeal motions
  const lastChairRuling = made.motionType === 'appeal' ? state.lastChairRuling : null;

  // A question the chair puts from the agenda needs no second: the agenda is the assembly's
  // business already
  const needsSecond = motion.needsSecond && !made.putByChair;

  if (needsSecond) {
    const message = made.fromFloor
      ? logFloorMotionMade(made.mover, text, motion.name)
      : logMotionMade(made.mover, text, motion.name);
    return {
      ...state,
      pendingSecond: motion,
      lastChairRuling,
      meetingLog: log(made.timestamp, message),
    };
  }

  const logMessage = made.putByChair
    ? logQuestionPut(text, motion.name)
    : `${made.mover} raises ${motion.name}${made.fromFloor ? ' from the floor' : ''}.`;

  // With no second to wait for, the motion is the pending question at once, as a seconded
  // motion is (objection to consideration, for one, requires an active motion)
  const activeMotion = { ...motion, status: 'active' as const };
  return {
    ...state,
    // A question stated on an empty floor ends the open forum (not a point of order on one)
    ...(state.motionStack.length === 0 && made.motionType !== 'pointOrder' && FORUM_ENDS),
    currentMotion: activeMotion,
    motionStack: [...state.motionStack, activeMotion],
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
    ...(state.motionStack.length === 0 && FORUM_ENDS),
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
      // The motion dies for want of a second; the minutes say so
      const died = state.pendingSecond;
      return {
        ...state,
        pendingSecond: null,
        completedMotions: died
          ? [
              ...state.completedMotions,
              unvotedRecord(state, died, 'no-second', typedAction.timestamp, typedAction.at),
            ]
          : state.completedMotions,
        meetingLog: log(typedAction.timestamp, LOG_MOTION_FAILED_NO_SECOND),
      };
    }

    case 'WITHDRAW_MOTION': {
      const typedAction = action as Extract<MeetingAction, { type: 'WITHDRAW_MOTION' }>;
      // Before the question is stated (awaiting a second) the mover withdraws it at once
      if (state.pendingSecond) {
        return {
          ...state,
          pendingSecond: null,
          completedMotions: [
            ...state.completedMotions,
            unvotedRecord(
              state,
              state.pendingSecond,
              'withdrawn',
              typedAction.timestamp,
              typedAction.at,
            ),
          ],
          meetingLog: log(typedAction.timestamp, logMotionWithdrawn(state.pendingSecond.mover)),
        };
      }
      // Once stated it is the meeting's: the mover asks, and the request is the question, which
      // the chair puts by unanimous consent or a vote (RONR 33:11 to 33:19)
      const motion = state.currentMotion;
      if (!motion || typedAction.motionId === undefined) return state;
      const request: Motion = {
        ...MOTIONS.withdrawMotion,
        id: typedAction.motionId,
        type: 'withdrawMotion',
        text: `Permission to withdraw "${motion.text}"`,
        mover: motion.mover,
        moverId: motion.moverId,
        secondedBy: null,
        status: 'active',
        moverHasSpoken: false,
        ...(typedAction.fromFloor && { fromFloor: true }),
      };
      return {
        ...state,
        currentMotion: request,
        motionStack: [...state.motionStack, request],
        meetingLog: log(typedAction.timestamp, logWithdrawalAsked(motion.mover, motion.text)),
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

    case 'TAKE_UP_POSTPONED': {
      const typedAction = action as Extract<MeetingAction, { type: 'TAKE_UP_POSTPONED' }>;
      // The question postponed to later in the meeting, as it was: its main motion and any
      // amendment pending on it
      const postponed = state.postponedMotions ?? [];
      const question = postponed.find((p) => p.motions[0]?.id === typedAction.motionId);
      if (!question) return state;
      const motions = question.motions.map((m) => ({ ...m, status: 'active' as const }));
      return {
        ...state,
        motionStack: [...state.motionStack, ...motions],
        currentMotion: motions.at(-1) ?? state.currentMotion,
        postponedMotions: postponed.filter((p) => p !== question),
        lastChairRuling: null,
        meetingLog: log(typedAction.timestamp, logTakenUp(motions[0].text)),
      };
    }

    default:
      // This handler only receives its specific actions from the main reducer
      return state;
  }
};
