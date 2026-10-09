import { describe, it, expect } from 'vitest';
import { ACTION_SCHEMAS, isActionType, parseClientAction } from '../socket/actionSchemas.js';
import { ACTION_TYPES, isServerOnly } from '../socket/permissionGuard.js';

const MEGABYTE = 'x'.repeat(1024 * 1024);

describe('action schemas', () => {
  it('has a schema for every action type, and none for anything else', () => {
    expect(Object.keys(ACTION_SCHEMAS).sort()).toEqual([...ACTION_TYPES].sort());
  });

  it('knows an action type only as its own key, never a prototype key', () => {
    expect(isActionType('RAISE_HAND')).toBe(true);
    for (const type of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'NOPE', 3]) {
      expect(isActionType(type), String(type)).toBe(false);
    }
    expect(parseClientAction({ type: 'constructor' })).toEqual({
      success: false,
      error: 'Unknown action type',
    });
  });

  it.each(ACTION_TYPES.filter(isServerOnly))('accepts no %s from a client', (type) => {
    expect(parseClientAction({ type }).success).toBe(false);
  });

  it('accepts the actions the clients send, as they send them', () => {
    const actions = [
      { type: 'RAISE_HAND', stance: 'pro' },
      { type: 'CAST_VOTE', vote: 'yea' },
      { type: 'SECOND_MOTION', timestamp: '7:01:02 PM' },
      {
        type: 'MAKE_MOTION',
        motionType: 'mainMotion',
        text: 'Resurface the pool',
        mover: 'Alice',
        moverId: 2,
        motionId: 1_700_000_000_000_123,
        timestamp: '7:01:02 PM',
      },
      {
        type: 'MAKE_MOTION',
        motionType: 'bylawAmendment',
        text: 'I move to amend the bylaws',
        motionId: 1,
        timestamp: '',
        bylawAmendment: {
          documentId: 'd0c',
          changeType: 'modify',
          targetSectionId: 's42',
          newContent: 'Fifteen percent of the votes is a quorum.',
        },
      },
      {
        type: 'SET_FLOOR_BALLOTS',
        counts: { 'Carmen Diaz': 12, 'Ray Castillo': 4 },
        timestamp: '',
      },
      { type: 'SET_HEADCOUNT', count: 3, names: ['Mrs. Ortiz'], timestamp: '' },
      { type: 'SET_HEADCOUNT', count: 3, names: [], proxiesHeld: 21, timestamp: '' },
      {
        type: 'SET_HEADCOUNT',
        count: 3,
        names: ['Rosa'],
        invites: ['3f1f8c5e-7a5b-4c47-9d2a-4f0d2f2c9b11'],
        base: { count: 2, names: [], proxiesHeld: 0, invites: [] },
        timestamp: '',
      },
      { type: 'OPEN_VOTING', voteTimerEnd: null, timestamp: '' },
    ];
    for (const action of actions) {
      expect(parseClientAction(action), action.type).toEqual({ success: true, action });
    }
  });

  it('takes a member echoed from an older state, dropping the field since retired', () => {
    const result = parseClientAction({
      type: 'RECOGNIZE_SPEAKER',
      member: { id: 3, name: 'Ben', role: 'member', present: true, selfRenameUsed: true },
      stance: 'pro',
      speakerTimerEnd: null,
      timestamp: '',
    });
    expect(result).toMatchObject({
      success: true,
      action: { member: { id: 3, name: 'Ben', role: 'member', present: true } },
    });
    if (result.success) expect(result.action).not.toHaveProperty('member.selfRenameUsed');
  });

  it('takes an agenda item title up to 500 characters, as the schedule does', () => {
    const add = (title: string) =>
      parseClientAction({ type: 'ADD_AGENDA_ITEM', title, itemId: 1 }).success;
    expect(add('x'.repeat(500))).toBe(true);
    expect(add('x'.repeat(501))).toBe(false);
  });

  describe("refuses the reviewer's probes", () => {
    it.each([
      ['a prototype key as a stance', { type: 'RAISE_HAND', stance: '__proto__' }],
      [
        'an object as motion text',
        {
          type: 'MAKE_MOTION',
          motionType: 'mainMotion',
          text: { length: 3 },
          motionId: 1,
          timestamp: '',
        },
      ],
      [
        'an object as a nominee',
        {
          type: 'NOMINATE',
          position: 'Director',
          nomineeName: { evil: true },
          nomineeId: 3,
          nominationId: 1,
          timestamp: '',
        },
      ],
      ['a megabyte vote', { type: 'CAST_VOTE', vote: MEGABYTE }],
      [
        'a megabyte motion',
        {
          type: 'MAKE_MOTION',
          motionType: 'mainMotion',
          text: MEGABYTE,
          motionId: 1,
          timestamp: '',
        },
      ],
      [
        'a megabyte bylaw text',
        {
          type: 'MAKE_MOTION',
          motionType: 'bylawAmendment',
          text: 'I move to amend the bylaws',
          motionId: 1,
          timestamp: '',
          bylawAmendment: { documentId: 'd', changeType: 'modify', newContent: MEGABYTE },
        },
      ],
      [
        'an unknown motion type',
        {
          type: 'MAKE_MOTION',
          motionType: '__proto__',
          text: 'x',
          motionId: 1,
          timestamp: '',
        },
      ],
      ['an unknown key', { type: 'RAISE_HAND', stance: 'pro', extra: 1 }],
      [
        'a prototype key on the action',
        JSON.parse('{"type":"RAISE_HAND","stance":"pro","__proto__":{"admin":true}}'),
      ],
      [
        'a prototype key in a member',
        JSON.parse(
          '{"type":"LOWER_HAND","member":{"id":1,"name":"A","role":"member","present":true,"__proto__":{}}}',
        ),
      ],
      [
        'a prototype key as a candidate',
        JSON.parse('{"type":"SET_FLOOR_BALLOTS","counts":{"__proto__":3},"timestamp":""}'),
      ],
      ['a negative count', { type: 'SET_FLOOR_TALLY', yea: -1, nay: 0, abstain: 0, timestamp: '' }],
      ['a fractional count', { type: 'SET_HEADCOUNT', count: 1.5, names: [], timestamp: '' }],
      [
        'negative proxies held',
        { type: 'SET_HEADCOUNT', count: 1, names: [], proxiesHeld: -1, timestamp: '' },
      ],
      [
        'too many names',
        { type: 'SET_HEADCOUNT', count: 9, names: Array(501).fill('A'), timestamp: '' },
      ],
      [
        'an unknown bylaw change',
        {
          type: 'MAKE_MOTION',
          motionType: 'bylawAmendment',
          text: 'x',
          motionId: 1,
          timestamp: '',
          bylawAmendment: { documentId: 'd', changeType: 'rewrite' },
        },
      ],
    ])('%s', (_label, action) => {
      expect(parseClientAction(action).success).toBe(false);
    });
  });

  it('gives a short reason', () => {
    const result = parseClientAction({ type: 'CAST_VOTE', vote: MEGABYTE });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.length).toBeLessThanOrEqual(200);
  });
});
