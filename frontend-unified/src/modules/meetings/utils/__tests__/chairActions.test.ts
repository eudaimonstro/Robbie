import { describe, it, expect } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { MOTIONS } from '@robbie-bylawyer/shared/constants';
import type { MeetingState, Motion } from '@robbie-bylawyer/shared/types';
import { chairActions } from '../chairActions';

const motion = (key: string, overrides: Partial<Motion> = {}): Motion => ({
  ...MOTIONS[key],
  id: 1,
  type: key,
  text: 'Approve the pool contract',
  mover: 'Alice Brennan',
  moverId: 3,
  secondedBy: 'Ben Whitaker',
  status: 'active',
  ...overrides,
});

const active: MeetingState = {
  ...initialState,
  meetingActive: true,
  meetingStage: 'call-to-order',
  agenda: [
    { id: 1, title: 'Call to order', status: 'pending' },
    { id: 2, title: "Treasurer's report", status: 'pending' },
  ],
};
const adopted: MeetingState = { ...active, agendaAdopted: true };
const ids = (state: MeetingState) => chairActions(state, 2).map((action) => action.id);

describe('chairActions', () => {
  it('calls the meeting to order first, and offers nothing once it is adjourned', () => {
    expect(chairActions(initialState, 2).map((a) => [a.label, a.tone])).toEqual([
      ['Call to order', 'primary'],
    ]);
    expect(chairActions(initialState, 2)[0].make()).toMatchObject({ type: 'START_MEETING' });
    expect(ids({ ...initialState, meetingStage: 'adjourned' })).toEqual([]);
  });

  it('adopts the agenda, then calls the next item', () => {
    expect(ids(active)).toEqual(['adopt-agenda', 'agenda-objection']);
    expect(ids({ ...active, agendaObjection: true })).toEqual(['adjourn']);
    const next = chairActions(adopted, 2);
    expect(next.map((a) => a.label)).toEqual(['Call the next item: Call to order', 'Adjourn']);
    expect(next[0].make()).toMatchObject({ type: 'CALL_AGENDA_ITEM', id: 1 });
  });

  it("completes the current item, or puts it to a vote in the presiding officer's name", () => {
    const state: MeetingState = {
      ...adopted,
      currentAgendaItem: { id: 2, title: "Treasurer's report", status: 'active' },
    };
    const actions = chairActions(state, 2);
    expect(actions.map((a) => a.id)).toEqual(['complete-item', 'put-item']);
    expect(actions[1].make()).toMatchObject({
      type: 'MAKE_MOTION',
      motionType: 'mainMotion',
      text: "Approve: Treasurer's report",
      moverId: 2,
    });
    expect(chairActions(state, null).map((a) => a.id)).toEqual(['complete-item']);
  });

  it('declares no second while a motion waits for one', () => {
    expect(ids({ ...adopted, pendingSecond: motion('mainMotion', { secondedBy: null }) })).toEqual([
      'no-second',
    ]);
  });

  it('opens the vote or asks for unanimous consent on a seconded motion', () => {
    const state = { ...adopted, currentMotion: motion('mainMotion') };
    const actions = chairActions(state, 2);
    expect(actions.map((a) => a.label)).toEqual(['Open the vote', 'Ask for unanimous consent']);
    expect(actions[0].make()).toMatchObject({ type: 'OPEN_VOTING' });
    expect(ids({ ...state, unanimousConsentPending: true })).toEqual(['adopted', 'open-vote']);
  });

  it('gives the chair a ruling on a call for the orders of the day', () => {
    const state = { ...adopted, currentMotion: motion('callOrderDay', { secondedBy: null }) };
    const actions = chairActions(state, 2);
    expect(actions.map((a) => a.label)).toEqual(['Proceed to the orders of the day']);
    expect(actions[0].make()).toMatchObject({ type: 'CHAIR_RULING', ruling: 'allow' });
  });

  it('rules on a point of order', () => {
    const state = { ...adopted, currentMotion: motion('pointOrder', { secondedBy: null }) };
    expect(chairActions(state, 2).map((a) => a.label)).toEqual([
      'Sustain the point',
      'Overrule the point',
    ]);
  });

  it('leaves closing a vote to the vote panel, and an election to the election panel', () => {
    expect(ids({ ...adopted, currentMotion: motion('mainMotion'), votingOpen: true })).toEqual([]);
  });
});
