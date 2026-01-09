import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger.js';

let client: Anthropic | null = null;

/**
 * Get or create the Anthropic client singleton.
 * Uses ANTHROPIC_API_KEY from environment.
 */
export function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    client = new Anthropic({ apiKey });
    logger.info('Anthropic client initialized');
  }
  return client;
}

/**
 * Default model to use for requests.
 * claude-sonnet-4-20250514 is a good balance of speed and capability.
 */
export const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

/**
 * Model for complex/agentic tasks that need more reasoning.
 */
export const COMPLEX_MODEL = 'claude-sonnet-4-20250514';
