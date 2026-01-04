import { Context, InputFile } from 'grammy';
import type { RoutingMode } from '../orchestrator/index.js';
import { getUserMode } from './mode-selector.js';

// Security: Maximum message length to prevent abuse
const MAX_MESSAGE_LENGTH = 8000;

export type MessageProcessor = (
  userId: string,
  message: string,
  mode: RoutingMode
) => Promise<{ text: string; speakText?: string }>;

export type VoiceTranscriber = (
  fileUrl: string
) => Promise<{ success: boolean; text?: string; error?: string }>;

export type TextToSpeech = (
  text: string
) => Promise<{ success: boolean; audioPath?: string; error?: string }>;

/**
 * Strips markdown formatting from text for plain Telegram display.
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, (match) => match.slice(3, -3).trim())
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/  +/g, ' ')
    .trim();
}

/**
 * Handles incoming text messages - processes directly with user's current mode.
 */
export async function handleMessage(
  ctx: Context,
  processMessage: MessageProcessor
): Promise<void> {
  const userId = ctx.from?.id;
  const text = ctx.message?.text;

  if (!userId || !text || text.trim() === '') {
    return;
  }

  // Security: Reject messages that are too long
  if (text.length > MAX_MESSAGE_LENGTH) {
    await ctx.reply(`Message too long. Maximum ${MAX_MESSAGE_LENGTH} characters allowed.`);
    return;
  }

  const userIdStr = String(userId);
  const mode = getUserMode(userIdStr);

  try {
    const response = await processMessage(userIdStr, text, mode);
    await ctx.reply(stripMarkdown(response.text));
  } catch (error) {
    console.error('Error processing message:', error);
    await ctx.reply('Sorry, an error occurred while processing your message.');
  }
}

/**
 * Creates a message handler bound to a specific processor.
 */
export function createMessageHandler(processMessage: MessageProcessor) {
  return async (ctx: Context): Promise<void> => {
    await handleMessage(ctx, processMessage);
  };
}

/**
 * Handles incoming text messages with optional TTS support.
 */
export async function handleMessageWithTTS(
  ctx: Context,
  processMessage: MessageProcessor,
  synthesize: TextToSpeech,
  cleanup: (path: string) => void
): Promise<void> {
  const userId = ctx.from?.id;
  const text = ctx.message?.text;

  if (!userId || !text || text.trim() === '') {
    return;
  }

  // Security: Reject messages that are too long
  if (text.length > MAX_MESSAGE_LENGTH) {
    await ctx.reply(`Message too long. Maximum ${MAX_MESSAGE_LENGTH} characters allowed.`);
    return;
  }

  const userIdStr = String(userId);
  const mode = getUserMode(userIdStr);

  try {
    const response = await processMessage(userIdStr, text, mode);

    if (response.speakText) {
      await ctx.reply('Generating audio...');
      const result = await synthesize(response.speakText);

      if (result.success && result.audioPath) {
        try {
          await ctx.replyWithVoice(new InputFile(result.audioPath));
        } finally {
          cleanup(result.audioPath);
        }
      } else {
        await ctx.reply(`Audio generation failed: ${result.error || 'Unknown error'}`);
        await ctx.reply(stripMarkdown(response.speakText));
      }
    } else {
      await ctx.reply(stripMarkdown(response.text));
    }
  } catch (error) {
    console.error('Error processing message:', error);
    await ctx.reply('Sorry, an error occurred while processing your message.');
  }
}

/**
 * Creates a message handler with TTS support.
 */
export function createMessageHandlerWithTTS(
  processMessage: MessageProcessor,
  synthesize: TextToSpeech,
  cleanup: (path: string) => void
) {
  return async (ctx: Context): Promise<void> => {
    await handleMessageWithTTS(ctx, processMessage, synthesize, cleanup);
  };
}

/**
 * Handles incoming voice messages.
 */
export async function handleVoiceMessage(
  ctx: Context,
  transcribe: VoiceTranscriber,
  processMessage: MessageProcessor
): Promise<void> {
  const userId = ctx.from?.id;
  const voice = ctx.message?.voice;

  if (!userId || !voice) {
    return;
  }

  const userIdStr = String(userId);
  const mode = getUserMode(userIdStr);

  try {
    await ctx.reply('Transcribing...');

    const file = await ctx.api.getFile(voice.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;

    const result = await transcribe(fileUrl);

    if (!result.success || !result.text) {
      await ctx.reply(`Transcription failed: ${result.error || 'Unknown error'}`);
      return;
    }

    await ctx.reply(`"${result.text}"`);

    const response = await processMessage(userIdStr, result.text, mode);
    await ctx.reply(stripMarkdown(response.text));
  } catch (error) {
    console.error('Error processing voice message:', error);
    await ctx.reply('Sorry, an error occurred while processing your voice message.');
  }
}

/**
 * Creates a voice message handler.
 */
export function createVoiceHandler(
  transcribe: VoiceTranscriber,
  processMessage: MessageProcessor
) {
  return async (ctx: Context): Promise<void> => {
    await handleVoiceMessage(ctx, transcribe, processMessage);
  };
}

/**
 * Handles incoming voice messages with optional TTS response.
 */
export async function handleVoiceMessageWithTTS(
  ctx: Context,
  transcribe: VoiceTranscriber,
  processMessage: MessageProcessor,
  synthesize: TextToSpeech,
  cleanup: (path: string) => void
): Promise<void> {
  const userId = ctx.from?.id;
  const voice = ctx.message?.voice;

  if (!userId || !voice) {
    return;
  }

  const userIdStr = String(userId);
  const mode = getUserMode(userIdStr);

  try {
    await ctx.reply('Transcribing...');

    const file = await ctx.api.getFile(voice.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;

    const result = await transcribe(fileUrl);

    if (!result.success || !result.text) {
      await ctx.reply(`Transcription failed: ${result.error || 'Unknown error'}`);
      return;
    }

    await ctx.reply(`"${result.text}"`);

    const response = await processMessage(userIdStr, result.text, mode);

    if (response.speakText) {
      await ctx.reply('Generating audio...');
      const ttsResult = await synthesize(response.speakText);

      if (ttsResult.success && ttsResult.audioPath) {
        try {
          await ctx.replyWithVoice(new InputFile(ttsResult.audioPath));
        } finally {
          cleanup(ttsResult.audioPath);
        }
      } else {
        await ctx.reply(`Audio generation failed: ${ttsResult.error || 'Unknown error'}`);
        await ctx.reply(stripMarkdown(response.speakText));
      }
    } else {
      await ctx.reply(stripMarkdown(response.text));
    }
  } catch (error) {
    console.error('Error processing voice message:', error);
    await ctx.reply('Sorry, an error occurred while processing your voice message.');
  }
}

/**
 * Creates a voice message handler with TTS support.
 */
export function createVoiceHandlerWithTTS(
  transcribe: VoiceTranscriber,
  processMessage: MessageProcessor,
  synthesize: TextToSpeech,
  cleanup: (path: string) => void
) {
  return async (ctx: Context): Promise<void> => {
    await handleVoiceMessageWithTTS(
      ctx,
      transcribe,
      processMessage,
      synthesize,
      cleanup
    );
  };
}
