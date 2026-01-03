import { Context, InputFile } from 'grammy';
import type { RoutingMode } from '../orchestrator/index.js';
import {
  getModeKeyboard,
  getUserModeState,
  setUserMode,
  setPendingMessage,
  consumePendingMessage,
  markMessageConsumed,
} from './mode-selector.js';
import { suggestMode } from '../orchestrator/index.js';

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
 * Handles incoming text messages with mode selection via buttons.
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

  const userIdStr = String(userId);
  const modeState = getUserModeState(userIdStr);

  // If user has selected a mode and we're awaiting their message
  if (modeState?.awaitingMessage) {
    // Process with selected mode
    try {
      const response = await processMessage(userIdStr, text, modeState.mode);
      await ctx.reply(stripMarkdown(response.text));
    } catch (error) {
      console.error('Error processing message:', error);
      await ctx.reply('Sorry, an error occurred while processing your message.');
    } finally {
      // Clear mode after processing
      markMessageConsumed(userIdStr);
    }
    return;
  }

  // No mode selected - store message and show mode selection
  setPendingMessage(userIdStr, text);
  const suggested = suggestMode(text);
  const suggestionHint =
    suggested === 'flow'
      ? ' (I suggest 🔄 Flow for this task)'
      : ' (I suggest ⚡ Simple for this)';

  await ctx.reply(`Choose a mode${suggestionHint}:`, {
    reply_markup: getModeKeyboard(),
  });
}

/**
 * Handles mode selection callback from inline keyboard.
 */
