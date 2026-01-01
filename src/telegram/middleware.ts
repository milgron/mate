import { Context, NextFunction } from 'grammy';
import { UserWhitelist } from '../security/whitelist.js';
import { RateLimiter, RateLimiterConfig } from '../security/rate-limit.js';

/**
 * Middleware that only allows messages from whitelisted users.
 */
export function createAuthMiddleware(whitelist: UserWhitelist) {
  return async (ctx: Context, next: NextFunction): Promise<void> => {
    const userId = ctx.from?.id;

    if (!userId) {
      // No user info, silently ignore
      return;
    }

    if (!whitelist.isAllowed(userId)) {
      await ctx.reply('You are not authorized to use this bot.');
      return;
    }

    await next();
  };
}

/**
 * Middleware that rate limits requests per user.
 */
export function createRateLimitMiddleware(config: RateLimiterConfig) {
  const limiter = new RateLimiter(config);

  return async (ctx: Context, next: NextFunction): Promise<void> => {
    const userId = ctx.from?.id;

    if (!userId) {
      return;
    }

    if (!limiter.checkAndConsume(String(userId))) {
      await ctx.reply('You are being rate limited. Please wait before sending more messages.');
      return;
    }

    await next();
  };
}

/**
 * Middleware that logs all incoming messages.
 */
export function createLoggingMiddleware(
  logFn: (userId: string, message: string) => void
) {
  return async (ctx: Context, next: NextFunction): Promise<void> => {
    const userId = ctx.from?.id;
    const text = ctx.message?.text || '[non-text message]';

    if (userId) {
      logFn(String(userId), text);
    }

    await next();
  };
}
