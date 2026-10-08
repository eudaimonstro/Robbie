import { describe, it, expect } from 'vitest';
import {
  calculateVoteResult,
  canChairVoteDecide,
  motionThreshold,
  thresholdFromSetting,
  thresholdText,
  votesNeeded,
} from '../../utils/index.js';

const votes = (yea: number, nay: number, abstain = 0) => ({ yea, nay, abstain });
const ofMembers = (fraction: 'majority' | '2/3', members: number) =>
  ({ fraction, of: 'members', members }) as const;

describe('vote thresholds', () => {
  describe('of all the voting members', () => {
    it('needs more than half of the members for a majority, 72 of 142', () => {
      expect(votesNeeded(ofMembers('majority', 142))).toBe(72);
      expect(calculateVoteResult(votes(71, 0), ofMembers('majority', 142)).passed).toBe(false);
      const result = calculateVoteResult(votes(72, 30, 5), ofMembers('majority', 142));
      expect(result).toMatchObject({ passed: true, needed: 72, total: 102 });
    });

    it('needs two thirds of the members, 95 of 142, whatever the votes cast', () => {
      expect(votesNeeded(ofMembers('2/3', 142))).toBe(95);
      // 94 to 5 is far more than two thirds of the votes cast, and still short
      expect(calculateVoteResult(votes(94, 5), ofMembers('2/3', 142)).passed).toBe(false);
      expect(calculateVoteResult(votes(95, 40), ofMembers('2/3', 142)).passed).toBe(true);
      expect(votesNeeded(ofMembers('2/3', 3))).toBe(2);
      expect(votesNeeded(ofMembers('2/3', 9))).toBe(6);
    });

    it('counts an abstention as no help: abstaining is not voting yes', () => {
      expect(calculateVoteResult(votes(70, 0, 40), ofMembers('majority', 142)).passed).toBe(false);
    });

    it('must also carry among the votes cast (a count of members set too low)', () => {
      expect(calculateVoteResult(votes(6, 7), ofMembers('majority', 10)).passed).toBe(false);
    });

    it('never needs fewer than one vote', () => {
      expect(votesNeeded(ofMembers('2/3', 0))).toBe(1);
      expect(calculateVoteResult(votes(0, 0), ofMembers('2/3', 0)).passed).toBe(false);
    });
  });

  it('of the votes cast, is the old requirement: abstentions left out, a tie fails', () => {
    const cast = { fraction: 'majority', of: 'cast' } as const;
    expect(calculateVoteResult(votes(3, 3, 9), cast).passed).toBe(false);
    expect(calculateVoteResult(votes(4, 3, 9), cast).passed).toBe(true);
    expect(calculateVoteResult(votes(6, 3), { fraction: '2/3', of: 'cast' }).passed).toBe(true);
    expect(votesNeeded(cast)).toBeNull();
  });

  it("lets the chair vote when the chair's vote reaches the number needed", () => {
    expect(canChairVoteDecide(votes(94, 2), ofMembers('2/3', 142))).toBe(true);
    expect(canChairVoteDecide(votes(80, 2), ofMembers('2/3', 142))).toBe(false);
  });

  it('comes from the setting, with the members counted', () => {
    expect(thresholdFromSetting('twoThirdsCast', 142)).toEqual({ fraction: '2/3', of: 'cast' });
    expect(thresholdFromSetting('majorityCast', 142)).toEqual({ fraction: 'majority', of: 'cast' });
    expect(thresholdFromSetting('majorityMembers', 142)).toEqual(ofMembers('majority', 142));
    expect(thresholdFromSetting('twoThirdsMembers', 142)).toEqual(ofMembers('2/3', 142));
  });

  it('is said plainly', () => {
    expect(thresholdText({ fraction: 'majority', of: 'cast' })).toBe('Majority');
    expect(thresholdText({ fraction: '2/3', of: 'cast' })).toBe('Two thirds');
    expect(thresholdText(ofMembers('2/3', 142))).toBe(
      'Two thirds of all 142 voting members: 95 votes needed',
    );
    expect(thresholdText(ofMembers('majority', 1))).toBe(
      'Majority of all 1 voting members: 1 vote needed',
    );
  });

  describe("a motion's threshold", () => {
    it("is its definition's vote, of the votes cast", () => {
      expect(motionThreshold({ type: 'mainMotion', vote: 'majority' })).toEqual({
        fraction: 'majority',
        of: 'cast',
      });
      expect(motionThreshold({ type: 'previousQuestion', vote: '2/3' })).toEqual({
        fraction: '2/3',
        of: 'cast',
      });
    });

    it("is a bylaw amendment's own, stamped when it was moved", () => {
      expect(
        motionThreshold({
          type: 'bylawAmendment',
          vote: '2/3',
          bylawAmendment: {
            documentId: 'd',
            changeType: 'modify',
            voteRequired: ofMembers('majority', 50),
          },
        }),
      ).toEqual(ofMembers('majority', 50));
    });
  });
});
