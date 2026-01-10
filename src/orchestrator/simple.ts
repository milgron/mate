import { generateText, stepCountIs } from 'ai';
import { logger } from '../utils/logger.js';
import { getConversationDB } from '../db/conversations.js';
import { getSemanticDB } from '../db/semantic.js';
import { getModel, getActiveProvider } from './providers.js';
import { createMemoryTools, MemoryTool } from './tools.js';
import { extractUserInfo, shouldRemember } from '../utils/patterns.js';

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

const MAX_RETRIES = 2;

/**
 * Check if an error is retryable (e.g., Groq tool call failures).
 */
function isRetryableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('Failed to call a function') ||
         message.includes('tool') ||
         message.includes('function');
}

/**
 * Build the system prompt with memory context from LanceDB.
 */
async function buildSystemPrompt(userId: string): Promise<string> {
  const parts: string[] = [];

  try {
    const db = await getSemanticDB();
    const allMemories = await db.getAllForUser(userId);

    if (allMemories.length > 0) {
      const facts = allMemories.filter(m => m.type === 'fact');
      const prefs = allMemories.filter(m => m.type === 'preference');

      if (facts.length > 0) {
        parts.push('=== USER INFO ===');
        facts.forEach(f => parts.push(`- ${f.key}: ${f.content}`));
        parts.push('');
      }

      if (prefs.length > 0) {
        parts.push('=== PREFERENCES ===');
        prefs.forEach(p => parts.push(`- ${p.key}: ${p.content}`));
        parts.push('');
      }
    }
  } catch (error) {
    logger.error('Failed to load memories for system prompt', { error, userId });
  }

  parts.push('=== TOOLS ===');
  parts.push('You have 2 tools available:');
  parts.push('1. remember(key, value) - Save user info. Use when user shares name, location, work, preferences.');
  parts.push('2. recall(query) - Search memories semantically.');
  parts.push('');
  parts.push('When user shares personal info, call remember FIRST, then respond.');
  parts.push('Example: "me llamo Juan" -> remember(key="name", value="Juan")');
  parts.push('');
  parts.push('=== INSTRUCTIONS ===');
  parts.push('Respond in the same language as the user.');

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
 * Includes retry logic for intermittent tool call failures.
 * Falls back to pattern matching if tools aren't called.
 */
export async function execSimple(
  prompt: string,
  userId: string,
  options: SimpleExecOptions = {}
): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const provider = getActiveProvider();
  const model = getModel();

  logger.info('Executing simple prompt via Vercel AI SDK', {
    promptLength: prompt.length,
    timeout: opts.timeout,
    provider,
  });

  const db = getConversationDB();
  const systemPrompt = await buildSystemPrompt(userId);
  const messages = buildMessages(userId, prompt, opts.historyLimit);
  const tools = createMemoryTools(userId);

  let lastError: Error | null = null;

  // Retry loop for intermittent Groq tool call failures
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        logger.warn('Retrying after tool call error', { attempt, provider });
      }

      const result = await generateText({
        model,
        system: systemPrompt,
        messages,
        maxOutputTokens: opts.maxTokens,
        tools,
        toolChoice: 'auto',
        stopWhen: stepCountIs(5),
      });

      const { text, usage, steps, toolCalls } = result;

      logger.info('Simple prompt completed', {
        responseLength: text.length,
        inputTokens: usage?.inputTokens,
        outputTokens: usage?.outputTokens,
        provider,
        stepsCount: steps?.length || 0,
        toolCallsCount: toolCalls?.length || 0,
        toolCallNames: toolCalls?.map(tc => tc.toolName) || [],
        attempt,
      });

      // Fallback: If no tools were called but the message looks like it should remember something
      if ((toolCalls?.length || 0) === 0 && shouldRemember(prompt)) {
        const extracted = extractUserInfo(prompt);
        if (extracted) {
          logger.info('Fallback pattern matching triggered', {
            key: extracted.key,
            value: extracted.value,
            file: extracted.file,
          });

          // Use MemoryTool directly for fallback
          const memoryTool = new MemoryTool();
          memoryTool.setUser(userId);
          await memoryTool.remember({
            key: extracted.key,
            value: extracted.value,
            file: extracted.file,
          });
        }
      }

      // Save both messages to history
      db.addMessage(userId, 'user', prompt);
      db.addMessage(userId, 'assistant', text);

      return text;
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Only retry if it's a retryable error and we have retries left
      if (attempt < MAX_RETRIES && isRetryableError(error)) {
        logger.warn('Tool call error, will retry', {
          error: lastError.message,
          attempt,
          provider,
        });
        continue;
      }

      // Log and throw on final attempt or non-retryable error
      logger.error('AI SDK execution failed', {
        error: lastError.message,
        provider,
        attempt,
        willRetry: false,
      });
      break;
    }
  }

  // If we get here, all retries failed
  throw new Error('An error occurred processing your request.');
}
