import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

export interface SimpleExecOptions {
  timeout?: number;
  maxBuffer?: number;
}

const DEFAULT_OPTIONS: Required<SimpleExecOptions> = {
  timeout: 120000, // 2 minutes
  maxBuffer: 1024 * 1024, // 1MB
};

/**
 * Execute a simple prompt using the Claude CLI.
 * This is fast and suitable for straightforward questions/tasks.
 */
export async function execSimple(
  prompt: string,
  options: SimpleExecOptions = {}
): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Escape the prompt for shell
  const escaped = prompt.replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$');

  logger.info('Executing simple prompt via Claude CLI', {
    promptLength: prompt.length,
    timeout: opts.timeout,
  });

  try {
    const { stdout, stderr } = await execAsync(
      `claude -p "${escaped}" --output-format text`,
      {
        timeout: opts.timeout,
        maxBuffer: opts.maxBuffer,
        env: { ...process.env },
      }
    );

    if (stderr) {
      logger.warn('Claude CLI stderr output', { stderr: stderr.slice(0, 500) });
    }

    const result = stdout.trim();
    logger.info('Simple prompt completed', { responseLength: result.length });
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Claude CLI execution failed', { error: errorMessage });
    throw new Error(`Claude CLI failed: ${errorMessage}`);
  }
}
