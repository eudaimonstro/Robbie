import { describe, it, expect, vi } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';

const handleDisconnect = vi.hoisted(() =>
  vi.fn(async (socket: { data: Record<string, unknown> }) => {
    socket.data.meetingCode = null;
  }),
);
vi.mock('../socket/disconnectHandler.js', () => ({ handleDisconnect }));
vi.mock('../db/meetingStorage.js', () => ({
  getStorage: () => ({
    getMeeting: async () => null,
    getOrCreateMeeting: async () => ({ code: 'NEW1', state: initialState, stateVersion: 1 }),
  }),
}));
vi.mock('../bylawyer/services/meetingMinutes.js', () => ({ previousMinutesFor: async () => null }));
vi.mock('../socket/meetingPacket.js', () => ({
  findMeetingPacket: async (code: string) =>
    code === 'NEW1'
      ? {
          robbieCode: 'NEW1',
          organizationId: 'org',
          title: null,
          scheduledFor: null,
          chairUserId: null,
          organization: { name: 'Org', eligibleVoters: 20, quorumPercent: null, quorumCount: 3 },
          agendaItems: [],
        }
      : null,
  findPerson: async () => ({ name: 'Member', email: 'm@x.org', orgRole: 'member' }),
  countRosterVoters: async () => 1,
  stateFromPacket: () => initialState,
}));
vi.mock('../socket/meetingRoles.js', () => ({
  deriveMeetingRole: () => 'member',
  staleRoles: async () => [],
  updateSocketRoles: async () => {},
}));
vi.mock('../socket/stateManager.js', () => ({
  applyAction: async () => ({ success: true, state: initialState, stateVersion: 2, changed: true }),
  getMeetingState: async () => ({ state: initialState, stateVersion: 2 }),
}));
vi.mock('../socket/presenceReconciler.js', () => ({ scheduleReconcile: () => {} }));

const { handleJoinMeeting } = await import('../socket/joinHandler.js');

function fakeSocket(id: string, meetingCode: string | null, userId: number) {
  const emit = vi.fn();
  return {
    id,
    data: { meetingCode, userId, name: 'Member', email: 'm@x.org', role: 'member', sessionId: 's' },
    handshake: { headers: {} },
    join: vi.fn(),
    to: () => ({ emit }),
  };
}
const io = { to: () => ({ emit: vi.fn() }) };

describe('handleJoinMeeting', () => {
  it('leaves the meeting a socket is already in before joining another', async () => {
    const socket = fakeSocket('socket-1', 'OLD1', 7);
    const callback = vi.fn();

    await handleJoinMeeting(socket as never, io as never, { meetingCode: 'NEW1' }, callback);

    // Otherwise it kept receiving the old meeting's updates and stayed present there
    expect(handleDisconnect).toHaveBeenCalledOnce();
    expect(socket.join).toHaveBeenCalledWith('meeting:NEW1');
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('rejects a malformed meeting code without leaving or joining anything', async () => {
    handleDisconnect.mockClear();
    const socket = fakeSocket('socket-2', 'OLD1', 8);
    const callback = vi.fn();

    await handleJoinMeeting(socket as never, io as never, { meetingCode: 'bad code!' }, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(handleDisconnect).not.toHaveBeenCalled();
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('refuses a code without a scheduled meeting', async () => {
    const socket = fakeSocket('socket-3', null, 9);
    const callback = vi.fn();

    await handleJoinMeeting(socket as never, io as never, { meetingCode: 'NOPE01' }, callback);

    expect(callback).toHaveBeenCalledWith({
      success: false,
      error: 'No meeting with that code',
      errorCode: 'MEETING_NOT_FOUND',
    });
    expect(socket.join).not.toHaveBeenCalled();
  });
});
