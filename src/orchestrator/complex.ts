import { execFile } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger.js';
import { execSimple } from './simple.js';
import { getConversationDB, formatHistory } from '../db/conversations.js';
import { loadLongTermMemory, initLongTermMemory, getMemoryFilePath } from '../db/longterm.js';

const execFileAsync = promisify(execFile);

// Safe environment variables - don't expose secrets to child process
const SAFE_ENV = {
  HOME: '/home/mate',
  PATH: '/usr/local/bin:/usr/bin:/bin',
  NODE_ENV: 'production',
};

export interface ComplexExecOptions {
  timeout?: number;
  maxBuffer?: number;
  fallbackToSimple?: boolean;
  historyLimit?: number;
}

const DEFAULT_OPTIONS: Required<ComplexExecOptions> = {
  timeout: 300000, // 5 minutes
  maxBuffer: 5 * 1024 * 1024, // 5MB
  fallbackToSimple: true,
  historyLimit: 30,
};

interface ClaudeFlowResult {
  result?: string;
  output?: string;
  error?: string;
}

/**
 * Build the full task description with memory context.
 */
function buildTaskWithContext(
  userId: string,
  task: string,
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

  // Build full task
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

  parts.push('=== CURRENT TASK ===');
  parts.push(task);
  parts.push('');

  parts.push('=== INSTRUCTIONS ===');
  parts.push('- You can read/write files in /app/data/');
  parts.push(`- If something is important to remember permanently, update ${memoryPath}`);
  parts.push('- Respond in the same language as the user');

  return parts.join('\n');
}

/**
 * Execute a complex task using claude-flow swarm mode.
 * This handles multi-step tasks, research, analysis, etc.
 */
export async function execComplex(
  task: string,
  userId: string,
  options: ComplexExecOptions = {}
): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Initialize long-term memory file if it doesn't exist
  initLongTermMemory(userId);

  // Build task with context
  const fullTask = buildTaskWithContext(userId, task, opts.historyLimit);

  logger.info('Executing complex task via claude-flow', {
    taskLength: task.length,
    fullTaskLength: fullTask.length,
    timeout: opts.timeout,
  });

  const db = getConversationDB();

  try {
    // Use execFile with argument array to prevent shell injection
    const { stdout, stderr } = await execFileAsync(
      'claude-flow',
      [
        'swarm', fullTask,
        '--claude',
        '--output-format', 'json',
      ],
      {
        timeout: opts.timeout,
        maxBuffer: opts.maxBuffer,
        env: SAFE_ENV,
        cwd: '/app/data',
      }
    );

    if (stderr) {
      logger.warn('claude-flow stderr output', { stderr: stderr.slice(0, 500) });
    }

    // Try to parse JSON response
    let result: string;
    try {
      const parsed: ClaudeFlowResult = JSON.parse(stdout);
      result = parsed.result || parsed.output || stdout;
    } catch {
      // If not valid JSON, return raw output
      logger.warn('claude-flow returned non-JSON output, using raw response');
      result = stdout.trim();
    }

    logger.info('Complex task completed', { responseLength: result.length });

    // Save both messages to history
    db.addMessage(userId, 'user', task);
    db.addMessage(userId, 'assistant', result);

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // Log detailed error for debugging
    logger.error('claude-flow execution failed', { error: errorMessage });

    if (opts.fallbackToSimple) {
      logger.info('Falling back to simple CLI execution');
      return execSimple(task, userId);
    }

    // Sanitized error message - don't expose internal details
    throw new Error('An error occurred processing your request.');
  }
}
