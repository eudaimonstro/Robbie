import { describe, it, expect } from 'vitest';
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import { act, inSession, minutesOf, refusal, type Person } from './support/meetingPipeline.js';

/** The election card's steps, through the server */
const open = (s: MeetingState, position: string, seats?: number) =>
  act(s, 'dana', { type: 'OPEN_NOMINATIONS', position, ...(seats ? { seats } : {}) });

/** A nomination from a phone (nominee: a member's id and name, or 0 and a name) */
const nominate = (s: MeetingState, by: Person, position: string, id: number, name: string) =>
  act(s, by, {
    type: 'NOMINATE',
    position,
    nomineeName: name,
    nomineeId: id,
    nominationId: 1,
  });

const ALICE = [3, 'Alice Brennan'] as const;
const BEN = [4, 'Ben Whitaker'] as const;
const CARL = [5, 'Carl Moss'] as const;

/** Nominations for two directors: Alice, Ben and Carl, closed */
function threeForTwo(): MeetingState {
  let s = open(inSession(), 'Director', 2);
  s = nominate(s, 'eve', 'Director', ...ALICE);
  s = nominate(s, 'pat', 'Director', ...BEN);
  s = nominate(s, 'alice', 'Director', ...CARL);
  return act(s, 'dana', { type: 'CLOSE_NOMINATIONS' });
}

const ballot = (s: MeetingState, who: Person, ...names: string[]) =>
  act(s, who, { type: 'CAST_BALLOT', candidateNames: names, voterId: 0 });

const startBallot = (s: MeetingState, requiredVotes = 'majority') =>
  act(s, 'dana', {
    type: 'START_ELECTION',
    electionId: 1,
    position: 'Director',
    requiredVotes,
  });

