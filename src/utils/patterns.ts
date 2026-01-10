/**
 * Pattern matching utilities for extracting user information from messages.
 * Used as a fallback when LLM tool calling fails or doesn't trigger.
 */

export interface ExtractedInfo {
  key: string;
  value: string;
  file: 'about' | 'preferences';
}

interface Pattern {
  regex: RegExp;
  key: string;
  file: 'about' | 'preferences';
}

/**
 * Patterns for extracting user information.
 * Order matters - more specific patterns should come first.
 */
const PATTERNS: Pattern[] = [
  // Spanish - Name patterns
  { regex: /me llamo\s+([a-záéíóúñ]+)/i, key: 'Name', file: 'about' },
  { regex: /mi nombre es\s+([a-záéíóúñ]+)/i, key: 'Name', file: 'about' },
  { regex: /puedes llamarme\s+([a-záéíóúñ]+)/i, key: 'Name', file: 'about' },
  { regex: /llámame\s+([a-záéíóúñ]+)/i, key: 'Name', file: 'about' },

  // Spanish - Location patterns
  { regex: /vivo en\s+([a-záéíóúñ\s,]+)/i, key: 'Location', file: 'about' },
  { regex: /soy de\s+([a-záéíóúñ\s,]+)/i, key: 'Location', file: 'about' },
  { regex: /estoy en\s+([a-záéíóúñ\s,]+)/i, key: 'Location', file: 'about' },

  // Spanish - Work patterns
  { regex: /trabajo en\s+(.+?)(?:\.|,|$)/i, key: 'Work', file: 'about' },
  { regex: /trabajo como\s+(.+?)(?:\.|,|$)/i, key: 'Occupation', file: 'about' },
  { regex: /soy\s+(ingeniero|doctor|profesor|abogado|diseñador|programador|desarrollador)(?:\s|$)/i, key: 'Occupation', file: 'about' },

  // Spanish - Preference patterns
  { regex: /prefiero\s+(.+?)(?:\.|,|$)/i, key: 'Preference', file: 'preferences' },
  { regex: /me gusta\s+(.+?)(?:\.|,|$)/i, key: 'Likes', file: 'preferences' },

  // English - Name patterns
  { regex: /my name is\s+(\w+)/i, key: 'Name', file: 'about' },
  { regex: /i'm\s+(\w+)/i, key: 'Name', file: 'about' },
  { regex: /call me\s+(\w+)/i, key: 'Name', file: 'about' },

  // English - Location patterns
  { regex: /i live in\s+(.+?)(?:\.|,|$)/i, key: 'Location', file: 'about' },
  { regex: /i'm from\s+(.+?)(?:\.|,|$)/i, key: 'Location', file: 'about' },
  { regex: /i am from\s+(.+?)(?:\.|,|$)/i, key: 'Location', file: 'about' },

  // English - Work patterns
  { regex: /i work at\s+(.+?)(?:\.|,|$)/i, key: 'Work', file: 'about' },
  { regex: /i work as\s+(.+?)(?:\.|,|$)/i, key: 'Occupation', file: 'about' },
  { regex: /i am a\s+(developer|engineer|doctor|teacher|lawyer|designer|programmer)(?:\s|$)/i, key: 'Occupation', file: 'about' },

  // English - Preference patterns
  { regex: /i prefer\s+(.+?)(?:\.|,|$)/i, key: 'Preference', file: 'preferences' },
  { regex: /i like\s+(.+?)(?:\.|,|$)/i, key: 'Likes', file: 'preferences' },
];

/**
 * Extract user information from text using pattern matching.
 * Returns the first match found.
 */
export function extractUserInfo(text: string): ExtractedInfo | null {
  for (const { regex, key, file } of PATTERNS) {
    const match = text.match(regex);
    if (match && match[1]) {
      const value = match[1].trim();
      // Skip very short or suspiciously long values
      if (value.length >= 2 && value.length <= 100) {
        return { key, value, file };
      }
    }
  }
  return null;
}

/**
 * Check if text likely contains information worth remembering.
 */
export function shouldRemember(text: string): boolean {
  return PATTERNS.some(({ regex }) => regex.test(text));
}

/**
 * Extract all user information from text (not just the first match).
 */
export function extractAllUserInfo(text: string): ExtractedInfo[] {
  const results: ExtractedInfo[] = [];
  const seenKeys = new Set<string>();

  for (const { regex, key, file } of PATTERNS) {
    if (seenKeys.has(key)) continue; // Skip if we already found this key

    const match = text.match(regex);
    if (match && match[1]) {
      const value = match[1].trim();
      if (value.length >= 2 && value.length <= 100) {
        results.push({ key, value, file });
        seenKeys.add(key);
      }
    }
  }

  return results;
}
