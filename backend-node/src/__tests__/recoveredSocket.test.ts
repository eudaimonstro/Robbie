import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { TERMS_VERSION } from '@robbie-bylawyer/shared/constants';
import type { MeetingState } from '@robbie-bylawyer/shared/types';

const stored = vi.hoisted(() => ({ state: null as unknown as MeetingState }));
vi.mock('../db/meetingStorage.js', () => ({
  getStorage: () => ({ getMeeting: async () => ({ state: stored.state, stateVersion: 5 }) }),
}));
const applyAction = vi.hoisted(() =>
  vi.fn(async () => ({ success: true, state: stored.state, stateVersion: 6 })),
);
vi.mock('../socket/stateManager.js', () => ({ applyAction }));

// The session the socket signed in with, as the database has it now
const session = vi.hoisted(() => ({
  current: null as null | { termsVersion: string | null },
}));
vi.mock('../auth/sessionService.js', () => ({
  findSessionById: async () => session.current,
}));

// The meeting's packet and the socket's user, as the organization has them now
const organization = vi.hoisted(() => ({
  chairUserId: null as number | null,
  orgRole: 'member' as string | null,
}));
vi.mock('../socket/meetingPacket.js', () => ({
  findMeetingPacket: async () => ({
    robbieCode: 'REC001',
    organizationId: 'org',
    title: null,
    scheduledFor: null,
    chairUserId: organization.chairUserId,
    organization: { name: 'Org', eligibleVoters: null, quorumPercent: null, quorumCount: null },
    agendaItems: [],
  }),
  findPerson: async () => ({
    name: 'Ann',
    email: 'ann@example.org',
    orgRole: organization.orgRole,
  }),
  findOrgPeople: async () => new Map(),
}));

const { roomManager } = await import('../socket/roomManager.js');
const { handleRecoveredSocket } = await import('../socket/joinHandler.js');

function recovered(data: Record<string, unknown> = {}) {
  return {
    id: 'recovered-socket',
    data: {
      meetingCode: 'REC001',
      userId: 3,
      name: 'Ann',
      role: 'member',
      sessionId: 'session-3',
      ...data,
    },
    disconnect: vi.fn(),
  };
}

describe('handleRecoveredSocket', () => {
  const emit = vi.fn();
  const sockets: Array<ReturnType<typeof recovered>> = [];
  const io = {
    to: () => ({ emit }),
    in: () => ({ fetchSockets: async () => sockets }),
  };

  beforeEach(() => {
    applyAction.mockClear();
    emit.mockClear();
    sockets.length = 0;
    roomManager.removeMember('REC001', 'recovered-socket');
    session.current = { termsVersion: TERMS_VERSION };
    organization.chairUserId = null;
    organization.orgRole = 'member';
    stored.state = {
      ...initialState,
      members: [{ id: 3, name: 'Ann', role: 'member', present: true, presentBy: 'device' }],
    };
  });

  it('counts the member connected again, which ends their grace period', async () => {
    roomManager.startGrace('REC001', 3, () => {});

    await handleRecoveredSocket(recovered() as never, io as never);

    expect(roomManager.isMemberConnected('REC001', 3)).toBe(true);
    expect(roomManager.inGrace('REC001', 3)).toBe(false);
    expect(applyAction).not.toHaveBeenCalled();
  });

  it('marks the member present again when the grace period ran out meanwhile', async () => {
    stored.state = {
      ...initialState,
      members: [{ id: 3, name: 'Ann', role: 'member', present: false }],
    };

    await handleRecoveredSocket(recovered() as never, io as never);

    expect(applyAction).toHaveBeenCalledWith(
      'REC001',
      expect.objectContaining({ type: 'SET_MEMBER_PRESENCE', memberId: 3, present: true }),
    );
    expect(emit).toHaveBeenCalledWith('STATE_UPDATE', expect.objectContaining({ stateVersion: 6 }));
  });

  it('does nothing for a display', async () => {
    await handleRecoveredSocket(recovered({ display: true }) as never, io as never);
    expect(roomManager.isMemberConnected('REC001', 3)).toBe(false);
  });

  it('closes a socket whose session was signed out while it was away', async () => {
    session.current = null;
    const socket = recovered();

    await handleRecoveredSocket(socket as never, io as never);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(roomManager.isMemberConnected('REC001', 3)).toBe(false);
    expect(applyAction).not.toHaveBeenCalled();
  });

  it('closes a socket whose user has not accepted the current terms', async () => {
    session.current = { termsVersion: null };
    const socket = recovered();

    await handleRecoveredSocket(socket as never, io as never);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(roomManager.isMemberConnected('REC001', 3)).toBe(false);
  });

  it('gives the socket the role the organization gives now, demoting a stale chair', async () => {
    stored.state = {
      ...initialState,
      members: [{ id: 3, name: 'Ann', role: 'chair', present: true, presentBy: 'device' }],
    };
    // Someone else presides now
    organization.chairUserId = 4;
    const socket = recovered({ role: 'chair' });
    sockets.push(socket);

    await handleRecoveredSocket(socket as never, io as never);

    expect(socket.data.role).toBe('member');
    expect(roomManager.getMembers('REC001')).toEqual([
      { id: 3, name: 'Ann', role: 'member', present: true },
    ]);
    expect(applyAction).toHaveBeenCalledWith(
      'REC001',
      expect.objectContaining({
        type: 'REFRESH_MEMBERS',
        members: [{ id: 3, name: 'Ann', role: 'member' }],
      }),
    );
    expect(emit).toHaveBeenCalledWith('STATE_UPDATE', expect.objectContaining({ stateVersion: 6 }));
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('makes a guest of a socket whose user left the organization', async () => {
    organization.orgRole = null;
    const socket = recovered();

    await handleRecoveredSocket(socket as never, io as never);

    expect(socket.data.role).toBe('guest');
    expect(applyAction).toHaveBeenCalledWith(
      'REC001',
      expect.objectContaining({ members: [{ id: 3, name: 'Ann', role: 'guest' }] }),
    );
  });
});
