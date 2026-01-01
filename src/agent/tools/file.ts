import fs from 'fs/promises';
import path from 'path';

export interface FileToolConfig {
  allowedPaths: string[];
}

export interface FileResult {
  success: boolean;
  content?: string;
  error?: string;
}

/**
 * File operations with path restrictions.
 */
export class FileTool {
  private readonly allowedPaths: string[];

  constructor(config: FileToolConfig) {
    // Normalize and resolve all allowed paths
    this.allowedPaths = config.allowedPaths.map((p) => path.resolve(p));
  }

  /**
   * Checks if a path is within allowed directories.
   */
  isPathAllowed(filePath: string): boolean {
    const resolved = path.resolve(filePath);
    return this.allowedPaths.some((allowed) => resolved.startsWith(allowed));
  }

  /**
   * Reads a file.
   */
  async read(filePath: string): Promise<FileResult> {
    if (!this.isPathAllowed(filePath)) {
      return {
        success: false,
        error: `Path "${filePath}" is not allowed`,
      };
    }

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return {
        success: true,
        content,
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
   * Writes a file.
   */
  async write(filePath: string, content: string): Promise<FileResult> {
    if (!this.isPathAllowed(filePath)) {
      return {
        success: false,
        error: `Path "${filePath}" is not allowed`,
      };
    }

    try {
      // Ensure directory exists
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, 'utf-8');
      return {
        success: true,
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
   * Lists files in a directory.
   */
  async list(dirPath: string): Promise<FileResult> {
    if (!this.isPathAllowed(dirPath)) {
      return {
        success: false,
        error: `Path "${dirPath}" is not allowed`,
      };
    }

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const files = entries.map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
      return {
        success: true,
        content: files.join('\n'),
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
   * Returns tool definitions for Claude.
   */
  getToolDefinitions() {
    return [
      {
        name: 'read_file',
        description: 'Read the contents of a file',
        input_schema: {
          type: 'object' as const,
          properties: {
            path: {
              type: 'string',
              description: 'The path to the file to read',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'write_file',
        description: 'Write content to a file',
        input_schema: {
          type: 'object' as const,
          properties: {
            path: {
              type: 'string',
              description: 'The path to the file to write',
            },
            content: {
              type: 'string',
              description: 'The content to write to the file',
            },
          },
          required: ['path', 'content'],
        },
      },
      {
        name: 'list_files',
        description: 'List files in a directory',
        input_schema: {
          type: 'object' as const,
          properties: {
            path: {
              type: 'string',
              description: 'The path to the directory to list',
            },
          },
          required: ['path'],
        },
      },
    ];
  }
}
