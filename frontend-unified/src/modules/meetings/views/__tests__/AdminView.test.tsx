import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { MeetingState, Member } from '@robbie-bylawyer/shared/types';

const firstAdmin: Member = { id: 1, name: 'First Admin', role: 'admin', present: true };
const secondAdmin: Member = { id: 2, name: 'Second Admin', role: 'admin', present: true };

vi.mock('../../context/SocketContext', () => ({ useSocket: () => ({ currentUser: secondAdmin }) }));
vi.mock('../../context/OrganizationBridge', () => ({
  useMeetingOrganization: () => ({ currentOrganization: null }),
}));

const { AdminView } = await import('../AdminView');

describe('AdminView with two admins', () => {
  it('acts as the signed-in admin, not the first admin listed', () => {
    const state: MeetingState = {
      ...initialState,
      meetingActive: true,
      members: [firstAdmin, secondAdmin],
      nominationsOpen: true,
      currentNominationPosition: 'Treasurer',
      nominations: [
        {
          id: 5,
          position: 'Treasurer',
          nomineeName: 'Second Admin',
          nomineeId: 2,
          nominatedBy: 'First Admin',
          nominatorId: 1,
          timestamp: '',
          declined: false,
        },
      ],
    };
    render(<AdminView state={state} dispatch={vi.fn()} />);

    // Only the nominee may decline, and the signed-in admin is the nominee
    expect(screen.queryByRole('button', { name: /decline/i })).not.toBeNull();
  });
});
