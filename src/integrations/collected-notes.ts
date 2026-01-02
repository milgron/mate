const BASE_URL = 'https://api.collectednotes.com';

export interface Note {
  id: number;
  site_id: number;
  user_id: number;
  body: string;
  path: string;
  headline: string;
  title: string;
  created_at: string;
  updated_at: string;
  visibility: 'public' | 'private' | 'public_unlisted';
  url: string;
  poster?: string;
  curated?: boolean;
  ordering?: number;
}

export interface Site {
  id: number;
  user_id: number;
  name: string;
  headline?: string;
  about?: string;
  site_path: string;
  domain?: string;
  created_at: string;
  updated_at: string;
}

export interface CollectedNotesResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Client for the Collected Notes API.
 * https://collectednotes.com/blog/api
 */
export class CollectedNotesClient {
  private email: string;
  private token: string;
  private sitePath: string;

  constructor(email: string, token: string, sitePath: string) {
    this.email = email;
    this.token = token;
    this.sitePath = sitePath;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<CollectedNotesResult<T>> {
    try {
      const response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
          Authorization: `${this.email} ${this.token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `HTTP ${response.status}: ${errorText}`,
        };
      }

      const data = (await response.json()) as T;
      return { success: true, data };
    } catch (error: unknown) {
      const err = error as { message?: string };
      return { success: false, error: err.message || String(error) };
    }
  }

  private async requestText(path: string): Promise<CollectedNotesResult<string>> {
    try {
      const response = await fetch(`${BASE_URL}${path}`, {
        method: 'GET',
        headers: {
          Authorization: `${this.email} ${this.token}`,
          Accept: 'text/plain',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `HTTP ${response.status}: ${errorText}`,
        };
      }

      const data = await response.text();
      return { success: true, data };
    } catch (error: unknown) {
      const err = error as { message?: string };
      return { success: false, error: err.message || String(error) };
    }
  }

  /**
   * Get all notes for the configured site.
   */
  async listNotes(): Promise<CollectedNotesResult<Note[]>> {
    return this.request<Note[]>('GET', `/sites/${this.sitePath}/notes`);
  }

  /**
   * Get a specific note by its path.
   */
  async getNote(notePath: string): Promise<CollectedNotesResult<Note>> {
    return this.request<Note>('GET', `/sites/${this.sitePath}/notes/${notePath}`);
  }

  /**
   * Get a note's content as markdown.
   */
  async getNoteMarkdown(notePath: string): Promise<CollectedNotesResult<string>> {
    return this.requestText(`/sites/${this.sitePath}/notes/${notePath}.md`);
  }

  /**
   * Create a new note.
   */
  async createNote(
    body: string,
    visibility: 'public' | 'private' | 'public_unlisted' = 'private'
  ): Promise<CollectedNotesResult<Note>> {
    return this.request<Note>('POST', `/sites/${this.sitePath}/notes`, {
      body,
      visibility,
    });
  }

  /**
   * Update an existing note.
   */
  async updateNote(
    notePath: string,
    body: string,
    visibility?: 'public' | 'private' | 'public_unlisted'
  ): Promise<CollectedNotesResult<Note>> {
    const payload: { body: string; visibility?: string } = { body };
    if (visibility) {
      payload.visibility = visibility;
    }
    return this.request<Note>(
      'PUT',
      `/sites/${this.sitePath}/notes/${notePath}`,
      payload
    );
  }

  /**
   * Delete a note.
   */
  async deleteNote(notePath: string): Promise<CollectedNotesResult<void>> {
    return this.request<void>('DELETE', `/sites/${this.sitePath}/notes/${notePath}`);
  }

  /**
   * Search notes.
   */
  async searchNotes(
    term: string,
    mode: 'exact' | 'semantic' = 'exact'
  ): Promise<CollectedNotesResult<Note[]>> {
    const params = new URLSearchParams({ term, mode });
    return this.request<Note[]>(
      'GET',
      `/sites/${this.sitePath}/notes/search?${params}`
    );
  }

  /**
   * Get site info.
   */
  async getSite(): Promise<CollectedNotesResult<Site>> {
    return this.request<Site>('GET', `/sites/${this.sitePath}`);
  }
}
