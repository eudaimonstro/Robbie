import { describe, it, expect } from 'vitest';
import type { Election } from '../../types/index.js';
import { countBallot } from '../../utils/index.js';

const ballot = (overrides: Partial<Election>): Election => ({
  id: 1,
  position: 'Director',
  candidates: [
    { name: 'Ann', id: 1 },
    { name: 'Bo', id: 2 },
    { name: 'Cy', id: 3 },
  ],
  requiredVotes: 'majority',
  votingInProgress: true,
  ballotResults: {},
  votersWhoVoted: [],
  elected: null,
  ...overrides,
});
const voters = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe('countBallot', () => {
  it('counts a blank paper ballot out of the ballots cast, and an illegal one in (RONR 45:31)', () => {
    // One seat: 4 on devices, paper 3 for Ann and 1 illegal, 2 blank: 8 cast, and Ann's 5 is a
    // majority (with the blanks counted, 10 cast, it would not be)
    const { totals, winners } = countBallot(
      ballot({
        ballotResults: { Ann: 2, Bo: 2 },
        votersWhoVoted: voters(4),
        floorBallots: { Ann: 3 },
        floorBlank: 2,
        floorIllegal: 1,
      }),
    );
    expect(totals).toEqual({ cast: 8, blank: 2, illegal: 1 });
    expect(winners).toEqual(['Ann']);
  });

  it('elects two thirds of the ballots for two seats only with two thirds', () => {
    const { winners } = countBallot(
      ballot({
        requiredVotes: '2/3',
        seats: 2,
        ballotResults: { Ann: 6, Bo: 5, Cy: 4 },
        votersWhoVoted: voters(9),
      }),
    );
    // Two thirds of 9 is 6: Ann alone
    expect(winners).toEqual(['Ann']);
  });

  it('fills the seats by plurality, leaving a tie for the last seat to another ballot', () => {
    const tie = countBallot(
      ballot({
        requiredVotes: 'plurality',
        seats: 2,
        ballotResults: { Ann: 5, Bo: 3, Cy: 3 },
        votersWhoVoted: voters(6),
      }),
    );
    expect(tie.winners).toEqual(['Ann']);
    // With nobody elected under a plurality, the tied run off
    const runoff = countBallot(
      ballot({
        requiredVotes: 'plurality',
        ballotResults: { Ann: 3, Bo: 3, Cy: 1 },
        votersWhoVoted: voters(7),
      }),
    );
    expect(runoff.winners).toEqual([]);
    expect(runoff.tied).toEqual(['Ann', 'Bo']);
    expect(runoff.next.map((c) => c.name)).toEqual(['Ann', 'Bo']);
  });

  it('elects nobody with no ballots cast', () => {
    expect(countBallot(ballot({ requiredVotes: 'plurality' })).winners).toEqual([]);
  });

  it('puts a name written in who received votes on the next ballot, as a write-in', () => {
    const { next, totals } = countBallot(
      ballot({
        ballotResults: { Ann: 1 },
        votersWhoVoted: voters(1),
        floorWriteIns: { Dee: 2, Eve: 0 },
      }),
    );
    expect(next.at(-1)).toEqual({ name: 'Dee', id: 0, writeIn: true });
    expect(next).toHaveLength(4);
    expect(totals.writeIns).toEqual(['Dee']);
  });
});