describe('an election for two directors', () => {
  it('takes ballots of up to two names on phones and on paper, and elects the two with a majority', () => {
    let s = startBallot(threeForTwo());
    expect(s.currentElection).toMatchObject({ seats: 2 });
    expect(s.currentElection?.candidates.map((c) => c.name)).toEqual([
      'Alice Brennan',
      'Ben Whitaker',
      'Carl Moss',
    ]);

    s = ballot(s, 'pat', 'Alice Brennan', 'Ben Whitaker');
    s = ballot(s, 'alice', 'Alice Brennan', 'Carl Moss');
    s = ballot(s, 'ben', 'Ben Whitaker', 'Alice Brennan');
    s = ballot(s, 'carl', 'Carl Moss');
    // A phone marks no more names than seats, each once, each a candidate (I12: no device write-in)
    const refused = (names: string[]) =>
      refusal(s, 'eve', { type: 'CAST_BALLOT', candidateNames: names, voterId: 0 });
    expect(refused(['Alice Brennan', 'Ben Whitaker', 'Carl Moss'])?.error).toBe(
      'Mark up to 2 names',
    );
    expect(refused(['Alice Brennan', 'Alice Brennan'])?.error).toBe('Mark each name once');
    expect(refused(['Mickey Mouse'])?.error).toBe('Vote for a candidate on the ballot');
    expect(
      refusal(s, 'carl', { type: 'CAST_BALLOT', candidateNames: ['Ben Whitaker'], voterId: 0 })
        ?.errorCode,
    ).toBe('ALREADY_VOTED_ELECTION');
    s = ballot(s, 'eve', 'Alice Brennan', 'Ben Whitaker');

    // The paper ballots: marks, a name written in, a blank and a spoiled ballot, and how many
    // were counted (a ballot marks two names, so the marks can't say)
    const paper = {
      type: 'SET_FLOOR_BALLOTS' as const,
      counts: { 'Alice Brennan': 10, 'Ben Whitaker': 9, 'Carl Moss': 6 },
      writeIns: { 'Dan Ortiz': 1 },
      blank: 1,
      illegal: 1,
    };
    expect(refusal(s, 'dana', paper)?.error).toBe('Enter how many paper ballots were counted');
    expect(refusal(s, 'dana', { ...paper, ballots: 12 })?.error).toBe(
      "The marks don't fit on 12 paper ballots of up to 2 names",
    );
    expect(
      refusal(s, 'dana', { ...paper, counts: { ...paper.counts, 'Dan Ortiz': 1 }, ballots: 15 })
        ?.error,
    ).toBe('Enter a name not on the ballot as a write-in');
    s = act(s, 'dana', { ...paper, ballots: 15 });

    // Nothing is declared while the ballot is open
    expect(
      refusal(s, 'dana', { type: 'DECLARE_ELECTED', candidateName: 'Alice Brennan' })?.errorCode,
    ).toBe('VOTING_IN_PROGRESS');
    s = act(s, 'dana', { type: 'CLOSE_ELECTION' });
    // 5 on phones and 15 on paper (the blank not counted, the spoiled one counted): 20 cast, a
    // majority is 11. Alice 14 and Ben 12 have it; Carl 8 does not.
    expect(s.currentElection).toMatchObject({
      votingInProgress: false,
      winners: ['Alice Brennan', 'Ben Whitaker'],
      ballotTotals: [{ cast: 20, blank: 1, illegal: 1, writeIns: ['Dan Ortiz'] }],
    });
    expect(refusal(s, 'dana', { type: 'DECLARE_ELECTED', candidateName: 'Carl Moss' })?.error).toBe(
      'Carl Moss does not have the vote required',
    );

    s = act(s, 'dana', { type: 'DECLARE_ELECTED', candidateName: 'Alice Brennan' });
    expect(s.currentElection?.winners).toEqual(['Ben Whitaker']);
    expect(s.meetingLog.at(-1)?.message).toBe('Chair declares Alice Brennan elected as Director.');
    s = act(s, 'dana', { type: 'DECLARE_ELECTED', candidateName: 'Ben Whitaker' });
    expect(s.currentElection).toBeNull();
    // One election chose them both (its id is the server's)
    const [first, second] = s.electedOfficers;
    expect([first.name, second.name]).toEqual(['Alice Brennan', 'Ben Whitaker']);
    expect(second.electionId).toBe(first.electionId);
    expect(minutesOf(s)).toContain(
      '**Election for Director.** Ballot 1, 20 ballots cast (1 blank ballot not counted, 1 illegal ballot): Alice Brennan 14, Ben Whitaker 12, Carl Moss 8, Dan Ortiz (write-in) 1. Alice Brennan and Ben Whitaker were elected.',
    );
  });

  it('leaves a tie for the last seat to another ballot, without the director already elected (RONR 46:32)', () => {
    let s = startBallot(threeForTwo());
    s = ballot(s, 'pat', 'Alice Brennan', 'Ben Whitaker');
    s = ballot(s, 'alice', 'Alice Brennan', 'Carl Moss');
    s = ballot(s, 'ben', 'Alice Brennan', 'Ben Whitaker');
    s = ballot(s, 'carl', 'Alice Brennan', 'Carl Moss');
    s = ballot(s, 'eve', 'Alice Brennan');
    s = act(s, 'dana', { type: 'CLOSE_ELECTION' });
    // Alice 5 of 5; Ben 2 and Carl 2 tie, and neither has a majority anyway
    expect(s.currentElection?.winners).toEqual(['Alice Brennan']);
    s = act(s, 'dana', { type: 'DECLARE_ELECTED', candidateName: 'Alice Brennan' });
    // One seat is still open: the chair opens the next ballot, without Alice
    expect(s.currentElection).toMatchObject({ seats: 1, votingInProgress: false, winners: [] });
    expect(refusal(s, 'dana', { type: 'OPEN_NOMINATIONS', position: 'Treasurer' })?.error).toBe(
      'Finish the election for Director, or set it aside',
    );
    s = startBallot(s);
    expect(s.currentElection?.candidates.map((c) => c.name)).toEqual(['Ben Whitaker', 'Carl Moss']);
    expect(
      refusal(s, 'pat', {
        type: 'CAST_BALLOT',
        candidateNames: ['Ben Whitaker', 'Carl Moss'],
        voterId: 0,
      })?.error,
    ).toBe('Mark one name');
    s = ballot(s, 'pat', 'Ben Whitaker');
    s = ballot(s, 'alice', 'Carl Moss');
    s = ballot(s, 'ben', 'Ben Whitaker');
    s = act(s, 'dana', { type: 'CLOSE_ELECTION' });
    s = act(s, 'dana', { type: 'DECLARE_ELECTED', candidateName: 'Ben Whitaker' });
    expect(s.currentElection).toBeNull();
    expect(minutesOf(s)).toContain(
      '**Election for Director.** Ballot 1, 5 ballots cast: Alice Brennan 5, Ben Whitaker 2, Carl Moss 2. Alice Brennan was elected. Ballot 2, 3 ballots cast: Ben Whitaker 2, Carl Moss 1. Ben Whitaker was elected.',
    );
    // Elected to one seat, Alice isn't nominated again for the position
    s = open(s, 'Director');
    expect(
      refusal(s, 'eve', {
        type: 'NOMINATE',
        position: 'Director',
        nomineeName: 'Alice Brennan',
        nomineeId: 3,
        nominationId: 1,
      })?.error,
    ).toBe('Alice Brennan has already been elected Director');
  });

  it('keeps every candidate when nobody has a majority', () => {
    let s = startBallot(threeForTwo());
    s = ballot(s, 'pat', 'Alice Brennan');
    s = ballot(s, 'alice', 'Ben Whitaker');
    s = ballot(s, 'ben', 'Carl Moss');
    s = act(s, 'dana', { type: 'CLOSE_ELECTION' });
    expect(s.currentElection).toMatchObject({ votingInProgress: true, seats: 2 });
    expect(s.currentElection?.candidates).toHaveLength(3);
  });
});

