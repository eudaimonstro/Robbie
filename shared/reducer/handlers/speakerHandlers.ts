import type { MeetingAction } from '../../types/index.js';
import { logSpeakerRecognized, logSpeakerYields } from '../../constants/logMessages.js';
import { isRuleSuspended } from '../../utils/ruleSuspensionHelper.js';
import type { ActionHandler } from './types.js';

export const speakerHandler: ActionHandler = (state, action, log) => {
  switch (action.type) {
    case 'RAISE_HAND': {
      const typedAction = action as Extract<MeetingAction, { type: 'RAISE_HAND' }>;
      // Already in queue? Don't add again
      if (state.speakerQueue.find((s) => s.member.id === typedAction.member.id)) return state;

      // Check for side-switching (member already spoke with different stance)
      // Only enforce for pro/con, neutral is always allowed
      if (typedAction.stance !== 'neutral') {
        const previousStance = state.debatePositions[typedAction.member.id];
        if (previousStance && previousStance !== typedAction.stance) {
          // Member is trying to switch sides - check if debate rules are suspended
          const debateRulesSuspended = isRuleSuspended(state, 'debate-rules');
          if (!debateRulesSuspended) {
            return state; // Reject - can't switch sides
          }
        }
      }

      return {
        ...state,
        speakerQueue: [
          ...state.speakerQueue,
          { member: typedAction.member, stance: typedAction.stance },
        ],
      };
    }

    case 'LOWER_HAND': {
      const typedAction = action as Extract<MeetingAction, { type: 'LOWER_HAND' }>;
      return {
        ...state,
        speakerQueue: state.speakerQueue.filter((e) => e.member.id !== typedAction.member.id),
      };
    }

    case 'RECOGNIZE_SPEAKER': {
      const typedAction = action as Extract<MeetingAction, { type: 'RECOGNIZE_SPEAKER' }>;

      // Enforce motion-maker-priority rule: mover speaks first unless rule is suspended
      if (
        state.currentMotion &&
        state.currentMotion.debatable &&
        !state.currentMotion.moverHasSpoken
      ) {
        const isMover = state.currentMotion.moverId === typedAction.member.id;
        const prioritySuspended = isRuleSuspended(state, 'motion-maker-priority');

        // If not the mover and rule is active, reject the recognition
        if (!isMover && !prioritySuspended) {
          return state;
        }
      }

      // Mark motion maker as having spoken if they're being recognized
      const updatedMotion =
        state.currentMotion && state.currentMotion.moverId === typedAction.member.id
          ? { ...state.currentMotion, moverHasSpoken: true }
          : state.currentMotion;

      // Update motion stack if current motion was updated
      const updatedStack =
        updatedMotion && updatedMotion !== state.currentMotion
          ? state.motionStack.map((m) => (m.id === updatedMotion.id ? updatedMotion : m))
          : state.motionStack;

      // Lock member's debate position (pro/con/neutral) when they speak
      const updatedDebatePositions =
        typedAction.stance !== 'neutral'
          ? { ...state.debatePositions, [typedAction.member.id]: typedAction.stance }
          : state.debatePositions;

      return {
        ...state,
        currentMotion: updatedMotion,
        motionStack: updatedStack,
        recognizedSpeaker: typedAction.member,
        lastSpeakerStance: typedAction.stance,
        debatePositions: updatedDebatePositions,
        speakerTimerEnd: typedAction.speakerTimerEnd,
        speakerQueue: state.speakerQueue.filter((s) => s.member.id !== typedAction.member.id),
        meetingLog: log(typedAction.timestamp, logSpeakerRecognized(typedAction.member.name)),
      };
    }

    case 'YIELD_FLOOR': {
      const typedAction = action as Extract<MeetingAction, { type: 'YIELD_FLOOR' }>;
      const speakerName = state.recognizedSpeaker?.name || 'Speaker';
      return {
        ...state,
        recognizedSpeaker: null,
        speakerTimerEnd: null,
        meetingLog: log(typedAction.timestamp, logSpeakerYields(speakerName)),
      };
    }

    default:
      // This handler only receives its specific actions from the main reducer
      return state;
  }
};
