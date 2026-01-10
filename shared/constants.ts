/**
 * Available AI models and providers
 */

export const REASONING_MODELS = [
  {
    id: 'anthropic:claude-sonnet-4-20250514',
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    description: 'Extended thinking, best for complex tasks',
    pricing: '$3 / $15 per 1M tokens',
    supportsThinking: true,
  },
  {
    id: 'openai:gpt-4o',
    provider: 'openai',
    model: 'gpt-4o',
    name: 'GPT-4o',
    description: 'Fast and capable, good for most tasks',
    pricing: '$2.50 / $10 per 1M tokens',
    supportsThinking: false,
  },
  {
    id: 'groq:llama-3.3-70b-versatile',
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B',
    description: 'Free tier available, very fast inference',
    pricing: '$0.59 / $0.79 per 1M tokens',
    supportsThinking: false,
  },
] as const;

export const TTS_VOICES = [
  { id: 'Arista-PlayAI', name: 'Arista', description: 'Female, warm' },
  { id: 'Atlas-PlayAI', name: 'Atlas', description: 'Male, professional' },
  { id: 'Basil-PlayAI', name: 'Basil', description: 'Male, friendly' },
  { id: 'Briggs-PlayAI', name: 'Briggs', description: 'Male, deep' },
  { id: 'Calum-PlayAI', name: 'Calum', description: 'Male, casual' },
  { id: 'Celeste-PlayAI', name: 'Celeste', description: 'Female, calm' },
  { id: 'Cheyenne-PlayAI', name: 'Cheyenne', description: 'Female, energetic' },
  { id: 'Chip-PlayAI', name: 'Chip', description: 'Male, youthful' },
  { id: 'Cillian-PlayAI', name: 'Cillian', description: 'Male, Irish accent' },
  { id: 'Deedee-PlayAI', name: 'Deedee', description: 'Female, cheerful' },
] as const;

export const STT_MODELS = [
  {
    id: 'groq:whisper-large-v3-turbo',
    provider: 'groq',
    model: 'whisper-large-v3-turbo',
    name: 'Whisper Large v3 Turbo',
    description: 'Fast and accurate transcription',
  },
] as const;

export const PROVIDER_COLORS = {
  anthropic: '#D97706',
  openai: '#10B981',
  groq: '#8B5CF6',
} as const;
