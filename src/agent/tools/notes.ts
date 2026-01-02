import { CollectedNotesClient, Note } from '../../integrations/collected-notes.js';

export interface NotesToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Tool for managing blog notes via Collected Notes API.
 */
export class NotesTool {
  private client: CollectedNotesClient | null = null;

  constructor(email?: string, apiKey?: string, sitePath?: string) {
    if (email && apiKey && sitePath) {
      this.client = new CollectedNotesClient(email, apiKey, sitePath);
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * List all notes.
   */
  async listNotes(): Promise<NotesToolResult> {
    if (!this.client) {
      return { success: false, error: 'Collected Notes not configured' };
    }

    const result = await this.client.listNotes();
    if (!result.success) {
      return { success: false, error: result.error };
    }

    // Return a summary of notes
    const notes = result.data ?? [];
    const summary = notes.map((n: Note) => ({
      path: n.path,
      title: n.title || n.headline,
      visibility: n.visibility,
      updated_at: n.updated_at,
      url: n.url,
    }));

    return { success: true, data: { count: notes.length, notes: summary } };
  }

  /**
   * Get a specific note.
   */
  async getNote(input: { path: string }): Promise<NotesToolResult> {
    if (!this.client) {
      return { success: false, error: 'Collected Notes not configured' };
    }

    const result = await this.client.getNoteMarkdown(input.path);
    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, data: result.data };
  }

  /**
   * Create a new note.
   */
  async createNote(input: {
    body: string;
    visibility?: 'public' | 'private' | 'public_unlisted';
  }): Promise<NotesToolResult> {
    if (!this.client) {
      return { success: false, error: 'Collected Notes not configured' };
    }

    const result = await this.client.createNote(
      input.body,
      input.visibility ?? 'private'
    );
    if (!result.success) {
      return { success: false, error: result.error };
    }

    const note = result.data!;
    return {
      success: true,
      data: {
        message: 'Note created successfully',
        path: note.path,
        title: note.title || note.headline,
        url: note.url,
        visibility: note.visibility,
      },
    };
  }

  /**
   * Update an existing note.
   */
  async updateNote(input: {
    path: string;
    body: string;
    visibility?: 'public' | 'private' | 'public_unlisted';
  }): Promise<NotesToolResult> {
    if (!this.client) {
      return { success: false, error: 'Collected Notes not configured' };
    }

    const result = await this.client.updateNote(
      input.path,
      input.body,
      input.visibility
    );
    if (!result.success) {
      return { success: false, error: result.error };
    }

    const note = result.data!;
    return {
      success: true,
      data: {
        message: 'Note updated successfully',
        path: note.path,
        title: note.title || note.headline,
        url: note.url,
        visibility: note.visibility,
      },
    };
  }

  /**
   * Delete a note.
   */
  async deleteNote(input: { path: string }): Promise<NotesToolResult> {
    if (!this.client) {
      return { success: false, error: 'Collected Notes not configured' };
    }

    const result = await this.client.deleteNote(input.path);
    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, data: { message: `Note '${input.path}' deleted` } };
  }

  /**
   * Search notes.
   */
  async searchNotes(input: {
    query: string;
    mode?: 'exact' | 'semantic';
  }): Promise<NotesToolResult> {
    if (!this.client) {
      return { success: false, error: 'Collected Notes not configured' };
    }

    const result = await this.client.searchNotes(input.query, input.mode ?? 'exact');
    if (!result.success) {
      return { success: false, error: result.error };
    }

    const notes = result.data ?? [];
    const summary = notes.map((n: Note) => ({
      path: n.path,
      title: n.title || n.headline,
      visibility: n.visibility,
      url: n.url,
    }));

    return { success: true, data: { count: notes.length, notes: summary } };
  }

  /**
   * Returns tool definitions for Claude.
   */
  getToolDefinitions() {
    return [
      {
        name: 'list_notes',
        description:
          'List all blog notes from Collected Notes. Returns titles, paths, and visibility status.',
        input_schema: {
          type: 'object' as const,
          properties: {},
          required: [],
        },
      },
      {
        name: 'get_note',
        description:
          'Get the full content of a specific blog note in markdown format.',
        input_schema: {
          type: 'object' as const,
          properties: {
            path: {
              type: 'string',
              description: 'The path/slug of the note to retrieve',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'create_note',
        description:
          'Create a new blog note on Collected Notes. The body should be in markdown format. The first line starting with # becomes the title.',
        input_schema: {
          type: 'object' as const,
          properties: {
            body: {
              type: 'string',
              description:
                'The note content in markdown. First # heading becomes the title.',
            },
            visibility: {
              type: 'string',
              enum: ['public', 'private', 'public_unlisted'],
              description:
                'Note visibility: public (visible to all), private (only you), public_unlisted (accessible via link but not listed)',
            },
          },
          required: ['body'],
        },
      },
      {
        name: 'update_note',
        description: 'Update an existing blog note.',
        input_schema: {
          type: 'object' as const,
          properties: {
            path: {
              type: 'string',
              description: 'The path/slug of the note to update',
            },
            body: {
              type: 'string',
              description: 'The new content in markdown format',
            },
            visibility: {
              type: 'string',
              enum: ['public', 'private', 'public_unlisted'],
              description: 'New visibility setting (optional)',
            },
          },
          required: ['path', 'body'],
        },
      },
      {
        name: 'delete_note',
        description: 'Delete a blog note. This action cannot be undone.',
        input_schema: {
          type: 'object' as const,
          properties: {
            path: {
              type: 'string',
              description: 'The path/slug of the note to delete',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'search_notes',
        description: 'Search for notes by keyword.',
        input_schema: {
          type: 'object' as const,
          properties: {
            query: {
              type: 'string',
              description: 'The search term',
            },
            mode: {
              type: 'string',
              enum: ['exact', 'semantic'],
              description:
                'Search mode: exact for literal matching, semantic for AI-powered search',
            },
          },
          required: ['query'],
        },
      },
    ];
  }
}
