/**
 * Markdown parsing and manipulation utilities.
 * Designed for human-readable memory files that are also machine-parseable.
 */

export interface MarkdownSection {
  title: string;
  level: number;
  content: string;
}

/**
 * Parse markdown content into sections based on headers.
 * Returns a map of section title -> content.
 */
export function parseMarkdownSections(content: string): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = content.split('\n');

  let currentSection = '';
  let currentContent: string[] = [];

  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headerMatch && headerMatch[2]) {
      // Save previous section
      if (currentSection) {
        sections.set(currentSection, currentContent.join('\n').trim());
      }

      currentSection = headerMatch[2].trim();
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  // Save last section
  if (currentSection) {
    sections.set(currentSection, currentContent.join('\n').trim());
  }

  return sections;
}

/**
 * Update a specific section in markdown content.
 * If section doesn't exist, appends it at the end.
 */
export function updateMarkdownSection(
  content: string,
  sectionTitle: string,
  newContent: string,
  level: number = 2
): string {
  const lines = content.split('\n');
  const headerPrefix = '#'.repeat(level);
  const headerRegex = new RegExp(`^#{1,6}\\s+${escapeRegex(sectionTitle)}\\s*$`);

  let inTargetSection = false;
  let sectionFound = false;
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;

    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headerMatch) {
      if (headerRegex.test(line)) {
        // Found target section
        inTargetSection = true;
        sectionFound = true;
        result.push(line);
        result.push(newContent);
        continue;
      } else if (inTargetSection) {
        // Hit a new section, stop skipping
        inTargetSection = false;
        result.push(line);
        continue;
      }
    }

    if (!inTargetSection) {
      result.push(line);
    }
  }

  // If section wasn't found, append it
  if (!sectionFound) {
    result.push('');
    result.push(`${headerPrefix} ${sectionTitle}`);
    result.push(newContent);
  }

  return result.join('\n');
}

/**
 * Format key-value pairs as a markdown list.
 */
export function formatAsMarkdownList(items: Record<string, string>): string {
  return Object.entries(items)
    .map(([key, value]) => `- **${key}**: ${value}`)
    .join('\n');
}

/**
 * Parse a markdown list into key-value pairs.
 * Supports format: "- **Key**: Value" or "- Key: Value"
 */
export function parseMarkdownList(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split('\n');

  for (const line of lines) {
    // Match "- **Key**: Value" or "- Key: Value"
    const match = line.match(/^-\s+(?:\*\*)?([^*:]+)(?:\*\*)?\s*:\s*(.+)$/);
    if (match && match[1] && match[2]) {
      result[match[1].trim()] = match[2].trim();
    }
  }

  return result;
}

/**
 * Update a single key-value in a markdown list section.
 */
export function updateMarkdownListItem(
  content: string,
  key: string,
  value: string
): string {
  const lines = content.split('\n');
  const keyRegex = new RegExp(`^-\\s+(?:\\*\\*)?${escapeRegex(key)}(?:\\*\\*)?\\s*:`);
  let found = false;

  const result = lines.map((line) => {
    if (keyRegex.test(line)) {
      found = true;
      return `- **${key}**: ${value}`;
    }
    return line;
  });

  if (!found) {
    result.push(`- **${key}**: ${value}`);
  }

  return result.join('\n');
}

/**
 * Get current date in ISO format for timestamps.
 */
export function getDateString(): string {
  const parts = new Date().toISOString().split('T');
  return parts[0] || new Date().toISOString().slice(0, 10);
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
