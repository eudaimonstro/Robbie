import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SocketRateLimiter } from '../socket/rateLimiter.js';

describe('SocketRateLimiter', () => {
  let limiter: SocketRateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    limiter?.destroy();
    vi.useRealTimers();
  });

  describe('consume', () => {
    it('should allow requests up to maxTokens', () => {
      limiter = new SocketRateLimiter({ maxTokens: 5, refillRate: 1, tokensPerRequest: 1 });

      // Should allow 5 requests (maxTokens)
      for (let i = 0; i < 5; i++) {
        expect(limiter.consume('user1')).toBe(true);
      }

      // 6th request should be denied
      expect(limiter.consume('user1')).toBe(false);
    });

    it('should track different users separately', () => {
      limiter = new SocketRateLimiter({ maxTokens: 2, refillRate: 1, tokensPerRequest: 1 });

      expect(limiter.consume('user1')).toBe(true);
      expect(limiter.consume('user1')).toBe(true);
      expect(limiter.consume('user1')).toBe(false);

      // user2 should have their own bucket
      expect(limiter.consume('user2')).toBe(true);
      expect(limiter.consume('user2')).toBe(true);
      expect(limiter.consume('user2')).toBe(false);
    });

    it('should accept both string and number user IDs', () => {
      limiter = new SocketRateLimiter({ maxTokens: 2, refillRate: 1, tokensPerRequest: 1 });

      expect(limiter.consume(123)).toBe(true);
      expect(limiter.consume('123')).toBe(true);
      // Same user, should be rate limited
      expect(limiter.consume(123)).toBe(false);
    });

    it('should refill tokens over time', () => {
      limiter = new SocketRateLimiter({ maxTokens: 2, refillRate: 1, tokensPerRequest: 1 });

      // Use all tokens
      expect(limiter.consume('user1')).toBe(true);
      expect(limiter.consume('user1')).toBe(true);
      expect(limiter.consume('user1')).toBe(false);

      // Advance time by 1 second (refillRate is 1 token/second)
      vi.advanceTimersByTime(1000);

      // Should have 1 token now
      expect(limiter.consume('user1')).toBe(true);
      expect(limiter.consume('user1')).toBe(false);
    });

    it('should not exceed maxTokens when refilling', () => {
      limiter = new SocketRateLimiter({ maxTokens: 3, refillRate: 10, tokensPerRequest: 1 });

      // Use one token
      expect(limiter.consume('user1')).toBe(true);

      // Advance time by 10 seconds (would add 100 tokens at refillRate 10)
      vi.advanceTimersByTime(10000);

      // Should still be capped at maxTokens (3)
      expect(limiter.consume('user1')).toBe(true);
      expect(limiter.consume('user1')).toBe(true);
      expect(limiter.consume('user1')).toBe(true);
      expect(limiter.consume('user1')).toBe(false);
    });

    it('should handle tokensPerRequest > 1', () => {
      limiter = new SocketRateLimiter({ maxTokens: 10, refillRate: 1, tokensPerRequest: 3 });

      // Each request costs 3 tokens, so 10/3 = 3 requests
      expect(limiter.consume('user1')).toBe(true); // 10 -> 7
      expect(limiter.consume('user1')).toBe(true); // 7 -> 4
      expect(limiter.consume('user1')).toBe(true); // 4 -> 1
      expect(limiter.consume('user1')).toBe(false); // 1 < 3, denied
    });
  });

  describe('getRemaining', () => {
    it('should return maxTokens for new users', () => {
      limiter = new SocketRateLimiter({ maxTokens: 30, refillRate: 2, tokensPerRequest: 1 });

      expect(limiter.getRemaining('newuser')).toBe(30);
    });

    it('should return remaining tokens after consumption', () => {
      limiter = new SocketRateLimiter({ maxTokens: 10, refillRate: 1, tokensPerRequest: 1 });

      limiter.consume('user1');
      limiter.consume('user1');
      limiter.consume('user1');

      expect(limiter.getRemaining('user1')).toBe(7);
    });

    it('should return floored value', () => {
      limiter = new SocketRateLimiter({ maxTokens: 10, refillRate: 1, tokensPerRequest: 1 });

      // Use all tokens
      for (let i = 0; i < 10; i++) {
        limiter.consume('user1');
      }

      // Advance by 500ms (0.5 tokens)
      vi.advanceTimersByTime(500);

      expect(limiter.getRemaining('user1')).toBe(0); // 0.5 floors to 0
    });
  });

  describe('getRetryAfter', () => {
    it('should return 0 when tokens are available', () => {
      limiter = new SocketRateLimiter({ maxTokens: 10, refillRate: 1, tokensPerRequest: 1 });

      expect(limiter.getRetryAfter('user1')).toBe(0);

      limiter.consume('user1');
      expect(limiter.getRetryAfter('user1')).toBe(0);
    });

    it('should return 0 for unknown users', () => {
      limiter = new SocketRateLimiter({ maxTokens: 10, refillRate: 1, tokensPerRequest: 1 });

      expect(limiter.getRetryAfter('unknown')).toBe(0);
    });

    it('should return time until next token when rate limited', () => {
      limiter = new SocketRateLimiter({ maxTokens: 2, refillRate: 1, tokensPerRequest: 1 });

      limiter.consume('user1');
      limiter.consume('user1');

      // Now rate limited, need 1 token at 1/second = 1000ms
      const retryAfter = limiter.getRetryAfter('user1');
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(1000);
    });

    it('should reflect updated state after consume is called again', () => {
      limiter = new SocketRateLimiter({ maxTokens: 2, refillRate: 1, tokensPerRequest: 1 });

      limiter.consume('user1');
      limiter.consume('user1');
      // Now rate limited

      const initial = limiter.getRetryAfter('user1');
      expect(initial).toBeGreaterThan(0);

      // Advance time and try to consume again (this updates the bucket)
      vi.advanceTimersByTime(1500); // 1.5 tokens refilled

      // Now consume should work (updates bucket with refill)
      expect(limiter.consume('user1')).toBe(true);

      // After successful consume, retryAfter should be 0 or low
      const after = limiter.getRetryAfter('user1');
      expect(after).toBeLessThanOrEqual(500); // 0.5 tokens remain, need 0.5 more = 500ms
    });
  });

  describe('remove', () => {
    it('should remove a user bucket', () => {
      limiter = new SocketRateLimiter({ maxTokens: 5, refillRate: 1, tokensPerRequest: 1 });

      // Use some tokens
      limiter.consume('user1');
      limiter.consume('user1');
      expect(limiter.getRemaining('user1')).toBe(3);

      // Remove the bucket
      limiter.remove('user1');

      // Should be back to maxTokens (new bucket)
      expect(limiter.getRemaining('user1')).toBe(5);
    });

    it('should not affect other users', () => {
      limiter = new SocketRateLimiter({ maxTokens: 5, refillRate: 1, tokensPerRequest: 1 });

      limiter.consume('user1');
      limiter.consume('user2');
      limiter.consume('user2');

      limiter.remove('user1');

      expect(limiter.getRemaining('user1')).toBe(5); // Reset
      expect(limiter.getRemaining('user2')).toBe(3); // Unchanged
    });
  });

  describe('cleanup', () => {
    it('should remove old buckets after inactivity', () => {
      limiter = new SocketRateLimiter({ maxTokens: 5, refillRate: 1, tokensPerRequest: 1 });

      limiter.consume('user1');
      expect(limiter.getRemaining('user1')).toBe(4);

      // Advance past cleanup interval (5 min) + max age (10 min)
      vi.advanceTimersByTime(16 * 60 * 1000);

      // Bucket should be cleaned up, back to maxTokens
      expect(limiter.getRemaining('user1')).toBe(5);
    });
  });

  describe('destroy', () => {
    it('should clear all buckets', () => {
      limiter = new SocketRateLimiter({ maxTokens: 5, refillRate: 1, tokensPerRequest: 1 });

      limiter.consume('user1');
      limiter.consume('user2');

      limiter.destroy();

      // After destroy, getRemaining returns maxTokens (new buckets)
      expect(limiter.getRemaining('user1')).toBe(5);
      expect(limiter.getRemaining('user2')).toBe(5);
    });
  });

  describe('default configuration', () => {
    it('should use sensible defaults', () => {
      limiter = new SocketRateLimiter();

      // Should allow burst of 30
      for (let i = 0; i < 30; i++) {
        expect(limiter.consume('user1')).toBe(true);
      }
      expect(limiter.consume('user1')).toBe(false);

      // Should refill at 2/second
      vi.advanceTimersByTime(1000);
      expect(limiter.consume('user1')).toBe(true);
      expect(limiter.consume('user1')).toBe(true);
      expect(limiter.consume('user1')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle rapid successive calls', () => {
      limiter = new SocketRateLimiter({ maxTokens: 100, refillRate: 10, tokensPerRequest: 1 });

      // Rapid-fire 100 requests
      const results = [];
      for (let i = 0; i < 110; i++) {
        results.push(limiter.consume('user1'));
      }

      const allowed = results.filter((r) => r).length;
      const denied = results.filter((r) => !r).length;

      expect(allowed).toBe(100);
      expect(denied).toBe(10);
    });

    it('should handle very slow refill rates', () => {
      limiter = new SocketRateLimiter({ maxTokens: 5, refillRate: 0.1, tokensPerRequest: 1 });

      // Use all tokens
      for (let i = 0; i < 5; i++) {
        limiter.consume('user1');
      }

      // Advance 5 seconds (only 0.5 tokens at 0.1/sec)
      vi.advanceTimersByTime(5000);
      expect(limiter.consume('user1')).toBe(false);

      // Advance 10 more seconds (total 1.5 tokens)
      vi.advanceTimersByTime(10000);
      expect(limiter.consume('user1')).toBe(true);
      expect(limiter.consume('user1')).toBe(false);
    });
  });
});
