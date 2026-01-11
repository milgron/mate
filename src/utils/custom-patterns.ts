/**
 * Custom pattern matching for Siri-style natural language commands.
 * Reads user-defined patterns from patterns.json and executes actions
 * BEFORE sending the message to the LLM.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { getSemanticDB, type MemoryType } from '../db/semantic.js';
import { logger } from './logger.js';

/**
 * Available action types for custom patterns.
 */
export type PatternAction = 'memory' | 'note' | 'journal';

/**
 * Custom pattern definition.
 */
export interface CustomPattern {
  id: string;
  trigger: string;
  triggerRegex: string;
  action: PatternAction;
  key?: string;
  enabled: boolean;
}

/**
 * Pattern storage structure.
 */
export interface PatternsFile {
  patterns: CustomPattern[];
  updatedAt: string;
}

/**
 * Result of matching a pattern.
 */
export interface PatternMatch {
  pattern: CustomPattern;
  captured: string;
}

/**
 * Result of executing a pattern action.
 */
export interface PatternActionResult {
  success: boolean;
  action: PatternAction;
  message: string;
}

const DATA_DIR = process.env.DATA_DIR || './data';
const PATTERNS_FILE = join(DATA_DIR, 'patterns.json');

/**
 * Default patterns for common commands in Spanish and English.
 */
const DEFAULT_PATTERNS: CustomPattern[] = [
  // Spanish - Reminders
  {
    id: 'default-recordame',
    trigger: 'recordame que',
    triggerRegex: '^recordame que\\s+(.+)',
    action: 'memory',
    key: 'reminder',
    enabled: true,
  },
  {
    id: 'default-recuerdame',
    trigger: 'recuérdame que',
    triggerRegex: '^recu[eé]rdame que\\s+(.+)',
    action: 'memory',
    key: 'reminder',
    enabled: true,
  },
  // Spanish - Notes
  {
    id: 'default-crea-nota',
    trigger: 'crea una nota sobre',
    triggerRegex: '^crea una nota sobre\\s+(.+)',
    action: 'note',
    enabled: true,
  },
  {
    id: 'default-crea-nota-short',
    trigger: 'crea nota sobre',
    triggerRegex: '^crea nota sobre\\s+(.+)',
    action: 'note',
    enabled: true,
  },
  // Spanish - Journal
  {
    id: 'default-anota',
    trigger: 'anota que',
    triggerRegex: '^anota que\\s+(.+)',
    action: 'journal',
    enabled: true,
  },
  {
    id: 'default-anota-accent',
    trigger: 'anotá que',
    triggerRegex: '^anot[aá] que\\s+(.+)',
    action: 'journal',
    enabled: true,
  },
  // English - Reminders
  {
    id: 'default-remind-me',
    trigger: 'remind me that',
    triggerRegex: '^remind me that\\s+(.+)',
    action: 'memory',
    key: 'reminder',
    enabled: true,
  },
  {
    id: 'default-remember-that',
    trigger: 'remember that',
    triggerRegex: '^remember that\\s+(.+)',
    action: 'memory',
    key: 'reminder',
    enabled: true,
  },
  // English - Notes
  {
    id: 'default-create-note',
    trigger: 'create a note about',
    triggerRegex: '^create a note about\\s+(.+)',
    action: 'note',
    enabled: true,
  },
  // English - Journal
  {
    id: 'default-note-that',
    trigger: 'note that',
    triggerRegex: '^note that\\s+(.+)',
    action: 'journal',
    enabled: true,
  },
];

/**
 * Load patterns from the JSON file.
 * Creates default patterns if file doesn't exist.
 */
export function loadPatterns(): PatternsFile {
  try {
    if (existsSync(PATTERNS_FILE)) {
      const content = readFileSync(PATTERNS_FILE, 'utf-8');
      return JSON.parse(content) as PatternsFile;
    }
  } catch (error) {
    logger.warn('Failed to load patterns file, using defaults', { error });
  }

  // Create default patterns file
  const defaultFile: PatternsFile = {
    patterns: DEFAULT_PATTERNS,
    updatedAt: new Date().toISOString(),
  };

  savePatterns(defaultFile);
  return defaultFile;
}

/**
 * Save patterns to the JSON file.
 */
