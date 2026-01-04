import { spawn } from 'child_process';
import { logger } from '../utils/logger.js';
import { getConversationDB, formatHistory } from '../db/conversations.js';
import { loadLongTermMemory, initLongTermMemory, getMemoryFilePath } from '../db/longterm.js';

// Safe environment variables - don't expose secrets to child process
const SAFE_ENV = {
  HOME: '/home/mate',
  PATH: '/usr/local/bin:/usr/bin:/bin',
  NODE_ENV: 'production',
};

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
 * Execute command with spawn - prevents shell injection and properly handles stdin
 */
function spawnAsync(
  command: string,
  args: string[],
  options: { timeout: number; maxBuffer: number; env: NodeJS.ProcessEnv; cwd: string }
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: options.env,
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'], // Close stdin to prevent hanging
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
      reject(new Error(`Command timed out after ${options.timeout}ms`));
    }, options.timeout);

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
      if (stdout.length > options.maxBuffer) {
        killed = true;
        child.kill('SIGTERM');
        reject(new Error('stdout maxBuffer exceeded'));
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
      if (stderr.length > options.maxBuffer) {
        killed = true;
        child.kill('SIGTERM');
        reject(new Error('stderr maxBuffer exceeded'));
      }
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (killed) return;

      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const error = new Error(`Command failed with code ${code}`) as Error & {
          code: number;
          stdout: string;
          stderr: string;
        };
        error.code = code ?? 1;
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
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

  logger.info('Executing simple prompt via Claude CLI', {
    promptLength: prompt.length,
    fullPromptLength: fullPrompt.length,
    timeout: opts.timeout,
  });

  const db = getConversationDB();

  try {
    // Use spawn with argument array to prevent shell injection
    const { stdout, stderr } = await spawnAsync(
      'claude',
      [
        '-p', fullPrompt,
        '--dangerously-skip-permissions',
        '--output-format', 'text',
      ],
      {
        timeout: opts.timeout,
        maxBuffer: opts.maxBuffer,
        env: SAFE_ENV,
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
    // Log detailed error for debugging, but don't expose internals to user
    logger.error('Claude CLI execution failed', {
      error: err.message,
      stderr: err.stderr,
      stdout: err.stdout,
      code: err.code,
    });
    // Sanitized error message - don't expose internal details
    throw new Error('An error occurred processing your request.');
  }
}
