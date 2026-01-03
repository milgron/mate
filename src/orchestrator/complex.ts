import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger.js';
import { execSimple } from './simple.js';

const execAsync = promisify(exec);

export interface ComplexExecOptions {
  timeout?: number;
  maxBuffer?: number;
  fallbackToSimple?: boolean;
}

const DEFAULT_OPTIONS: Required<ComplexExecOptions> = {
  timeout: 300000, // 5 minutes
  maxBuffer: 5 * 1024 * 1024, // 5MB
  fallbackToSimple: true,
};

interface ClaudeFlowResult {
  result?: string;
  output?: string;
  error?: string;
}

/**
 * Execute a complex task using claude-flow swarm mode.
 * This handles multi-step tasks, research, analysis, etc.
 */
export async function execComplex(
  task: string,
  options: ComplexExecOptions = {}
): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Escape the task for shell
  const escaped = task.replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$');

  logger.info('Executing complex task via claude-flow', {
    taskLength: task.length,
    timeout: opts.timeout,
  });

  try {
    const { stdout, stderr } = await execAsync(
      `claude-flow swarm "${escaped}" --claude --output-format json < /dev/null`,
      {
        timeout: opts.timeout,
        maxBuffer: opts.maxBuffer,
        env: { ...process.env, HOME: '/home/mate' },
        shell: '/bin/bash',
        cwd: '/app/data',
      }
    );

    if (stderr) {
      logger.warn('claude-flow stderr output', { stderr: stderr.slice(0, 500) });
    }

    // Try to parse JSON response
    try {
      const result: ClaudeFlowResult = JSON.parse(stdout);
      const output = result.result || result.output || stdout;
      logger.info('Complex task completed', { responseLength: output.length });
      return output;
    } catch {
      // If not valid JSON, return raw output
      logger.warn('claude-flow returned non-JSON output, using raw response');
      return stdout.trim();
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('claude-flow execution failed', { error: errorMessage });

    if (opts.fallbackToSimple) {
      logger.info('Falling back to simple CLI execution');
      return execSimple(task);
    }

    throw new Error(`claude-flow failed: ${errorMessage}`);
  }
}
