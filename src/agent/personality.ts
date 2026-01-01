import fs from 'fs';
import path from 'path';

const CONFIG_DIR = process.env.CONFIG_DIR || '/app/config';
const DATA_DIR = process.env.DATA_DIR || '/app/data';

export interface PersonalityConfig {
  name: string;
  tone: string;
  style: string[];
  voice: string[];
  dos: string[];
  donts: string[];
  raw: string;
}

/**
 * Default personality if no config file exists.
 */
const DEFAULT_PERSONALITY: PersonalityConfig = {
  name: 'clanker',
  tone: 'Friendly, warm, and approachable. Like a knowledgeable friend who\'s always happy to help.',
  style: [
    'Keep responses short and to the point',
    'Use simple, clear language',
    'Avoid jargon unless the user uses it first',
    'One idea per sentence when possible',
    'Skip unnecessary pleasantries in follow-up messages',
  ],
  voice: [
    'Casual but professional',
    'Confident without being arrogant',
    'Helpful without being overly eager',
    'Direct without being curt',
  ],
  dos: [
    'Get straight to the answer',
    'Use contractions (I\'m, you\'re, let\'s)',
    'Be encouraging when users are learning',
    'Admit when you don\'t know something',
    'Ask clarifying questions when needed',
  ],
  donts: [
    'Write long paragraphs when a sentence will do',
    'Use excessive exclamation marks',
    'Repeat what the user just said back to them',
    'Over-explain simple things',
    'Add filler phrases like "Great question!" or "I\'d be happy to help!"',
  ],
  raw: '',
};

/**
 * Parses a markdown section into an array of bullet points.
 */
function parseSection(content: string, sectionName: string): string[] {
  const regex = new RegExp(`## ${sectionName}\\n([\\s\\S]*?)(?=\\n## |$)`, 'i');
  const match = content.match(regex);

  if (!match || !match[1]) return [];

  const sectionContent = match[1].trim();
  const lines = sectionContent.split('\n');

  return lines
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim());
}

/**
 * Parses a simple text section (not bullet points).
 */
function parseTextSection(content: string, sectionName: string): string {
  const regex = new RegExp(`## ${sectionName}\\n([\\s\\S]*?)(?=\\n## |$)`, 'i');
  const match = content.match(regex);

  if (!match || !match[1]) return '';

  const firstLine = match[1].trim().split('\n')[0];
  return firstLine?.trim() ?? '';
}

/**
 * Loads personality configuration from markdown file.
 * Checks multiple locations in order of priority:
 * 1. User-specific config in data directory
 * 2. Config directory
 * 3. Falls back to defaults
 */
export function loadPersonality(userId?: string): PersonalityConfig {
  const configPaths = [
    // User-specific personality (future use)
    userId ? path.join(DATA_DIR, 'personality', userId, 'personality.md') : null,
    // Global personality in data dir (can be edited at runtime)
    path.join(DATA_DIR, 'personality.md'),
    // Default config shipped with the app
    path.join(CONFIG_DIR, 'personality.md'),
    // Development fallback
    path.join(process.cwd(), 'config', 'personality.md'),
  ].filter(Boolean) as string[];

  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, 'utf-8');
        return parsePersonalityMarkdown(content);
      } catch {
        // Continue to next path
      }
    }
  }

  return DEFAULT_PERSONALITY;
}

/**
 * Parses a personality markdown file into a config object.
 */
export function parsePersonalityMarkdown(content: string): PersonalityConfig {
  return {
    name: parseTextSection(content, 'Name') || DEFAULT_PERSONALITY.name,
    tone: parseTextSection(content, 'Tone') || DEFAULT_PERSONALITY.tone,
    style: parseSection(content, 'Style'),
    voice: parseSection(content, 'Voice'),
    dos: parseSection(content, 'Do'),
    donts: parseSection(content, 'Don\'t'),
    raw: content,
  };
}

/**
 * Converts personality config to a system prompt section.
 */
export function personalityToPrompt(config: PersonalityConfig): string {
  const sections: string[] = [];

  sections.push(`Your name is ${config.name}.`);
  sections.push(`\nTone: ${config.tone}`);

  if (config.style.length > 0) {
    sections.push(`\nStyle:\n${config.style.map((s) => `- ${s}`).join('\n')}`);
  }

  if (config.voice.length > 0) {
    sections.push(`\nVoice:\n${config.voice.map((v) => `- ${v}`).join('\n')}`);
  }

  if (config.dos.length > 0) {
    sections.push(`\nDo:\n${config.dos.map((d) => `- ${d}`).join('\n')}`);
  }

  if (config.donts.length > 0) {
    sections.push(`\nDon't:\n${config.donts.map((d) => `- ${d}`).join('\n')}`);
  }

  return sections.join('\n');
}
