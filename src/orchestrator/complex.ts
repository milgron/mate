import { generateText } from 'ai';
import { logger } from '../utils/logger.js';
import { execSimple } from './simple.js';
import { getConversationDB } from '../db/conversations.js';
import { loadLongTermMemory, initLongTermMemory, getMemoryDir } from '../db/longterm.js';
import { getModel, getActiveProvider, supportsThinking, getProviderConfig } from './providers.js';

export interface ComplexExecOptions {
  timeout?: number;
  maxTokens?: number;
  fallbackToSimple?: boolean;
  historyLimit?: number;
  budgetTokens?: number;
}

const DEFAULT_OPTIONS: Required<ComplexExecOptions> = {
  timeout: 300000, // 5 minutes
  maxTokens: 16000,
  fallbackToSimple: true,
  historyLimit: 30,
  budgetTokens: 10000, // Extended thinking budget
};

/**
 * Build the system prompt with memory context for complex tasks.
 */
function buildSystemPrompt(userId: string): string {
  const longTermMemory = loadLongTermMemory(userId);
  const memoryDir = getMemoryDir(userId);

  const parts: string[] = [];

  parts.push('You are an advanced AI assistant capable of handling complex, multi-step tasks.');
  parts.push('Think through problems carefully and provide thorough, well-reasoned responses.');
  parts.push('');

  if (longTermMemory) {
    parts.push('=== LONG-TERM MEMORY ===');
    parts.push(longTermMemory);
    parts.push('');
  }

  parts.push('=== INSTRUCTIONS ===');
  parts.push('- You can read/write files in /app/data/');
  parts.push(`- Memory is stored in ${memoryDir}/`);
  parts.push('  - Update about.md for user identity info (name, location, work)');
  parts.push('  - Update preferences.md for user preferences (language, tone)');
  parts.push('  - Create notes/{topic}.md for topic-specific notes');
  parts.push('  - Create journal/{YYYY-MM-DD}.md for daily summaries');
  parts.push('- Respond in the same language as the user');
  parts.push('- For complex tasks, break down your approach step by step');
  parts.push('- Provide comprehensive and detailed responses');

  return parts.join('\n');
}

/**
 * Build conversation messages for the API.
 */
function buildMessages(
  userId: string,
  currentMessage: string,
  historyLimit: number
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const db = getConversationDB();
  const history = db.getHistory(userId, historyLimit);

  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  // Add history
  for (const msg of history) {
    messages.push({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    });
  }

  // Add current message with task framing
  messages.push({
    role: 'user',
    content: `Please help me with the following task. Think through it carefully:\n\n${currentMessage}`,
  });

  return messages;
}

/**
 * Execute a complex task using the Vercel AI SDK.
 * Uses extended thinking for Anthropic, standard generation for other providers.
 * This handles multi-step tasks, research, analysis, etc.
 */
export async function execComplex(
  task: string,
  userId: string,
  options: ComplexExecOptions = {}
): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Initialize long-term memory file if it doesn't exist
  initLongTermMemory(userId);

  const provider = getActiveProvider();
  const config = getProviderConfig(provider);
  const model = getModel();

  logger.info('Executing complex task via Vercel AI SDK', {
    taskLength: task.length,
    timeout: opts.timeout,
    provider,
    model: config.model,
    supportsThinking: supportsThinking(provider),
    budgetTokens: opts.budgetTokens,
  });

  const db = getConversationDB();

  try {
    const systemPrompt = buildSystemPrompt(userId);
    const messages = buildMessages(userId, task, opts.historyLimit);

    // Build generation options
    // Extended thinking is only available for Anthropic
    const generateOptions: Parameters<typeof generateText>[0] = {
      model,
      system: systemPrompt,
      messages,
      maxOutputTokens: opts.maxTokens,
    };

    // Add extended thinking for Anthropic
    if (supportsThinking(provider)) {
      // @ts-expect-error - experimental_thinking is Anthropic-specific
      generateOptions.experimental_thinking = {
        enabled: true,
        budgetTokens: opts.budgetTokens,
      };
    }

    const { text, usage } = await generateText(generateOptions);

    logger.info('Complex task completed', {
      responseLength: text.length,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
      provider,
    });

    // Save both messages to history
    db.addMessage(userId, 'user', task);
    db.addMessage(userId, 'assistant', text);

    return text;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('AI SDK complex execution failed', { error: errorMessage, provider });

    if (opts.fallbackToSimple) {
      logger.info('Falling back to simple execution');
      return execSimple(task, userId);
    }

    throw new Error('An error occurred processing your request.');
  }
}
