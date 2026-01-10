import { generateText } from 'ai';
import { logger } from '../utils/logger.js';
import { getConversationDB } from '../db/conversations.js';
import { loadLongTermMemory, initLongTermMemory, getMemoryDir } from '../db/longterm.js';
import { getModel, getActiveProvider } from './providers.js';

export interface SimpleExecOptions {
  timeout?: number;
  maxTokens?: number;
  historyLimit?: number;
}

const DEFAULT_OPTIONS: Required<SimpleExecOptions> = {
  timeout: 120000, // 2 minutes
  maxTokens: 4096,
  historyLimit: 30, // Last 30 messages
};

/**
 * Build the system prompt with memory context.
 */
function buildSystemPrompt(userId: string): string {
  const longTermMemory = loadLongTermMemory(userId);
  const memoryDir = getMemoryDir(userId);

  const parts: string[] = [];

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

  // Add current message
  messages.push({
    role: 'user',
    content: currentMessage,
  });

  return messages;
}

/**
 * Execute a simple prompt using the Vercel AI SDK.
 * This is fast and suitable for straightforward questions/tasks.
 */
export async function execSimple(
  prompt: string,
  userId: string,
  options: SimpleExecOptions = {}
): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Initialize long-term memory file if it doesn't exist
  initLongTermMemory(userId);

  const provider = getActiveProvider();
  const model = getModel();

  logger.info('Executing simple prompt via Vercel AI SDK', {
    promptLength: prompt.length,
    timeout: opts.timeout,
    provider,
  });

  const db = getConversationDB();

  try {
    const systemPrompt = buildSystemPrompt(userId);
    const messages = buildMessages(userId, prompt, opts.historyLimit);

    const { text, usage } = await generateText({
      model,
      system: systemPrompt,
      messages,
      maxOutputTokens: opts.maxTokens,
    });

    logger.info('Simple prompt completed', {
      responseLength: text.length,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
      provider,
    });

    // Save both messages to history
    db.addMessage(userId, 'user', prompt);
    db.addMessage(userId, 'assistant', text);

    return text;
  } catch (error: unknown) {
    const err = error as { message?: string };
    logger.error('AI SDK execution failed', {
      error: err.message,
      provider,
    });
    throw new Error('An error occurred processing your request.');
  }
}
