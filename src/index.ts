import os from 'os';
import fs from 'fs';
import path from 'path';
import { createBot, startBot } from './telegram/bot.js';
import { InputFile } from 'grammy';
import {
  createAuthMiddleware,
  createRateLimitMiddleware,
  createLoggingMiddleware,
  createSecurityNotifier,
} from './telegram/middleware.js';
import {
  createMessageHandler,
  createMessageHandlerWithTTS,
  createVoiceHandlerWithTTS,
} from './telegram/handlers.js';
import { UserWhitelist } from './security/whitelist.js';
import { GroqTranscriber } from './integrations/transcription.js';
import { GroqTTS } from './integrations/tts.js';
import { logger } from './utils/logger.js';
import { loadPersonality } from './agent/personality.js';
import { routeMessage, type RoutingMode } from './orchestrator/index.js';
import { setUserMode, getUserMode } from './telegram/mode-selector.js';

// Track bot start time for uptime calculation
const botStartTime = Date.now();

// Load personality config (for bot name)
const personality = loadPersonality();

// Load configuration from environment
const config = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN,
  allowedUsers: process.env.TELEGRAM_ALLOWED_USERS ?? '',
  groqApiKey: process.env.GROQ_API_KEY,
  botName: process.env.BOT_NAME ?? personality.name,
};

