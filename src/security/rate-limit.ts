/**
 * Token bucket rate limiter.
 * Tokens refill at a constant rate up to capacity.
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private lastUsed: number;

  constructor(
    private readonly capacity: number,
    private readonly refillRate: number // tokens per second
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
    this.lastUsed = Date.now();
  }

  /**
   * Attempts to consume tokens from the bucket.
   * Returns true if successful, false if not enough tokens.
   */
  consume(tokens: number = 1): boolean {
    this.refill();
    this.lastUsed = Date.now();

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

  /**
   * Returns timestamp of last usage.
   */
  getLastUsed(): number {
    return this.lastUsed;
  }
}

export interface RateLimiterConfig {
  capacity: number;
  refillRate: number; // tokens per second
}

// Max idle time before bucket is cleaned up (1 hour)
const MAX_IDLE_MS = 3600000;

/**
 * Per-user rate limiter using token buckets.
 */
export class RateLimiter {
  private readonly buckets: Map<string, TokenBucket> = new Map();
  private readonly config: RateLimiterConfig;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: RateLimiterConfig) {
    this.config = config;
    // Auto-cleanup every 10 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 600000);
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
   * Uses timestamp-based cleanup to prevent memory leaks.
   */
  cleanup(): void {
    const now = Date.now();

    for (const [userId, bucket] of this.buckets) {
      // Remove buckets that haven't been used in MAX_IDLE_MS
      if (now - bucket.getLastUsed() > MAX_IDLE_MS) {
        this.buckets.delete(userId);
      }
    }
  }

  /**
   * Stops the cleanup interval (for graceful shutdown).
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Returns the number of active buckets (for debugging).
   */
  size(): number {
    return this.buckets.size;
  }
}
