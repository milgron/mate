import os from 'os';
import { createBot, startBot } from './telegram/bot.js';
import {
  createAuthMiddleware,
  createRateLimitMiddleware,
  createLoggingMiddleware,
} from './telegram/middleware.js';
import { createMessageHandler, createMessageHandlerWithTTS, createVoiceHandlerWithTTS } from './telegram/handlers.js';
import { createAgent } from './agent/agent.js';
import { UserWhitelist } from './security/whitelist.js';
import { GroqTranscriber } from './integrations/transcription.js';
import { GroqTTS } from './integrations/tts.js';
import { logger } from './utils/logger.js';
import { loadPersonality } from './agent/personality.js';

// Track bot start time for uptime calculation
const botStartTime = Date.now();

// Load personality config (for bot name)
const personality = loadPersonality();

// Load configuration from environment (BOT_NAME env var overrides personality.md)
const config = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  allowedUsers: process.env.TELEGRAM_ALLOWED_USERS ?? '',
  groqApiKey: process.env.GROQ_API_KEY,
  botName: process.env.BOT_NAME ?? personality.name,
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
  logger.info(`Starting ${config.botName}...`);

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
    const voiceFeatures = config.groqApiKey
      ? 'You can send voice messages!\n' +
        'Say "reply with voice" to get audio responses.\n\n'
      : '';

    await ctx.reply(
      `Hello! I am ${config.botName}, your AI assistant.\n\n` +
        'Send me a message and I will help you.\n' +
        'I can execute shell commands and manage files.\n' +
        voiceFeatures +
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
      `📊 ${config.botName} Status`,
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
      `  Voice input: ${config.groqApiKey ? '✓' : '✗'}`,
      `  Voice output: ${config.groqApiKey ? '✓' : '✗'}`,
      `  Users: ${whitelist.size}`,
    ].join('\n');

    await ctx.reply(status);
  });

  // Message processor function used by all handlers
  const processUserMessage = async (userId: string, message: string) => {
    logger.info('Processing message', { userId, length: message.length });
    const response = await agent.processMessage(userId, message);
    logger.info('Message processed', { userId, responseLength: response.length });
    return response;
  };

  // Handle text and voice messages with optional TTS support
  if (config.groqApiKey) {
    const transcriber = new GroqTranscriber(config.groqApiKey);
    const tts = new GroqTTS(config.groqApiKey);
    logger.info('Voice support enabled: transcription (Whisper) + TTS (PlayAI)');

    // Text messages with TTS support
    bot.on('message:text', createMessageHandlerWithTTS(
      processUserMessage,
      (text) => tts.synthesize(text),
      GroqTTS.cleanup
    ));

    // Voice messages with TTS support
    bot.on('message:voice', createVoiceHandlerWithTTS(
      (fileUrl) => transcriber.transcribeFromUrl(fileUrl),
      processUserMessage,
      (text) => tts.synthesize(text),
      GroqTTS.cleanup
    ));
  } else {
    logger.info('Voice support disabled (GROQ_API_KEY not set)');

    // Text messages without TTS
    bot.on('message:text', createMessageHandler(processUserMessage));
  }

  // Handle errors
  bot.catch((err) => {
    logger.error('Bot error', { error: String(err) });
  });

  // Start bot
  const stop = await startBot(bot);
  logger.info(`${config.botName} is running!`);

  // Notify all whitelisted users that bot is ready
  const startupMessage = `🤖 ${config.botName} is back online and ready!`;
  for (const userId of whitelist.getAllUserIds()) {
    try {
      await bot.api.sendMessage(userId, startupMessage);
      logger.info('Sent startup notification', { userId });
    } catch (err) {
      logger.warn('Failed to send startup notification', { userId, error: String(err) });
    }
  }

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
