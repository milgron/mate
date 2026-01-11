import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

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

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), '..', 'data');
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
    console.warn('Failed to load patterns file, using defaults', error);
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
  } catch (error) {
    console.error('Failed to save patterns file', error);
    throw error;
  }
}

/**
 * Get all patterns.
 */
export function getAllPatterns(): CustomPattern[] {
  const { patterns } = loadPatterns();
  return patterns;
}

/**
 * Add a new pattern.
 */
export function addPattern(pattern: CustomPattern): void {
  const data = loadPatterns();
  data.patterns.push(pattern);
  savePatterns(data);
}

/**
 * Delete a pattern by ID.
 */
export function deletePattern(id: string): boolean {
  const data = loadPatterns();
  const initialLength = data.patterns.length;
  data.patterns = data.patterns.filter(p => p.id !== id);

  if (data.patterns.length < initialLength) {
    savePatterns(data);
    return true;
  }
  return false;
}

/**
 * Toggle pattern enabled state.
 */
export function togglePattern(id: string): boolean {
  const data = loadPatterns();
  const pattern = data.patterns.find(p => p.id === id);

  if (pattern) {
    pattern.enabled = !pattern.enabled;
    savePatterns(data);
    return true;
  }
  return false;
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

/**
 * Get the list of default patterns.
 */
export function getDefaultPatterns(): CustomPattern[] {
  return [...DEFAULT_PATTERNS];
}

/**
 * Action display info.
 */
export const ACTION_INFO: Record<PatternAction, { name: string; icon: string; description: string }> = {
  memory: {
    name: 'Save to Memory',
    icon: '\uD83E\uDDE0', // brain
    description: 'Stores in LanceDB semantic memory',
  },
  note: {
    name: 'Create Note',
    icon: '\uD83D\uDCDD', // memo
    description: 'Creates a file in notes/{topic}.md',
  },
  journal: {
    name: 'Add to Journal',
    icon: '\uD83D\uDCD3', // notebook
    description: 'Appends to journal/{date}.md',
  },
};
