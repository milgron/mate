import { logger } from '../../utils/logger.js';

export interface LogsResult {
  success: boolean;
  logs?: string;
  error?: string;
}

/**
 * Tool for reading application logs.
 */
export class LogsTool {
  private readonly maxLines: number;

  constructor(maxLines: number = 100) {
    this.maxLines = maxLines;
  }

  /**
   * Reads the last N lines from the log file.
   */
  async execute(input: { lines?: number }): Promise<LogsResult> {
    const lines = Math.min(input.lines ?? 30, this.maxLines);

    try {
      const logs = logger.readLastLines(lines);
      return {
        success: true,
        logs,
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
   * Returns the tool definition for Claude.
   */
  getToolDefinition() {
    return {
      name: 'logs',
      description: 'Read the last N lines from the application logs. Use this to check what has been happening, debug issues, or see recent activity.',
      input_schema: {
        type: 'object' as const,
        properties: {
          lines: {
            type: 'number',
            description: `Number of log lines to retrieve (default: 30, max: ${this.maxLines})`,
          },
        },
        required: [],
      },
    };
  }
}
