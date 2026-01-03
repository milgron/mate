import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || '/app/data';

/**
 * Long-term memory manager.
 * Stores important facts in a markdown file per user.
 */

/**
 * Get the path to a user's memory file.
 */
function getMemoryPath(userId: string): string {
  return path.join(DATA_DIR, userId, 'memory.md');
}

/**
 * Ensure the user's directory exists.
 */
function ensureUserDir(userId: string): void {
  const userDir = path.join(DATA_DIR, userId);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }
}

/**
 * Load long-term memory for a user.
 * Returns empty string if no memory file exists.
 */
export function loadLongTermMemory(userId: string): string {
  const memoryPath = getMemoryPath(userId);

  if (!fs.existsSync(memoryPath)) {
    return '';
  }

  try {
    return fs.readFileSync(memoryPath, 'utf-8');
  } catch {
    return '';
  }
}

/**
 * Initialize long-term memory file with default template.
 * Only creates if file doesn't exist.
 */
export function initLongTermMemory(userId: string): void {
  ensureUserDir(userId);
  const memoryPath = getMemoryPath(userId);

  if (fs.existsSync(memoryPath)) {
    return;
  }

  const template = `# Long-Term Memory

## Important Files
<!-- Add file locations that should be remembered -->

## Preferences
<!-- User preferences and settings -->

## Context
<!-- Important context about the user -->

## Notes
<!-- Other important information -->
`;

  fs.writeFileSync(memoryPath, template, 'utf-8');
}

/**
 * Get the memory file path for instructions to Claude.
 */
export function getMemoryFilePath(userId: string): string {
  return getMemoryPath(userId);
}
