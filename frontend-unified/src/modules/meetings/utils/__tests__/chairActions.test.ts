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

  it('leaves the approval of the minutes to their card until they are approved', () => {
    const state: MeetingState = {
      ...adopted,
      currentAgendaItem: { id: 2, title: 'Approval of the minutes', status: 'active' },
      previousMinutesId: 'm1',
    };
    const tones = (s: MeetingState) => chairActions(s, 2).map((a) => [a.id, a.tone]);
    expect(tones(state)).toEqual([
      ['complete-item', 'secondary'],
      ['put-item', 'secondary'],
      ['adjourn', 'secondary'],
    ]);
    expect(tones({ ...state, minutesApproved: true })[0]).toEqual(['complete-item', 'primary']);
  });

  it('keeps Complete the item first at an item that only gives itself minutes', () => {
    const tones = (s: MeetingState) => chairActions(s, 2).map((a) => [a.id, a.tone]);
    const timed: MeetingState = {
      ...adopted,
      currentAgendaItem: { id: 2, title: "Treasurer's report (5 minutes)", status: 'active' },
      previousMinutesId: 'm1',
    };
    expect(tones(timed)[0]).toEqual(['complete-item', 'primary']);
    // No minutes before the meeting: an item about them is an ordinary item
    const none: MeetingState = {
      ...adopted,
      currentAgendaItem: { id: 2, title: 'Approval of the minutes', status: 'active' },
    };
    expect(tones(none)[0]).toEqual(['complete-item', 'primary']);
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

  it('offers no adjournment while a question is pending, a vote is open or a ballot runs (the ballot can be set aside)', () => {
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
    ).toEqual(['set-aside']);
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
    expect(ids({ ...state, unanimousConsentPending: true })).toEqual([
      'adopted',
      'floor-objection',
    ]);
    const [, objection] = chairActions({ ...state, unanimousConsentPending: true }, 2);
    expect(objection.label).toBe('Objection from the floor');
    expect(objection.make()).toMatchObject({ type: 'OBJECT_TO_CONSENT', fromFloor: true });
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
      'Rule the point well taken',
      'Rule the point not well taken',
    ]);
  });

  it('rules on a point of order raised during a vote or while a motion awaits a second', () => {
    const point = motion('pointOrder', { secondedBy: null });
    const main = motion('mainMotion');
    const voting = {
      ...adopted,
      currentMotion: point,
      motionStack: [main, point],
      votingOpen: true,
    };
    expect(ids(voting)).toEqual(['sustain', 'out-of-order', 'overrule']);
    expect(chairActions(voting, 2)[1]).toMatchObject({ label: 'Rule the motion out of order' });
    expect(chairActions(voting, 2)[1].make()).toMatchObject({
      type: 'CHAIR_RULING',
      ruling: 'sustain',
      outOfOrder: true,
    });
    const awaiting = {
      ...adopted,
      currentMotion: point,
      motionStack: [point],
      pendingSecond: motion('mainMotion', { secondedBy: null }),
    };
    expect(ids(awaiting)).toEqual(['sustain', 'out-of-order', 'overrule']);
    // Nothing is recorded from the floor until the chair rules
    expect(floorActions(awaiting)).toEqual([]);
  });

  it('leaves closing a vote to the vote panel, and an election to the election panel', () => {
    expect(ids({ ...adopted, currentMotion: motion('mainMotion'), votingOpen: true })).toEqual([]);
  });

  it('declares the meeting adjourned once an adjournment carries, and nothing else', () => {
    const pending = { ...adopted, currentMotion: motion('mainMotion'), adjournmentCarried: true };
    const actions = chairActions(pending, 2);
    expect(actions.map((a) => a.label)).toEqual(['Declare the meeting adjourned']);
    expect(actions[0]).toMatchObject({ tone: 'primary' });
    expect(actions[0].confirm).toBeUndefined();
    expect(actions[0].make()).toMatchObject({ type: 'END_MEETING' });
  });

  it('resumes the meeting from a recess, or adjourns it', () => {
    const recess = { ...adopted, recess: { since: '8:02 PM', until: '8:15 PM' } };
    expect(ids(recess)).toEqual(['resume', 'adjourn']);
    expect(chairActions(recess, 2)[0].make()).toMatchObject({ type: 'RESUME_MEETING' });
  });

  it('takes up a question postponed to later in the meeting when the floor is clear', () => {
    const postponed = {
      ...adopted,
      postponedMotions: [{ motions: [motion('mainMotion', { id: 9 })], when: '8:30 PM' }],
    };
    const takeUp = chairActions(postponed, 2).find((a) => a.id === 'take-up-9');
    expect(takeUp?.label).toBe('Take up: Approve the pool contract');
    expect(takeUp?.make()).toMatchObject({ type: 'TAKE_UP_POSTPONED', motionId: 9 });
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
      ).toEqual(['floor-second', 'floor-motion']);
      expect(
        floorActions({ ...adopted, pendingSecond: motion('mainMotion', { secondedBy: null }) })[0]
          .label,
      ).toBe('Seconded from the floor');
    });

    it('records nothing before the call to order or after the adjournment', () => {
      expect(floor(initialState)).toEqual([]);
      expect(floor({ ...adopted, meetingStage: 'adjourned', meetingActive: false })).toEqual([]);
    });

    it('records a motion from the floor while a question is up: an amendment, a point of order in a vote, adjourning in an election', () => {
      const pending = { ...adopted, currentMotion: motion('mainMotion') };
      pending.motionStack = [pending.currentMotion];
      expect(floor(pending)).toEqual(['floor-motion']);
      expect(floor({ ...pending, votingOpen: true })).toEqual(['floor-motion']);
      expect(
        floor({ ...adopted, nominationsOpen: true, currentNominationPosition: 'Treasurer' }),
      ).toEqual(['floor-motion']);
    });
  });

  it('leaves an election to the election card, but for setting it aside and adjourning, from nominations to the declaration', () => {
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
      expect(ids({ ...adopted, ...election })).toEqual(['set-aside', 'adjourn']);
      // Only adjourn, recess and a point of order are in order: the chair records them
      expect(floorActions({ ...adopted, ...election }).map((a) => a.id)).toEqual(['floor-motion']);
    }
  });

  it('sets the election aside after asking first', () => {
    const [setAside] = chairActions({ ...adopted, currentNominationPosition: 'Director' }, 2);
    expect(setAside).toMatchObject({
      label: 'Set the election aside',
      tone: 'secondary',
      confirm: true,
    });
    expect(setAside.make()).toMatchObject({ type: 'SET_ASIDE_ELECTION' });
  });

  it('puts a privileged or incidental motion made during an election before the election', () => {
    const nominating: MeetingState = {
      ...adopted,
      nominationsOpen: true,
      currentNominationPosition: 'Director',
    };
    expect(ids({ ...nominating, pendingSecond: motion('recess', { secondedBy: null }) })).toEqual([
      'no-second',
    ]);
    expect(ids({ ...nominating, currentMotion: motion('recess') })).toEqual([
      'open-vote',
      'consent',
    ]);
    expect(ids({ ...nominating, currentMotion: motion('pointOrder') })).toEqual([
      'sustain',
      'overrule',
    ]);
  });
});
