import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { MOTIONS } from '@robbie-bylawyer/shared/constants';
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import { PendingMotionPanel } from '../PendingMotionPanel';

describe('PendingMotionPanel', () => {
  it('gives the chair a way to act on a call for the orders of the day', () => {
    const motion = {
      ...MOTIONS.callOrderDay,
      id: 1,
      type: 'callOrderDay',
      text: 'I call for the orders of the day.',
      mover: 'Member',
      moverId: 2,
      secondedBy: null,
      status: 'active' as const,
    };
    const state: MeetingState = {
      ...initialState,
      meetingActive: true,
      currentMotion: motion,
      motionStack: [motion],
    };
    const dispatch = vi.fn();
    render(<PendingMotionPanel state={state} dispatch={dispatch} />);

    fireEvent.click(screen.getByRole('button', { name: /orders of the day/i }));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'CHAIR_RULING' }));
  });
});
