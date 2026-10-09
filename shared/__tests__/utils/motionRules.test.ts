import { describe, it, expect } from 'vitest';
import { MOTIONS, RETIRED_MOTIONS } from '../../constants/index.js';
import { initialState } from '../../reducer/index.js';
import { getValidMotions, motionOutOfOrder, OFFERED_MOTIONS } from '../../utils/index.js';
import type { MeetingState, Motion } from '../../types/index.js';

let nextId = 1;
const motion = (type: string, fields: Partial<Motion> = {}): Motion => ({
  ...MOTIONS[type],
  id: nextId++,
  type,
  text: `A ${type}`,
  mover: 'Alice',
  moverId: 3,
  secondedBy: 'Ben',
  status: 'active',
  ...fields,
});

/** In session with the agenda adopted, and these motions pending (the last is the question) */
const pending = (motions: Motion[] = [], fields: Partial<MeetingState> = {}): MeetingState => ({
  ...initialState,
  meetingActive: true,
  meetingStage: 'new-business',
  agendaAdopted: true,
  motionStack: motions,
  currentMotion: motions.at(-1) ?? null,
  ...fields,
});

const reason = (state: MeetingState, type: string) => motionOutOfOrder(state, type)?.reason ?? null;
const offered = (state: MeetingState) => getValidMotions(state).map((m) => m.key);

