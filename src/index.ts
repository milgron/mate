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
import { AuditLogger } from './security/audit.js';
import { GroqTranscriber } from './integrations/transcription.js';

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
  console.error('Error: TELEGRAM_BOT_TOKEN is required');
  process.exit(1);
}

if (!config.anthropicApiKey) {
  console.error('Error: ANTHROPIC_API_KEY is required');
  process.exit(1);
}

if (!config.allowedUsers) {
  console.error('Error: TELEGRAM_ALLOWED_USERS is required');
  process.exit(1);
}

async function main() {
  console.log('Starting Jarvis...');

  // Initialize security
  const whitelist = UserWhitelist.fromString(config.allowedUsers);
  console.log(`Loaded ${whitelist.size} allowed users`);

  const auditLogger = AuditLogger.createConsoleLogger();

  // Initialize Claude agent (Haiku by default, Opus for "think hard")
  const agent = createAgent({
    apiKey: config.anthropicApiKey!,
  });
  console.log('Claude agent initialized (Haiku default, Opus for "think hard")');

  // Create Telegram bot
  const bot = createBot(config.telegramToken!);

  // Add middleware
  bot.use(createAuthMiddleware(whitelist));
  bot.use(createRateLimitMiddleware({ capacity: 10, refillRate: 0.5 }));
  bot.use(
    createLoggingMiddleware((userId, message) => {
      auditLogger.logAction('message_received', userId, {
        preview: message.slice(0, 100),
      });
    })
  );

  // Handle text messages
  bot.on('message:text', createMessageHandler(async (userId, message) => {
    auditLogger.logAction('processing_message', userId, { length: message.length });

    const response = await agent.processMessage(userId, message);

    auditLogger.logAction('message_processed', userId, {
      responseLength: response.length,
    });

    return response;
  }));

  // Handle voice messages (if Groq API key is configured)
  if (config.groqApiKey) {
    const transcriber = new GroqTranscriber(config.groqApiKey);
    console.log('Voice message support enabled (Groq Whisper)');

    bot.on('message:voice', createVoiceHandler(
      (fileUrl) => transcriber.transcribeFromUrl(fileUrl),
      async (userId, message) => {
        auditLogger.logAction('processing_voice_message', userId, { length: message.length });

        const response = await agent.processMessage(userId, message);

        auditLogger.logAction('voice_message_processed', userId, {
          responseLength: response.length,
        });

        return response;
      }
    ));
  } else {
    console.log('Voice message support disabled (GROQ_API_KEY not set)');
  }

  // Handle /start command
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
    const loadAvg = os.loadavg()[0].toFixed(2);
    const botUptime = Math.floor((Date.now() - botStartTime) / 1000);

    const formatTime = (seconds: number) => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = seconds % 60;
      return `${h}h ${m}m ${s}s`;
    };

    const status = [
      '📊 *Jarvis Status*',
      '',
      '*Models*',
      '├ Default: Haiku',
      '└ Thinking: Opus',
      '',
      '*Your Session*',
      `└ Messages: ${historyLength}`,
      '',
      '*System*',
      `├ Pi uptime: ${formatTime(uptime)}`,
      `├ Memory: ${memUsedPercent}% used`,
      `├ Load: ${loadAvg}`,
      `└ Bot uptime: ${formatTime(botUptime)}`,
      '',
      '*Features*',
      `├ Voice: ${config.groqApiKey ? '✓' : '✗'}`,
      `└ Users: ${whitelist.size}`,
    ].join('\n');

    await ctx.reply(status, { parse_mode: 'Markdown' });
  });

  // Handle errors
  bot.catch((err) => {
    console.error('Bot error:', err);
  });

  // Start bot
  const stop = await startBot(bot);
  console.log('Jarvis is running!');

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down...`);
    await stop();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
