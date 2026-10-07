import { describe, it, expect } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { MOTIONS } from '@robbie-bylawyer/shared/constants';
import type { MeetingState, Motion } from '@robbie-bylawyer/shared/types';
import { chairActions, floorActions } from '../chairActions';

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
    expect(ids(active)).toEqual(['adopt-agenda', 'agenda-objection', 'adjourn']);
    expect(ids({ ...active, agendaObjection: true })).toEqual(['adjourn']);
    const next = chairActions(adopted, 2);
    expect(next.map((a) => a.label)).toEqual(['Call the next item: Call to order', 'Adjourn']);
    expect(next[0].make()).toMatchObject({ type: 'CALL_AGENDA_ITEM', id: 1 });
  });

  it('completes the current item, or puts it to a vote as put by the chair', () => {
    const state: MeetingState = {
      ...adopted,
      currentAgendaItem: { id: 2, title: "Treasurer's report", status: 'active' },
    };
    const actions = chairActions(state, 2);
    expect(actions.map((a) => a.id)).toEqual(['complete-item', 'put-item', 'adjourn']);
    expect(actions.map((a) => a.tone)).toEqual(['primary', 'secondary', 'secondary']);
    expect(actions[1].make()).toMatchObject({
      type: 'MAKE_MOTION',
      motionType: 'mainMotion',
      text: "Approve: Treasurer's report",
      // The presiding officer sends it (the server checks who), recorded as put by the chair
      moverId: 2,
      putByChair: true,
    });
    expect(chairActions(state, null).map((a) => a.id)).toEqual(['complete-item', 'adjourn']);
  });

  it('adjourns from the last item without completing it first', () => {
    const state: MeetingState = {
      ...adopted,
      agenda: [
        { id: 1, title: 'Call to order', status: 'completed' },
        { id: 2, title: 'Adjournment', status: 'active' },
      ],
      currentAgendaItem: { id: 2, title: 'Adjournment', status: 'active' },
    };
    const actions = chairActions(state, 2);
    expect(actions.map((a) => [a.id, a.tone])).toEqual([
      ['adjourn', 'primary'],
      ['complete-item', 'secondary'],
      ['put-item', 'secondary'],
    ]);
    expect(actions[0].make()).toMatchObject({ type: 'END_MEETING' });
    // Adjourning asks first, wherever it is offered
    expect(actions[0].confirm).toBe(true);
    expect(chairActions(adopted, 2).find((a) => a.id === 'adjourn')?.confirm).toBe(true);
    expect(
      chairActions(state, 2)
        .filter((a) => a.confirm)
        .map((a) => a.id),
    ).toEqual(['adjourn']);
  });

  it('offers no adjournment while a question is pending, a vote is open or a ballot runs', () => {
    const during: MeetingState = {
      ...adopted,
      currentAgendaItem: { id: 2, title: "Treasurer's report", status: 'active' },
    };
    expect(ids({ ...during, currentMotion: motion('mainMotion') })).not.toContain('adjourn');
    expect(
      ids({ ...during, pendingSecond: motion('mainMotion', { secondedBy: null }) }),
    ).not.toContain('adjourn');
    expect(ids({ ...during, currentMotion: motion('mainMotion'), votingOpen: true })).toEqual([]);
    expect(
      ids({
        ...during,
        currentElection: {
          id: 1,
          position: 'Treasurer',
          candidates: [],
          requiredVotes: 'majority',
          votingInProgress: true,
          ballotResults: {},
          votersWhoVoted: [],
          elected: null,
        },
      }),
    ).toEqual([]);
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

  describe('business from the floor', () => {
    const floor = (state: MeetingState) => floorActions(state).map((a) => a.id);

    it('records a motion from the floor when nothing is pending, on an item or between them', () => {
      expect(floor(adopted)).toEqual(['floor-motion']);
      expect(
        floor({
          ...adopted,
          currentAgendaItem: { id: 2, title: "Treasurer's report", status: 'active' },
        }),
      ).toEqual(['floor-motion']);
      expect(floorActions(adopted)[0]).toMatchObject({
        label: 'A motion from the floor',
        tone: 'secondary',
      });
    });

    it('records a second from the floor while a motion waits for one', () => {
      expect(
        floor({ ...adopted, pendingSecond: motion('mainMotion', { secondedBy: null }) }),
      ).toEqual(['floor-second']);
      expect(
        floorActions({ ...adopted, pendingSecond: motion('mainMotion', { secondedBy: null }) })[0]
          .label,
      ).toBe('Seconded from the floor');
    });

    it('records nothing before the call to order, after the adjournment or while a question is up', () => {
      expect(floor(initialState)).toEqual([]);
      expect(floor({ ...adopted, meetingStage: 'adjourned', meetingActive: false })).toEqual([]);
      expect(floor({ ...adopted, currentMotion: motion('mainMotion') })).toEqual([]);
      expect(floor({ ...adopted, currentMotion: motion('mainMotion'), votingOpen: true })).toEqual(
        [],
      );
      expect(
        floor({ ...adopted, nominationsOpen: true, currentNominationPosition: 'Treasurer' }),
      ).toEqual([]);
    });
  });

  it('leaves an election to the election card, but for adjourning, from nominations to the declaration', () => {
    const elections: Partial<MeetingState>[] = [
      { nominationsOpen: true, currentNominationPosition: 'Director' },
      // Nominations closed, the ballot still to open
      { currentNominationPosition: 'Director' },
      {
        currentElection: {
          id: 1,
          position: 'Director',
          candidates: [{ name: 'Carmen Diaz', id: 5 }],
          requiredVotes: 'majority',
          votingInProgress: false,
          ballotResults: { 'Carmen Diaz': 2 },
          votersWhoVoted: [3, 4],
          elected: 'Carmen Diaz',
        },
      },
    ];
    for (const election of elections) {
      expect(ids({ ...adopted, ...election })).toEqual(['adjourn']);
      expect(floorActions({ ...adopted, ...election })).toEqual([]);
    }
  });
});
