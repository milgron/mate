import { Context } from 'grammy';

export type MessageProcessor = (userId: string, message: string) => Promise<string>;
export type VoiceTranscriber = (fileUrl: string) => Promise<{ success: boolean; text?: string; error?: string }>;

/**
 * Handles incoming text messages.
 * Passes the message to the processor and replies with the result.
 */
export async function handleMessage(
  ctx: Context,
  processMessage: MessageProcessor
): Promise<void> {
  const userId = ctx.from?.id;
  const text = ctx.message?.text;

  if (!userId || !text || text.trim() === '') {
    // Ignore empty messages
    return;
  }

  try {
    const response = await processMessage(String(userId), text);
    await ctx.reply(response);
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
 * Handles incoming voice messages.
 * Transcribes the audio and passes to the message processor.
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

  try {
    // Notify user we're processing
    await ctx.reply('🎤 Transcribing...');

    // Get file URL from Telegram
    const file = await ctx.api.getFile(voice.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;

    // Transcribe
    const result = await transcribe(fileUrl);

    if (!result.success || !result.text) {
      await ctx.reply(`❌ Transcription failed: ${result.error || 'Unknown error'}`);
      return;
    }

    // Show what was transcribed
    await ctx.reply(`📝 "${result.text}"`);

    // Process with Claude
    const response = await processMessage(String(userId), result.text);
    await ctx.reply(response);
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
