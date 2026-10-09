import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { MOTIONS } from '@robbie-bylawyer/shared/constants';
import type { MeetingState, Member, Motion } from '@robbie-bylawyer/shared/types';

vi.mock('../../../context/SocketContext', () => ({ useSocket: () => ({ error: null }) }));

const { FloorMotionDialog, FloorSecondForm } = await import('../FloorBusiness');

const people: Member[] = [
  { id: 1, name: 'Dana Okafor', role: 'chair', present: true, presentBy: 'device' },
  { id: 3, name: 'Alice Brennan', role: 'member', present: true, presentBy: 'device' },
  { id: 6, name: 'Pat Lindqvist', role: 'admin', present: true, presentBy: 'chair' },
  { id: 4, name: 'Ben Whitaker', role: 'observer', present: true, presentBy: 'device' },
  { id: 7, name: 'Ray Castillo', role: 'admin', nonVoting: true, present: true },
];
const board: MeetingState = {
  ...initialState,
  meetingActive: true,
  meetingStage: 'new-business',
  agendaAdopted: true,
  kind: 'board',
  board: { directors: 4 },
  members: people,
};
const dispatch = vi.fn(async () => true);

describe('floor business in a board meeting', () => {
  beforeEach(() => vi.clearAllMocks());

  it('records a motion only for a director present, never a name typed', () => {
    render(
      <FloorMotionDialog
        isOpen
        onClose={vi.fn()}
        state={board}
        dispatch={dispatch}
        presidingId={1}
        meId={7}
      />,
    );
    fireEvent.change(screen.getByLabelText('The motion'), { target: { value: 'Hire a gardener' } });
    fireEvent.change(screen.getByLabelText('Who moved it'), { target: { value: 'An owner' } });
    expect(
      screen.getByText('No director present by that name: mark them present first.'),
    ).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Record the motion' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    // The directors, the chair of a small board among them; not the observer or Ray
    fireEvent.change(screen.getByLabelText('Who moved it'), { target: { value: '' } });
    const offered = screen
      .getByRole('list', { name: 'Members present' })
      .querySelectorAll('button span:first-child');
    expect([...offered].map((span) => span.textContent)).toEqual([
      'Dana Okafor',
      'Alice Brennan',
      'Pat Lindqvist',
    ]);
  });

  it('records a second only for a director named', () => {
    const awaiting: Motion = {
      ...MOTIONS.mainMotion,
      id: 1,
      type: 'mainMotion',
      text: 'Hire a gardener',
      mover: 'Alice Brennan',
      moverId: 3,
      secondedBy: null,
      status: 'pending',
    };
    render(
      <FloorSecondForm
        state={{ ...board, pendingSecond: awaiting }}
        dispatch={dispatch}
        presidingId={1}
        meId={7}
        onDone={vi.fn()}
      />,
    );
    const record = screen.getByRole('button', { name: 'Record the second' }) as HTMLButtonElement;
    expect(record.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Who seconded it'), { target: { value: '6' } });
    expect(record.disabled).toBe(false);
    fireEvent.click(record);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SECOND_FROM_FLOOR', seconderMemberId: 6 }),
    );
  });
});
