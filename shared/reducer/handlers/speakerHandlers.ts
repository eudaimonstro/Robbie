import type { MeetingState, MeetingAction } from '../../types/index.js';
import { logSpeakerRecognized, logSpeakerYields } from '../../constants/logMessages.js';
import type { ActionHandler } from './types.js';

export const speakerHandler: ActionHandler = (state, action, log) => {
  switch (action.type) {
    case 'RAISE_HAND': {
      const typedAction = action as Extract<MeetingAction, { type: 'RAISE_HAND' }>;
      // Already in queue? Update stance
      if (state.speakerQueue.some(e => e.member.id === typedAction.member.id)) {
        return {
          ...state,
          speakerQueue: state.speakerQueue.map(e =>
            e.member.id === typedAction.member.id ? { ...e, stance: typedAction.stance } : e
          )
        };
      }
      return {
        ...state,
        speakerQueue: [...state.speakerQueue, { member: typedAction.member, stance: typedAction.stance }]
      };
    }

    case 'LOWER_HAND': {
      const typedAction = action as Extract<MeetingAction, { type: 'LOWER_HAND' }>;
      return {
        ...state,
        speakerQueue: state.speakerQueue.filter(e => e.member.id !== typedAction.member.id)
      };
    }

    case 'RECOGNIZE_SPEAKER': {
      const typedAction = action as Extract<MeetingAction, { type: 'RECOGNIZE_SPEAKER' }>;
      // Track if this is the motion maker getting their first chance to speak
      const isMotionMaker = state.currentMotion && state.currentMotion.moverId === typedAction.member.id;
      const updateMoverHasSpoken = isMotionMaker && !state.currentMotion?.moverHasSpoken;

      return {
        ...state,
        recognizedSpeaker: typedAction.member,
        lastSpeakerStance: typedAction.stance,
        debatePositions: {
          ...state.debatePositions,
          [typedAction.member.id]: typedAction.stance
        },
        speakerQueue: state.speakerQueue.filter(e => e.member.id !== typedAction.member.id),
        speakerTimerEnd: typedAction.speakerTimerEnd,
        currentMotion: updateMoverHasSpoken && state.currentMotion
          ? { ...state.currentMotion, moverHasSpoken: true }
          : state.currentMotion,
        meetingLog: log(typedAction.timestamp, logSpeakerRecognized(typedAction.member.name))
      };
    }

    case 'YIELD_FLOOR': {
      const typedAction = action as Extract<MeetingAction, { type: 'YIELD_FLOOR' }>;
      const speakerName = state.recognizedSpeaker?.name || 'Speaker';
      return {
        ...state,
        recognizedSpeaker: null,
        speakerTimerEnd: null,
        meetingLog: log(typedAction.timestamp, logSpeakerYields(speakerName))
      };
    }

    default:
      return undefined;
  }
};
