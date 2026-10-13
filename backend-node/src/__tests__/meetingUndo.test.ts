import { describe, it, expect } from 'vitest';
import {
  act,
  gathered,
  inSession,
  minutesOf,
  move,
  moved,
  refusal,
  vote,
  ALL_YES,
} from './support/meetingPipeline.js';
import { publicState } from '../socket/statePublisher.js';

const undo = { type: 'UNDO_LAST_STEP' } as const;

describe("undoing the chair's last step", () => {
  it('takes back an objection to the agenda clicked by mistake', () => {
    let s = act(gathered(), 'dana', { type: 'START_MEETING' });
    s = act(s, 'dana', { type: 'AGENDA_OBJECTION' });
    expect(s.lastStep?.type).toBe('AGENDA_OBJECTION');
    s = act(s, 'dana', undo);
    expect(s.agendaObjection).toBe(false);
    expect(s.lastStep).toBeNull();
    // The log keeps what happened, and says it was undone
    expect(s.meetingLog.slice(-2).map((e) => e.message)).toEqual([
      'Objection raised to agenda.',
      'The chair undid recording the agenda objection.',
    ]);
    s = act(s, 'dana', { type: 'ADOPT_AGENDA' });
    expect(minutesOf(s)).toContain('The agenda was adopted without objection.');
  });

  it("never erases a member's own business: their objection, motion or second", () => {
    let s = act(gathered(), 'dana', { type: 'START_MEETING' });
    s = act(s, 'carl', { type: 'AGENDA_OBJECTION' });
    expect(s.lastStep).toBeNull();
    expect(refusal(s, 'dana', undo)).toMatchObject({ error: 'Nothing to undo' });

    s = inSession();
    expect(s.lastStep?.type).toBe('CALL_AGENDA_ITEM');
    s = move(s, 'alice', 'mainMotion', 'Resurface the pool');
    expect(s.lastStep).toBeNull();
  });

  it('puts back a motion declared dead for want of a second, and the minutes never record it', () => {
    let s = move(inSession(), 'alice', 'mainMotion', 'Resurface the pool');
    const awaiting = s.pendingSecond;
    s = act(s, 'dana', { type: 'DECLINE_SECOND' });
    expect(s.completedMotions).toHaveLength(1);
    s = act(s, 'dana', undo);
    expect(s.pendingSecond).toEqual(awaiting);
    expect(s.completedMotions).toHaveLength(0);
    expect(minutesOf(s)).not.toContain('Resurface the pool');
    // Undone once: nothing more to undo, and undoing never redoes
    expect(refusal(s, 'dana', undo)).toMatchObject({ errorCode: 'INVALID_STATE' });
  });

  it('takes back a motion recorded from the floor', () => {
    let s = act(inSession(), 'dana', {
      type: 'MAKE_FLOOR_MOTION',
      motionType: 'mainMotion',
      text: 'Paint the clubhouse',
      moverName: 'Frank',
      motionId: 1,
    });
    expect(s.pendingSecond?.text).toBe('Paint the clubhouse');
    s = act(s, 'dana', undo);
    expect(s.pendingSecond).toBeNull();
    expect(s.currentAgendaItem?.id).toBe(102);
  });

  it('closes a vote opened by mistake, dropping its votes', () => {
    let s = moved(inSession(), 'alice', 'mainMotion', 'Resurface the pool', 'ben');
    s = act(s, 'dana', { type: 'OPEN_VOTING', voteTimerEnd: null });
    s = act(s, 'carl', { type: 'CAST_VOTE', vote: 'yea', voterId: 0 });
    // Votes go on around the step: it can still be undone
    expect(s.lastStep?.type).toBe('OPEN_VOTING');
    s = act(s, 'dana', undo);
    expect(s.votingOpen).toBe(false);
    expect(s.voters).toEqual([]);
    expect(s.currentMotion?.text).toBe('Resurface the pool');
  });

  it('takes back recognizing the wrong speaker; hands raised since stay up', () => {
    let s = moved(inSession(), 'alice', 'mainMotion', 'Resurface the pool', 'ben');
    s = act(s, 'carl', { type: 'RAISE_HAND', stance: 'con' });
    const carl = s.members.find((m) => m.name === 'Carl Moss')!;
    s = act(s, 'dana', {
      type: 'RECOGNIZE_SPEAKER',
      member: carl,
      stance: 'con',
      speakerTimerEnd: null,
    });
    expect(s.recognizedSpeaker?.name).toBe('Carl Moss');
    s = act(s, 'eve', { type: 'RAISE_HAND', stance: 'pro' });
    s = act(s, 'dana', undo);
    expect(s.recognizedSpeaker).toBeNull();
    expect(s.speakerQueue.map((e) => e.member.name)).toEqual(['Carl Moss', 'Eve Park']);
  });

  it('reopens a vote closed by mistake, with its votes', () => {
    let s = moved(inSession(), 'alice', 'mainMotion', 'Resurface the pool', 'ben');
    s = vote(s, ALL_YES);
    expect(s.completedMotions).toHaveLength(1);
    s = act(s, 'dana', undo);
    expect(s.votingOpen).toBe(true);
    expect(s.voters).toHaveLength(5);
    expect(s.completedMotions).toHaveLength(0);
  });

  it('is gone once the meeting moves on', () => {
    let s = move(inSession(), 'alice', 'mainMotion', 'Resurface the pool');
    s = act(s, 'dana', { type: 'DECLINE_SECOND' });
    s = move(s, 'carl', 'mainMotion', 'Repave the lot');
    expect(refusal(s, 'dana', undo)).toMatchObject({ errorCode: 'INVALID_STATE' });
  });

  it("is the chair's: a member cannot undo", () => {
    const s = move(inSession(), 'alice', 'mainMotion', 'Resurface the pool');
    const declined = act(s, 'dana', { type: 'DECLINE_SECOND' });
    expect(refusal(declined, 'alice', undo)).toMatchObject({ errorCode: 'PERMISSION_DENIED' });
    // An admin at the console can
    expect(act(declined, 'pat', undo).pendingSecond?.text).toBe('Resurface the pool');
  });

  it('works in a recess, on the vote that carried it', () => {
    let s = moved(inSession(), 'alice', 'mainMotion', 'Resurface the pool', 'ben');
    s = moved(s, 'carl', 'recess', 'Recess for ten minutes', 'eve');
    s = vote(s, ALL_YES);
    expect(s.recess).toBeTruthy();
    s = act(s, 'dana', undo);
    expect(s.recess).toBeFalsy();
    expect(s.votingOpen).toBe(true);
  });

  it('sends clients only what the step was, never what undoing it would put back', () => {
    let s = moved(inSession(), 'alice', 'mainMotion', 'Resurface the pool', 'ben');
    s = vote(s, ALL_YES);
    expect(s.lastStep?.undo).toBeDefined();
    for (const role of ['chair', 'admin', 'member', 'guest'] as const) {
      expect(publicState(s, role).lastStep).toEqual({ type: 'CLOSE_VOTING' });
    }
  });
});
