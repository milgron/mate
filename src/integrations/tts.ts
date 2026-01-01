import Groq from 'groq-sdk';
import fs from 'fs';
import path from 'path';

export interface TTSResult {
  success: boolean;
  audioPath?: string;
  error?: string;
}

// Available voices for Groq Orpheus TTS (canopylabs/orpheus-v1-english)
// Voices ordered by conversational realism
export type GroqVoice =
  | 'tara'
  | 'leah'
  | 'jess'
  | 'leo'
  | 'dan'
  | 'mia'
  | 'zac'
  | 'zoe';

const DEFAULT_VOICE: GroqVoice = 'tara';

/**
 * Text-to-speech using Groq's Orpheus TTS API.
 */
export class GroqTTS {
  private client: Groq;
  private voice: GroqVoice;

  constructor(apiKey: string, voice: GroqVoice = DEFAULT_VOICE) {
    this.client = new Groq({ apiKey });
    this.voice = voice;
  }

  /**
   * Converts text to speech and saves to a temporary file.
   * Returns the path to the audio file.
   */
  async synthesize(text: string): Promise<TTSResult> {
    const tempPath = path.join('/tmp', `tts_${Date.now()}.mp3`);

    try {
      // Truncate very long text to avoid API limits
      const maxLength = 4000;
      const truncatedText = text.length > maxLength
        ? text.slice(0, maxLength) + '...'
        : text;

      const response = await this.client.audio.speech.create({
        model: 'canopylabs/orpheus-v1-english',
        voice: this.voice,
        input: truncatedText,
        response_format: 'mp3',
      });

      // Get the audio data as a buffer
      const buffer = Buffer.from(await response.arrayBuffer());

      // Write to temp file
      fs.writeFileSync(tempPath, buffer);

      return {
        success: true,
        audioPath: tempPath,
      };
    } catch (error: unknown) {
      const err = error as { message?: string };
      return {
        success: false,
        error: err.message || String(error),
      };
    }
  }

  /**
   * Cleans up a temporary audio file.
   */
  static cleanup(audioPath: string): void {
    try {
      fs.unlinkSync(audioPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}
