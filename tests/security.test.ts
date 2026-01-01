import { describe, it, expect, beforeEach } from 'vitest';

// Import modules we'll implement (tests first - TDD)
// These will fail until we implement them

describe('Encryption', () => {
  describe('encrypt/decrypt roundtrip', () => {
    it('should encrypt and decrypt a string correctly', async () => {
      const { encrypt, decrypt } = await import('../src/security/encryption.js');

      const plaintext = 'secret message';
      const masterKey = 'test-master-key-32-bytes-long!!';

      const encrypted = encrypt(plaintext, masterKey);
      const decrypted = decrypt(encrypted, masterKey);

      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext for same input (random IV)', async () => {
      const { encrypt } = await import('../src/security/encryption.js');

      const plaintext = 'secret message';
      const masterKey = 'test-master-key-32-bytes-long!!';

      const encrypted1 = encrypt(plaintext, masterKey);
      const encrypted2 = encrypt(plaintext, masterKey);

      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
    });

    it('should fail decryption with wrong key', async () => {
      const { encrypt, decrypt } = await import('../src/security/encryption.js');

      const plaintext = 'secret message';
      const correctKey = 'test-master-key-32-bytes-long!!';
      const wrongKey = 'wrong-master-key-32-bytes-long!';

      const encrypted = encrypt(plaintext, correctKey);

      expect(() => decrypt(encrypted, wrongKey)).toThrow();
    });

    it('should detect tampering with ciphertext', async () => {
      const { encrypt, decrypt } = await import('../src/security/encryption.js');

      const plaintext = 'secret message';
      const masterKey = 'test-master-key-32-bytes-long!!';

      const encrypted = encrypt(plaintext, masterKey);
      // Tamper with ciphertext
      encrypted.ciphertext = 'tampered' + encrypted.ciphertext.slice(8);

      expect(() => decrypt(encrypted, masterKey)).toThrow();
    });
  });
});

describe('Whitelist', () => {
  describe('user ID validation', () => {
    it('should allow whitelisted user IDs', async () => {
      const { UserWhitelist } = await import('../src/security/whitelist.js');

      const whitelist = new UserWhitelist(['123456789', '987654321']);

      expect(whitelist.isAllowed('123456789')).toBe(true);
      expect(whitelist.isAllowed('987654321')).toBe(true);
    });

    it('should reject non-whitelisted user IDs', async () => {
      const { UserWhitelist } = await import('../src/security/whitelist.js');

      const whitelist = new UserWhitelist(['123456789']);

      expect(whitelist.isAllowed('999999999')).toBe(false);
    });

    it('should handle numeric user IDs', async () => {
      const { UserWhitelist } = await import('../src/security/whitelist.js');

      const whitelist = new UserWhitelist(['123456789']);

      expect(whitelist.isAllowed(123456789)).toBe(true);
    });

    it('should reject invalid user ID formats', async () => {
      const { UserWhitelist } = await import('../src/security/whitelist.js');

      const whitelist = new UserWhitelist(['123456789']);

      expect(whitelist.isAllowed('')).toBe(false);
      expect(whitelist.isAllowed('abc')).toBe(false);
      expect(whitelist.isAllowed('-123')).toBe(false);
    });

    it('should load from comma-separated string', async () => {
      const { UserWhitelist } = await import('../src/security/whitelist.js');

      const whitelist = UserWhitelist.fromString('123,456,789');

      expect(whitelist.isAllowed('123')).toBe(true);
      expect(whitelist.isAllowed('456')).toBe(true);
      expect(whitelist.isAllowed('789')).toBe(true);
    });
  });
});

describe('RateLimiter', () => {
  describe('token bucket', () => {
    it('should allow requests within rate limit', async () => {
      const { TokenBucket } = await import('../src/security/rate-limit.js');

      // 10 tokens, refill 1 per second
      const bucket = new TokenBucket(10, 1);

      // Should allow 10 requests
      for (let i = 0; i < 10; i++) {
        expect(bucket.consume()).toBe(true);
      }
    });

    it('should reject requests exceeding rate limit', async () => {
      const { TokenBucket } = await import('../src/security/rate-limit.js');

      const bucket = new TokenBucket(5, 1);

      // Consume all tokens
      for (let i = 0; i < 5; i++) {
        bucket.consume();
      }

      // Next request should be rejected
      expect(bucket.consume()).toBe(false);
    });

    it('should refill tokens over time', async () => {
      const { TokenBucket } = await import('../src/security/rate-limit.js');

      const bucket = new TokenBucket(5, 10); // 10 tokens per second

      // Consume all tokens
      for (let i = 0; i < 5; i++) {
        bucket.consume();
      }

      // Wait 100ms (should refill ~1 token)
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should have at least 1 token now
      expect(bucket.consume()).toBe(true);
    });

    it('should not exceed capacity', async () => {
      const { TokenBucket } = await import('../src/security/rate-limit.js');

      const bucket = new TokenBucket(5, 100); // Very fast refill

      // Wait for potential over-refill
      await new Promise(resolve => setTimeout(resolve, 200));

      // Consume capacity tokens
      for (let i = 0; i < 5; i++) {
        expect(bucket.consume()).toBe(true);
      }

      // 6th should fail (bucket capped at capacity)
      expect(bucket.consume()).toBe(false);
    });
  });

  describe('per-user rate limiting', () => {
    it('should track rate limits per user', async () => {
      const { RateLimiter } = await import('../src/security/rate-limit.js');

      const limiter = new RateLimiter({ capacity: 2, refillRate: 0.1 });

      // User A uses their quota
      expect(limiter.checkAndConsume('userA')).toBe(true);
      expect(limiter.checkAndConsume('userA')).toBe(true);
      expect(limiter.checkAndConsume('userA')).toBe(false);

      // User B should still have quota
      expect(limiter.checkAndConsume('userB')).toBe(true);
    });
  });
});

describe('AuditLogger', () => {
  it('should log actions with timestamp and user', async () => {
    const { AuditLogger } = await import('../src/security/audit.js');

    const logs: Array<{ action: string; userId: string; details: unknown }> = [];
    const logger = new AuditLogger({
      log: (entry) => logs.push(entry),
    });

    logger.logAction('tool_call', 'user123', { tool: 'bash', input: 'ls' });

    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      action: 'tool_call',
      userId: 'user123',
      details: { tool: 'bash', input: 'ls' },
    });
  });

  it('should include timestamp in logs', async () => {
    const { AuditLogger } = await import('../src/security/audit.js');

    const logs: Array<{ timestamp: string }> = [];
    const logger = new AuditLogger({
      log: (entry) => logs.push(entry as { timestamp: string }),
    });

    const before = Date.now();
    logger.logAction('test', 'user', {});
    const after = Date.now();

    const logTime = new Date(logs[0]!.timestamp).getTime();
    expect(logTime).toBeGreaterThanOrEqual(before);
    expect(logTime).toBeLessThanOrEqual(after);
  });
});
