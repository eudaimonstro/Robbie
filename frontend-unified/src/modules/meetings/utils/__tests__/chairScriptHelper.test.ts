import { describe, it, expect } from 'vitest';
import { initialState, meetingReducer } from '@robbie-bylawyer/shared/reducer';
import { MOTIONS } from '@robbie-bylawyer/shared/constants';
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import { getChairScript } from '../chairScriptHelper';

const pendingMotion = {
  ...MOTIONS.mainMotion,
  id: 1,
  type: 'mainMotion',
  text: 'Approve the budget',
  mover: 'Member 1',
  moverId: 1,
  secondedBy: 'Member 2',
  status: 'active' as const,
};

// Runs a vote through the reducer so the log has the messages the app really writes
function afterVote(yeas: number, nays: number): MeetingState {
  const motion = {
    ...MOTIONS.mainMotion,
    id: 1,
    type: 'mainMotion',
    text: 'Approve the budget',
    mover: 'Member 1',
    moverId: 1,
    secondedBy: 'Member 2',
    status: 'active' as const,
  };
  const voterIds = Array.from({ length: yeas + nays }, (_, i) => i + 1);
  let state: MeetingState = {
    ...initialState,
    meetingActive: true,
    agendaAdopted: true,
    members: voterIds.map((id) => ({ id, name: `Member ${id}`, role: 'member', present: true })),
    currentMotion: motion,
    motionStack: [motion],
  };
  state = meetingReducer(state, { type: 'OPEN_VOTING', voteTimerEnd: null, timestamp: '10:05' });
  voterIds.forEach((voterId, i) => {
    state = meetingReducer(state, { type: 'CAST_VOTE', voterId, vote: i < yeas ? 'yea' : 'nay' });
  });
  return meetingReducer(state, { type: 'CLOSE_VOTING', timestamp: '10:10' });
}

describe('getChairScript', () => {
  it('announces a motion that carried', () => {
    expect(getChairScript(afterVote(3, 1))?.text).toBe('"The motion has carried."');
  });

  it('announces a motion adopted by unanimous consent', () => {
    let state: MeetingState = {
      ...initialState,
      meetingActive: true,
      agendaAdopted: true,
      currentMotion: pendingMotion,
      motionStack: [pendingMotion],
    };
    state = meetingReducer(state, { type: 'REQUEST_UNANIMOUS_CONSENT', timestamp: '10:05' });
    state = meetingReducer(state, { type: 'UNANIMOUS_CONSENT_PASSED', timestamp: '10:06' });
    expect(getChairScript(state)?.text).toBe('"The motion has carried."');
  });

  it('announces a motion that failed', () => {
    expect(getChairScript(afterVote(1, 3))?.text).toBe('"The motion has failed."');
  });
});

describe('the script while a vote is open', () => {
  const voting = (votingMethod: MeetingState['votingMethod']) =>
    getChairScript({
      ...initialState,
      meetingActive: true,
      agendaAdopted: true,
      currentMotion: pendingMotion,
      motionStack: [pendingMotion],
      votingOpen: true,
      votingMethod,
    })?.text;

  it('asks the room to vote on their phones or raise their hands', () => {
    expect(voting('standard')).toBe(
      '"Those in favor, vote on your phone or raise your hand. Those opposed, vote on your phone or raise your hand."',
    );
  });

  it('keeps Aye and No for a voice vote', () => {
    expect(voting('voice')).toBe('"Those in favor say Aye. Those opposed say No."');
  });

  it('opens a secret ballot and a roll call in their own words', () => {
    expect(voting('ballot')).toBe('"The ballot is open. Vote on your phone or on a paper ballot."');
    expect(voting('rollcall')).toBe(
      '"The secretary will call the roll. Answer Aye or No when your name is called, or vote on your phone."',
    );
  });
});

describe('the script during an election', () => {
  const during = (fields: Partial<MeetingState>) =>
    getChairScript({ ...initialState, meetingActive: true, agendaAdopted: true, ...fields })?.text;

  it('takes no ballot when nobody has been nominated', () => {
    expect(during({ currentNominationPosition: 'Director' })).toBe(
      '"Nominations for Director are closed, and nobody has been nominated."',
    );
  });

  it('takes nominations, then opens the ballot, then declares the result', () => {
    expect(during({ nominationsOpen: true, currentNominationPosition: 'Director' })).toBe(
      '"Nominations are open for Director. Are there any further nominations?"',
    );
    expect(
      during({
        currentNominationPosition: 'Director',
        nominations: [
          {
            id: 1,
            position: 'Director',
            nomineeName: 'Carmen Diaz',
            nomineeId: 5,
            nominatedBy: 'Alice Brennan',
            nominatorId: 3,
            timestamp: '8:00:00 PM',
            declined: false,
          },
        ],
      }),
    ).toBe('"Nominations for Director are closed. The ballot will now be taken."');
    const election = {
      id: 1,
      position: 'Director',
      candidates: [{ name: 'Carmen Diaz', id: 5 }],
      requiredVotes: 'majority' as const,
      votingInProgress: true,
      ballotResults: { 'Carmen Diaz': 0 },
      votersWhoVoted: [],
      elected: null,
    };
    expect(during({ currentElection: election })).toBe(
      '"The ballot is open. Vote on your phone or on a paper ballot."',
    );
    expect(
      during({
        currentElection: { ...election, votingInProgress: false, elected: 'Carmen Diaz' },
      }),
    ).toBe('"Carmen Diaz, having received the vote required, is elected Director."');
  });
});

describe('the chair script for the moments of the meeting rules', () => {
  const inSession: MeetingState = { ...initialState, meetingActive: true, agendaAdopted: true };

  it('declares an adjournment that carried, and a recess', () => {
    expect(getChairScript({ ...inSession, adjournmentCarried: true })?.note).toBe(
      'Declare the meeting adjourned.',
    );
    expect(
      getChairScript({ ...inSession, recess: { since: '8:02 PM', until: '8:15 PM' } })?.text,
    ).toBe('"The meeting is in recess until 8:15 PM."');
  });

  it('rules on a point of order, and puts a request to withdraw by consent', () => {
    const point = {
      ...pendingMotion,
      id: 2,
      type: 'pointOrder',
      vote: 'none' as const,
      mover: 'Ben',
    };
    expect(
      getChairScript({ ...inSession, currentMotion: point, motionStack: [pendingMotion, point] })
        ?.note,
    ).toBe('Rule on the point. An appeal from the ruling is in order at once.');
    const request = { ...pendingMotion, id: 3, type: 'withdrawMotion' };
    expect(
      getChairScript({
        ...inSession,
        currentMotion: request,
        motionStack: [pendingMotion, request],
      })?.text,
    ).toBe('"Member 1 asks to withdraw the motion. Is there any objection?"');
  });

  it('puts the question once debate is closed', () => {
    const closed = { ...pendingMotion, debateClosed: true };
    expect(getChairScript({ ...inSession, currentMotion: closed, motionStack: [closed] })).toEqual({
      text: '"Debate is closed. The question is on: Approve the budget."',
      note: 'Open the vote.',
    });
  });
});
