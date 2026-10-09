import type { MeetingAction, Motion } from '../../types/index.js';
import { logChairRuled } from '../../constants/logMessages.js';
import { NO_VOTES } from '../../utils/voteCalculator.js';
import { decisionContext, unvotedRecord } from './records.js';
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
      // The chair rules on the point of order before the meeting (the validator allows nothing
      // else): it leaves the floor, and the business it interrupted is pending again
      const point = state.currentMotion;
      if (!point) return state;
      let motionStack = state.motionStack.slice(0, -1);
      let pendingSecond = state.pendingSecond;
      // Well taken, the chair can rule the motion it was about out of order: the one awaiting a
      // second, or else the one beneath the point. It leaves the floor with a record, and an
      // appeal that reverses the ruling puts it back.
      let removed: { motion: Motion; awaitingSecond: boolean } | undefined;
      if (typedAction.ruling === 'sustain' && typedAction.outOfOrder) {
        if (pendingSecond) {
          removed = { motion: pendingSecond, awaitingSecond: true };
          pendingSecond = null;
        } else if (motionStack.length > 0) {
          removed = { motion: motionStack[motionStack.length - 1], awaitingSecond: false };
          motionStack = motionStack.slice(0, -1);
        }
      }
      const rulingText =
        typedAction.ruling === 'sustain'
          ? removed
            ? 'The point is well taken; the motion is out of order.'
            : 'The point is well taken.'
          : typedAction.ruling === 'overrule'
            ? 'The point is not well taken.'
            : typedAction.ruling === 'allow'
              ? 'The request is granted.'
              : 'The request is denied.';
      const logMessage = logChairRuled(rulingText, typedAction.explanation, point.text);
      // A vote on the motion ruled out of order ends with it, undecided
      const voteEnded = removed && !removed.awaitingSecond && state.votingOpen;
      return {
        ...state,
        currentMotion: motionStack.at(-1) ?? null,
        motionStack,
        pendingSecond,
        // The ruling an appeal can name
        lastChairRuling: {
          ruling: rulingText,
          motionText: point.text,
          timestamp: typedAction.timestamp,
          ...(removed && { removed }),
        },
        // The minutes record a point of order and its ruling (a request saved before they were
        // questions to the chair is not a ruling)
        chairRulings:
          point.type === 'pointOrder'
            ? [
                ...(state.chairRulings ?? []),
                {
                  ruling: rulingText,
                  ...(typedAction.explanation ? { explanation: typedAction.explanation } : {}),
                  motionText: point.text,
                  ...(point.mover ? { raisedBy: point.mover } : {}),
                  ...(removed ? { outOfOrder: removed.motion.text } : {}),
                  timestamp: typedAction.timestamp,
                  ...decisionContext(state, typedAction.at),
                },
              ]
            : (state.chairRulings ?? []),
        completedMotions: removed
          ? [
              ...state.completedMotions,
              unvotedRecord(
                state,
                removed.motion,
                'out-of-order',
                typedAction.timestamp,
                typedAction.at,
              ),
            ]
          : state.completedMotions,
        ...(removed && !removed.awaitingSecond
          ? {
              speakerQueue: [],
              recognizedSpeaker: null,
              speakerTimerEnd: null,
              lastSpeakerStance: null,
              debatePositions: {},
            }
          : {}),
        ...(voteEnded
          ? {
              votingOpen: false,
              voteTimerEnd: null,
              votes: NO_VOTES,
              voters: [],
              voterChoices: {},
              floorVotes: NO_VOTES,
              divisionCalled: false,
            }
          : {}),
        meetingLog: log(typedAction.timestamp, logMessage),
      };
    }

    default:
      // This handler only receives its specific actions from the main reducer
      return state;
  }
};
