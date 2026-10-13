import { describe, it, expect } from 'vitest';
import { meetingReducer, initialState } from '../../reducer/index.js';
import { stepName } from '../../constants/index.js';
import type { MeetingAction, MeetingState, Member, Motion } from '../../types/index.js';

const dana: Member = {
  id: 1,
  name: 'Dana Okafor',
  role: 'chair',
  present: true,
  presentBy: 'device',
};
const alice: Member = {
  id: 2,
  name: 'Alice Brennan',
  role: 'member',
  present: true,
  presentBy: 'device',
};

const motion = (fields: Partial<Motion>): Motion =>
  ({
    id: 7,
    type: 'mainMotion',
    text: 'Resurface the pool',
    mover: 'Alice Brennan',
    moverId: 2,
    secondedBy: 'Ben Whitaker',
    status: 'active',
    moverHasSpoken: false,
    vote: 'majority',
    ...fields,
  }) as Motion;

const meeting = (fields: Partial<MeetingState> = {}): MeetingState => ({
  ...initialState,
  meetingActive: true,
  agendaAdopted: true,
  members: [dana, alice],
  ...fields,
});

const run = (state: MeetingState, ...actions: MeetingAction[]) =>
  actions.reduce(meetingReducer, state);

describe('the last step', () => {
  it('is an objection recorded from the floor, not one sent from a phone', () => {
    const asked = meeting({
      currentMotion: motion({}),
      motionStack: [motion({})],
      unanimousConsentPending: true,
    });
    const floor = run(asked, {
      type: 'OBJECT_TO_CONSENT',
      objector: '',
      fromFloor: true,
      timestamp: '7:01',
    });
    expect(floor.lastStep?.type).toBe('OBJECT_TO_CONSENT');
    const undone = run(floor, { type: 'UNDO_LAST_STEP', timestamp: '7:02' });
    expect(undone.unanimousConsentPending).toBe(true);
    expect(undone.meetingLog.at(-1)?.message).toBe('The chair undid recording the objection.');

    const phone = run(asked, {
      type: 'OBJECT_TO_CONSENT',
      objector: 'Alice Brennan',
      objectorId: 2,
      timestamp: '7:01',
    });
    expect(phone.lastStep).toBeNull();
  });

  it('is never a bylaw amendment decided: the server applies it to the bylaws', () => {
    const bylaw = motion({ type: 'bylawAmendment' });
    const decided = run(
      meeting({ currentMotion: bylaw, motionStack: [bylaw], unanimousConsentPending: true }),
      { type: 'UNANIMOUS_CONSENT_PASSED', timestamp: '7:01' },
    );
    expect(decided.lastStep ?? null).toBeNull();
  });

  it('takes away what the step added, and stays while the room is counted', () => {
    const before = meeting({ agendaAdopted: false });
    delete (before as Partial<MeetingState>).agendaAdoption;
    const adopted = run(
      before,
      { type: 'ADOPT_AGENDA', timestamp: '7:01' },
      { type: 'SET_HEADCOUNT', count: 4, names: [], timestamp: '7:02' },
    );
    expect(adopted.lastStep?.added).toContain('agendaAdoption');
    const undone = run(adopted, { type: 'UNDO_LAST_STEP', timestamp: '7:03' });
    expect(undone.agendaAdopted).toBe(false);
    expect('agendaAdoption' in undone).toBe(false);
    expect(undone.headcount).toBe(4);
  });

  it('stays when a step is refused, and is gone when the meeting moves on', () => {
    const called = run(meeting({ agenda: [{ id: 1, title: 'New business', status: 'pending' }] }), {
      type: 'CALL_AGENDA_ITEM',
      id: 1,
      timestamp: '7:01',
    });
    expect(called.lastStep?.type).toBe('CALL_AGENDA_ITEM');
    // Nothing to undo after undoing, so undoing again changes nothing
    const undone = run(called, { type: 'UNDO_LAST_STEP', timestamp: '7:02' });
    expect(run(undone, { type: 'UNDO_LAST_STEP', timestamp: '7:03' })).toBe(undone);
    const moved = run(called, {
      type: 'MAKE_MOTION',
      motionType: 'mainMotion',
      text: 'Paint it',
      motionId: 9,
      moverId: 2,
      mover: 'Alice Brennan',
      timestamp: '7:02',
    } as MeetingAction);
    expect(moved.lastStep).toBeNull();
  });

  it('has a name for the console, or a plain one', () => {
    expect(stepName('DECLINE_SECOND')).toBe('declaring no second');
    expect(stepName('CAST_VOTE')).toBe('the last step');
  });
});
