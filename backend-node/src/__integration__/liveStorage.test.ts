import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import type { JoinMeetingResponse } from '@robbie-bylawyer/shared/types/socket';
import { pool } from '../db/client.js';
import { FLUSH_DELAY_MS, getStorage, initializeStorage } from '../db/meetingStorage.js';
import { handleJoinMeeting } from '../socket/joinHandler.js';
import { joinFloodLimiter, joinRateLimiter } from '../socket/rateLimiter.js';
import { applyAction } from '../socket/stateManager.js';
import { resetDatabase, resetLiveMeetings } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { liveSockets } from './liveSockets.js';

const live = liveSockets();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** What the table holds, read past the server's copy */
async function row(code: string): Promise<{ id: number; version: number; state: MeetingState }> {
  const result = await pool.query(
    'SELECT id, state_version, current_state FROM meetings WHERE code = $1',
    [code],
  );
  const [r] = result.rows;
  return r && { id: r.id, version: r.state_version, state: r.current_state };
}

const member = (id: number) => ({
  id,
  name: `Member ${id}`,
  role: 'member' as const,
  present: true,
  presentBy: 'device' as const,
});

beforeAll(initializeStorage);

describe('the live meetings in memory', () => {
  beforeEach(resetLiveMeetings);

  it('writes a vote within the flush delay, and a decision (with the votes before it) at once', async () => {
    const opened = await getStorage().getOrCreateMeeting('MEM001', {
      ...initialState,
      meetingActive: true,
      members: [member(1), member(2)],
      votingOpen: true,
    });

    const vote = await applyAction('MEM001', { type: 'CAST_VOTE', vote: 'yea', voterId: 1 });
    expect(vote).toMatchObject({ success: true, stateVersion: opened.stateVersion + 1 });
    // The server has it; the table not yet
    expect((await getStorage().getMeeting('MEM001'))?.state.voterChoices).toEqual({ 1: 'yea' });
    expect((await row('MEM001')).version).toBe(opened.stateVersion);

    await sleep(FLUSH_DELAY_MS + 150);
    expect(await row('MEM001')).toMatchObject({ version: opened.stateVersion + 1 });

    await applyAction('MEM001', { type: 'CAST_VOTE', vote: 'nay', voterId: 2 });
    await applyAction('MEM001', { type: 'CLOSE_VOTING', timestamp: '' });
    const written = await row('MEM001');
    expect(written.version).toBe(opened.stateVersion + 3);
    expect(written.state.votingOpen).toBe(false);
    // The votes deferred before the decision went into the table with it
    expect(written.state.voterChoices).toEqual({ 1: 'yea', 2: 'nay' });
  });

  it('carries on when an earlier write landed though its answer was lost', async () => {
    const opened = await getStorage().getOrCreateMeeting('MEM006', {
      ...initialState,
      meetingActive: true,
      members: [member(1), member(2)],
      votingOpen: true,
    });
    await applyAction('MEM006', { type: 'CAST_VOTE', vote: 'yea', voterId: 1 });
    await applyAction('MEM006', { type: 'CAST_VOTE', vote: 'nay', voterId: 2 });
    // The flush of the first vote reached the table, and its answer never came back
    await pool.query('UPDATE meetings SET state_version = $1 WHERE code = $2', [
      opened.stateVersion + 1,
      'MEM006',
    ]);

    const closed = await applyAction('MEM006', { type: 'CLOSE_VOTING', timestamp: '' });

    expect(closed).toMatchObject({ success: true, stateVersion: opened.stateVersion + 3 });
    const written = await row('MEM006');
    expect(written.version).toBe(opened.stateVersion + 3);
    // The votes deferred before the decision went into the table with it
    expect(written.state.voterChoices).toEqual({ 1: 'yea', 2: 'nay' });
  });

  it('writes what is waiting when the server shuts down', async () => {
    await getStorage().getOrCreateMeeting('MEM002', {
      ...initialState,
      meetingActive: true,
      members: [member(1)],
      votingOpen: true,
    });
    await applyAction('MEM002', { type: 'CAST_VOTE', vote: 'nay', voterId: 1 });

    await getStorage().flushAll();

    expect((await row('MEM002')).state.voterChoices).toEqual({ 1: 'nay' });
  });

  it('notices a meeting deleted, or put back with the same code and version, outside the server', async () => {
    const first = await getStorage().getOrCreateMeeting('MEM003', {
      ...initialState,
      title: 'First',
    });

    // The e2e harness and these tests clear the table behind the server's back
    await pool.query('DELETE FROM meetings WHERE code = $1', ['MEM003']);
    expect(await getStorage().getMeeting('MEM003')).toBeNull();

    // A row under the same code at the same version is another meeting
    await pool.query(
      `INSERT INTO meetings (code, current_state, state_version) VALUES ($1, $2, $3)`,
      ['MEM003', JSON.stringify({ ...initialState, title: 'Second' }), first.stateVersion],
    );
    expect((await getStorage().getMeeting('MEM003'))?.state.title).toBe('Second');
  });

  it("refuses an action on a meeting whose row was replaced, and then works on the table's", async () => {
    const opened = await getStorage().getOrCreateMeeting('MEM004', {
      ...initialState,
      members: [member(1)],
    });
    await pool.query('UPDATE meetings SET state_version = state_version + 5 WHERE code = $1', [
      'MEM004',
    ]);

    // The write finds another version: the state is read again, and the action applied to it
    const result = await applyAction('MEM004', { type: 'SET_QUORUM', quorum: 3, timestamp: '' });
    expect(result).toMatchObject({ success: true, stateVersion: opened.stateVersion + 6 });
    expect((await row('MEM004')).state.quorum).toBe(3);
  });

  it('keeps no version or write for an action that changes nothing', async () => {
    const opened = await getStorage().getOrCreateMeeting('MEM005', {
      ...initialState,
      members: [member(1)],
    });
    const result = await applyAction('MEM005', {
      type: 'SET_MEMBER_PRESENCE',
      memberId: 1,
      present: true,
      timestamp: '',
    });
    expect(result).toMatchObject({ success: true, changed: false });
    expect((await row('MEM005')).version).toBe(opened.stateVersion);
  });
});