describe('election by acclamation', () => {
  /** Nominations for two directors with these nominees, closed */
  const nominated = (...nominees: Array<readonly [number, string]>) => {
    let s = open(inSession(), 'Director', 2);
    for (const [id, name] of nominees) s = nominate(s, 'eve', 'Director', id, name);
    return s;
  };

  it('declares as many nominees as seats elected without a ballot', () => {
    let s = nominated(ALICE, BEN);
    expect(refusal(s, 'dana', { type: 'ELECT_BY_ACCLAMATION', electionId: 1 })?.error).toBe(
      'Close nominations first',
    );
    s = act(s, 'dana', { type: 'CLOSE_NOMINATIONS' });
    expect(refusal(s, 'alice', { type: 'ELECT_BY_ACCLAMATION', electionId: 1 })?.errorCode).toBe(
      'PERMISSION_DENIED',
    );
    s = act(s, 'dana', { type: 'ELECT_BY_ACCLAMATION', electionId: 1 });
    expect(s.electedOfficers).toMatchObject([
      { name: 'Alice Brennan', acclamation: true },
      { name: 'Ben Whitaker', acclamation: true },
    ]);
    expect(s.currentNominationPosition).toBeNull();
    expect(s.meetingLog.at(-1)?.message).toBe(
      'Chair declares Alice Brennan and Ben Whitaker elected as Director, by acclamation.',
    );
    expect(minutesOf(s)).toContain(
      '**Election for Director.** Alice Brennan and Ben Whitaker were elected by acclamation.',
    );
  });

  it('is refused with more nominees than seats, and without a quorum unless confirmed', () => {
    const s = act(nominated(ALICE, BEN, CARL), 'dana', { type: 'CLOSE_NOMINATIONS' });
    expect(refusal(s, 'dana', { type: 'ELECT_BY_ACCLAMATION', electionId: 1 })?.error).toBe(
      'Only nominees who are no more than the open seats are elected without a ballot',
    );
    let thin = open(inSession({ quorum: 10 }), 'Treasurer');
    thin = nominate(thin, 'eve', 'Treasurer', ...ALICE);
    thin = act(thin, 'dana', { type: 'CLOSE_NOMINATIONS' });
    expect(refusal(thin, 'dana', { type: 'ELECT_BY_ACCLAMATION', electionId: 1 })?.error).toBe(
      'There is no quorum. Business done now is not valid. Declare them elected anyway?',
    );
    expect(
      refusal(thin, 'dana', {
        type: 'ELECT_BY_ACCLAMATION',
        electionId: 1,
        confirmedWithoutQuorum: true,
      }),
    ).toBeNull();
  });

  it('with a lone nominee for two seats, leaves the other seat open for nominations', () => {
    let s = act(nominated(ALICE), 'dana', { type: 'CLOSE_NOMINATIONS' });
    s = act(s, 'dana', { type: 'ELECT_BY_ACCLAMATION', electionId: 1 });
    expect(s).toMatchObject({ currentNominationPosition: 'Director', openSeats: 1 });
    // Reopened, the position keeps the seat it has left
    s = open(s, 'Director', 2);
    expect(s.openSeats).toBe(1);
    s = nominate(s, 'pat', 'Director', ...CARL);
    s = act(s, 'dana', { type: 'CLOSE_NOMINATIONS' });
    s = act(s, 'dana', { type: 'ELECT_BY_ACCLAMATION', electionId: 2 });
    expect(s.electedOfficers.map((o) => o.name)).toEqual(['Alice Brennan', 'Carl Moss']);
    expect(s.currentNominationPosition).toBeNull();
  });
});

