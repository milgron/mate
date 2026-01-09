import { logger } from '../utils/logger.js';
import { execSimple } from './simple.js';
import { getConversationDB } from '../db/conversations.js';
import { loadLongTermMemory, initLongTermMemory, getMemoryDir } from '../db/longterm.js';
import { getClient, COMPLEX_MODEL } from './client.js';

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
 * Execute a complex task using the Anthropic SDK with extended thinking.
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

  logger.info('Executing complex task via Anthropic SDK', {
    taskLength: task.length,
    timeout: opts.timeout,
    model: COMPLEX_MODEL,
    budgetTokens: opts.budgetTokens,
  });

  const db = getConversationDB();
  const client = getClient();

  try {
    const systemPrompt = buildSystemPrompt(userId);
    const messages = buildMessages(userId, task, opts.historyLimit);

    // Use extended thinking for complex tasks
    const response = await client.messages.create({
      model: COMPLEX_MODEL,
      max_tokens: opts.maxTokens,
      thinking: {
        type: 'enabled',
        budget_tokens: opts.budgetTokens,
      },
      system: systemPrompt,
      messages,
    });

    // Extract text from response (skip thinking blocks)
    const textBlocks = response.content.filter((block) => block.type === 'text');
    const result = textBlocks
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('\n');

    logger.info('Complex task completed', {
      responseLength: result.length,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });

    // Save both messages to history
    db.addMessage(userId, 'user', task);
    db.addMessage(userId, 'assistant', result);

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Anthropic SDK complex execution failed', { error: errorMessage });

    if (opts.fallbackToSimple) {
      logger.info('Falling back to simple execution');
      return execSimple(task, userId);
    }

    throw new Error('An error occurred processing your request.');
  }
}