describe('joining again', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    await resetLiveMeetings();
    f = await seedFixture();
  });
  afterEach(() => live.disconnectAll());

  /** A join as a phone makes it, with the limits as they are (live.join resets them) */
  async function rejoin(socket: ReturnType<typeof live.connect>, meetingCode: string) {
    const callback = vi.fn();
    await handleJoinMeeting(socket as never, live.io as never, { meetingCode }, callback);
    return callback.mock.calls[0][0] as JoinMeetingResponse;
  }

  it('changes nothing for a member already present, and tells nobody', async () => {
    const phone = live.connect(f.users.member);
    const first = await live.join(phone, f.packet.code);
    await live.join(live.connect(f.users.secretary), f.packet.code);
    live.broadcasts.length = 0;
    const before = (await getStorage().getMeeting(f.packet.code))!;

    // The phone's connection drops and comes back: a new socket, joining again
    await live.drop(phone);
    const again = await live.join(live.connect(f.users.member), f.packet.code);

    expect(again.success).toBe(true);
    expect(again.stateVersion).toBe(before.stateVersion);
    expect(again.state?.members).toEqual(before.state.members);
    expect(live.broadcasts).toEqual([]);
    expect(first.stateVersion).toBeLessThan(before.stateVersion);
  });

  it('never refuses a phone joining its meeting again and again, but limits codes that find nothing', async () => {
    joinRateLimiter.remove(f.users.member.id);
    joinFloodLimiter.remove(f.users.member.id);
    const phone = live.connect(f.users.member);
    for (let i = 0; i < 12; i++) {
      expect((await rejoin(phone, f.packet.code)).success, `join ${i + 1}`).toBe(true);
    }

    const guesser = live.connect(f.users.viewer);
    joinRateLimiter.remove(f.users.viewer.id);
    joinFloodLimiter.remove(f.users.viewer.id);
    for (let i = 0; i < 5; i++) {
      expect(await rejoin(guesser, 'NOPE01')).toMatchObject({ errorCode: 'MEETING_NOT_FOUND' });
    }
    const refused = await rejoin(guesser, 'NOPE01');
    expect(refused).toMatchObject({ success: false, errorCode: 'RATE_LIMITED' });
    expect(refused.retryAfterMs).toBeGreaterThan(0);
  });
});