// Validate required environment variables
if (!config.telegramToken) {
  logger.error('TELEGRAM_BOT_TOKEN is required');
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

  // Create Telegram bot
  const bot = createBot(config.telegramToken!);

  // Create security notifier for alerting admins
  const securityNotifier = createSecurityNotifier(bot.api, whitelist);

  // Add middleware (order matters for security!)
  // 1. Rate limit first - prevents DoS before hitting auth
  bot.use(createRateLimitMiddleware({ capacity: 10, refillRate: 0.5 }));
  // 2. Auth second - only after rate limit check (with security notifications)
  bot.use(createAuthMiddleware(whitelist, securityNotifier));
  // 3. Logging last - only for authenticated requests
  bot.use(
    createLoggingMiddleware((userId, message) => {
      logger.info('Message received', { userId, preview: message.slice(0, 100) });
    })
  );

  // Handle /start command
  bot.command('start', async (ctx) => {
    const voiceFeatures = config.groqApiKey
      ? 'You can send voice messages!\n\n'
      : '';

    await ctx.reply(
      `Hello! I am ${config.botName}, your AI assistant.\n\n` +
        `${voiceFeatures}` +
        'Commands:\n' +
        '/flow - Switch to complex mode (multi-step tasks)\n' +
        '/simple - Switch to simple mode (default)\n' +
        '/status - Show bot and system status\n' +
        '/files - List available files\n' +
        '/file <name> - Download a file\n' +
        '/shutdown - Shutdown Raspberry Pi\n' +
        '/reboot - Reboot Raspberry Pi'
    );
  });

  // Handle /flow command - switch to flow mode
  bot.command('flow', async (ctx) => {
    const userId = ctx.from?.id;
    if (userId) {
      setUserMode(String(userId), 'flow');
      await ctx.reply('🔄 Flow mode activated. Complex multi-step tasks enabled.\n\nUse /simple to switch back.');
    }
  });

  // Handle /simple command - switch to simple mode
  bot.command('simple', async (ctx) => {
    const userId = ctx.from?.id;
    if (userId) {
      setUserMode(String(userId), 'simple');
      await ctx.reply('⚡ Simple mode activated (default). Fast responses via Claude CLI.');
    }
  });

  // Handle /status command
  bot.command('status', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const userIdStr = String(userId);
    const currentMode = getUserMode(userIdStr);
    const modeEmoji = currentMode === 'flow' ? '🔄' : '⚡';

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
      `▸ Current mode: ${modeEmoji} ${currentMode}`,
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
    ].join('\n');

    await ctx.reply(status);
  });

  // Shutdown trigger file path (host watches this)
  const SHUTDOWN_TRIGGER = '/var/mate/shutdown';

  // Track pending shutdown confirmations
  const pendingShutdowns = new Map<string, number>();

  // Handle /shutdown command
  bot.command('shutdown', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const userIdStr = String(userId);
    const now = Date.now();

    // Check if there's a pending confirmation (within 30 seconds)
    const pendingTime = pendingShutdowns.get(userIdStr);
    if (pendingTime && now - pendingTime < 30000) {
      // Confirmed! Execute shutdown
      pendingShutdowns.delete(userIdStr);

      try {
        // Write trigger file for host systemd service
        fs.writeFileSync(SHUTDOWN_TRIGGER, new Date().toISOString());
        logger.warn('Shutdown triggered by user', { userId: userIdStr });
        await ctx.reply('⏻ Apagando Raspberry Pi...\n\nEl bot se desconectará en unos segundos.');

        // Also notify all admins
        await securityNotifier(`**Sistema apagándose**\nIniciado por: ${ctx.from?.username || userId}`);
      } catch (err) {
        logger.error('Failed to trigger shutdown', { error: String(err) });
        await ctx.reply('❌ Error al apagar. Verifica que el servicio de shutdown esté configurado.');
      }
      return;
    }

    // Request confirmation
    pendingShutdowns.set(userIdStr, now);
    await ctx.reply(
      '⚠️ **¿Estás seguro que querés apagar la Raspberry Pi?**\n\n' +
      'Enviá /shutdown de nuevo en los próximos 30 segundos para confirmar.'
    );
  });

  // Handle /reboot command
  bot.command('reboot', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const userIdStr = String(userId);
    const now = Date.now();

    // Check if there's a pending confirmation (within 30 seconds)
    const pendingTime = pendingShutdowns.get(userIdStr + '_reboot');
    if (pendingTime && now - pendingTime < 30000) {
      // Confirmed! Execute reboot
      pendingShutdowns.delete(userIdStr + '_reboot');

      try {
        // Write trigger file for host systemd service (with reboot flag)
        fs.writeFileSync(SHUTDOWN_TRIGGER, 'reboot:' + new Date().toISOString());
        logger.warn('Reboot triggered by user', { userId: userIdStr });
        await ctx.reply('🔄 Reiniciando Raspberry Pi...\n\nEl bot volverá en unos minutos.');

        await securityNotifier(`**Sistema reiniciándose**\nIniciado por: ${ctx.from?.username || userId}`);
      } catch (err) {
        logger.error('Failed to trigger reboot', { error: String(err) });
        await ctx.reply('❌ Error al reiniciar. Verifica que el servicio de shutdown esté configurado.');
      }
      return;
    }

    // Request confirmation
    pendingShutdowns.set(userIdStr + '_reboot', now);
    await ctx.reply(
      '⚠️ **¿Estás seguro que querés reiniciar la Raspberry Pi?**\n\n' +
      'Enviá /reboot de nuevo en los próximos 30 segundos para confirmar.'
    );
  });

  // Data directory for user files
  const DATA_DIR = '/app/data';

  // Handle /files command - list available files
  bot.command('files', async (ctx) => {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        await ctx.reply('No hay archivos disponibles.');
        return;
      }

      const files = fs.readdirSync(DATA_DIR, { withFileTypes: true });
      const fileList = files
        .filter((f) => f.isFile())
        .map((f) => {
          const filePath = path.join(DATA_DIR, f.name);
          const stats = fs.statSync(filePath);
          const sizeKB = (stats.size / 1024).toFixed(1);
          return `• ${f.name} (${sizeKB} KB)`;
        });

      if (fileList.length === 0) {
        await ctx.reply('No hay archivos disponibles.');
        return;
      }

      await ctx.reply(
        `📁 Archivos en /app/data:\n\n${fileList.join('\n')}\n\nUsa /file <nombre> para descargar`
      );
    } catch (error) {
      logger.error('Error listing files', { error: String(error) });
      await ctx.reply('Error al listar archivos.');
    }
  });

  // Handle /file command - send a specific file
  bot.command('file', async (ctx) => {
    const args = ctx.message?.text?.split(' ').slice(1).join(' ').trim();

    if (!args) {
      await ctx.reply('Uso: /file <nombre>\n\nEjemplo: /file twinkle_twinkle.wav\n\nUsa /files para ver archivos disponibles.');
      return;
    }

    // Security: prevent path traversal
    const filename = path.basename(args);
    const filePath = path.join(DATA_DIR, filename);

    try {
      if (!fs.existsSync(filePath)) {
        await ctx.reply(`Archivo no encontrado: ${filename}\n\nUsa /files para ver archivos disponibles.`);
        return;
      }

      const stats = fs.statSync(filePath);
      if (!stats.isFile()) {
        await ctx.reply('Solo se pueden enviar archivos, no carpetas.');
        return;
      }

      // Send file based on extension
      const ext = path.extname(filename).toLowerCase();

      if (['.mp3', '.wav', '.ogg', '.m4a'].includes(ext)) {
        await ctx.replyWithAudio(new InputFile(filePath));
      } else if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
        await ctx.replyWithPhoto(new InputFile(filePath));
      } else if (['.mp4', '.mov', '.avi', '.webm'].includes(ext)) {
        await ctx.replyWithVideo(new InputFile(filePath));
      } else {
        await ctx.replyWithDocument(new InputFile(filePath));
      }

      logger.info('File sent', { filename, size: stats.size });
    } catch (error) {
      logger.error('Error sending file', { filename, error: String(error) });
      await ctx.reply(`Error al enviar archivo: ${filename}`);
    }
  });

  // Message processor function using orchestrator
  const processUserMessage = async (
    userId: string,
    message: string,
    mode: RoutingMode
  ) => {
    logger.info('Processing message', { userId, length: message.length, mode });

    try {
      const response = await routeMessage(message, mode, userId);
      logger.info('Message processed', {
        userId,
        responseLength: response.length,
        mode,
      });
      return { text: response };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error processing message', { userId, error: errorMessage });
      throw error;
    }
  };

  // Handle text and voice messages with optional TTS support
  if (config.groqApiKey) {
    const transcriber = new GroqTranscriber(config.groqApiKey);
    const tts = new GroqTTS(config.groqApiKey);
    logger.info('Voice support enabled: transcription (Whisper) + TTS (PlayAI)');

    // Text messages with TTS support
    bot.on(
      'message:text',
      createMessageHandlerWithTTS(
        processUserMessage,
        (text) => tts.synthesize(text),
        GroqTTS.cleanup
      )
    );

    // Voice messages with TTS support
    bot.on(
      'message:voice',
      createVoiceHandlerWithTTS(
        (fileUrl) => transcriber.transcribeFromUrl(fileUrl),
        processUserMessage,
        (text) => tts.synthesize(text),
        GroqTTS.cleanup
      )
    );
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
  const startupMessage = `🤖 ${config.botName} is online!\n\n⚡ Simple mode (default)\n\nUse /flow for complex tasks`;
  for (const userId of whitelist.getAllUserIds()) {
    try {
      await bot.api.sendMessage(userId, startupMessage);
      logger.info('Sent startup notification', { userId });
    } catch (err) {
      logger.warn('Failed to send startup notification', {
        userId,
        error: String(err),
      });
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
