import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || '/app/data';
const MEMORY_DIR = path.join(DATA_DIR, 'memory');

// Memory categories with their purposes
export const MEMORY_CATEGORIES = {
  todo: 'Tasks and action items to complete',
  posts: 'Blog posts and content ideas',
  today: "Today's tasks (subset of todo for current day)",
  memory: 'Important facts and things to remember',
  random: 'Everything else that doesn\'t fit other categories',
} as const;

export type MemoryCategory = keyof typeof MEMORY_CATEGORIES;

export interface MemoryEntry {
  value: string;
  timestamp: string;
  category: MemoryCategory;
}

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
 * Gets the category directory path for a user.
 */
function getCategoryPath(userId: string, category: MemoryCategory): string {
  const categoryDir = path.join(MEMORY_DIR, userId, category);
  ensureDir(categoryDir);
  return path.join(categoryDir, 'items.json');
}

/**
 * Gets the legacy memory file path for migration.
 */
function getLegacyMemoryPath(userId: string): string {
  return path.join(MEMORY_DIR, userId, 'facts.json');
}

/**
 * Loads memories for a user in a specific category.
 */
function loadCategoryMemories(userId: string, category: MemoryCategory): Record<string, MemoryEntry> {
  const memoryPath = getCategoryPath(userId, category);
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
 * Saves memories for a user in a specific category.
 */
function saveCategoryMemories(userId: string, category: MemoryCategory, memories: Record<string, MemoryEntry>): void {
  const memoryPath = getCategoryPath(userId, category);
  fs.writeFileSync(memoryPath, JSON.stringify(memories, null, 2));
}

/**
 * Loads all memories across all categories for a user.
 */
function loadAllMemories(userId: string): Record<MemoryCategory, Record<string, MemoryEntry>> {
  const allMemories: Record<MemoryCategory, Record<string, MemoryEntry>> = {
    todo: {},
    posts: {},
    today: {},
    memory: {},
    random: {},
  };

  for (const category of Object.keys(MEMORY_CATEGORIES) as MemoryCategory[]) {
    allMemories[category] = loadCategoryMemories(userId, category);
  }

  return allMemories;
}

/**
 * Migrates legacy flat facts.json to new category-based structure.
 * Existing memories go to 'random' category.
 */
function migrateIfNeeded(userId: string): void {
  const legacyPath = getLegacyMemoryPath(userId);

  if (fs.existsSync(legacyPath)) {
    try {
      const content = fs.readFileSync(legacyPath, 'utf-8');
      const legacyMemories = JSON.parse(content);

      // Move all legacy memories to 'random' category
      const randomMemories = loadCategoryMemories(userId, 'random');

      for (const [key, value] of Object.entries(legacyMemories)) {
        const legacyEntry = value as { value: string; timestamp: string };
        randomMemories[key] = {
          value: legacyEntry.value,
          timestamp: legacyEntry.timestamp,
          category: 'random',
        };
      }

      saveCategoryMemories(userId, 'random', randomMemories);

      // Rename legacy file to mark as migrated
      const backupPath = path.join(MEMORY_DIR, userId, 'facts.json.migrated');
      fs.renameSync(legacyPath, backupPath);
    } catch {
      // Migration failed, leave legacy file in place
    }
  }
}

/**
 * Validates that a category string is valid.
 */
function isValidCategory(category: string): category is MemoryCategory {
  return category in MEMORY_CATEGORIES;
}

/**
 * Tool for persistent memory storage with category organization.
 * Allows the agent to remember facts across sessions, organized by category.
 */
export class MemoryTool {
  private currentUserId: string = '';

  /**
   * Sets the current user context and runs migration if needed.
   */
  setUser(userId: string): void {
    this.currentUserId = userId;
    migrateIfNeeded(userId);
  }

  /**
   * Stores a fact in memory under a specific category.
   */
  async remember(input: { key: string; value: string; category?: string }): Promise<MemoryResult> {
    if (!this.currentUserId) {
      return { success: false, error: 'No user context set' };
    }

    const category: MemoryCategory = input.category && isValidCategory(input.category)
      ? input.category
      : 'random';

    try {
      const memories = loadCategoryMemories(this.currentUserId, category);
      memories[input.key] = {
        value: input.value,
        timestamp: new Date().toISOString(),
        category,
      };
      saveCategoryMemories(this.currentUserId, category, memories);

      return { success: true, data: `Remembered in ${category}: ${input.key}` };
    } catch (error: unknown) {
      const err = error as { message?: string };
      return { success: false, error: err.message || String(error) };
    }
  }

  /**
   * Recalls a fact from memory. Searches across all categories if not specified.
   */
  async recall(input: { key: string; category?: string }): Promise<MemoryResult> {
    if (!this.currentUserId) {
      return { success: false, error: 'No user context set' };
    }

    try {
      // If category specified, search only there
      if (input.category && isValidCategory(input.category)) {
        const memories = loadCategoryMemories(this.currentUserId, input.category);
        const memory = memories[input.key];
        return { success: true, data: memory || null };
      }

      // Otherwise search all categories
      const allMemories = loadAllMemories(this.currentUserId);
      for (const category of Object.keys(MEMORY_CATEGORIES) as MemoryCategory[]) {
        const memory = allMemories[category][input.key];
        if (memory) {
          return { success: true, data: memory };
        }
      }

      return { success: true, data: null };
    } catch (error: unknown) {
      const err = error as { message?: string };
      return { success: false, error: err.message || String(error) };
    }
  }

  /**
   * Lists all facts in memory, optionally filtered by category.
   */
  async listMemories(input?: { category?: string }): Promise<MemoryResult> {
    if (!this.currentUserId) {
      return { success: false, error: 'No user context set' };
    }

    try {
      // If category specified, list only that category
      if (input?.category && isValidCategory(input.category)) {
        const memories = loadCategoryMemories(this.currentUserId, input.category);
        const keys = Object.keys(memories);
        return {
          success: true,
          data: {
            category: input.category,
            count: keys.length,
            keys,
            memories,
          },
        };
      }

      // Otherwise list all categories with summary
      const allMemories = loadAllMemories(this.currentUserId);
      const summary: Record<string, { count: number; keys: string[]; memories: Record<string, MemoryEntry> }> = {};
      let totalCount = 0;

      for (const category of Object.keys(MEMORY_CATEGORIES) as MemoryCategory[]) {
        const memories = allMemories[category];
        const keys = Object.keys(memories);
        totalCount += keys.length;
        summary[category] = {
          count: keys.length,
          keys,
          memories,
        };
      }

      return {
        success: true,
        data: {
          totalCount,
          categories: MEMORY_CATEGORIES,
          summary,
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
  async forget(input: { key: string; category?: string }): Promise<MemoryResult> {
    if (!this.currentUserId) {
      return { success: false, error: 'No user context set' };
    }

    try {
      // If category specified, delete only from there
      if (input.category && isValidCategory(input.category)) {
        const memories = loadCategoryMemories(this.currentUserId, input.category);
        if (memories[input.key]) {
          delete memories[input.key];
          saveCategoryMemories(this.currentUserId, input.category, memories);
          return { success: true, data: `Forgot from ${input.category}: ${input.key}` };
        }
        return { success: true, data: `No memory found for: ${input.key} in ${input.category}` };
      }

      // Otherwise search and delete from any category
      const allMemories = loadAllMemories(this.currentUserId);
      for (const category of Object.keys(MEMORY_CATEGORIES) as MemoryCategory[]) {
        if (allMemories[category][input.key]) {
          delete allMemories[category][input.key];
          saveCategoryMemories(this.currentUserId, category, allMemories[category]);
          return { success: true, data: `Forgot from ${category}: ${input.key}` };
        }
      }

      return { success: true, data: `No memory found for: ${input.key}` };
    } catch (error: unknown) {
      const err = error as { message?: string };
      return { success: false, error: err.message || String(error) };
    }
  }

  /**
   * Moves a memory from one category to another.
   * Useful for moving items from todo to today, or completing tasks.
   */
  async moveMemory(input: { key: string; fromCategory: string; toCategory: string }): Promise<MemoryResult> {
    if (!this.currentUserId) {
      return { success: false, error: 'No user context set' };
    }

    if (!isValidCategory(input.fromCategory)) {
      return { success: false, error: `Invalid source category: ${input.fromCategory}. Valid: ${Object.keys(MEMORY_CATEGORIES).join(', ')}` };
    }

    if (!isValidCategory(input.toCategory)) {
      return { success: false, error: `Invalid target category: ${input.toCategory}. Valid: ${Object.keys(MEMORY_CATEGORIES).join(', ')}` };
    }

    try {
      const fromMemories = loadCategoryMemories(this.currentUserId, input.fromCategory);
      const memory = fromMemories[input.key];

      if (!memory) {
        return { success: false, error: `No memory found for: ${input.key} in ${input.fromCategory}` };
      }

      // Remove from source
      delete fromMemories[input.key];
      saveCategoryMemories(this.currentUserId, input.fromCategory, fromMemories);

      // Add to target with updated category
      const toMemories = loadCategoryMemories(this.currentUserId, input.toCategory);
      toMemories[input.key] = {
        ...memory,
        category: input.toCategory,
        timestamp: new Date().toISOString(), // Update timestamp on move
      };
      saveCategoryMemories(this.currentUserId, input.toCategory, toMemories);

      return { success: true, data: `Moved "${input.key}" from ${input.fromCategory} to ${input.toCategory}` };
    } catch (error: unknown) {
      const err = error as { message?: string };
      return { success: false, error: err.message || String(error) };
    }
  }

  /**
   * Returns the tool definitions for Claude.
   */
  getToolDefinitions() {
    const categoryList = Object.keys(MEMORY_CATEGORIES).join(', ');
    const categoryDescriptions = Object.entries(MEMORY_CATEGORIES)
      .map(([cat, desc]) => `  - ${cat}: ${desc}`)
      .join('\n');

    return [
      {
        name: 'remember',
        description: `Store a fact or piece of information in persistent memory under a specific category. Memory persists across sessions.

Available categories:
${categoryDescriptions}

Use the appropriate category to keep memories organized. Default is 'random' if not specified.`,
        input_schema: {
          type: 'object' as const,
          properties: {
            key: {
              type: 'string',
              description: 'A descriptive key for the memory (e.g., "buy_groceries", "blog_idea_ai", "user_name")',
            },
            value: {
              type: 'string',
              description: 'The value or fact to remember',
            },
            category: {
              type: 'string',
              enum: Object.keys(MEMORY_CATEGORIES),
              description: `Category for the memory. Options: ${categoryList}. Default: random`,
            },
          },
          required: ['key', 'value'],
        },
      },
      {
        name: 'recall',
        description: 'Retrieve a specific fact from persistent memory by its key. Searches all categories unless one is specified.',
        input_schema: {
          type: 'object' as const,
          properties: {
            key: {
              type: 'string',
              description: 'The key of the memory to recall',
            },
            category: {
              type: 'string',
              enum: Object.keys(MEMORY_CATEGORIES),
              description: `Optional: specific category to search in. Options: ${categoryList}`,
            },
          },
          required: ['key'],
        },
      },
      {
        name: 'list_memories',
        description: `List all facts stored in persistent memory. Can filter by category or show all.

Available categories:
${categoryDescriptions}`,
        input_schema: {
          type: 'object' as const,
          properties: {
            category: {
              type: 'string',
              enum: Object.keys(MEMORY_CATEGORIES),
              description: `Optional: filter by category. Options: ${categoryList}. If not specified, shows all categories.`,
            },
          },
          required: [],
        },
      },
      {
        name: 'forget',
        description: 'Remove a fact from persistent memory. Searches all categories unless one is specified.',
        input_schema: {
          type: 'object' as const,
          properties: {
            key: {
              type: 'string',
              description: 'The key of the memory to forget',
            },
            category: {
              type: 'string',
              enum: Object.keys(MEMORY_CATEGORIES),
              description: `Optional: specific category to delete from. Options: ${categoryList}`,
            },
          },
          required: ['key'],
        },
      },
      {
        name: 'move_memory',
        description: `Move a memory from one category to another. Useful for:
- Moving tasks from 'todo' to 'today' for daily planning
- Moving completed items out of 'today'
- Reorganizing memories between categories`,
        input_schema: {
          type: 'object' as const,
          properties: {
            key: {
              type: 'string',
              description: 'The key of the memory to move',
            },
            fromCategory: {
              type: 'string',
              enum: Object.keys(MEMORY_CATEGORIES),
              description: `Source category. Options: ${categoryList}`,
            },
            toCategory: {
              type: 'string',
              enum: Object.keys(MEMORY_CATEGORIES),
              description: `Target category. Options: ${categoryList}`,
            },
          },
          required: ['key', 'fromCategory', 'toCategory'],
        },
      },
    ];
  }
}
