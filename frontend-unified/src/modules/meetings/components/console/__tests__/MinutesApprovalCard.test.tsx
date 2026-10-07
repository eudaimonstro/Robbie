import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import { MinutesApprovalCard } from '../MinutesApprovalCard';

const MINUTES =
  '# Maple Grove HOA\n\n## Minutes of the 2025 Annual Meeting\n\nWithout a quorum, no business was taken up.';
const atTheMinutes: MeetingState = {
  ...initialState,
  meetingActive: true,
  meetingStage: 'new-business',
  currentAgendaItem: {
    id: 2,
    title: 'Approval of the minutes of the 2025 annual meeting',
    status: 'active',
  },
  minutesFromPreviousMeeting: MINUTES,
  previousMinutesId: 'm1',
};

const dispatch = vi.fn();

describe('MinutesApprovalCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the minutes and approves them as read', () => {
    render(<MinutesApprovalCard state={atTheMinutes} dispatch={dispatch} />);
    // The Now line names the item already: the card starts with the minutes' title
    expect(screen.queryByText('Approval of the minutes')).toBeNull();
    expect(screen.getByRole('region', { name: 'Approval of the minutes' })).toBeTruthy();
    // The title once: the text below it starts after its own heading
    expect(screen.getAllByText('Minutes of the 2025 Annual Meeting')).toHaveLength(1);
    expect(screen.queryByText('Maple Grove HOA')).toBeNull();
    expect(screen.getByText('Without a quorum, no business was taken up.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Approve as read' }));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'APPROVE_MINUTES',
      timestamp: expect.any(String),
    });
  });

  it('approves them with the corrections the room agrees', () => {
    render(<MinutesApprovalCard state={atTheMinutes} dispatch={dispatch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve with corrections' }));
    const approve = screen.getByRole('button', { name: 'Approve with these corrections' });
    expect(approve).toHaveProperty('disabled', true);

    fireEvent.change(screen.getByLabelText('Corrections'), {
      target: { value: ' Twenty-two members were present, not 21 ' },
    });
    fireEvent.click(approve);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'APPROVE_MINUTES',
      corrections: 'Twenty-two members were present, not 21',
      timestamp: expect.any(String),
    });
  });

  it('says once they are approved, and how', () => {
    render(
      <MinutesApprovalCard
        state={{
          ...atTheMinutes,
          minutesApproved: true,
          minutesApproval: { corrections: 'Twenty-two were present', timestamp: '' },
        }}
        dispatch={dispatch}
      />,
    );
    expect(screen.getByText('Minutes approved')).toBeTruthy();
    expect(screen.getByText('With corrections: Twenty-two were present')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve as read' })).toBeNull();
  });

  it('lets minutes read from paper be approved when none were published', () => {
    // No minutes before the meeting: the chair moves to the minutes stage (Order of business)
    render(
      <MinutesApprovalCard
        state={{
          ...atTheMinutes,
          meetingStage: 'minutes-approval',
          currentAgendaItem: null,
          minutesFromPreviousMeeting: '',
          previousMinutesId: null,
        }}
        dispatch={dispatch}
      />,
    );
    expect(screen.getByText('No published minutes are before this meeting')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Approve as read' })).toBeTruthy();
  });

  it('stays out of the way at any other time', () => {
    const { container } = render(
      <MinutesApprovalCard
        state={{ ...atTheMinutes, currentAgendaItem: null }}
        dispatch={dispatch}
      />,
    );
    expect(container.textContent).toBe('');
  });
});
