import { describe, it, expect, vi } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { MeetingState } from '@robbie-bylawyer/shared/types';

const findMeetingPacket = vi.hoisted(() =>
  vi.fn(async () => ({ organizationId: 'org', chairUserId: null })),
);
vi.mock('../socket/meetingPacket.js', () => ({
  findMeetingPacket,
  findOrgPeople: async () =>
    new Map([[2, { role: 'member', name: 'Bo', email: 'bo@example.org' }]]),
}));

const { prepareAttendanceAction } = await import('../socket/attendanceActions.js');

describe('prepareAttendanceAction', () => {
  it('reads the roster through the packet, even for a state saved without its organization', async () => {
    // A live state from before it recorded its organization
    const state: MeetingState = { ...initialState, meetingCode: 'OLD001', organizationId: null };
    const prepared = await prepareAttendanceAction('OLD001', state, {
      type: 'MARK_PRESENT',
      userId: 2,
      timestamp: '',
    });
    expect(findMeetingPacket).toHaveBeenCalledWith('OLD001');
    expect(prepared).toEqual({
      action: expect.objectContaining({
        member: { id: 2, name: 'Bo', role: 'member', present: true },
      }),
    });
  });
});
