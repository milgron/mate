import Groq from 'groq-sdk';
import fs from 'fs';
import path from 'path';

export interface TTSResult {
  success: boolean;
  audioPath?: string;
  error?: string;
}

// Available voices for Groq TTS
export type GroqVoice =
  | 'Arista-PlayAI'
  | 'Atlas-PlayAI'
  | 'Basil-PlayAI'
  | 'Briggs-PlayAI'
  | 'Calum-PlayAI'
  | 'Celeste-PlayAI'
  | 'Cheyenne-PlayAI'
  | 'Chip-PlayAI'
  | 'Cillian-PlayAI'
  | 'Deedee-PlayAI'
  | 'Fritz-PlayAI'
  | 'Gail-PlayAI'
  | 'Indigo-PlayAI'
  | 'Mamaw-PlayAI'
  | 'Mason-PlayAI'
  | 'Mikail-PlayAI'
  | 'Mitch-PlayAI'
  | 'Quinn-PlayAI'
  | 'Thunder-PlayAI'
  | 'Wagner-PlayAI';

const DEFAULT_VOICE: GroqVoice = 'Fritz-PlayAI';

/**
 * Text-to-speech using Groq's PlayAI TTS API.
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
        model: 'playai-tts',
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