export function savePatterns(data: PatternsFile): void {
  try {
    const dir = dirname(PATTERNS_FILE);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    data.updatedAt = new Date().toISOString();
    writeFileSync(PATTERNS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    logger.info('Saved patterns file', { count: data.patterns.length });
  } catch (error) {
    logger.error('Failed to save patterns file', { error });
    throw error;
  }
}

/**
 * Match text against custom patterns.
 * Returns the first matching pattern and the captured content.
 * Patterns are matched case-insensitively.
 */
export function matchCustomPatterns(text: string): PatternMatch | null {
  const { patterns } = loadPatterns();
  const normalizedText = text.toLowerCase().trim();

  // Sort patterns by trigger length (longer = more specific = higher priority)
  const sortedPatterns = [...patterns]
    .filter(p => p.enabled)
    .sort((a, b) => b.trigger.length - a.trigger.length);

  for (const pattern of sortedPatterns) {
    try {
      const regex = new RegExp(pattern.triggerRegex, 'i');
      const match = normalizedText.match(regex);

      if (match && match[1]) {
        const captured = match[1].trim();
        if (captured.length >= 2) {
          logger.debug('Matched custom pattern', {
            trigger: pattern.trigger,
            action: pattern.action,
            captured: captured.slice(0, 50),
          });
          return { pattern, captured };
        }
      }
    } catch (error) {
      logger.warn('Invalid pattern regex', { pattern: pattern.trigger, error });
    }
  }

  return null;
}

/**
 * Execute the action associated with a matched pattern.
 */
export async function executePatternAction(
  match: PatternMatch,
  userId: string
): Promise<PatternActionResult> {
  const { pattern, captured } = match;

  logger.info('Executing pattern action', {
    action: pattern.action,
    trigger: pattern.trigger,
    userId,
    captured: captured.slice(0, 50),
  });

  try {
    switch (pattern.action) {
      case 'memory':
        return await executeMemoryAction(userId, pattern.key || 'reminder', captured);

      case 'note':
        return await executeNoteAction(userId, captured);

      case 'journal':
        return await executeJournalAction(userId, captured);

      default:
        return {
          success: false,
          action: pattern.action,
          message: `Unknown action: ${pattern.action}`,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Pattern action failed', { action: pattern.action, error: message });
    return {
      success: false,
      action: pattern.action,
      message: `Action failed: ${message}`,
    };
  }
}

/**
 * Save content to LanceDB memory.
 */
async function executeMemoryAction(
  userId: string,
  key: string,
  content: string
): Promise<PatternActionResult> {
  const db = await getSemanticDB();

  // Generate a unique key with timestamp to avoid overwriting
  const memoryKey = `${key}-${Date.now()}`;
  const memoryType: MemoryType = 'note';

  await db.store(userId, memoryKey, content, memoryType);

  logger.info('Stored memory via pattern', { userId, key: memoryKey });

  return {
    success: true,
    action: 'memory',
    message: `Guardado en memoria: "${content.slice(0, 50)}${content.length > 50 ? '...' : ''}"`,
  };
}

/**
 * Create a note file in the notes directory.
 */
async function executeNoteAction(
  userId: string,
  content: string
): Promise<PatternActionResult> {
  const { writeFileSync, existsSync, mkdirSync } = await import('fs');
  const { join } = await import('path');

  const notesDir = join(DATA_DIR, 'notes');
  if (!existsSync(notesDir)) {
    mkdirSync(notesDir, { recursive: true });
  }

  // Generate filename from first words of content
  const slug = content
    .slice(0, 30)
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúñü]+/g, '-')
    .replace(/^-|-$/g, '');

  const filename = `${slug}-${Date.now()}.md`;
  const filepath = join(notesDir, filename);

  const noteContent = `# ${content.slice(0, 50)}\n\n${content}\n\n---\nCreated: ${new Date().toISOString()}\nUser: ${userId}\n`;

  writeFileSync(filepath, noteContent, 'utf-8');

  logger.info('Created note file via pattern', { userId, filename });

  return {
    success: true,
    action: 'note',
    message: `Nota creada: ${filename}`,
  };
}

/**
 * Append content to the daily journal file.
 */
async function executeJournalAction(
  userId: string,
  content: string
): Promise<PatternActionResult> {
  const { appendFileSync, existsSync, mkdirSync } = await import('fs');
  const { join } = await import('path');

  const journalDir = join(DATA_DIR, 'journal');
  if (!existsSync(journalDir)) {
    mkdirSync(journalDir, { recursive: true });
  }

  // Use today's date for the journal file
  const today = new Date().toISOString().split('T')[0];
  const filename = `${today}.md`;
  const filepath = join(journalDir, filename);

  const timestamp = new Date().toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  // Create new file with header if it doesn't exist
  if (!existsSync(filepath)) {
    const header = `# Journal - ${today}\n\n`;
    appendFileSync(filepath, header, 'utf-8');
  }

  const entry = `- **${timestamp}**: ${content}\n`;
  appendFileSync(filepath, entry, 'utf-8');

  logger.info('Appended to journal via pattern', { userId, date: today });

  return {
    success: true,
    action: 'journal',
    message: `Agregado al diario de hoy (${today})`,
  };
}

/**
 * Get the list of available default patterns.
 * Useful for the UI to show examples.
 */
export function getDefaultPatterns(): CustomPattern[] {
  return [...DEFAULT_PATTERNS];
}

/**
 * Create a new custom pattern with generated ID and regex.
 */
export function createPattern(
  trigger: string,
  action: PatternAction,
  key?: string
): CustomPattern {
  // Normalize trigger
  const normalizedTrigger = trigger.toLowerCase().trim();

  // Generate regex that matches the trigger at the start and captures the rest
  const escapedTrigger = normalizedTrigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const triggerRegex = `^${escapedTrigger}\\s+(.+)`;

  return {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    trigger: normalizedTrigger,
    triggerRegex,
    action,
    key,
    enabled: true,
  };
}
