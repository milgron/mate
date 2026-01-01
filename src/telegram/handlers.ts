import { Context, InputFile } from 'grammy';

export type MessageProcessor = (userId: string, message: string) => Promise<string>;
export type VoiceTranscriber = (fileUrl: string) => Promise<{ success: boolean; text?: string; error?: string }>;
export type TextToSpeech = (text: string) => Promise<{ success: boolean; audioPath?: string; error?: string }>;

// Phrases that trigger voice response
const VOICE_TRIGGERS = [
  // English - flexible variations
  'reply with voice',
  'reply with audio',
  'reply with a voice',
  'reply with a audio',
  'respond with voice',
  'respond with audio',
  'respond with a voice',
  'respond with a audio',
  'voice response',
  'audio response',
  'voice audio',
  'with voice',
  'with audio',
  'speak this',
  'say this',
  'read aloud',
  'read this aloud',
  'tell me aloud',
  'send voice',
  'send audio',
  'as voice',
  'as audio',
  // Spanish
  'con voz',
  'responde con voz',
  'responde con audio',
  'dime en voz',
  'leelo en voz alta',
  'en audio',
];

/**
 * Detects if user wants a voice response based on their message.
 */
function wantsVoiceResponse(message: string): boolean {
  const lower = message.toLowerCase();
  return VOICE_TRIGGERS.some(trigger => lower.includes(trigger));
}

/**
 * Removes voice trigger phrases from the message.
 */
function stripVoiceTrigger(message: string): string {
  let result = message;
  for (const trigger of VOICE_TRIGGERS) {
    const regex = new RegExp(trigger, 'gi');
    result = result.replace(regex, '');
  }
  return result.trim();
}

/**
 * Strips markdown formatting from text for plain Telegram display.
 * Removes: **bold**, *italic*, `code`, ```code blocks```, [links](url), headers
 */
function stripMarkdown(text: string): string {
  return text
    // Remove code blocks first (```...```)
    .replace(/```[\s\S]*?```/g, (match) => match.slice(3, -3).trim())
    // Remove inline code (`...`)
    .replace(/`([^`]+)`/g, '$1')
    // Remove bold (**...**)
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    // Remove bold (__)
    .replace(/__([^_]+)__/g, '$1')
    // Remove italic (*...*)
    .replace(/\*([^*]+)\*/g, '$1')
    // Remove italic (_..._)
    .replace(/_([^_]+)_/g, '$1')
    // Remove strikethrough (~~...~~)
    .replace(/~~([^~]+)~~/g, '$1')
    // Remove markdown links [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove markdown headers (# Header)
    .replace(/^#{1,6}\s+/gm, '')
    // Clean up any double spaces
    .replace(/  +/g, ' ')
    .trim();
}

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
    await ctx.reply(stripMarkdown(response));
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
 * If user requests voice response and TTS is available, sends audio.
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

  const requestsVoice = wantsVoiceResponse(text);
  const cleanedMessage = requestsVoice ? stripVoiceTrigger(text) : text;

  // If the message is empty after stripping triggers, use original
  const messageToProcess = cleanedMessage || text;

  try {
    const response = await processMessage(String(userId), messageToProcess);

    if (requestsVoice) {
      // User wants voice response
      await ctx.reply('🔊 Generating audio...');

      const result = await synthesize(response);

      if (result.success && result.audioPath) {
        try {
          await ctx.replyWithVoice(new InputFile(result.audioPath));
        } finally {
          cleanup(result.audioPath);
        }
      } else {
        // Fallback to text if TTS fails
        await ctx.reply(`❌ Audio generation failed: ${result.error || 'Unknown error'}`);
        await ctx.reply(stripMarkdown(response));
      }
    } else {
      // Normal text response
      await ctx.reply(stripMarkdown(response));
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
    await ctx.reply(stripMarkdown(response));
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
 * If user mentions wanting voice response, replies with audio.
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

  try {
    await ctx.reply('🎤 Transcribing...');

    const file = await ctx.api.getFile(voice.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;

    const result = await transcribe(fileUrl);

    if (!result.success || !result.text) {
      await ctx.reply(`❌ Transcription failed: ${result.error || 'Unknown error'}`);
      return;
    }

    await ctx.reply(`📝 "${result.text}"`);

    const requestsVoice = wantsVoiceResponse(result.text);
    const cleanedMessage = requestsVoice ? stripVoiceTrigger(result.text) : result.text;
    const messageToProcess = cleanedMessage || result.text;

    const response = await processMessage(String(userId), messageToProcess);

    if (requestsVoice) {
      await ctx.reply('🔊 Generating audio...');

      const ttsResult = await synthesize(response);

      if (ttsResult.success && ttsResult.audioPath) {
        try {
          await ctx.replyWithVoice(new InputFile(ttsResult.audioPath));
        } finally {
          cleanup(ttsResult.audioPath);
        }
      } else {
        await ctx.reply(`❌ Audio generation failed: ${ttsResult.error || 'Unknown error'}`);
        await ctx.reply(stripMarkdown(response));
      }
    } else {
      await ctx.reply(stripMarkdown(response));
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
    await handleVoiceMessageWithTTS(ctx, transcribe, processMessage, synthesize, cleanup);
  };
}
