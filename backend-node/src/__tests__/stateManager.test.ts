import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { MeetingState } from '@robbie-bylawyer/shared/types';

// A stand-in for the database: each read and write takes a turn of the event loop, so
// concurrent actions interleave the way they do against Postgres
const record = { state: initialState as MeetingState, stateVersion: 0 };
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const storage = {
  async getMeeting() {
    await tick();
    return { code: 'TEST01', ...structuredClone(record) };
  },
  async updateMeetingState(
    _code: string,
    state: MeetingState,
    expectedVersion: number,
    newVersion: number,
  ) {
    await tick();
    if (record.stateVersion !== expectedVersion) {
      return { success: false, error: 'VERSION_CONFLICT' };
    }
    record.state = state;
    record.stateVersion = newVersion;
    return { success: true };
  },
};

vi.mock('../db/meetingStorage.js', () => ({ getStorage: () => storage }));

const { applyAction } = await import('../socket/stateManager.js');

describe('applyAction', () => {
  beforeEach(() => {
    record.state = { ...initialState, meetingActive: true };
    record.stateVersion = 0;
  });

  it('applies every one of many concurrent actions on a meeting', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        applyAction('TEST01', {
          type: 'ADD_MEMBER',
          member: { id: i + 1, name: `Member ${i + 1}`, role: 'member', present: true },
          timestamp: '',
        }),
      ),
    );

    expect(results.every((r) => r.success)).toBe(true);
    expect(record.state.members).toHaveLength(10);
    expect(record.stateVersion).toBe(10);
  });

  it('re-runs the validator against the state it applies to', async () => {
    // The second action is valid only while the member is still absent; once the first
    // action marks them present, the validator must see that and reject it
    record.state.members = [{ id: 1, name: 'Member 1', role: 'member', present: false }];
    const onlyIfAbsent = (state: MeetingState) =>
      state.members[0].present ? { valid: false, error: 'Already present' } : { valid: true };
    const markPresent = {
      type: 'SET_MEMBER_PRESENCE' as const,
      memberId: 1,
      present: true,
      timestamp: '',
    };

    const [first, second] = await Promise.all([
      applyAction('TEST01', markPresent, onlyIfAbsent),
      applyAction('TEST01', markPresent, onlyIfAbsent),
    ]);

    expect(first.success).toBe(true);
    expect(second).toMatchObject({ success: false, error: 'Already present' });
  });
});
