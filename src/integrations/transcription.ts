import Groq from 'groq-sdk';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

export interface TranscriptionResult {
  success: boolean;
  text?: string;
  error?: string;
}

/**
 * Downloads a file from URL to a temporary path.
 */
async function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const protocol = url.startsWith('https') ? https : http;

    protocol.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          downloadFile(redirectUrl, destPath).then(resolve).catch(reject);
          return;
        }
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {}); // Delete partial file
      reject(err);
    });
  });
}

/**
 * Transcribes audio using Groq's Whisper API.
 */
export class GroqTranscriber {
  private client: Groq;

  constructor(apiKey: string) {
    this.client = new Groq({ apiKey });
  }

  /**
   * Transcribes audio from a URL (e.g., Telegram file URL).
   */
  async transcribeFromUrl(fileUrl: string): Promise<TranscriptionResult> {
    const tempPath = path.join('/tmp', `voice_${Date.now()}.ogg`);

    try {
      // Download the file
      await downloadFile(fileUrl, tempPath);

      // Transcribe with Groq
      const transcription = await this.client.audio.transcriptions.create({
        file: fs.createReadStream(tempPath),
        model: 'whisper-large-v3',
        language: 'en', // Can be made configurable
      });

      return {
        success: true,
        text: transcription.text,
      };
    } catch (error: unknown) {
      const err = error as { message?: string };
      return {
        success: false,
        error: err.message || String(error),
      };
    } finally {
      // Cleanup temp file
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Transcribes audio from a local file path.
   */
  async transcribeFromFile(filePath: string): Promise<TranscriptionResult> {
    try {
      const transcription = await this.client.audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model: 'whisper-large-v3',
      });

      return {
        success: true,
        text: transcription.text,
      };
    } catch (error: unknown) {
      const err = error as { message?: string };
      return {
        success: false,
        error: err.message || String(error),
      };
    }
  }
}
