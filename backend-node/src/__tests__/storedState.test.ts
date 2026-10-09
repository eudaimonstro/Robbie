import { describe, expect, it } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import { RETIRED_STATE_KEYS, withDefaults } from '../db/meetingStorage.js';

describe('withDefaults (a live meeting loaded from the database)', () => {
  it('gives a field the state was saved without its initial value', () => {
    const { headcount: _left, ...saved } = { ...initialState, meetingCode: 'OLD123' };
    const loaded = withDefaults(saved as MeetingState);
    expect(loaded.headcount).toBe(initialState.headcount);
    expect(loaded.meetingCode).toBe('OLD123');
  });

  it('drops the fields of removed features a meeting saved before their removal carries', () => {
    const saved = {
      ...initialState,
      meetingCode: 'OLD123',
      proxiesHeld: 3,
      allowProxyVoting: true,
      maxProxiesPerMember: 2,
      proxiesCountForQuorum: true,
      proxies: [{ id: 1, grantedBy: 2, grantedTo: 3, scope: 'all' }],
      proxyVotes: [{ memberId: 2, castBy: 3, vote: 'yea' }],
      allowMemberProxyGrant: false,
      pendingProxyRequests: [],
      suspendedRules: [{ id: 1, rule: 'debate-rules', scope: 'meeting-remainder' }],
      tabledMotions: [],
      dividedQuestionParts: [],
    } as unknown as MeetingState;
    const loaded = withDefaults(saved) as unknown as Record<string, unknown>;
    for (const key of RETIRED_STATE_KEYS) {
      expect(saved).toHaveProperty(key);
      expect(loaded).not.toHaveProperty(key);
    }
    // The proxies the chair holds are a count of the meeting's own, and stay
    expect(loaded.proxiesHeld).toBe(3);
    expect(loaded.meetingCode).toBe('OLD123');
  });

  it('retires no field the current state has', () => {
    for (const key of RETIRED_STATE_KEYS) expect(initialState).not.toHaveProperty(key);
  });
});
