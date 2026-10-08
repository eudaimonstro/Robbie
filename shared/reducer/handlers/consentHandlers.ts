import type { MeetingAction } from '../../types/index.js';
import { logAdoptedByConsent, logUnanimousConsentObjection } from '../../constants/logMessages.js';
import { decide } from './decisions.js';
import { unvotedRecord } from './records.js';
import type { ActionHandler } from './types.js';

export const consentHandler: ActionHandler = (state, action, log) => {
  switch (action.type) {
    case 'REQUEST_UNANIMOUS_CONSENT': {
      const typedAction = action as Extract<MeetingAction, { type: 'REQUEST_UNANIMOUS_CONSENT' }>;
      // The request is on the question pending now; it ends when that question does
      return {
        ...state,
        unanimousConsentPending: true,
        consentMotionId: state.currentMotion?.id ?? null,
        meetingLog: log(typedAction.timestamp, 'Chair: "Is there any objection?"'),
      };
    }

    case 'OBJECT_TO_CONSENT': {
      const typedAction = action as Extract<MeetingAction, { type: 'OBJECT_TO_CONSENT' }>;
      // An objection from the floor is recorded by the chair, with the objector's name if given
      const objector = typedAction.fromFloor
        ? typedAction.floorObjector?.trim() || 'A member in the room'
        : typedAction.objector;
      return {
        ...state,
        unanimousConsentPending: false,
        consentMotionId: null,
        meetingLog: log(typedAction.timestamp, logUnanimousConsentObjection(objector)),
      };
    }

    case 'UNANIMOUS_CONSENT_PASSED': {
      const typedAction = action as Extract<MeetingAction, { type: 'UNANIMOUS_CONSENT_PASSED' }>;
      const decided = state.currentMotion;
      if (!decided) return { ...state, unanimousConsentPending: false, consentMotionId: null };
      // Adopted without a vote: recorded as unanimous consent, with the quorum
      const record = unvotedRecord(
        state,
        decided,
        'unanimous',
        typedAction.timestamp,
        typedAction.at,
      );
      const outcome = decide(state, true, record, typedAction.timestamp, typedAction.at);
      return {
        ...state,
        unanimousConsentPending: false,
        consentMotionId: null,
        ...outcome.state,
        meetingLog: log(typedAction.timestamp, logAdoptedByConsent(outcome.log)),
      };
    }

    default:
      // This handler only receives its specific actions from the main reducer
      return state;
  }
};
