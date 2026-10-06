import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { MeetingState, Member } from '@robbie-bylawyer/shared/types';
import { ChairView } from '../ChairView';

const admin: Member = { id: 1, name: 'Admin', role: 'admin', present: true };
const member: Member = { id: 2, name: 'Member', role: 'member', present: true };

// An admin presiding over a meeting with no member in the chair role
const state: MeetingState = {
  ...initialState,
  meetingActive: true,
  members: [admin, member],
  inquiries: [
    {
      id: 7,
      type: 'parliamentary',
      question: 'Is a motion to recess in order?',
      askedBy: 'Member',
      askerId: 2,
      timestamp: '10:00:00',
    },
  ],
  suspendedRules: [
    {
      id: 9,
      rule: 'debate-rules',
      purpose: 'Allow a longer report',
      specificAction: 'Treasurer speaks for 10 minutes',
      scope: 'meeting-remainder',
      suspendedAt: '10:00:00',
      motionId: 5,
    },
  ],
};

describe('ChairView presided over by an admin', () => {
  it('lets the admin answer inquiries', () => {
    render(<ChairView state={state} dispatch={vi.fn()} currentUser={admin} />);
    expect(screen.queryByText(/Is a motion to recess in order\?/)).not.toBeNull();
    expect(screen.queryByPlaceholderText('Enter your answer...')).not.toBeNull();
  });

  it('lets the admin restore a suspended rule', () => {
    render(<ChairView state={state} dispatch={vi.fn()} currentUser={admin} />);
    expect(screen.queryByRole('button', { name: /restore/i })).not.toBeNull();
  });
});
