import { Bot, Context } from 'grammy';

export interface JarvisBot extends Bot<Context> {
  token: string;
}

/**
 * Creates a new Telegram bot instance with the provided token.
 */
export function createBot(token: string): JarvisBot {
  const bot = new Bot(token) as JarvisBot;
  bot.token = token;
  return bot;
}

/**
 * Starts the bot with long polling.
 * Returns a function to stop the bot.
 */
export async function startBot(bot: Bot): Promise<() => Promise<void>> {
  // Start the bot
  bot.start({
    onStart: (botInfo) => {
      console.log(`Bot @${botInfo.username} started`);
    },
  });

  // Return stop function
  return async () => {
    await bot.stop();
  };
}
