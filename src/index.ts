import os from 'os';
import { createBot, startBot } from './telegram/bot.js';
import {
  createAuthMiddleware,
  createRateLimitMiddleware,
  createLoggingMiddleware,
} from './telegram/middleware.js';
import { createMessageHandler, createVoiceHandler } from './telegram/handlers.js';
import { createAgent } from './agent/agent.js';
import { UserWhitelist } from './security/whitelist.js';
import { GroqTranscriber } from './integrations/transcription.js';
import { logger } from './utils/logger.js';

// Track bot start time for uptime calculation
const botStartTime = Date.now();

// Load configuration from environment
const config = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  allowedUsers: process.env.TELEGRAM_ALLOWED_USERS ?? '',
  groqApiKey: process.env.GROQ_API_KEY,
};

// Validate required environment variables
if (!config.telegramToken) {
  logger.error('TELEGRAM_BOT_TOKEN is required');
  process.exit(1);
}

if (!config.anthropicApiKey) {
  logger.error('ANTHROPIC_API_KEY is required');
  process.exit(1);
}

if (!config.allowedUsers) {
  logger.error('TELEGRAM_ALLOWED_USERS is required');
  process.exit(1);
}

async function main() {
  logger.info('Starting Jarvis...');

  // Initialize security
  const whitelist = UserWhitelist.fromString(config.allowedUsers);
  logger.info(`Loaded ${whitelist.size} allowed users`);

  // Initialize Claude agent (Haiku by default, Opus for "think hard")
  const agent = createAgent({
    apiKey: config.anthropicApiKey!,
  });
  logger.info('Claude agent initialized (Haiku default, Opus for "think hard")');

  // Create Telegram bot
  const bot = createBot(config.telegramToken!);

  // Add middleware
  bot.use(createAuthMiddleware(whitelist));
  bot.use(createRateLimitMiddleware({ capacity: 10, refillRate: 0.5 }));
  bot.use(
    createLoggingMiddleware((userId, message) => {
      logger.info('Message received', { userId, preview: message.slice(0, 100) });
    })
  );

  // Handle /start command (MUST be before message:text handler)
  bot.command('start', async (ctx) => {
    const voiceSupport = config.groqApiKey
      ? 'You can also send voice messages!\n\n'
      : '';

    await ctx.reply(
      'Hello! I am Jarvis, your AI assistant.\n\n' +
        'Send me a message and I will help you.\n' +
        'I can execute shell commands and manage files.\n' +
        voiceSupport +
        'Tip: Start with "think hard" for complex tasks.\n\n' +
        'Commands:\n' +
        '/start - Show this message\n' +
        '/clear - Clear conversation history\n' +
        '/status - Show bot and system status'
    );
  });

  // Handle /clear command
  bot.command('clear', async (ctx) => {
    const userId = ctx.from?.id;
    if (userId) {
      agent.clearHistory(String(userId));
      await ctx.reply('Conversation history cleared.');
    }
  });

  // Handle /status command
  bot.command('status', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const historyLength = agent.getHistory(String(userId)).length;
    const uptime = os.uptime();
    const freeMem = os.freemem();
    const totalMem = os.totalmem();
    const memUsedPercent = ((1 - freeMem / totalMem) * 100).toFixed(1);
    const loadAvg = (os.loadavg()[0] ?? 0).toFixed(2);
    const botUptime = Math.floor((Date.now() - botStartTime) / 1000);

    const formatTime = (seconds: number) => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = seconds % 60;
      return `${h}h ${m}m ${s}s`;
    };

    const status = [
      '📊 Jarvis Status',
      '',
      '▸ Models',
      '  Default: Haiku',
      '  Thinking: Opus',
      '',
      '▸ Your Session',
      `  Messages: ${historyLength}`,
      '',
      '▸ System',
      `  Pi uptime: ${formatTime(uptime)}`,
      `  Memory: ${memUsedPercent}% used`,
      `  Load: ${loadAvg}`,
      `  Bot uptime: ${formatTime(botUptime)}`,
      '',
      '▸ Features',
      `  Voice: ${config.groqApiKey ? '✓' : '✗'}`,
      `  Users: ${whitelist.size}`,
    ].join('\n');

    await ctx.reply(status);
  });

  // Handle text messages (AFTER commands so /commands are not intercepted)
  bot.on('message:text', createMessageHandler(async (userId, message) => {
    logger.info('Processing message', { userId, length: message.length });

    const response = await agent.processMessage(userId, message);

    logger.info('Message processed', { userId, responseLength: response.length });

    return response;
  }));

  // Handle voice messages (if Groq API key is configured)
  if (config.groqApiKey) {
    const transcriber = new GroqTranscriber(config.groqApiKey);
    logger.info('Voice message support enabled (Groq Whisper)');

    bot.on('message:voice', createVoiceHandler(
      (fileUrl) => transcriber.transcribeFromUrl(fileUrl),
      async (userId, message) => {
        logger.info('Processing voice message', { userId, length: message.length });

        const response = await agent.processMessage(userId, message);

        logger.info('Voice message processed', { userId, responseLength: response.length });

        return response;
      }
    ));
  } else {
    logger.info('Voice message support disabled (GROQ_API_KEY not set)');
  }

  // Handle errors
  bot.catch((err) => {
    logger.error('Bot error', { error: String(err) });
  });

  // Start bot
  const stop = await startBot(bot);
  logger.info('Jarvis is running!');

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received. Shutting down...`);
    await stop();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('Fatal error', { error: String(err) });
  process.exit(1);
});
