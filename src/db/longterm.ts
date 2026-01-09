import fs from 'fs';
import path from 'path';
import { parseMarkdownSections, getDateString } from '../utils/markdown.js';

const DATA_DIR = process.env.DATA_DIR || '/app/data';

/**
 * Long-term memory manager with human-readable file structure.
 *
 * Structure:
 *   data/memory/{userId}/
 *   ├── about.md        # User identity
 *   ├── preferences.md  # User preferences
 *   ├── notes/          # Topic-specific notes
 *   │   └── {topic}.md
 *   └── journal/        # Daily entries
 *       └── {YYYY-MM-DD}.md
 */

// Templates for new memory files
const ABOUT_TEMPLATE = `# About

## Identity
- Name:
- Location:
- Timezone:

## Work
- Role:
- Company:

## Context
<!-- Important context about this user -->

---
*Last updated: ${getDateString()}*
`;

const PREFERENCES_TEMPLATE = `# Preferences

## Communication
- Language:
- Tone:
- Response length:

## Technical
- Code style:
- Date format:

---
*Last updated: ${getDateString()}*
`;

/**
 * Get the base memory directory for a user.
 */
export function getMemoryDir(userId: string): string {
  return path.join(DATA_DIR, 'memory', userId);
}

/**
 * Get path to a specific memory file.
 */
export function getMemoryFilePath(userId: string, file: 'about' | 'preferences' = 'about'): string {
  return path.join(getMemoryDir(userId), `${file}.md`);
}

/**
 * Ensure a directory exists.
 */
function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Read a file safely, returning empty string if not found.
 */
function readFileSafe(filePath: string): string {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
  } catch {
    // Ignore read errors
  }
  return '';
}

/**
 * Get list of recent notes (by modification time).
 */
