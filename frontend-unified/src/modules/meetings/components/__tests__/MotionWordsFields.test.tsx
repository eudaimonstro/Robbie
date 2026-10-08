import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { MOTIONS } from '@robbie-bylawyer/shared/constants';
import type { MeetingState, Motion } from '@robbie-bylawyer/shared/types';
import { MotionWordsFields } from '../MotionWordsFields';
import { EMPTY_DRAFT, motionFromDraft, type MotionDraft } from '../../utils/motionDraft';

const pool: Motion = {
  ...MOTIONS.mainMotion,
  id: 1,
  type: 'mainMotion',
  text: 'Resurface the pool for $40,000',
  mover: 'Alice Brennan',
  moverId: 3,
  secondedBy: 'Ben Whitaker',
  status: 'active',
};
const pending: MeetingState = {
  ...initialState,
  meetingActive: true,
  agendaAdopted: true,
  currentMotion: pool,
  motionStack: [pool],
};

function Fields({ type }: { type: string }) {
  const [draft, setDraft] = useState<MotionDraft>(EMPTY_DRAFT);
  return <MotionWordsFields type={type} state={pending} draft={draft} onChange={setDraft} />;
}

describe('the words of a motion', () => {
  it('amends by striking and inserting, showing the motion as it would read', () => {
    render(<Fields type="amend" />);
    expect(screen.getByText('“Resurface the pool for $40,000”')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Words to strike'), { target: { value: '$40,000' } });
    fireEvent.change(screen.getByLabelText('Words to insert in their place'), {
      target: { value: '$35,000' },
    });
    expect(screen.getByText('Resurface the pool for $35,000')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Add words'));
    expect(screen.getByLabelText('After the words (leave empty to add at the end)')).toBeTruthy();
  });

  it('makes an amendment with its change, worded from it, or says what is missing', () => {
    const draft = { ...EMPTY_DRAFT, strike: '$40,000', insert: '$35,000' };
    expect(motionFromDraft('amend', draft, pending)).toEqual({
      text: 'Strike “$40,000” and insert “$35,000”',
      details: { textAmendment: { form: 'strikeInsert', strike: '$40,000', insert: '$35,000' } },
    });
    expect(motionFromDraft('amend', { ...draft, strike: 'June' }, pending)).toEqual({
      problem: '"June" is not in the words being amended',
    });
  });

  it('postpones to the next meeting or to a time later in this one, and refers to whom', () => {
    expect(motionFromDraft('postponeDefinite', EMPTY_DRAFT, pending)).toEqual({
      text: 'Postpone it to the next meeting',
      details: { postponeTo: { kind: 'next-meeting' } },
    });
    expect(
      motionFromDraft('postponeDefinite', { ...EMPTY_DRAFT, postpone: 'later' }, pending),
    ).toEqual({ problem: 'Say when' });
    expect(
      motionFromDraft('referCommittee', { ...EMPTY_DRAFT, referTo: ' the board ' }, pending),
    ).toEqual({ text: 'Refer it to the board', details: { referTo: 'the board' } });
  });

  it('needs the words of a main motion and a point of order; the rest have their phrase', () => {
    expect(motionFromDraft('mainMotion', EMPTY_DRAFT, initialState)).toEqual({
      problem: 'Write the motion',
    });
    expect(motionFromDraft('pointOrder', EMPTY_DRAFT, pending)).toEqual({
      problem: 'Say what is out of order',
    });
    expect(motionFromDraft('previousQuestion', EMPTY_DRAFT, pending)).toEqual({
      text: 'I move the previous question.',
      details: {},
    });
  });
});
