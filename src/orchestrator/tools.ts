import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { MemoryTool } from '../agent/tools/memory.js';

// Simple schemas for Groq compatibility - no optional fields, no enums
const rememberSchema = z.object({
  key: z.string(),
  value: z.string(),
});

const recallSchema = z.object({
  key: z.string(),
});

/**
 * Creates memory tools for the Vercel AI SDK.
 * Simplified for Groq compatibility - only essential tools with minimal schemas.
 */
export function createMemoryTools(userId: string) {
  const memoryTool = new MemoryTool();
  memoryTool.setUser(userId);

  return {
    remember: tool({
      description: 'Save user information to memory. Use when user shares: name, location, preferences, work, etc. Example: user says "me llamo Juan" -> call remember with key="name", value="Juan"',
      inputSchema: zodSchema(rememberSchema),
      execute: async ({ key, value }) => {
        // Determine file based on key content
        const file = ['language', 'style', 'preference', 'tone'].some(p =>
          key.toLowerCase().includes(p)) ? 'preferences' : 'about';
        return memoryTool.remember({ key, value, file });
      },
    }),

    recall: tool({
      description: 'Retrieve saved user information from memory by key.',
      inputSchema: zodSchema(recallSchema),
      execute: async ({ key }) => memoryTool.recall({ key }),
    }),
  };
}

/**
 * Export MemoryTool for direct use in fallback patterns.
 */
export { MemoryTool };
