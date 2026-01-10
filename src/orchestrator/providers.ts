import fs from 'fs';
import path from 'path';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { createGroq } from '@ai-sdk/groq';
import { logger } from '../utils/logger.js';

/**
 * Supported AI providers.
 */
export type ProviderName = 'anthropic' | 'openai' | 'groq';

/**
 * Web config file structure (subset of what we need).
 */
interface WebConfig {
  models?: {
    reasoning?: {
      provider?: string;
      model?: string;
    };
  };
  features?: {
    extendedThinking?: boolean;
  };
}

/**
 * Load config from data/config.json if available.
 */
function loadWebConfig(): WebConfig | null {
  try {
    const dataDir = process.env.DATA_DIR || '/app/data';
    const configPath = path.join(dataDir, 'config.json');

    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(data) as WebConfig;
    }
  } catch (error) {
    logger.debug('Could not load web config', { error: String(error) });
  }
  return null;
}

/**
 * Provider configuration.
 */
export interface ProviderConfig {
  name: ProviderName;
  model: string;
  supportsThinking: boolean;
}

/**
 * Available providers and their default models.
 */
export const PROVIDERS: Record<ProviderName, ProviderConfig> = {
  anthropic: {
    name: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    supportsThinking: true,
  },
  openai: {
    name: 'openai',
    model: 'gpt-4o',
    supportsThinking: false,
  },
  groq: {
    name: 'groq',
    model: 'llama-3.3-70b-versatile',
    supportsThinking: false,
  },
};

// Create Groq provider instance
const groq = createGroq();

/**
 * Get the active provider from web config or environment.
 * Priority: config.json > AI_PROVIDER env > 'anthropic' default.
 */
export function getActiveProvider(): ProviderName {
  // Check web config first
  const webConfig = loadWebConfig();
  if (webConfig?.models?.reasoning?.provider) {
    const provider = webConfig.models.reasoning.provider as ProviderName;
    if (PROVIDERS[provider]) {
      return provider;
    }
  }

  // Fall back to environment variable
  const envProvider = process.env.AI_PROVIDER as ProviderName;
  if (envProvider && PROVIDERS[envProvider]) {
    return envProvider;
  }

  return 'anthropic';
}

/**
 * Get the model override from web config or environment.
 */
function getModelOverride(): string | undefined {
  // Check web config first
  const webConfig = loadWebConfig();
  if (webConfig?.models?.reasoning?.model) {
    return webConfig.models.reasoning.model;
  }

  // Fall back to environment variable
  return process.env.AI_MODEL;
}

/**
 * Get a Vercel AI SDK model instance for the specified provider.
 */
export function getModel(providerName?: ProviderName) {
  const name = providerName || getActiveProvider();
  const config = PROVIDERS[name];
  const modelId = getModelOverride() || config.model;

  logger.debug('Getting AI model', { provider: name, model: modelId });

  switch (name) {
    case 'anthropic':
      return anthropic(modelId);
    case 'openai':
      return openai(modelId);
    case 'groq':
      return groq(modelId);
    default:
      logger.warn('Unknown provider, falling back to Anthropic', { provider: name });
      return anthropic(PROVIDERS.anthropic.model);
  }
}

/**
 * Check if the provider supports extended thinking.
 */
export function supportsThinking(providerName?: ProviderName): boolean {
  const name = providerName || getActiveProvider();
  return PROVIDERS[name]?.supportsThinking ?? false;
}

/**
 * Get provider configuration.
 */
export function getProviderConfig(providerName?: ProviderName): ProviderConfig {
  const name = providerName || getActiveProvider();
  return PROVIDERS[name] || PROVIDERS.anthropic;
}

/**
 * Log the current provider configuration.
 */
export function logProviderInfo(): void {
  const provider = getActiveProvider();
  const config = getProviderConfig(provider);
  const modelOverride = getModelOverride();

  logger.info('AI Provider configured', {
    provider: config.name,
    model: modelOverride || config.model,
    supportsThinking: config.supportsThinking,
  });
}
