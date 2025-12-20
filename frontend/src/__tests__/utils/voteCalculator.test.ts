import { describe, it, expect } from 'vitest';
import { calculateVoteResult, getChairVotingOptions } from '@robbie/shared/utils';

describe('voteCalculator', () => {
  describe('calculateVoteResult', () => {
    it('should pass a majority vote when yea exceeds half', () => {
      const result = calculateVoteResult({ yea: 6, nay: 4, abstain: 2 }, 'majority');
      expect(result.passed).toBe(true);
      expect(result.yea).toBe(6);
      expect(result.nay).toBe(4);
      expect(result.total).toBe(10);
    });

    it('should fail a majority vote when yea equals half', () => {
      const result = calculateVoteResult({ yea: 5, nay: 5, abstain: 0 }, 'majority');
      expect(result.passed).toBe(false);
    });

    it('should fail a majority vote when yea is less than half', () => {
      const result = calculateVoteResult({ yea: 4, nay: 6, abstain: 0 }, 'majority');
      expect(result.passed).toBe(false);
    });

    it('should pass a 2/3 vote when yea exceeds two-thirds', () => {
      const result = calculateVoteResult({ yea: 8, nay: 2, abstain: 0 }, '2/3');
      expect(result.passed).toBe(true);
    });

    it('should fail a 2/3 vote when yea equals two-thirds', () => {
      // 6 yea, 3 nay = 9 total, threshold = 6
      const result = calculateVoteResult({ yea: 6, nay: 3, abstain: 0 }, '2/3');
      expect(result.passed).toBe(false);
    });

    it('should fail a 2/3 vote when yea is less than two-thirds', () => {
      const result = calculateVoteResult({ yea: 5, nay: 5, abstain: 0 }, '2/3');
      expect(result.passed).toBe(false);
    });

    it('should not count abstentions toward total', () => {
      const result = calculateVoteResult({ yea: 3, nay: 2, abstain: 10 }, 'majority');
      expect(result.total).toBe(5);
      expect(result.abstain).toBe(10);
      expect(result.passed).toBe(true);
    });

    it('should handle vote requirement "none"', () => {
      // "none" should be treated as majority
      const result = calculateVoteResult({ yea: 3, nay: 2, abstain: 0 }, 'none');
      expect(result.passed).toBe(true);
    });

    it('should handle zero votes', () => {
      const result = calculateVoteResult({ yea: 0, nay: 0, abstain: 0 }, 'majority');
      expect(result.passed).toBe(false);
      expect(result.total).toBe(0);
    });
  });

  describe('getChairVotingOptions', () => {
    it('should allow chair to break a tie', () => {
      const result = getChairVotingOptions({ yea: 5, nay: 5, abstain: 0 });
      expect(result.canBreakTie).toBe(true);
      expect(result.canCreateTie).toBe(false);
    });

    it('should allow chair to create a tie when yea is ahead by one', () => {
      const result = getChairVotingOptions({ yea: 6, nay: 5, abstain: 0 });
      expect(result.canBreakTie).toBe(false);
      expect(result.canCreateTie).toBe(true);
    });

    it('should not allow chair voting when neither option applies', () => {
      const result = getChairVotingOptions({ yea: 7, nay: 5, abstain: 0 });
      expect(result.canBreakTie).toBe(false);
      expect(result.canCreateTie).toBe(false);
    });

    it('should not allow chair voting when nay is ahead', () => {
      const result = getChairVotingOptions({ yea: 4, nay: 6, abstain: 0 });
      expect(result.canBreakTie).toBe(false);
      expect(result.canCreateTie).toBe(false);
    });
  });
});
