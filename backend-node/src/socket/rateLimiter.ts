/**
 * Simple token bucket rate limiter for Socket.io events
 * Tracks requests per user/socket with configurable limits
 *
 * Includes memory protection:
 * - Maximum bucket count to prevent unbounded growth
 * - Automatic eviction of oldest buckets when limit is reached
 * - Periodic cleanup of stale buckets
 */

interface RateLimitBucket {
  tokens: number;
  lastRefill: number;
}

interface RateLimiterOptions {
  /** Maximum tokens in bucket */
  maxTokens: number;
  /** Tokens added per second */
  refillRate: number;
  /** Tokens consumed per request */
  tokensPerRequest: number;
  /** Maximum number of buckets to prevent memory exhaustion (default: 10000) */
  maxBuckets?: number;
}

const DEFAULT_OPTIONS: RateLimiterOptions = {
  maxTokens: 30, // Allow burst of 30 actions
  refillRate: 2, // Refill 2 tokens per second
  tokensPerRequest: 1, // Each action costs 1 token
  maxBuckets: 10000, // Limit memory usage
};

export class SocketRateLimiter {
  private buckets = new Map<string, RateLimitBucket>();
  private options: Required<RateLimiterOptions>;
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(options: Partial<RateLimiterOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options } as Required<RateLimiterOptions>;

    // Cleanup old buckets every 5 minutes
    this.cleanupInterval = setInterval(
      () => {
        this.cleanup();
      },
      5 * 60 * 1000,
    );
  }

  /**
   * Check if a request should be allowed
   * Returns true if allowed, false if rate limited
   */
  consume(userId: string | number): boolean {
    const key = String(userId);
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      // Enforce maximum bucket count to prevent memory exhaustion
      if (this.buckets.size >= this.options.maxBuckets) {
        this.evictOldest();
      }

      bucket = {
        tokens: this.options.maxTokens,
        lastRefill: now,
      };
      this.buckets.set(key, bucket);
    }

    // Refill tokens based on time elapsed
    const elapsed = (now - bucket.lastRefill) / 1000; // seconds
    const tokensToAdd = elapsed * this.options.refillRate;
    bucket.tokens = Math.min(this.options.maxTokens, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    // Check if we have enough tokens
    if (bucket.tokens >= this.options.tokensPerRequest) {
      bucket.tokens -= this.options.tokensPerRequest;
      return true;
    }

    return false;
  }

  /**
   * Evict the oldest bucket to make room for new ones
   * Called when maxBuckets limit is reached
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.lastRefill < oldestTime) {
        oldestTime = bucket.lastRefill;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.buckets.delete(oldestKey);
    }
  }

  /**
   * Get remaining tokens for a user (for debugging/monitoring)
   */
  getRemaining(userId: string | number): number {
    const bucket = this.buckets.get(String(userId));
    return bucket ? Math.floor(bucket.tokens) : this.options.maxTokens;
  }

  /**
   * Get time until next token is available (in milliseconds)
   */
  getRetryAfter(userId: string | number): number {
    const bucket = this.buckets.get(String(userId));
    if (!bucket || bucket.tokens >= this.options.tokensPerRequest) {
      return 0;
    }
    const tokensNeeded = this.options.tokensPerRequest - bucket.tokens;
    return Math.ceil((tokensNeeded / this.options.refillRate) * 1000);
  }

  /**
   * Remove a user's bucket (e.g., on disconnect)
   */
  remove(userId: string | number): void {
    this.buckets.delete(String(userId));
  }

  /**
   * Cleanup buckets that haven't been used in a while
   */
  private cleanup(): void {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutes

    for (const [key, bucket] of this.buckets.entries()) {
      if (now - bucket.lastRefill > maxAge) {
        this.buckets.delete(key);
      }
    }
  }

  /**
   * Destroy the rate limiter (clear interval)
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.buckets.clear();
  }
}

// Singleton instance for action rate limiting
export const actionRateLimiter = new SocketRateLimiter({
  maxTokens: 30, // Allow burst of 30 actions
  refillRate: 2, // 2 actions per second sustainable rate
  tokensPerRequest: 1,
});

// Stricter limiter for join attempts (prevent meeting code guessing)
export const joinRateLimiter = new SocketRateLimiter({
  maxTokens: 5, // Max 5 join attempts
  refillRate: 0.1, // 1 attempt per 10 seconds sustainable
  tokensPerRequest: 1,
});
