import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export interface UpdateToolConfig {
  triggerPath: string;
}

export interface UpdateResult {
  success: boolean;
  message: string;
}

/**
 * Triggers a self-update by writing to a trigger file.
 * The host's auto-update service watches this file and performs the update.
 */
export class UpdateTool {
  private readonly triggerPath: string;

  constructor(config: UpdateToolConfig) {
    this.triggerPath = config.triggerPath;
  }

  /**
   * Triggers an update by writing to the trigger file.
   */
  async trigger(): Promise<UpdateResult> {
    try {
      // Ensure directory exists
      const dir = dirname(this.triggerPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      // Write timestamp to trigger file
      const timestamp = new Date().toISOString();
      writeFileSync(this.triggerPath, timestamp);

      return {
        success: true,
        message: `Update triggered at ${timestamp}. I will restart shortly with the latest code from GitHub.`,
      };
    } catch (error: unknown) {
      const err = error as Error;
      return {
        success: false,
        message: `Failed to trigger update: ${err.message}`,
      };
    }
  }

  /**
   * Returns the tool definition for Claude.
   */
  getToolDefinition() {
    return {
      name: 'self_update',
      description:
        'Triggers a self-update to pull the latest code from GitHub and restart. ' +
        'Use this when the user asks to update, upgrade, or get the latest version. ' +
        'After triggering, the bot will restart within ~60 seconds.',
      input_schema: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
    };
  }
}
