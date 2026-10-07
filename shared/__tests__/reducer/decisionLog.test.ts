import { describe, it, expect } from 'vitest';
import { meetingReducer, initialState } from '../../reducer/index.js';
import { MOTIONS } from '../../constants/motions.js';
import {
  LOG_ADOPTED_BY_CONSENT,
  LOG_CHAIR_RULED,
  LOG_MOTION_FAILED_NO_SECOND,
  LOG_MOTION_WITHDRAWN,
} from '../../constants/logMessages.js';
import type { MeetingAction, MeetingState, Motion } from '../../types/index.js';

// The screens show a decision by the line the meeting log records for it, so each decision's
// line comes from a constant they can match on

const motion = (type: string, text: string, fields: Partial<Motion> = {}): Motion => ({
  ...MOTIONS[type],
  id: 1,
  type,
  text,
  mover: 'Alice',
  moverId: 2,
  secondedBy: 'Bob',
  status: 'active',
  ...fields,
});

const pending = (m: Motion): MeetingState => ({
  ...initialState,
  meetingActive: true,
  currentMotion: m,
  motionStack: [m],
});

const lastLine = (state: MeetingState, action: MeetingAction) =>
  meetingReducer(state, action).meetingLog.at(-1)?.message;

describe('the log line for each decision', () => {
  it('records a motion adopted by unanimous consent', () => {
    const line = lastLine(
      { ...pending(motion('mainMotion', 'Paint the clubhouse')), unanimousConsentPending: true },
      { type: 'UNANIMOUS_CONSENT_PASSED', timestamp: '10:00:00' },
    );
    expect(LOG_ADOPTED_BY_CONSENT).toBe('Motion CARRIED by unanimous consent.');
    expect(line).toBe(LOG_ADOPTED_BY_CONSENT);
  });

  it('records a ruling of the chair', () => {
    const line = lastLine(pending(motion('pointOrder', 'The speaker is off topic')), {
      type: 'CHAIR_RULING',
      ruling: 'sustain',
      explanation: 'Stay on the question',
      timestamp: '10:00:00',
    });
    expect(line?.startsWith(LOG_CHAIR_RULED)).toBe(true);
    expect(line).toBe(
      'Chair ruled: The point is well taken. - Stay on the question (Re: The speaker is off topic)',
    );
  });

  it('records a motion that died for lack of a second', () => {
    const line = lastLine(
      { ...initialState, meetingActive: true, pendingSecond: motion('mainMotion', 'Paint it') },
      { type: 'DECLINE_SECOND', timestamp: '10:00:00' },
    );
    expect(line).toBe(LOG_MOTION_FAILED_NO_SECOND);
  });

  it('records a withdrawal', () => {
    const line = lastLine(pending(motion('mainMotion', 'Paint it')), {
      type: 'WITHDRAW_MOTION',
      requesterId: 2,
      timestamp: '10:00:00',
    });
    expect(line).toBe(`Alice${LOG_MOTION_WITHDRAWN}`);
    expect(line).toBe("Alice's motion is withdrawn.");
  });
});
