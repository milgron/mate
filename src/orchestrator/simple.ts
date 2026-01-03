import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger.js';
import { getConversationDB, formatHistory } from '../db/conversations.js';
import { loadLongTermMemory, initLongTermMemory, getMemoryFilePath } from '../db/longterm.js';

const execAsync = promisify(exec);

export interface SimpleExecOptions {
  timeout?: number;
  maxBuffer?: number;
  historyLimit?: number;
}

const DEFAULT_OPTIONS: Required<SimpleExecOptions> = {
  timeout: 120000, // 2 minutes
  maxBuffer: 1024 * 1024, // 1MB
  historyLimit: 30, // Last 30 messages
};

/**
 * Build the full prompt with memory context.
 */
function buildPromptWithContext(
  userId: string,
  currentMessage: string,
  historyLimit: number
): string {
  const db = getConversationDB();

  // Load long-term memory
  const longTermMemory = loadLongTermMemory(userId);

  // Load short-term history
  const history = db.getHistory(userId, historyLimit);
  const formattedHistory = formatHistory(history);

  // Get memory file path for instructions
  const memoryPath = getMemoryFilePath(userId);

  // Build full prompt
  const parts: string[] = [];

  if (longTermMemory) {
    parts.push('=== LONG-TERM MEMORY ===');
    parts.push(longTermMemory);
    parts.push('');
  }

  if (formattedHistory) {
    parts.push('=== RECENT CONVERSATION ===');
    parts.push(formattedHistory);
    parts.push('');
  }

  parts.push('=== CURRENT MESSAGE ===');
  parts.push(`User: ${currentMessage}`);
  parts.push('');

  parts.push('=== INSTRUCTIONS ===');
  parts.push('- You can read/write files in /app/data/');
  parts.push(`- If something is important to remember permanently, update ${memoryPath}`);
  parts.push('- Respond in the same language as the user');

  return parts.join('\n');
}

/**
 * Execute a simple prompt using the Claude CLI.
 * This is fast and suitable for straightforward questions/tasks.
 */
export async function execSimple(
  prompt: string,
  userId: string,
  options: SimpleExecOptions = {}
): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Initialize long-term memory file if it doesn't exist
  initLongTermMemory(userId);

  // Build prompt with context
  const fullPrompt = buildPromptWithContext(userId, prompt, opts.historyLimit);

  // Escape the prompt for shell
  const escaped = fullPrompt.replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$');

  logger.info('Executing simple prompt via Claude CLI', {
    promptLength: prompt.length,
    fullPromptLength: fullPrompt.length,
    timeout: opts.timeout,
  });

  const db = getConversationDB();

  try {
    const { stdout, stderr } = await execAsync(
      `claude -p "${escaped}" --dangerously-skip-permissions --output-format text < /dev/null`,
      {
        timeout: opts.timeout,
        maxBuffer: opts.maxBuffer,
        env: { ...process.env, HOME: '/home/mate' },
        shell: '/bin/bash',
        cwd: '/app/data',
      }
    );

    if (stderr) {
      logger.warn('Claude CLI stderr output', { stderr: stderr.slice(0, 500) });
    }

    const result = stdout.trim();
    logger.info('Simple prompt completed', { responseLength: result.length });

    // Save both messages to history
    db.addMessage(userId, 'user', prompt);
    db.addMessage(userId, 'assistant', result);

    return result;
  } catch (error: unknown) {
    const err = error as { message?: string; stderr?: string; stdout?: string; code?: number };
    logger.error('Claude CLI execution failed', {
      error: err.message,
      stderr: err.stderr,
      stdout: err.stdout,
      code: err.code,
    });
    throw new Error(`Claude CLI failed: ${err.message || String(error)}${err.stderr ? ` - ${err.stderr}` : ''}`);
  }
}
