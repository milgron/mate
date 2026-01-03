import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || '/app/data';
const LOG_DIR = path.join(DATA_DIR, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'mate.log');
const MAX_LOG_SIZE = 1024 * 1024; // 1MB

// Track if file logging is available
let fileLoggingEnabled = false;

// Try to ensure log directory exists
try {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
  fileLoggingEnabled = true;
} catch {
  // File logging not available (e.g., in tests or when path doesn't exist)
  fileLoggingEnabled = false;
}

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function formatMessage(level: LogLevel, message: string, meta?: unknown): string {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
}

function rotateIfNeeded(): void {
  try {
    if (fs.existsSync(LOG_FILE)) {
      const stats = fs.statSync(LOG_FILE);
      if (stats.size > MAX_LOG_SIZE) {
        const backupFile = `${LOG_FILE}.1`;
        if (fs.existsSync(backupFile)) {
          fs.unlinkSync(backupFile);
        }
        fs.renameSync(LOG_FILE, backupFile);
      }
    }
  } catch {
    // Ignore rotation errors
  }
}

function writeToFile(formatted: string): void {
  if (!fileLoggingEnabled) return;
  try {
    rotateIfNeeded();
    fs.appendFileSync(LOG_FILE, formatted + '\n');
  } catch {
    // Ignore write errors
  }
}

export const logger = {
  info(message: string, meta?: unknown): void {
    const formatted = formatMessage('info', message, meta);
    console.log(formatted);
    writeToFile(formatted);
  },

  warn(message: string, meta?: unknown): void {
    const formatted = formatMessage('warn', message, meta);
    console.warn(formatted);
    writeToFile(formatted);
  },

  error(message: string, meta?: unknown): void {
    const formatted = formatMessage('error', message, meta);
    console.error(formatted);
    writeToFile(formatted);
  },

  debug(message: string, meta?: unknown): void {
    const formatted = formatMessage('debug', message, meta);
    if (process.env.DEBUG) {
      console.log(formatted);
    }
    writeToFile(formatted);
  },

  getLogPath(): string {
    return LOG_FILE;
  },

  readLastLines(count: number = 50): string {
    if (!fileLoggingEnabled) {
      return 'File logging not available. Check Docker logs instead.';
    }
    try {
      if (!fs.existsSync(LOG_FILE)) {
        return 'No logs available yet.';
      }
      const content = fs.readFileSync(LOG_FILE, 'utf-8');
      const lines = content.trim().split('\n');
      const lastLines = lines.slice(-count);
      return lastLines.join('\n') || 'Log file is empty.';
    } catch (error) {
      return `Error reading logs: ${error}`;
    }
  },
};
