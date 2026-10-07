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
