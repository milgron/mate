/**
 * Token bucket rate limiter.
 * Tokens refill at a constant rate up to capacity.
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    private readonly refillRate: number // tokens per second
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  /**
   * Attempts to consume tokens from the bucket.
   * Returns true if successful, false if not enough tokens.
   */
  consume(tokens: number = 1): boolean {
    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }

    return false;
  }

  /**
   * Refills tokens based on elapsed time.
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const tokensToAdd = elapsed * this.refillRate;

    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Returns current token count (for debugging).
   */
  getTokens(): number {
    this.refill();
    return this.tokens;
  }
}

export interface RateLimiterConfig {
  capacity: number;
  refillRate: number; // tokens per second
}

/**
 * Per-user rate limiter using token buckets.
 */
export class RateLimiter {
  private readonly buckets: Map<string, TokenBucket> = new Map();
  private readonly config: RateLimiterConfig;

  constructor(config: RateLimiterConfig) {
    this.config = config;
  }

  /**
   * Checks if user can make a request and consumes a token if allowed.
   */
  checkAndConsume(userId: string): boolean {
    let bucket = this.buckets.get(userId);

    if (!bucket) {
      bucket = new TokenBucket(this.config.capacity, this.config.refillRate);
      this.buckets.set(userId, bucket);
    }

    return bucket.consume();
  }

  /**
   * Cleans up buckets for users who haven't made requests recently.
   * Call periodically to prevent memory leaks.
   */
  cleanup(): void {
    for (const [userId, bucket] of this.buckets) {
      // If bucket is full, user hasn't made requests recently
      if (bucket.getTokens() >= this.config.capacity) {
        this.buckets.delete(userId);
      }
    }
  }
}
