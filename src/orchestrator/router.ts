import { execSimple } from './simple.js';
import { execComplex } from './complex.js';
import { logger } from '../utils/logger.js';

/**
 * Routing mode for message processing.
 * - 'simple': Use Claude CLI for fast, straightforward responses
 * - 'flow': Use claude-flow for complex, multi-step tasks
 */
export type RoutingMode = 'simple' | 'flow';

/**
 * Patterns that suggest a task is complex and should use claude-flow.
 * These are for UI suggestions only - the user ultimately chooses the mode.
 * Note: Spanish patterns use (?:^|\s) and (?:\s|$) instead of \b because
 * JavaScript's \b word boundary doesn't work with Unicode/accented characters.
 */
const COMPLEX_PATTERNS = [
  // Spanish imperatives for complex tasks (with accented á)
  // Using whitespace boundaries since \b doesn't work with Unicode
  /(?:^|\s)investigá(?:\s|$)/i,
  /(?:^|\s)analizá(?:\s|$)/i,
  /(?:^|\s)creá(?:\s|$)/i,
  /(?:^|\s)compará(?:\s|$)/i,
  /(?:^|\s)buildea(?:\s|$)/i,
  /(?:^|\s)escribí(?:\s|$)/i,
  /(?:^|\s)múltiples(?:\s|$)/i,
  // English complex task keywords (can use \b)
  /\bresearch\b/i,
  /\banalyze\b/i,
  /\bcreate\b/i,
  /\bbuild\b/i,
  /\bcompare\b/i,
  // Multi-step indicators
  /step.by.step/i,
  // Long-form content
  /\b(documento|informe|reporte|essay|article)\b/i,
];

/**
 * Suggest which routing mode to use based on message content.
 * This is a hint for the UI - the user makes the final decision.
 */
export function suggestMode(message: string): RoutingMode {
  const isComplex = COMPLEX_PATTERNS.some((pattern) => pattern.test(message));
  return isComplex ? 'flow' : 'simple';
}

/**
 * Route a message to the appropriate executor based on the selected mode.
 */
export async function routeMessage(
  message: string,
  mode: RoutingMode,
  userId: string
): Promise<string> {
  logger.info('Routing message', { mode, messageLength: message.length, userId });

  if (mode === 'flow') {
    return execComplex(message, userId);
  }

  return execSimple(message, userId);
}
