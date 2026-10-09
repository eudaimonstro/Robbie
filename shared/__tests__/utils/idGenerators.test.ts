import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateId, generateTimestamp, calculateTimerEnd } from '../../utils/index.js';

describe('idGenerators', () => {
  describe('generateId', () => {
    it('should return a number', () => {
      const id = generateId();
      expect(typeof id).toBe('number');
    });

    it('should return different IDs on subsequent calls', async () => {
      const id1 = generateId();
      await new Promise((resolve) => setTimeout(resolve, 2));
      const id2 = generateId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('generateTimestamp', () => {
    it('should return a string', () => {
      const timestamp = generateTimestamp();
      expect(typeof timestamp).toBe('string');
    });

    it('should return a valid time format', () => {
      const timestamp = generateTimestamp();
      // Should contain time-like characters (digits and colons)
      expect(timestamp).toMatch(/\d/);
    });
  });

  describe('calculateTimerEnd', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-01T12:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return null when seconds is 0', () => {
      const result = calculateTimerEnd(0);
      expect(result).toBeNull();
    });

    it('should return null when seconds is negative', () => {
      const result = calculateTimerEnd(-10);
      expect(result).toBeNull();
    });

    it('should return timestamp in future when seconds is positive', () => {
      const now = Date.now();
      const result = calculateTimerEnd(60);
      expect(result).toBe(now + 60 * 1000);
    });

    it('should correctly calculate for various durations', () => {
      const now = Date.now();

      expect(calculateTimerEnd(30)).toBe(now + 30000);
      expect(calculateTimerEnd(120)).toBe(now + 120000);
      expect(calculateTimerEnd(300)).toBe(now + 300000);
    });
  });
});