export async function handleModeCallback(
  ctx: Context,
  processMessage: MessageProcessor
): Promise<void> {
  const callbackData = ctx.callbackQuery?.data;
  const userId = ctx.from?.id;

  if (!userId || !callbackData?.startsWith('mode:')) {
    return;
  }

  const userIdStr = String(userId);
  const mode = callbackData.replace('mode:', '') as RoutingMode;

  // Acknowledge the button press
  await ctx.answerCallbackQuery();

  // Check if there's a pending message to process
  const pendingMessage = consumePendingMessage(userIdStr);

  if (pendingMessage) {
    // Delete the mode selection message
    try {
      await ctx.deleteMessage();
    } catch {
      // Ignore if we can't delete
    }

    // Process the pending message with selected mode
    const modeEmoji = mode === 'flow' ? '🔄' : '⚡';
    await ctx.reply(`${modeEmoji} Processing with ${mode} mode...`);

    try {
      const response = await processMessage(userIdStr, pendingMessage, mode);
      await ctx.reply(stripMarkdown(response.text));
    } catch (error) {
      console.error('Error processing message:', error);
      await ctx.reply('Sorry, an error occurred while processing your message.');
    }
  } else {
    // No pending message - set mode and wait for message
    setUserMode(userIdStr, mode);

    // Update the message to show mode selected
    try {
      await ctx.editMessageText(
        `Mode: ${mode === 'flow' ? '🔄 Flow' : '⚡ Simple'}\n\nNow send me your message or audio.`
      );
    } catch {
      await ctx.reply(
        `Mode: ${mode === 'flow' ? '🔄 Flow' : '⚡ Simple'}\n\nNow send me your message or audio.`
      );
    }
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
 * Creates a callback query handler for mode selection.
 */
export function createModeCallbackHandler(processMessage: MessageProcessor) {
  return async (ctx: Context): Promise<void> => {
    await handleModeCallback(ctx, processMessage);
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

  const userIdStr = String(userId);
  const modeState = getUserModeState(userIdStr);

  // If user has selected a mode and we're awaiting their message
  if (modeState?.awaitingMessage) {
    try {
      const response = await processMessage(userIdStr, text, modeState.mode);

      if (response.speakText) {
        await ctx.reply('🔊 Generating audio...');
        const result = await synthesize(response.speakText);

        if (result.success && result.audioPath) {
          try {
            await ctx.replyWithVoice(new InputFile(result.audioPath));
          } finally {
            cleanup(result.audioPath);
          }
        } else {
          await ctx.reply(
            `Audio generation failed: ${result.error || 'Unknown error'}`
          );
          await ctx.reply(stripMarkdown(response.speakText));
        }
      } else {
        await ctx.reply(stripMarkdown(response.text));
      }
    } catch (error) {
      console.error('Error processing message:', error);
      await ctx.reply('Sorry, an error occurred while processing your message.');
    } finally {
      markMessageConsumed(userIdStr);
    }
    return;
  }

  // No mode selected - store message and show mode selection
  setPendingMessage(userIdStr, text);
  const suggested = suggestMode(text);
  const suggestionHint =
    suggested === 'flow'
      ? ' (I suggest 🔄 Flow for this task)'
      : ' (I suggest ⚡ Simple for this)';

  await ctx.reply(`Choose a mode${suggestionHint}:`, {
    reply_markup: getModeKeyboard(),
  });
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
 * Handles mode callback with TTS support.
 */
export async function handleModeCallbackWithTTS(
  ctx: Context,
  processMessage: MessageProcessor,
  synthesize: TextToSpeech,
  cleanup: (path: string) => void
): Promise<void> {
  const callbackData = ctx.callbackQuery?.data;
  const userId = ctx.from?.id;

  if (!userId || !callbackData?.startsWith('mode:')) {
    return;
  }

  const userIdStr = String(userId);
  const mode = callbackData.replace('mode:', '') as RoutingMode;

  await ctx.answerCallbackQuery();

  const pendingMessage = consumePendingMessage(userIdStr);

  if (pendingMessage) {
    try {
      await ctx.deleteMessage();
    } catch {
      // Ignore
    }

    const modeEmoji = mode === 'flow' ? '🔄' : '⚡';
    await ctx.reply(`${modeEmoji} Processing with ${mode} mode...`);

    try {
      const response = await processMessage(userIdStr, pendingMessage, mode);

      if (response.speakText) {
        await ctx.reply('🔊 Generating audio...');
        const result = await synthesize(response.speakText);

        if (result.success && result.audioPath) {
          try {
            await ctx.replyWithVoice(new InputFile(result.audioPath));
          } finally {
            cleanup(result.audioPath);
          }
        } else {
          await ctx.reply(
            `Audio generation failed: ${result.error || 'Unknown error'}`
          );
          await ctx.reply(stripMarkdown(response.speakText));
        }
      } else {
        await ctx.reply(stripMarkdown(response.text));
      }
    } catch (error) {
      console.error('Error processing message:', error);
      await ctx.reply('Sorry, an error occurred while processing your message.');
    }
  } else {
    setUserMode(userIdStr, mode);
    try {
      await ctx.editMessageText(
        `Mode: ${mode === 'flow' ? '🔄 Flow' : '⚡ Simple'}\n\nNow send me your message or audio.`
      );
    } catch {
      await ctx.reply(
        `Mode: ${mode === 'flow' ? '🔄 Flow' : '⚡ Simple'}\n\nNow send me your message or audio.`
      );
    }
  }
}

/**
 * Creates a callback handler with TTS support.
 */
export function createModeCallbackHandlerWithTTS(
  processMessage: MessageProcessor,
  synthesize: TextToSpeech,
  cleanup: (path: string) => void
) {
  return async (ctx: Context): Promise<void> => {
    await handleModeCallbackWithTTS(ctx, processMessage, synthesize, cleanup);
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
  const modeState = getUserModeState(userIdStr);

  try {
    await ctx.reply('🎤 Transcribing...');

    const file = await ctx.api.getFile(voice.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;

    const result = await transcribe(fileUrl);

    if (!result.success || !result.text) {
      await ctx.reply(
        `Transcription failed: ${result.error || 'Unknown error'}`
      );
      return;
    }

    await ctx.reply(`📝 "${result.text}"`);

    // If user has mode selected, process immediately
    if (modeState?.awaitingMessage) {
      const response = await processMessage(userIdStr, result.text, modeState.mode);
      await ctx.reply(stripMarkdown(response.text));
      markMessageConsumed(userIdStr);
    } else {
      // Store transcribed text and ask for mode
      setPendingMessage(userIdStr, result.text);
      const suggested = suggestMode(result.text);
      const suggestionHint =
        suggested === 'flow'
          ? ' (I suggest 🔄 Flow for this task)'
          : ' (I suggest ⚡ Simple for this)';

      await ctx.reply(`Choose a mode${suggestionHint}:`, {
        reply_markup: getModeKeyboard(),
      });
    }
  } catch (error) {
    console.error('Error processing voice message:', error);
    await ctx.reply('Sorry, an error occurred while processing your voice message.');
    markMessageConsumed(userIdStr);
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
  const modeState = getUserModeState(userIdStr);

  try {
    await ctx.reply('🎤 Transcribing...');

    const file = await ctx.api.getFile(voice.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;

    const result = await transcribe(fileUrl);

    if (!result.success || !result.text) {
      await ctx.reply(
        `Transcription failed: ${result.error || 'Unknown error'}`
      );
      return;
    }

    await ctx.reply(`📝 "${result.text}"`);

    // If user has mode selected, process immediately
    if (modeState?.awaitingMessage) {
      const response = await processMessage(userIdStr, result.text, modeState.mode);

      if (response.speakText) {
        await ctx.reply('🔊 Generating audio...');
        const ttsResult = await synthesize(response.speakText);

        if (ttsResult.success && ttsResult.audioPath) {
          try {
            await ctx.replyWithVoice(new InputFile(ttsResult.audioPath));
          } finally {
            cleanup(ttsResult.audioPath);
          }
        } else {
          await ctx.reply(
            `Audio generation failed: ${ttsResult.error || 'Unknown error'}`
          );
          await ctx.reply(stripMarkdown(response.speakText));
        }
      } else {
        await ctx.reply(stripMarkdown(response.text));
      }
      markMessageConsumed(userIdStr);
    } else {
      // Store transcribed text and ask for mode
      setPendingMessage(userIdStr, result.text);
      const suggested = suggestMode(result.text);
      const suggestionHint =
        suggested === 'flow'
          ? ' (I suggest 🔄 Flow for this task)'
          : ' (I suggest ⚡ Simple for this)';

      await ctx.reply(`Choose a mode${suggestionHint}:`, {
        reply_markup: getModeKeyboard(),
      });
    }
  } catch (error) {
    console.error('Error processing voice message:', error);
    await ctx.reply('Sorry, an error occurred while processing your voice message.');
    markMessageConsumed(userIdStr);
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
