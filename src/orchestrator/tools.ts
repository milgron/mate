import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { getSemanticDB, type MemoryType } from '../db/semantic.js';
import { logger } from '../utils/logger.js';

// Simple schemas for Groq compatibility - no optional fields, no enums
const rememberSchema = z.object({
  key: z.string(),
  value: z.string(),
});

const recallSchema = z.object({
  query: z.string(),
});

/**
 * Creates memory tools for the Vercel AI SDK.
 * Uses LanceDB for semantic vector storage and retrieval.
 */
export function createMemoryTools(userId: string) {
  return {
    remember: tool({
      description: 'Save user information to memory. Use when user shares: name, location, preferences, work, etc. Example: user says "me llamo Juan" -> call remember with key="name", value="Juan"',
      inputSchema: zodSchema(rememberSchema),
      execute: async ({ key, value }) => {
        try {
          const db = await getSemanticDB();
          const type: MemoryType = ['language', 'style', 'preference', 'tone'].some(p =>
            key.toLowerCase().includes(p)) ? 'preference' : 'fact';
          await db.store(userId, key, value, type);
          logger.info('Memory stored via tool', { userId, key, type });
          return { success: true, message: `Remembered: ${key} = ${value}` };
        } catch (error) {
          logger.error('Failed to store memory', { error, userId, key });
          return { success: false, message: 'Failed to save memory' };
        }
      },
    }),

    recall: tool({
      description: 'Search memories for relevant information. Use semantic search to find related memories.',
      inputSchema: zodSchema(recallSchema),
      execute: async ({ query }) => {
        try {
          const db = await getSemanticDB();
          const results = await db.search(userId, query, 3);
          if (results.length === 0) {
            return { found: false, message: 'No memories found' };
          }
          return {
            found: true,
            memories: results.map(r => ({ key: r.key, value: r.content })),
          };
        } catch (error) {
          logger.error('Failed to search memories', { error, userId, query });
          return { found: false, message: 'Error searching memories' };
        }
      },
    }),
  };
}

/**
 * MemoryTool class for direct use in fallback patterns.
 * Uses LanceDB for semantic storage.
 */
export class MemoryTool {
  private userId: string = 'default';

  setUser(userId: string): void {
    this.userId = userId;
  }

  async remember(params: { key: string; value: string; file?: string }): Promise<{ success: boolean; message: string }> {
    try {
      const db = await getSemanticDB();
      const type: MemoryType = params.file === 'preferences' ? 'preference' : 'fact';
      await db.store(this.userId, params.key, params.value, type);
      logger.info('Memory stored via MemoryTool', { userId: this.userId, key: params.key, type });
      return { success: true, message: `Remembered: ${params.key} = ${params.value}` };
    } catch (error) {
      logger.error('MemoryTool.remember failed', { error, userId: this.userId, key: params.key });
      return { success: false, message: 'Failed to save memory' };
    }
  }

  async recall(params: { key: string }): Promise<{ found: boolean; value?: string; message?: string }> {
    try {
      const db = await getSemanticDB();
      const memory = await db.findByKey(this.userId, params.key);
      if (memory) {
        return { found: true, value: memory.content };
      }
      // Try semantic search if exact match not found
      const results = await db.search(this.userId, params.key, 1);
      const firstResult = results[0];
      if (firstResult) {
        return { found: true, value: firstResult.content };
      }
      return { found: false, message: 'Memory not found' };
    } catch (error) {
      logger.error('MemoryTool.recall failed', { error, userId: this.userId, key: params.key });
      return { found: false, message: 'Error retrieving memory' };
    }
  }
}
