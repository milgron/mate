import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { MemoryTool, MemoryFile } from '../agent/tools/memory.js';

// Define input schemas
const rememberSchema = z.object({
  key: z.string().describe('The field name (e.g., "Name", "Location", "Language")'),
  value: z.string().describe('The value to store'),
  file: z.enum(['about', 'preferences']).optional().describe('Which file to update: about (identity) or preferences. Default: about'),
});

const recallSchema = z.object({
  key: z.string().describe('The key to search for'),
  file: z.enum(['about', 'preferences']).optional().describe('Optional: specific file to search'),
});

const noteSchema = z.object({
  topic: z.string().describe('The topic/title of the note'),
  content: z.string().describe('The note content in markdown'),
});

const getTopicSchema = z.object({
  topic: z.string().describe('The topic of the note'),
});

const journalSchema = z.object({
  content: z.string().describe('The journal entry content'),
  date: z.string().optional().describe('Date in YYYY-MM-DD format. Default: today'),
});

const dateSchema = z.object({
  date: z.string().optional().describe('Date in YYYY-MM-DD format. Default: today'),
});

const forgetSchema = z.object({
  key: z.string().describe('The key to forget'),
  file: z.enum(['about', 'preferences']).optional().describe('Optional: specific file to remove from'),
});

/**
 * Creates memory tools for the Vercel AI SDK.
 * These tools allow the agent to persist and recall user information.
 */
export function createMemoryTools(userId: string) {
  const memoryTool = new MemoryTool();
  memoryTool.setUser(userId);

  return {
    remember: tool<z.infer<typeof rememberSchema>, Awaited<ReturnType<MemoryTool['remember']>>>({
      description: `Store a fact in persistent memory. Use this when the user shares personal information.
Examples:
- User says "Me llamo Juan" → remember(key: "Name", value: "Juan", file: "about")
- User says "Prefiero respuestas cortas" → remember(key: "Response style", value: "short", file: "preferences")
- User says "Vivo en Madrid" → remember(key: "Location", value: "Madrid", file: "about")`,
      inputSchema: zodSchema(rememberSchema),
      execute: async (input) => {
        return memoryTool.remember({
          key: input.key,
          value: input.value,
          file: (input.file as MemoryFile) || 'about',
        });
      },
    }),

    recall: tool<z.infer<typeof recallSchema>, Awaited<ReturnType<MemoryTool['recall']>>>({
      description: 'Retrieve a specific fact from memory by its key.',
      inputSchema: zodSchema(recallSchema),
      execute: async (input) => {
        return memoryTool.recall({
          key: input.key,
          file: input.file as MemoryFile | undefined,
        });
      },
    }),

    addNote: tool<z.infer<typeof noteSchema>, Awaited<ReturnType<MemoryTool['addNote']>>>({
      description: `Create or update a note on a specific topic.
Notes are stored as separate markdown files. Good for: project notes, ideas, research.`,
      inputSchema: zodSchema(noteSchema),
      execute: async (input) => {
        return memoryTool.addNote(input);
      },
    }),

    getNote: tool<z.infer<typeof getTopicSchema>, Awaited<ReturnType<MemoryTool['getNote']>>>({
      description: 'Read a specific note by topic.',
      inputSchema: zodSchema(getTopicSchema),
      execute: async (input) => {
        return memoryTool.getNote(input);
      },
    }),

    listNotes: tool<Record<string, never>, Awaited<ReturnType<MemoryTool['listNotes']>>>({
      description: 'List all notes.',
      inputSchema: zodSchema(z.object({})),
      execute: async () => {
        return memoryTool.listNotes();
      },
    }),

    addJournalEntry: tool<z.infer<typeof journalSchema>, Awaited<ReturnType<MemoryTool['addJournalEntry']>>>({
      description: `Add a journal entry for today (or a specific date).
Good for: daily summaries, conversation notes, task tracking.`,
      inputSchema: zodSchema(journalSchema),
      execute: async (input) => {
        return memoryTool.addJournalEntry(input);
      },
    }),

    getJournalEntry: tool<z.infer<typeof dateSchema>, Awaited<ReturnType<MemoryTool['getJournalEntry']>>>({
      description: 'Read a journal entry for a specific date (default: today).',
      inputSchema: zodSchema(dateSchema),
      execute: async (input) => {
        return memoryTool.getJournalEntry(input || {});
      },
    }),

    forget: tool<z.infer<typeof forgetSchema>, Awaited<ReturnType<MemoryTool['forget']>>>({
      description: 'Remove a fact from memory.',
      inputSchema: zodSchema(forgetSchema),
      execute: async (input) => {
        return memoryTool.forget({
          key: input.key,
          file: input.file as MemoryFile | undefined,
        });
      },
    }),

    deleteNote: tool<z.infer<typeof getTopicSchema>, Awaited<ReturnType<MemoryTool['deleteNote']>>>({
      description: 'Delete a note by topic.',
      inputSchema: zodSchema(getTopicSchema),
      execute: async (input) => {
        return memoryTool.deleteNote(input);
      },
    }),
  };
}