describe('motionOutOfOrder', () => {
  it('refuses every motion Robbie no longer has, and moving a request to withdraw', () => {
    const state = pending([motion('mainMotion')]);
    for (const type of Object.keys(RETIRED_MOTIONS)) {
      expect(motionOutOfOrder(state, type)?.kind, type).toBe('unknown');
    }
    expect(reason(state, 'withdrawMotion')).toBe(
      "Permission to withdraw isn't offered in Robbie: the mover asks to withdraw their motion",
    );
    // Every motion offered somewhere is one Robbie keeps
    for (const type of Object.keys(MOTIONS)) {
      if (!OFFERED_MOTIONS.includes(type)) {
        expect(offered(pending([])), type).not.toContain(type);
      }
    }
  });

  it('allows nothing outside a session, in a recess, or once an adjournment has carried', () => {
    expect(reason({ ...pending(), meetingActive: false }, 'mainMotion')).toBe(
      'The meeting is not in session',
    );
    expect(reason(pending([], { recess: { since: '8:02 PM', until: null } }), 'adjourn')).toBe(
      'The meeting is in recess',
    );
    expect(reason(pending([], { adjournmentCarried: true }), 'pointOrder')).toBe(
      'The meeting has voted to adjourn: the chair declares it adjourned',
    );
  });

  it('allows a point of order during a vote and while a motion awaits a second, and nothing else', () => {
    const main = motion('mainMotion');
    const voting = pending([main], { votingOpen: true });
    expect(offered(voting)).toEqual(['pointOrder']);
    expect(reason(voting, 'adjourn')).toBe(
      'No motion can be made while a vote or a ballot is open',
    );
    const awaiting = pending([], { pendingSecond: motion('mainMotion', { secondedBy: null }) });
    expect(offered(awaiting)).toEqual(['pointOrder']);
    expect(reason(awaiting, 'recess')).toBe('Another motion is waiting for a second');
  });

  it('holds everything while a point of order is before the chair', () => {
    const state = pending([motion('mainMotion'), motion('pointOrder', { secondedBy: null })]);
    expect(offered(state)).toEqual([]);
    expect(reason(state, 'pointOrder')).toBe('The chair is ruling on a point of order');
    expect(reason(state, 'adjourn')).toBe('The chair rules on the point of order first');
  });

  it('takes one main motion at a time, and none before the agenda is adopted', () => {
    expect(reason(pending([motion('mainMotion')]), 'mainMotion')).toBe(
      'One main motion at a time: settle the pending motion first',
    );
    expect(reason(pending([motion('mainMotion')]), 'bylawAmendment')).toBe(
      'One main motion at a time: settle the pending motion first',
    );
    expect(reason(pending([], { agendaAdopted: false }), 'mainMotion')).toBe(
      'Adopt the agenda first',
    );
    expect(reason(pending(), 'mainMotion')).toBeNull();
  });

  it('takes one primary and one secondary amendment, on a main motion only', () => {
    const main = motion('mainMotion');
    const amendment = motion('amend', {
      textAmendment: { form: 'strikeInsert', strike: 'May', insert: 'June' },
    });
    expect(reason(pending([main]), 'amend')).toBeNull();
    expect(reason(pending([main]), 'amendAmendment')).toBe(
      'Amend the amendment applies to a pending amendment',
    );
    expect(reason(pending([main, amendment]), 'amend')).toBe(
      'An amendment is pending: amend it, or decide it first',
    );
    expect(reason(pending([main, amendment]), 'amendAmendment')).toBeNull();
    const secondary = motion('amendAmendment');
    expect(reason(pending([main, amendment, secondary]), 'amendAmendment')).toBe(
      'Only one amendment of an amendment at a time',
    );
    expect(reason(pending([main, amendment, secondary]), 'amend')).toBe(
      'An amendment of the amendment is pending: decide it first',
    );
    // An amendment that only strikes has no words for a secondary amendment to change
    const striking = motion('amend', { textAmendment: { form: 'strike', strike: 'May' } });
    expect(reason(pending([main, striking]), 'amendAmendment')).toBe(
      'The amendment inserts no words to amend',
    );
    // A bylaw amendment's words are fixed (A1); the agenda has its own amendment
    expect(reason(pending([motion('bylawAmendment')]), 'amend')).toBe(
      "A bylaw amendment's words come from its text: withdraw it and move it again",
    );
  });

  it('closes debate only on a debatable question, and after it only adjourn, recess and points', () => {
    const main = motion('mainMotion');
    expect(reason(pending([main, motion('recess')]), 'previousQuestion')).toBe(
      'Close debate applies to a debatable question',
    );
    expect(reason(pending([main]), 'previousQuestion')).toBeNull();
    const closed = pending([motion('mainMotion', { debateClosed: true })]);
    expect(offered(closed)).toEqual(['recess', 'adjourn', 'pointOrder']);
    expect(reason(closed, 'amend')).toBe('Debate is closed: the question is put to the vote now');
  });

  it('postpones and refers the main motion with its amendments, not past a higher motion', () => {
    const main = motion('mainMotion');
    const amendment = motion('amend');
    expect(reason(pending([main, amendment]), 'referCommittee')).toBeNull();
    expect(reason(pending([main, amendment]), 'postponeDefinite')).toBeNull();
    expect(reason(pending([main, amendment]), 'postponeIndefinitely')).toBe(
      'Postpone indefinitely is not in order while Amend is pending',
    );
    expect(reason(pending([main, motion('previousQuestion')]), 'referCommittee')).toBe(
      'Refer to a committee or the board is not in order while Close debate is pending',
    );
    expect(reason(pending([main, motion('postponeDefinite')]), 'referCommittee')).toBe(
      'Refer to a committee or the board is not in order while Postpone is pending',
    );
    expect(reason(pending([]), 'postponeDefinite')).toBe(
      'There is no motion for postpone to apply to',
    );
  });

  it('ranks adjourn above recess, and both above any pending question', () => {
    expect(reason(pending([motion('mainMotion'), motion('adjourn')]), 'recess')).toBe(
      'Recess is not in order while Adjourn is pending',
    );
    expect(reason(pending([motion('mainMotion'), motion('recess')]), 'adjourn')).toBeNull();
    expect(
      reason(pending([motion('mainMotion'), motion('previousQuestion')]), 'recess'),
    ).toBeNull();
  });

  it('takes an appeal only at once after a ruling', () => {
    expect(reason(pending([]), 'appeal')).toBe(
      'An appeal is made at once, after a ruling of the chair',
    );
    const ruled = pending([], {
      lastChairRuling: { ruling: 'The point is well taken.', motionText: 'x', timestamp: 't' },
    });
    expect(reason(ruled, 'appeal')).toBeNull();
  });

  it('lets only adjourn, recess and a point of order interrupt an election', () => {
    const state = pending([], { nominationsOpen: true, currentNominationPosition: 'Director' });
    expect(offered(state)).toEqual(['recess', 'adjourn', 'pointOrder']);
    expect(reason(state, 'mainMotion')).toBe('Finish or set aside the election first');
  });

  it('takes agenda motions only while the agenda is objected to or its adoption is pending', () => {
    const objected = pending([], { agendaAdopted: false, agendaObjection: true });
    expect(offered(objected)).toEqual([
      'adoptAgenda',
      'amendAgenda',
      'recess',
      'adjourn',
      'pointOrder',
    ]);
    const adopting = pending([motion('adoptAgenda')], {
      agendaAdopted: false,
      agendaObjection: true,
    });
    expect(reason(adopting, 'amendAgenda')).toBeNull();
    expect(reason(adopting, 'amend')).toBe('Use Amend the agenda to change the agenda');
    expect(reason(pending(), 'adoptAgenda')).toBe('The agenda is adopted');
  });
});

describe('a board meeting', () => {
  const board = pending([], { kind: 'board', board: { directors: 5 } });

  it('refuses a bylaw amendment, which the members make', () => {
    expect(motionOutOfOrder(board, 'bylawAmendment')).toEqual({
      reason: "The members amend the bylaws: a bylaw amendment isn't moved in a board meeting",
      kind: 'not-offered',
    });
    expect(offered(board)).not.toContain('bylawAmendment');
    expect(offered(board)).toContain('mainMotion');
  });

  it('offers it in a meeting of the members', () => {
    expect(offered(pending())).toContain('bylawAmendment');
  });
});
