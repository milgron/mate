import { Context, NextFunction, Api } from 'grammy';
import { UserWhitelist } from '../security/whitelist.js';
import { RateLimiter, RateLimiterConfig } from '../security/rate-limit.js';
import { logger } from '../utils/logger.js';

export type SecurityNotifier = (message: string) => Promise<void>;

/**
 * Creates a notifier that sends security alerts to all whitelisted users.
 */
export function createSecurityNotifier(api: Api, whitelist: UserWhitelist): SecurityNotifier {
  return async (message: string) => {
    const userIds = whitelist.getAllUserIds();
    for (const userId of userIds) {
      try {
        await api.sendMessage(userId, `🚨 ${message}`);
      } catch (err) {
        logger.error('Failed to send security notification', { userId, error: String(err) });
      }
    }
  };
}

/**
 * Middleware that only allows messages from whitelisted users.
 */
export function createAuthMiddleware(whitelist: UserWhitelist, notifier?: SecurityNotifier) {
  return async (ctx: Context, next: NextFunction): Promise<void> => {
    const userId = ctx.from?.id;

    if (!userId) {
      // No user info, silently ignore
      return;
    }

    if (!whitelist.isAllowed(userId)) {
      // Audit log unauthorized access attempts
      const details = {
        userId,
        username: ctx.from?.username,
        firstName: ctx.from?.first_name,
        timestamp: new Date().toISOString(),
      };
      logger.warn('Unauthorized access attempt', details);

      // Notify admins
      if (notifier) {
        const userInfo = ctx.from?.username
          ? `@${ctx.from.username}`
          : `${ctx.from?.first_name || 'Unknown'} (${userId})`;
        await notifier(`**Acceso no autorizado**\nUsuario: ${userInfo}\nID: ${userId}`);
      }

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
      // Audit log rate limit violations
      logger.warn('Rate limit exceeded', {
        userId,
        username: ctx.from?.username,
        timestamp: new Date().toISOString(),
      });
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
