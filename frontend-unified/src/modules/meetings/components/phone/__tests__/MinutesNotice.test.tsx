import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import { MinutesNotice } from '../MinutesNotice';

const atTheMinutes: MeetingState = {
  ...initialState,
  meetingActive: true,
  meetingStage: 'minutes-approval',
  minutesFromPreviousMeeting: '## Minutes of the 2025 Annual Meeting\n\nText.',
};

describe('MinutesNotice', () => {
  it("names the minutes and asks the chair's question", () => {
    render(<MinutesNotice state={atTheMinutes} />);
    expect(screen.getByText('Minutes of the 2025 Annual Meeting')).toBeTruthy();
    expect(screen.getByText('Any corrections?')).toBeTruthy();
  });

  it('labels the notice only when the agenda line above does not say it already', () => {
    // The minutes stage without an agenda item: the label says what the business is
    const { unmount } = render(<MinutesNotice state={atTheMinutes} />);
    expect(screen.getByText('Approval of the minutes')).toBeTruthy();
    unmount();

    render(
      <MinutesNotice
        state={{
          ...atTheMinutes,
          meetingStage: 'new-business',
          currentAgendaItem: {
            id: 2,
            title: 'Approval of the minutes of the 2025 annual meeting',
            status: 'active',
          },
        }}
      />,
    );
    expect(screen.queryByText('Approval of the minutes')).toBeNull();
    expect(screen.getByRole('region', { name: 'Approval of the minutes' })).toBeTruthy();
  });

  it('says once they are approved', () => {
    render(
      <MinutesNotice
        state={{
          ...atTheMinutes,
          minutesApproved: true,
          minutesApproval: { corrections: null, timestamp: '' },
        }}
      />,
    );
    expect(screen.getByText('Approved as read')).toBeTruthy();
  });

  it('shows nothing at any other time', () => {
    const { container } = render(
      <MinutesNotice state={{ ...atTheMinutes, meetingStage: 'new-business' }} />,
    );
    expect(container.textContent).toBe('');
  });
});
