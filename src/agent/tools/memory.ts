import {
  getMemoryDir,
  getMemoryFilePath,
  writeNote,
  readNote,
  listNotes,
  addJournalEntry,
  readJournalEntry,
  initLongTermMemory,
} from '../../db/longterm.js';
import {
  updateMarkdownListItem,
  getDateString,
} from '../../utils/markdown.js';
import fs from 'fs';
import path from 'path';

/**
 * Result type for memory operations.
 */
export interface MemoryResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Memory file types.
 */
export type MemoryFile = 'about' | 'preferences';

/**
 * Tool for human-readable persistent memory storage.
 *
 * Files are stored as markdown for easy reading/editing by humans.
 * Structure:
 *   data/memory/{userId}/
 *   ├── about.md        # User identity
 *   ├── preferences.md  # User preferences
 *   ├── notes/          # Topic-specific notes
 *   └── journal/        # Daily entries
 */
export class MemoryTool {
  private currentUserId: string = '';

  /**
   * Set the current user context.
   */
  setUser(userId: string): void {
    this.currentUserId = userId;
    initLongTermMemory(userId);
  }

  /**
   * Remember a fact by updating the appropriate markdown file.
   *
   * @param key - The key/field to update (e.g., "Name", "Language")
   * @param value - The value to store
   * @param file - Which file to update: 'about' or 'preferences'
   */
  async remember(input: {
    key: string;
    value: string;
    file?: MemoryFile;
  }): Promise<MemoryResult> {
    if (!this.currentUserId) {
      return { success: false, error: 'No user context set' };
    }

    const file = input.file || 'about';

    try {
      const filePath = getMemoryFilePath(this.currentUserId, file);
      let content = '';

      if (fs.existsSync(filePath)) {
        content = fs.readFileSync(filePath, 'utf-8');
      }

      // Update the key-value in the file
      const updatedContent = updateMarkdownListItem(content, input.key, input.value);

      // Update the "Last updated" timestamp
      const finalContent = updatedContent.replace(
        /\*Last updated: .+\*/,
        `*Last updated: ${getDateString()}*`
      );

      fs.writeFileSync(filePath, finalContent);

      return {
        success: true,
        data: `Remembered in ${file}.md: ${input.key} = ${input.value}`,
      };
    } catch (error: unknown) {
      const err = error as { message?: string };
      return { success: false, error: err.message || String(error) };
    }
  }

