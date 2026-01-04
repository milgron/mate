import Groq from 'groq-sdk';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

// Security: Maximum voice file size (25MB)
const MAX_VOICE_SIZE = 25 * 1024 * 1024;

export interface TranscriptionResult {
  success: boolean;
  text?: string;
  error?: string;
}

/**
 * Downloads a file from URL to a temporary path with size limit.
 */
async function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const protocol = url.startsWith('https') ? https : http;
    let downloadedSize = 0;

    const request = protocol.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          file.close();
          downloadFile(redirectUrl, destPath).then(resolve).catch(reject);
          return;
        }
      }

      // Check Content-Length header if available
      const contentLength = parseInt(response.headers['content-length'] || '0', 10);
      if (contentLength > MAX_VOICE_SIZE) {
        file.close();
        fs.unlink(destPath, () => {});
        reject(new Error(`Voice file too large (${Math.round(contentLength / 1024 / 1024)}MB). Maximum ${MAX_VOICE_SIZE / 1024 / 1024}MB allowed.`));
        return;
      }

      response.on('data', (chunk: Buffer) => {
        downloadedSize += chunk.length;
        // Security: Abort if file size exceeds limit during download
        if (downloadedSize > MAX_VOICE_SIZE) {
          request.destroy();
          file.close();
          fs.unlink(destPath, () => {});
          reject(new Error(`Voice file too large. Maximum ${MAX_VOICE_SIZE / 1024 / 1024}MB allowed.`));
        }
      });

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

      // Transcribe with Groq (auto-detect language)
      const transcription = await this.client.audio.transcriptions.create({
        file: fs.createReadStream(tempPath),
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
