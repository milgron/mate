import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || '/app/data';
const MEMORY_DIR = path.join(DATA_DIR, 'memory');

export interface MemoryResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Ensures a directory exists, creating it if necessary.
 */
function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Gets the memory file path for a user.
 */
function getMemoryPath(userId: string): string {
  const userDir = path.join(MEMORY_DIR, userId);
  ensureDir(userDir);
  return path.join(userDir, 'facts.json');
}

/**
 * Loads memories for a user.
 */
function loadMemories(userId: string): Record<string, unknown> {
  const memoryPath = getMemoryPath(userId);
  if (fs.existsSync(memoryPath)) {
    try {
      const content = fs.readFileSync(memoryPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Saves memories for a user.
 */
function saveMemories(userId: string, memories: Record<string, unknown>): void {
  const memoryPath = getMemoryPath(userId);
  fs.writeFileSync(memoryPath, JSON.stringify(memories, null, 2));
}

/**
 * Tool for persistent memory storage.
 * Allows the agent to remember facts across sessions.
 */
export class MemoryTool {
  private currentUserId: string = '';

  /**
   * Sets the current user context.
   */
  setUser(userId: string): void {
    this.currentUserId = userId;
  }

  /**
   * Stores a fact in memory.
   */
  async remember(input: { key: string; value: string }): Promise<MemoryResult> {
    if (!this.currentUserId) {
      return { success: false, error: 'No user context set' };
    }

    try {
      const memories = loadMemories(this.currentUserId);
      memories[input.key] = {
        value: input.value,
        timestamp: new Date().toISOString(),
      };
      saveMemories(this.currentUserId, memories);

      return { success: true, data: `Remembered: ${input.key}` };
    } catch (error: unknown) {
      const err = error as { message?: string };
      return { success: false, error: err.message || String(error) };
    }
  }

  /**
   * Recalls a fact from memory.
   */
  async recall(input: { key: string }): Promise<MemoryResult> {
    if (!this.currentUserId) {
      return { success: false, error: 'No user context set' };
    }

    try {
      const memories = loadMemories(this.currentUserId);
      const memory = memories[input.key];

      if (memory) {
        return { success: true, data: memory };
      } else {
        return { success: true, data: null };
      }
    } catch (error: unknown) {
      const err = error as { message?: string };
      return { success: false, error: err.message || String(error) };
    }
  }

  /**
   * Lists all facts in memory.
   */
  async listMemories(): Promise<MemoryResult> {
    if (!this.currentUserId) {
      return { success: false, error: 'No user context set' };
    }

    try {
      const memories = loadMemories(this.currentUserId);
      const keys = Object.keys(memories);

      return {
        success: true,
        data: {
          count: keys.length,
          keys,
          memories,
        },
      };
    } catch (error: unknown) {
      const err = error as { message?: string };
      return { success: false, error: err.message || String(error) };
    }
  }

  /**
   * Forgets a fact from memory.
   */
  async forget(input: { key: string }): Promise<MemoryResult> {
    if (!this.currentUserId) {
      return { success: false, error: 'No user context set' };
    }

    try {
      const memories = loadMemories(this.currentUserId);

      if (memories[input.key]) {
        delete memories[input.key];
        saveMemories(this.currentUserId, memories);
        return { success: true, data: `Forgot: ${input.key}` };
      } else {
        return { success: true, data: `No memory found for: ${input.key}` };
      }
    } catch (error: unknown) {
      const err = error as { message?: string };
      return { success: false, error: err.message || String(error) };
    }
  }

  /**
   * Returns the tool definitions for Claude.
   */
  getToolDefinitions() {
    return [
      {
        name: 'remember',
        description:
          'Store a fact or piece of information in persistent memory. Use this to remember important things about the user, their preferences, or anything they want you to recall later. Memory persists across sessions.',
        input_schema: {
          type: 'object' as const,
          properties: {
            key: {
              type: 'string',
              description:
                'A descriptive key for the memory (e.g., "user_name", "favorite_color", "project_deadline")',
            },
            value: {
              type: 'string',
              description: 'The value or fact to remember',
            },
          },
          required: ['key', 'value'],
        },
      },
      {
        name: 'recall',
        description:
          'Retrieve a specific fact from persistent memory by its key.',
        input_schema: {
          type: 'object' as const,
          properties: {
            key: {
              type: 'string',
              description: 'The key of the memory to recall',
            },
          },
          required: ['key'],
        },
      },
      {
        name: 'list_memories',
        description:
          'List all facts stored in persistent memory for the current user.',
        input_schema: {
          type: 'object' as const,
          properties: {},
          required: [],
        },
      },
      {
        name: 'forget',
        description: 'Remove a fact from persistent memory.',
        input_schema: {
          type: 'object' as const,
          properties: {
            key: {
              type: 'string',
              description: 'The key of the memory to forget',
            },
          },
          required: ['key'],
        },
      },
    ];
  }
}
