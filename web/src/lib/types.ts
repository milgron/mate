/**
 * Shared types for Mate configuration and usage tracking
 */

export interface ModelConfig {
  provider: 'anthropic' | 'openai' | 'groq';
  model: string;
  voice?: string;
}

export interface ConfigFile {
  version: number;
  assistant: {
    name: string;
    language: 'auto' | 'en' | 'es';
  };
  models: {
    reasoning: ModelConfig;
    tts: ModelConfig;
    stt: ModelConfig;
  };
  features: {
    voiceEnabled: boolean;
    extendedThinking: boolean;
  };
  updatedAt: string;
}

export interface UsageEntry {
  requests: number;
  inputTokens?: number;
  outputTokens?: number;
  characters?: number;
  minutes?: number;
  cost: number;
}

export interface DailyUsage {
  date: string;
  requests: number;
  cost: number;
}

export interface UsageFile {
  version: number;
  period: {
    start: string;
    end: string;
  };
  usage: {
    reasoning: UsageEntry;
    tts: UsageEntry;
    stt: UsageEntry;
  };
  daily: DailyUsage[];
  totalCost: number;
}

export const DEFAULT_CONFIG: ConfigFile = {
  version: 1,
  assistant: {
    name: 'Mate',
    language: 'auto',
  },
  models: {
    reasoning: {
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
    },
    tts: {
      provider: 'groq',
      model: 'playai-tts',
      voice: 'Arista-PlayAI',
    },
    stt: {
      provider: 'groq',
      model: 'whisper-large-v3-turbo',
    },
  },
  features: {
    voiceEnabled: true,
    extendedThinking: true,
  },
  updatedAt: new Date().toISOString(),
};

export const DEFAULT_USAGE: UsageFile = {
  version: 1,
  period: {
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
    end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString(),
  },
  usage: {
    reasoning: { requests: 0, inputTokens: 0, outputTokens: 0, cost: 0 },
    tts: { requests: 0, characters: 0, cost: 0 },
    stt: { requests: 0, minutes: 0, cost: 0 },
  },
  daily: [],
  totalCost: 0,
};
