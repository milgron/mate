import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface BashToolConfig {
  allowedCommands: string[];
  timeoutMs?: number;
}

export interface BashResult {
  success: boolean;
  output?: string;
  error?: string;
}

/**
 * Executes shell commands with security restrictions.
 */
export class BashTool {
  private readonly allowedCommands: Set<string>;
  private readonly timeoutMs: number;

  constructor(config: BashToolConfig) {
    this.allowedCommands = new Set(config.allowedCommands);
    this.timeoutMs = config.timeoutMs ?? 30000;
  }

  /**
   * Extracts the base command from a command string.
   */
  private getBaseCommand(command: string): string {
    const trimmed = command.trim();
    const firstWord = trimmed.split(/\s+/)[0] ?? '';
    return firstWord;
  }

  /**
   * Checks if a command is allowed.
   */
  isAllowed(command: string): boolean {
    const baseCommand = this.getBaseCommand(command);
    return this.allowedCommands.has(baseCommand);
  }

  /**
   * Executes a shell command.
   */
  async execute(input: { command: string }): Promise<BashResult> {
    const { command } = input;

    if (!this.isAllowed(command)) {
      return {
        success: false,
        error: `Command "${this.getBaseCommand(command)}" is not allowed`,
      };
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: this.timeoutMs,
        maxBuffer: 1024 * 1024, // 1MB
      });

      return {
        success: true,
        output: stdout + (stderr ? `\n${stderr}` : ''),
      };
    } catch (error: unknown) {
      const err = error as { killed?: boolean; message?: string; stderr?: string };

      if (err.killed) {
        return {
          success: false,
          error: 'Command timed out',
        };
      }

      return {
        success: false,
        error: err.message || String(error),
      };
    }
  }

  /**
   * Returns the tool definition for Claude.
   */
  getToolDefinition() {
    return {
      name: 'bash',
      description: `Execute shell commands. Allowed commands: ${[...this.allowedCommands].join(', ')}`,
      input_schema: {
        type: 'object' as const,
        properties: {
          command: {
            type: 'string',
            description: 'The shell command to execute',
          },
        },
        required: ['command'],
      },
    };
  }
}
