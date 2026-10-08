import type { MeetingAction } from '../../types/index.js';
import { logSpeakerRecognized, logSpeakerYields } from '../../constants/logMessages.js';
import { moverClaimsFloor } from '../../utils/motionHelpers.js';
import type { ActionHandler } from './types.js';

export const speakerHandler: ActionHandler = (state, action, log) => {
  switch (action.type) {
    case 'RAISE_HAND': {
      const typedAction = action as Extract<MeetingAction, { type: 'RAISE_HAND' }>;
      // Already in queue? Don't add again (a member may speak for one side and then the other)
      if (state.speakerQueue.find((s) => s.member.id === typedAction.member.id)) return state;

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

      // The mover speaks first if they have asked to (RONR 42:9)
      if (moverClaimsFloor(state) && state.currentMotion?.moverId !== typedAction.member.id) {
        return state;
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
        // An appeal from a ruling comes before debate goes on
        lastChairRuling: null,
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