describe('the server refuses', () => {
  it('declaring a candidate without the vote required, or while the ballot is open (I12)', () => {
    let s = open(inSession(), 'Treasurer');
    s = nominate(s, 'eve', 'Treasurer', ...ALICE);
    s = nominate(s, 'pat', 'Treasurer', ...BEN);
    s = act(s, 'dana', { type: 'CLOSE_NOMINATIONS' });
    s = act(s, 'dana', {
      type: 'START_ELECTION',
      electionId: 1,
      position: 'Treasurer',
      requiredVotes: 'majority',
    });
    s = act(s, 'pat', { type: 'CAST_BALLOT', candidateName: 'Ben Whitaker', voterId: 0 });
    s = act(s, 'alice', { type: 'CAST_BALLOT', candidateName: 'Ben Whitaker', voterId: 0 });
    s = act(s, 'carl', { type: 'CAST_BALLOT', candidateName: 'Alice Brennan', voterId: 0 });
    s = act(s, 'dana', { type: 'CLOSE_ELECTION' });
    expect(
      refusal(s, 'dana', { type: 'DECLARE_ELECTED', candidateName: 'Alice Brennan' })?.error,
    ).toBe('Alice Brennan does not have the vote required');
    expect(
      refusal(s, 'dana', { type: 'DECLARE_ELECTED', candidateName: 'Ben Whitaker' }),
    ).toBeNull();
  });
});

