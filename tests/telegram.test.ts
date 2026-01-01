import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Grammy types for testing
interface MockContext {
  from?: { id: number };
  message?: { text: string };
  reply: ReturnType<typeof vi.fn>;
}

describe('Telegram Bot', () => {
  describe('createBot', () => {
    it('should create a bot with the provided token', async () => {
      const { createBot } = await import('../src/telegram/bot.js');

      const bot = createBot('test-token');

      expect(bot).toBeDefined();
      expect(bot.token).toBe('test-token');
    });
  });

  describe('AuthMiddleware', () => {
    it('should allow whitelisted users', async () => {
      const { createAuthMiddleware } = await import('../src/telegram/middleware.js');
      const { UserWhitelist } = await import('../src/security/whitelist.js');

      const whitelist = new UserWhitelist(['123456789']);
      const middleware = createAuthMiddleware(whitelist);

      const ctx: MockContext = {
        from: { id: 123456789 },
        reply: vi.fn(),
      };
      const next = vi.fn();

      await middleware(ctx as any, next);

      expect(next).toHaveBeenCalled();
      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it('should reject non-whitelisted users', async () => {
      const { createAuthMiddleware } = await import('../src/telegram/middleware.js');
      const { UserWhitelist } = await import('../src/security/whitelist.js');

      const whitelist = new UserWhitelist(['123456789']);
      const middleware = createAuthMiddleware(whitelist);

      const ctx: MockContext = {
        from: { id: 999999999 },
        reply: vi.fn(),
      };
      const next = vi.fn();

      await middleware(ctx as any, next);

      expect(next).not.toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('not authorized')
      );
    });

    it('should reject messages without user info', async () => {
      const { createAuthMiddleware } = await import('../src/telegram/middleware.js');
      const { UserWhitelist } = await import('../src/security/whitelist.js');

      const whitelist = new UserWhitelist(['123456789']);
      const middleware = createAuthMiddleware(whitelist);

      const ctx: MockContext = {
        from: undefined,
        reply: vi.fn(),
      };
      const next = vi.fn();

      await middleware(ctx as any, next);

      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('RateLimitMiddleware', () => {
    it('should allow requests within rate limit', async () => {
      const { createRateLimitMiddleware } = await import('../src/telegram/middleware.js');

      const middleware = createRateLimitMiddleware({ capacity: 10, refillRate: 1 });

      const ctx: MockContext = {
        from: { id: 123456789 },
        reply: vi.fn(),
      };
      const next = vi.fn();

      await middleware(ctx as any, next);

      expect(next).toHaveBeenCalled();
      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it('should reject requests exceeding rate limit', async () => {
      const { createRateLimitMiddleware } = await import('../src/telegram/middleware.js');

      const middleware = createRateLimitMiddleware({ capacity: 2, refillRate: 0.01 });

      const ctx: MockContext = {
        from: { id: 123456789 },
        reply: vi.fn(),
      };
      const next = vi.fn();

      // Exhaust rate limit
      await middleware(ctx as any, next);
      await middleware(ctx as any, next);

      // Reset mock
      next.mockClear();
      ctx.reply.mockClear();

      // This should be rate limited
      await middleware(ctx as any, next);

      expect(next).not.toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('rate limit')
      );
    });
  });

  describe('MessageHandler', () => {
    it('should handle text messages', async () => {
      const { handleMessage } = await import('../src/telegram/handlers.js');

      const processMessage = vi.fn().mockResolvedValue('Response from agent');

      const ctx: MockContext = {
        from: { id: 123456789 },
        message: { text: 'Hello, agent!' },
        reply: vi.fn(),
      };

      await handleMessage(ctx as any, processMessage);

      expect(processMessage).toHaveBeenCalledWith('123456789', 'Hello, agent!');
      expect(ctx.reply).toHaveBeenCalledWith('Response from agent');
    });

    it('should handle empty messages gracefully', async () => {
      const { handleMessage } = await import('../src/telegram/handlers.js');

      const processMessage = vi.fn();

      const ctx: MockContext = {
        from: { id: 123456789 },
        message: { text: '' },
        reply: vi.fn(),
      };

      await handleMessage(ctx as any, processMessage);

      expect(processMessage).not.toHaveBeenCalled();
    });

    it('should handle errors from message processor', async () => {
      const { handleMessage } = await import('../src/telegram/handlers.js');

      const processMessage = vi.fn().mockRejectedValue(new Error('Agent error'));

      const ctx: MockContext = {
        from: { id: 123456789 },
        message: { text: 'Hello' },
        reply: vi.fn(),
      };

      await handleMessage(ctx as any, processMessage);

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('error')
      );
    });
  });
});
