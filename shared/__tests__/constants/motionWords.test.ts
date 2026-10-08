import { describe, it, expect } from 'vitest';
import { MOTIONS, motionWords, plainMotionName } from '../../constants/index.js';

describe('motionWords', () => {
  it('gives every motion a sentence-case name and one short line', () => {
    for (const key of Object.keys(MOTIONS)) {
      const { name, explanation } = motionWords(key);
      // No capital after the first letter
      expect(name.slice(1), key).toBe(name.slice(1).toLowerCase());
      expect(explanation.length, key).toBeGreaterThan(0);
      expect(explanation.length, key).toBeLessThanOrEqual(60);
    }
  });

  it('says what referring to a committee does', () => {
    expect(motionWords('referCommittee')).toEqual({
      name: 'Refer to a committee',
      explanation: 'Send the question to a committee to study',
    });
  });

  it('names a motion plainly from its key, its book name, or else in sentence case', () => {
    expect(plainMotionName('Main Motion', 'mainMotion')).toBe('Main motion');
    expect(plainMotionName('Refer to Committee')).toBe('Refer to a committee');
    expect(plainMotionName('Refer to a Committee')).toBe('Refer to a committee');
    expect(plainMotionName('Ratify the Contract', 'noSuchMotion')).toBe('Ratify the contract');
  });
});