describe('review fixes', () => {
  /** Two seats, Alice declared on the first ballot, the second seat still open */
  function oneSeatFilled(): MeetingState {
    let s = startBallot(threeForTwo());
    for (const who of ['pat', 'alice', 'ben'] as const) s = ballot(s, who, 'Alice Brennan');
    s = act(s, 'dana', { type: 'CLOSE_ELECTION' });
    return act(s, 'dana', { type: 'DECLARE_ELECTED', candidateName: 'Alice Brennan' });
  }

  it('never elects someone twice, by a paper write-in or a declaration (C1)', () => {
    let s = startBallot(oneSeatFilled());
    expect(
      refusal(s, 'dana', {
        type: 'SET_FLOOR_BALLOTS',
        counts: {},
        writeIns: { 'alice brennan': 5 },
      })?.error,
    ).toBe('alice brennan has already been elected Director');
    expect(
      refusal(s, 'carl', { type: 'CAST_BALLOT', candidateNames: ['Alice Brennan'], voterId: 0 })
        ?.error,
    ).toBe('Vote for a candidate on the ballot');
    // A state that somehow has her among the winners still can't declare her again
    s = act(s, 'pat', { type: 'CAST_BALLOT', candidateNames: ['Ben Whitaker'], voterId: 0 });
    s = act(s, 'dana', { type: 'CLOSE_ELECTION' });
    const forged = {
      ...s,
      currentElection: { ...s.currentElection!, winners: ['Alice Brennan'] },
    };
    expect(
      refusal(forged, 'dana', { type: 'DECLARE_ELECTED', candidateName: 'Alice Brennan' })?.error,
    ).toBe('Alice Brennan has already been elected Director');
  });

  it('sets nothing aside while a winner awaits the declaration, and leaves out ballots already minuted (I1)', () => {
    let s = startBallot(threeForTwo());
    for (const who of ['pat', 'alice', 'ben'] as const) {
      s = ballot(s, who, 'Alice Brennan', 'Ben Whitaker');
    }
    s = act(s, 'dana', { type: 'CLOSE_ELECTION' });
    expect(refusal(s, 'dana', { type: 'SET_ASIDE_ELECTION' })?.error).toBe(
      'Declare the result first',
    );
    s = act(s, 'dana', { type: 'DECLARE_ELECTED', candidateName: 'Alice Brennan' });
    s = act(s, 'dana', { type: 'DECLARE_ELECTED', candidateName: 'Ben Whitaker' });
    // A one-seat election: two ballots, then set aside
    s = open(s, 'Treasurer');
    s = nominate(s, 'eve', 'Treasurer', ...CARL);
    s = nominate(s, 'pat', 'Treasurer', 6, 'Eve Park');
    s = act(s, 'dana', { type: 'CLOSE_NOMINATIONS' });
    s = act(s, 'dana', {
      type: 'START_ELECTION',
      electionId: 2,
      position: 'Treasurer',
      requiredVotes: 'majority',
    });
    s = ballot(s, 'pat', 'Carl Moss');
    s = ballot(s, 'alice', 'Eve Park');
    s = act(s, 'dana', { type: 'CLOSE_ELECTION' });
    s = act(s, 'dana', { type: 'SET_ASIDE_ELECTION' });
    expect(s.electionsSetAside.at(-1)?.ballots).toHaveLength(1);

    // Set aside after a seat was filled: the ballot that filled it is in the director's paragraph
    let t = oneSeatFilled();
    t = startBallot(t);
    t = ballot(t, 'pat', 'Ben Whitaker');
    t = ballot(t, 'alice', 'Carl Moss');
    t = act(t, 'dana', { type: 'CLOSE_ELECTION' });
    t = act(t, 'dana', { type: 'SET_ASIDE_ELECTION' });
    expect(t.electionsSetAside.at(-1)?.ballots).toEqual([{ 'Ben Whitaker': 1, 'Carl Moss': 1 }]);
    expect(minutesOf(t)).toContain('Ballot 1, 2 ballots cast: Ben Whitaker 1, Carl Moss 1.');
  });

  it('reopens nominations for a seat still open with no candidates left, as one election (minor 1, 3)', () => {
    // Two seats, two nominees: Alice elected, Ben short of a majority, then he withdraws
    let s = open(inSession(), 'Director', 2);
    s = nominate(s, 'eve', 'Director', ...ALICE);
    s = act(s, 'dana', { type: 'CLOSE_NOMINATIONS' });
    // One nominee for two seats: acclaimed, the other seat open
    s = act(s, 'dana', { type: 'ELECT_BY_ACCLAMATION', electionId: 1 });
    s = open(s, 'Director');
    s = nominate(s, 'pat', 'Director', ...BEN);
    s = nominate(s, 'pat', 'Director', ...CARL);
    s = act(s, 'dana', { type: 'CLOSE_NOMINATIONS' });
    s = startBallot(s);
    for (const who of ['pat', 'alice', 'ben'] as const) s = ballot(s, who, 'Ben Whitaker');
    s = act(s, 'dana', { type: 'CLOSE_ELECTION' });
    s = act(s, 'dana', { type: 'DECLARE_ELECTED', candidateName: 'Ben Whitaker' });
    // One election from the acclamation to the ballot
    const [alice, ben] = s.electedOfficers;
    expect(ben.electionId).toBe(alice.electionId);
    expect(minutesOf(s)).toContain(
      '**Election for Director.** Alice Brennan was elected by acclamation. Ballot 1, 3 ballots cast: Ben Whitaker 3, Carl Moss 0. Ben Whitaker was elected.',
    );

    // A seat open with nobody left on the ballot: no next ballot, nominations reopen
    let t = open(inSession(), 'Director', 2);
    t = nominate(t, 'eve', 'Director', ...ALICE);
    t = nominate(t, 'eve', 'Director', ...BEN);
    t = act(t, 'dana', { type: 'CLOSE_NOMINATIONS' });
    t = startBallot(t);
    for (const who of ['pat', 'alice', 'ben'] as const) t = ballot(t, who, 'Alice Brennan');
    t = act(t, 'dana', { type: 'CLOSE_ELECTION' });
    t = act(t, 'dana', { type: 'DECLARE_ELECTED', candidateName: 'Alice Brennan' });
    t = act(t, 'dana', { type: 'DECLINE_NOMINATION', nominationId: t.nominations[1].id });
    const empty = { ...t, currentElection: { ...t.currentElection!, candidates: [] } };
    expect(
      refusal(empty, 'dana', {
        type: 'START_ELECTION',
        electionId: 3,
        position: 'Director',
        requiredVotes: 'majority',
      })?.error,
    ).toBe('No candidates are left: reopen nominations, or set the election aside');
    t = open(empty, 'Director');
    expect(t).toMatchObject({ nominationsOpen: true, currentElection: null, openSeats: 1 });
  });

  it('runs off only the candidates tied for the last seat under a plurality (minor 2)', () => {
    let s = open(inSession(), 'Director', 2);
    s = nominate(s, 'eve', 'Director', ...ALICE);
    s = nominate(s, 'pat', 'Director', ...BEN);
    s = nominate(s, 'alice', 'Director', ...CARL);
    s = nominate(s, 'alice', 'Director', 6, 'Eve Park');
    s = act(s, 'dana', { type: 'CLOSE_NOMINATIONS' });
    s = startBallot(s, 'plurality');
    s = ballot(s, 'pat', 'Alice Brennan', 'Ben Whitaker');
    s = ballot(s, 'alice', 'Alice Brennan', 'Carl Moss');
    s = ballot(s, 'ben', 'Alice Brennan', 'Eve Park');
    s = ballot(s, 'carl', 'Alice Brennan', 'Ben Whitaker');
    s = ballot(s, 'eve', 'Carl Moss');
    s = act(s, 'dana', { type: 'CLOSE_ELECTION' });
    // Alice 4; Ben 2 and Carl 2 tie for the second seat; Eve 1 is out of the running
    s = act(s, 'dana', { type: 'DECLARE_ELECTED', candidateName: 'Alice Brennan' });
    expect(s.currentElection?.candidates.map((c) => c.name)).toEqual(['Ben Whitaker', 'Carl Moss']);
  });

  it('keeps the open seats in the business left unfinished (minor 4)', () => {
    let s = oneSeatFilled();
    s = act(s, 'dana', { type: 'END_MEETING' });
    expect(s.unfinishedAtAdjournment[0]).toMatchObject({ kind: 'election', seats: 1 });
    expect(minutesOf(s)).toContain('the election for Director (1 seat still open)');
  });

  it('closes no ballot with no ballots cast (minor 5)', () => {
    const s = startBallot(threeForTwo());
    expect(refusal(s, 'dana', { type: 'CLOSE_ELECTION' })?.error).toBe(
      'No ballots have been cast: enter the paper ballots, or set the election aside',
    );
  });
});