function getRecentNotes(userId: string, limit: number = 5): Array<{ topic: string; content: string }> {
  const notesDir = path.join(getMemoryDir(userId), 'notes');

  if (!fs.existsSync(notesDir)) {
    return [];
  }

  try {
    const files = fs.readdirSync(notesDir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => ({
        name: f,
        path: path.join(notesDir, f),
        mtime: fs.statSync(path.join(notesDir, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, limit);

    return files.map((f) => ({
      topic: f.name.replace('.md', ''),
      content: readFileSafe(f.path),
    }));
  } catch {
    return [];
  }
}

/**
 * Get today's journal entry if it exists.
 */
function getTodayJournal(userId: string): string {
  const today = getDateString();
  const journalPath = path.join(getMemoryDir(userId), 'journal', `${today}.md`);
  return readFileSafe(journalPath);
}

/**
 * Migrate from old single-file memory format to new structure.
 */
function migrateIfNeeded(userId: string): void {
  const oldMemoryPath = path.join(DATA_DIR, userId, 'memory.md');
  const newMemoryDir = getMemoryDir(userId);

  // Check if old format exists and new doesn't
  if (fs.existsSync(oldMemoryPath) && !fs.existsSync(path.join(newMemoryDir, 'about.md'))) {
    try {
      const oldContent = fs.readFileSync(oldMemoryPath, 'utf-8');
      const sections = parseMarkdownSections(oldContent);

      // Ensure new structure
      ensureDir(newMemoryDir);
      ensureDir(path.join(newMemoryDir, 'notes'));
      ensureDir(path.join(newMemoryDir, 'journal'));

      // Create about.md with migrated content
      let aboutContent = ABOUT_TEMPLATE;
      const context = sections.get('Context');
      if (context) {
        aboutContent = aboutContent.replace(
          '<!-- Important context about this user -->',
          context
        );
      }
      fs.writeFileSync(path.join(newMemoryDir, 'about.md'), aboutContent);

      // Create preferences.md with migrated content
      let prefsContent = PREFERENCES_TEMPLATE;
      const prefs = sections.get('Preferences');
      if (prefs) {
        prefsContent = prefsContent.replace(
          '- Language:\n- Tone:\n- Response length:',
          prefs
        );
      }
      fs.writeFileSync(path.join(newMemoryDir, 'preferences.md'), prefsContent);

      // Migrate notes to notes/imported.md
      const notes = sections.get('Notes');
      if (notes && notes.trim()) {
        fs.writeFileSync(
          path.join(newMemoryDir, 'notes', 'imported.md'),
          `# Imported Notes\n\n${notes}\n\n---\n*Migrated from legacy format on ${getDateString()}*\n`
        );
      }

      // Rename old file
      fs.renameSync(oldMemoryPath, oldMemoryPath + '.migrated');
    } catch {
      // Migration failed, leave old file
    }
  }

  // Also migrate legacy JSON memory if exists
  const legacyJsonDir = path.join(DATA_DIR, 'memory', userId);
  const legacyJsonFile = path.join(legacyJsonDir, 'random', 'items.json');

  if (fs.existsSync(legacyJsonFile)) {
    try {
      const jsonContent = fs.readFileSync(legacyJsonFile, 'utf-8');
      const items = JSON.parse(jsonContent);

      ensureDir(path.join(newMemoryDir, 'notes'));

      // Convert JSON items to a note
      const entries = Object.entries(items)
        .map(([key, val]) => {
          const entry = val as { value: string; timestamp: string };
          return `- **${key}**: ${entry.value}`;
        })
        .join('\n');

      if (entries) {
        fs.writeFileSync(
          path.join(newMemoryDir, 'notes', 'legacy-json.md'),
          `# Legacy JSON Memory\n\n${entries}\n\n---\n*Migrated from JSON format on ${getDateString()}*\n`
        );
      }

      // Rename legacy directory
      fs.renameSync(legacyJsonDir, legacyJsonDir + '.migrated');
    } catch {
      // Migration failed
    }
  }
}

/**
 * Load long-term memory for a user.
 * Returns combined content from all memory files for context injection.
 */
export function loadLongTermMemory(userId: string): string {
  // Run migration if needed
  migrateIfNeeded(userId);

  const memoryDir = getMemoryDir(userId);
  const parts: string[] = [];

  // Load about.md
  const about = readFileSafe(path.join(memoryDir, 'about.md'));
  if (about) {
    parts.push('## About User');
    parts.push(about);
    parts.push('');
  }

  // Load preferences.md
  const prefs = readFileSafe(path.join(memoryDir, 'preferences.md'));
  if (prefs) {
    parts.push('## Preferences');
    parts.push(prefs);
    parts.push('');
  }

  // Load recent notes (titles only for context, not full content)
  const notes = getRecentNotes(userId, 5);
  if (notes.length > 0) {
    parts.push('## Recent Notes');
    parts.push(notes.map((n) => `- ${n.topic}`).join('\n'));
    parts.push('');
  }

  // Load today's journal
  const journal = getTodayJournal(userId);
  if (journal) {
    parts.push("## Today's Journal");
    parts.push(journal);
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * Initialize long-term memory structure for a new user.
 */
export function initLongTermMemory(userId: string): void {
  // Run migration first
  migrateIfNeeded(userId);

  const memoryDir = getMemoryDir(userId);

  // Create directories
  ensureDir(memoryDir);
  ensureDir(path.join(memoryDir, 'notes'));
  ensureDir(path.join(memoryDir, 'journal'));

  // Create about.md if doesn't exist
  const aboutPath = path.join(memoryDir, 'about.md');
  if (!fs.existsSync(aboutPath)) {
    fs.writeFileSync(aboutPath, ABOUT_TEMPLATE);
  }

  // Create preferences.md if doesn't exist
  const prefsPath = path.join(memoryDir, 'preferences.md');
  if (!fs.existsSync(prefsPath)) {
    fs.writeFileSync(prefsPath, PREFERENCES_TEMPLATE);
  }
}

/**
 * Write to a specific memory file.
 */
export function writeMemoryFile(
  userId: string,
  file: 'about' | 'preferences',
  content: string
): void {
  const memoryDir = getMemoryDir(userId);
  ensureDir(memoryDir);

  const filePath = path.join(memoryDir, `${file}.md`);
  fs.writeFileSync(filePath, content);
}

/**
 * Add or update a note.
 */
export function writeNote(userId: string, topic: string, content: string): void {
  const notesDir = path.join(getMemoryDir(userId), 'notes');
  ensureDir(notesDir);

  // Sanitize topic for filename
  const safeTopic = topic.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const notePath = path.join(notesDir, `${safeTopic}.md`);

  fs.writeFileSync(notePath, content);
}

/**
 * Read a specific note.
 */
export function readNote(userId: string, topic: string): string {
  const safeTopic = topic.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const notePath = path.join(getMemoryDir(userId), 'notes', `${safeTopic}.md`);
  return readFileSafe(notePath);
}

/**
 * List all notes for a user.
 */
export function listNotes(userId: string): string[] {
  const notesDir = path.join(getMemoryDir(userId), 'notes');

  if (!fs.existsSync(notesDir)) {
    return [];
  }

  try {
    return fs.readdirSync(notesDir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace('.md', ''));
  } catch {
    return [];
  }
}

/**
 * Add a journal entry for today.
 */
export function addJournalEntry(userId: string, content: string, date?: string): void {
  const journalDir = path.join(getMemoryDir(userId), 'journal');
  ensureDir(journalDir);

  const entryDate = date || getDateString();
  const journalPath = path.join(journalDir, `${entryDate}.md`);

  // Append to existing or create new
  const existing = readFileSafe(journalPath);
  const timestamp = new Date().toTimeString().split(' ')[0];

  const newEntry = existing
    ? `${existing}\n\n## ${timestamp}\n${content}`
    : `# Journal - ${entryDate}\n\n## ${timestamp}\n${content}`;

  fs.writeFileSync(journalPath, newEntry);
}

/**
 * Read a journal entry.
 */
export function readJournalEntry(userId: string, date?: string): string {
  const entryDate = date || getDateString();
  const journalPath = path.join(getMemoryDir(userId), 'journal', `${entryDate}.md`);
  return readFileSafe(journalPath);
}
