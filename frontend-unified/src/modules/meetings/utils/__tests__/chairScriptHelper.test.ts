import { describe, it, expect } from 'vitest';
import { initialState, meetingReducer } from '@robbie-bylawyer/shared/reducer';
import { MOTIONS } from '@robbie-bylawyer/shared/constants';
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import { getChairScript } from '../chairScriptHelper';

const pendingMotion = {
  ...MOTIONS.mainMotion,
  id: 1,
  type: 'mainMotion',
  text: 'Approve the budget',
  mover: 'Member 1',
  moverId: 1,
  secondedBy: 'Member 2',
  status: 'active' as const,
};

// Runs a vote through the reducer so the log has the messages the app really writes
function afterVote(yeas: number, nays: number): MeetingState {
  const motion = {
    ...MOTIONS.mainMotion,
    id: 1,
    type: 'mainMotion',
    text: 'Approve the budget',
    mover: 'Member 1',
    moverId: 1,
    secondedBy: 'Member 2',
    status: 'active' as const,
  };
  const voterIds = Array.from({ length: yeas + nays }, (_, i) => i + 1);
  let state: MeetingState = {
    ...initialState,
    meetingActive: true,
    agendaAdopted: true,
    members: voterIds.map((id) => ({ id, name: `Member ${id}`, role: 'member', present: true })),
    currentMotion: motion,
    motionStack: [motion],
  };
  state = meetingReducer(state, { type: 'OPEN_VOTING', voteTimerEnd: null, timestamp: '10:05' });
  voterIds.forEach((voterId, i) => {
    state = meetingReducer(state, { type: 'CAST_VOTE', voterId, vote: i < yeas ? 'yea' : 'nay' });
  });
  return meetingReducer(state, { type: 'CLOSE_VOTING', timestamp: '10:10' });
}

describe('getChairScript', () => {
  it('announces a motion that carried', () => {
    expect(getChairScript(afterVote(3, 1))?.text).toBe('"The motion has carried."');
  });

  it('announces a motion adopted by unanimous consent', () => {
    let state: MeetingState = {
      ...initialState,
      meetingActive: true,
      agendaAdopted: true,
      currentMotion: pendingMotion,
      motionStack: [pendingMotion],
    };
    state = meetingReducer(state, { type: 'REQUEST_UNANIMOUS_CONSENT', timestamp: '10:05' });
    state = meetingReducer(state, { type: 'UNANIMOUS_CONSENT_PASSED', timestamp: '10:06' });
    expect(getChairScript(state)?.text).toBe('"The motion has carried."');
  });

  it('announces a motion that failed', () => {
    expect(getChairScript(afterVote(1, 3))?.text).toBe('"The motion has failed."');
  });
});