  /**
   * Recall a fact by searching memory files.
   *
   * @param key - The key to search for
   * @param file - Optional: specific file to search
   */
  async recall(input: { key: string; file?: MemoryFile }): Promise<MemoryResult> {
    if (!this.currentUserId) {
      return { success: false, error: 'No user context set' };
    }

    try {
      const filesToSearch: MemoryFile[] = input.file
        ? [input.file]
        : ['about', 'preferences'];

      for (const file of filesToSearch) {
        const filePath = getMemoryFilePath(this.currentUserId, file);

        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');

          // Search for the key in markdown list format
          const regex = new RegExp(
            `^-\\s+(?:\\*\\*)?${input.key}(?:\\*\\*)?\\s*:\\s*(.+)$`,
            'im'
          );
          const match = content.match(regex);

          if (match && match[1]) {
            return {
              success: true,
              data: {
                key: input.key,
                value: match[1].trim(),
                file,
              },
            };
          }
        }
      }

      return { success: true, data: null };
    } catch (error: unknown) {
      const err = error as { message?: string };
      return { success: false, error: err.message || String(error) };
    }
  }

  /**
   * Add or update a note on a specific topic.
   */
  async addNote(input: { topic: string; content: string }): Promise<MemoryResult> {
    if (!this.currentUserId) {
      return { success: false, error: 'No user context set' };
    }

    try {
      const header = `# ${input.topic}\n\n`;
      const footer = `\n\n---\n*Last updated: ${getDateString()}*\n`;
      const fullContent = header + input.content + footer;

      writeNote(this.currentUserId, input.topic, fullContent);

      return {
        success: true,
        data: `Note saved: ${input.topic}`,
      };
    } catch (error: unknown) {
      const err = error as { message?: string };
      return { success: false, error: err.message || String(error) };
    }
  }

  /**
   * Read a specific note.
   */
  async getNote(input: { topic: string }): Promise<MemoryResult> {
    if (!this.currentUserId) {
      return { success: false, error: 'No user context set' };
    }

    try {
      const content = readNote(this.currentUserId, input.topic);

      if (content) {
        return { success: true, data: { topic: input.topic, content } };
      }

      return { success: true, data: null };
    } catch (error: unknown) {
      const err = error as { message?: string };
      return { success: false, error: err.message || String(error) };
    }
  }

  /**
   * List all notes.
   */
  async listNotes(): Promise<MemoryResult> {
    if (!this.currentUserId) {
      return { success: false, error: 'No user context set' };
    }

    try {
      const notes = listNotes(this.currentUserId);
      return { success: true, data: { count: notes.length, topics: notes } };
    } catch (error: unknown) {
      const err = error as { message?: string };
      return { success: false, error: err.message || String(error) };
    }
  }

  /**
   * Add a journal entry for today.
   */
  async addJournalEntry(input: { content: string; date?: string }): Promise<MemoryResult> {
    if (!this.currentUserId) {
      return { success: false, error: 'No user context set' };
    }

    try {
      addJournalEntry(this.currentUserId, input.content, input.date);
      const date = input.date || getDateString();

      return {
        success: true,
        data: `Journal entry added for ${date}`,
      };
    } catch (error: unknown) {
      const err = error as { message?: string };
      return { success: false, error: err.message || String(error) };
    }
  }

  /**
   * Read a journal entry.
   */
  async getJournalEntry(input: { date?: string }): Promise<MemoryResult> {
    if (!this.currentUserId) {
      return { success: false, error: 'No user context set' };
    }

    try {
      const date = input.date || getDateString();
      const content = readJournalEntry(this.currentUserId, date);

      if (content) {
        return { success: true, data: { date, content } };
      }

      return { success: true, data: null };
    } catch (error: unknown) {
      const err = error as { message?: string };
      return { success: false, error: err.message || String(error) };
    }
  }

  /**
   * Forget a fact by removing it from the file.
   */
  async forget(input: { key: string; file?: MemoryFile }): Promise<MemoryResult> {
    if (!this.currentUserId) {
      return { success: false, error: 'No user context set' };
    }

    try {
      const filesToSearch: MemoryFile[] = input.file
        ? [input.file]
        : ['about', 'preferences'];

      for (const file of filesToSearch) {
        const filePath = getMemoryFilePath(this.currentUserId, file);

        if (fs.existsSync(filePath)) {
          let content = fs.readFileSync(filePath, 'utf-8');

          // Remove the line with the key
          const regex = new RegExp(
            `^-\\s+(?:\\*\\*)?${input.key}(?:\\*\\*)?\\s*:.*$\\n?`,
            'im'
          );

          if (regex.test(content)) {
            content = content.replace(regex, '');
            fs.writeFileSync(filePath, content);

            return {
              success: true,
              data: `Forgot: ${input.key} from ${file}.md`,
            };
          }
        }
      }

      return { success: true, data: `No memory found for: ${input.key}` };
    } catch (error: unknown) {
      const err = error as { message?: string };
      return { success: false, error: err.message || String(error) };
    }
  }

  /**
   * Delete a note.
   */
  async deleteNote(input: { topic: string }): Promise<MemoryResult> {
    if (!this.currentUserId) {
      return { success: false, error: 'No user context set' };
    }

    try {
      const safeTopic = input.topic.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const notePath = path.join(getMemoryDir(this.currentUserId), 'notes', `${safeTopic}.md`);

      if (fs.existsSync(notePath)) {
        fs.unlinkSync(notePath);
        return { success: true, data: `Deleted note: ${input.topic}` };
      }

      return { success: true, data: `Note not found: ${input.topic}` };
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
        description: `Store a fact in persistent memory. Memory is stored as human-readable markdown.

Files:
- about: User identity (name, location, work, context)
- preferences: User preferences (language, tone, technical settings)

Examples:
- remember(key: "Name", value: "Juan", file: "about")
- remember(key: "Language", value: "Spanish", file: "preferences")`,
        input_schema: {
          type: 'object' as const,
          properties: {
            key: {
              type: 'string',
              description: 'The field name (e.g., "Name", "Location", "Language")',
            },
            value: {
              type: 'string',
              description: 'The value to store',
            },
            file: {
              type: 'string',
              enum: ['about', 'preferences'],
              description: 'Which file to update. Default: about',
            },
          },
          required: ['key', 'value'],
        },
      },
      {
        name: 'recall',
        description: 'Retrieve a specific fact from memory by its key.',
        input_schema: {
          type: 'object' as const,
          properties: {
            key: {
              type: 'string',
              description: 'The key to search for',
            },
            file: {
              type: 'string',
              enum: ['about', 'preferences'],
              description: 'Optional: specific file to search',
            },
          },
          required: ['key'],
        },
      },
      {
        name: 'add_note',
        description: `Create or update a note on a specific topic.
Notes are stored as separate markdown files in the notes/ directory.
Good for: project notes, ideas, research, anything topic-specific.`,
        input_schema: {
          type: 'object' as const,
          properties: {
            topic: {
              type: 'string',
              description: 'The topic/title of the note (becomes filename)',
            },
            content: {
              type: 'string',
              description: 'The note content in markdown',
            },
          },
          required: ['topic', 'content'],
        },
      },
      {
        name: 'get_note',
        description: 'Read a specific note by topic.',
        input_schema: {
          type: 'object' as const,
          properties: {
            topic: {
              type: 'string',
              description: 'The topic of the note to retrieve',
            },
          },
          required: ['topic'],
        },
      },
      {
        name: 'list_notes',
        description: 'List all notes.',
        input_schema: {
          type: 'object' as const,
          properties: {},
          required: [],
        },
      },
      {
        name: 'add_journal_entry',
        description: `Add a journal entry for today (or a specific date).
Journal entries are timestamped and appended to the day's file.
Good for: daily summaries, conversation notes, task tracking.`,
        input_schema: {
          type: 'object' as const,
          properties: {
            content: {
              type: 'string',
              description: 'The journal entry content',
            },
            date: {
              type: 'string',
              description: 'Optional: date in YYYY-MM-DD format. Default: today',
            },
          },
          required: ['content'],
        },
      },
      {
        name: 'get_journal_entry',
        description: "Read a journal entry for a specific date (default: today).",
        input_schema: {
          type: 'object' as const,
          properties: {
            date: {
              type: 'string',
              description: 'Date in YYYY-MM-DD format. Default: today',
            },
          },
          required: [],
        },
      },
      {
        name: 'forget',
        description: 'Remove a fact from memory.',
        input_schema: {
          type: 'object' as const,
          properties: {
            key: {
              type: 'string',
              description: 'The key to forget',
            },
            file: {
              type: 'string',
              enum: ['about', 'preferences'],
              description: 'Optional: specific file to remove from',
            },
          },
          required: ['key'],
        },
      },
      {
        name: 'delete_note',
        description: 'Delete a note by topic.',
        input_schema: {
          type: 'object' as const,
          properties: {
            topic: {
              type: 'string',
              description: 'The topic of the note to delete',
            },
          },
          required: ['topic'],
        },
      },
    ];
  }
}
