import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { getStorage, initializeStorage } from '../db/meetingStorage.js';
import { prisma } from '../db/prisma.js';
import { resetDatabase, resetLiveMeetings } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { liveSockets, type FakeSocket } from './liveSockets.js';

const live = liveSockets();
const stored = async (code: string) => (await getStorage().getMeeting(code))!;

beforeAll(initializeStorage);

/**
 * The security review's probes against the real handler, validator, reducer
 * and storage: each is refused with ACTION_REJECTED, and the meeting's state is untouched
 */
describe('a malformed action in a live meeting', () => {
  let f: Fixture;
  let chair: FakeSocket;
  let member: FakeSocket;
  let guest: FakeSocket;
  beforeEach(async () => {
    await resetDatabase();
    await resetLiveMeetings();
    f = await seedFixture();
    await prisma.meetingPacket.update({
      where: { id: f.packet.id },
      data: { chairUserId: f.users.secretary.id },
    });
    chair = live.connect(f.users.secretary);
    member = live.connect(f.users.member);
    guest = live.connect(f.users.viewer);
    for (const socket of [chair, member, guest]) await live.join(socket, f.packet.code);
    await live.dispatch(chair, { type: 'MARK_PRESENT', userId: f.users.owner.id, timestamp: '' });
    await live.dispatch(chair, { type: 'START_MEETING', timestamp: '' });
    // Business is taken up once the agenda is adopted
    await live.dispatch(chair, { type: 'ADOPT_AGENDA', timestamp: '' });
    await live.dispatch(member, {
      type: 'MAKE_MOTION',
      motionType: 'mainMotion',
      text: 'Resurface the pool',
      motionId: 1,
      timestamp: '',
    });
    await live.dispatch(chair, { type: 'SECOND_FROM_FLOOR', timestamp: '' });
    await live.dispatch(chair, { type: 'OPEN_VOTING', voteTimerEnd: null, timestamp: '' });
    expect((await stored(f.packet.code)).state.votingOpen).toBe(true);
  });
  afterEach(live.disconnectAll);

  it.each([
    [
      'a guest raising a hand with a prototype key as the stance',
      'guest',
      {
        type: 'RAISE_HAND',
        stance: '__proto__',
      },
    ],
    [
      'a member moving with an object as the text',
      'member',
      {
        type: 'MAKE_MOTION',
        motionType: 'mainMotion',
        text: { length: 3 },
        motionId: 1,
        timestamp: '',
      },
    ],
    ['a member voting a megabyte', 'member', { type: 'CAST_VOTE', vote: 'y'.repeat(1024 * 1024) }],
    [
      'a member nominating an object',
      'member',
      {
        type: 'NOMINATE',
        position: 'Director',
        nomineeName: { evil: true },
        nomineeId: 1,
        nominationId: 1,
        timestamp: '',
      },
    ],
  ])('%s', async (_label, who, action) => {
    const socket = { guest, member }[who as 'guest' | 'member'];
    const before = await stored(f.packet.code);
    const response = await live.dispatch(socket, action);
    expect(response.success).toBe(false);
    expect(socket.emit).toHaveBeenCalledWith(
      'ACTION_REJECTED',
      expect.objectContaining({ clientSequence: 1 }),
    );
    const after = await stored(f.packet.code);
    expect(after.stateVersion).toBe(before.stateVersion);
    expect(after.state).toEqual(before.state);
  });
});
