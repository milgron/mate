import { generateText, stepCountIs } from 'ai';
import { logger } from '../utils/logger.js';
import { execSimple } from './simple.js';
import { getConversationDB } from '../db/conversations.js';
import { getSemanticDB } from '../db/semantic.js';
import { getModel, getActiveProvider, supportsThinking, getProviderConfig } from './providers.js';
import { createMemoryTools, MemoryTool } from './tools.js';
import { extractUserInfo, shouldRemember } from '../utils/patterns.js';

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
 * Build the system prompt with memory context for complex tasks.
 * Loads memories from LanceDB semantic storage.
 */
async function buildSystemPrompt(userId: string): Promise<string> {
  const parts: string[] = [];

  parts.push('You are an advanced AI assistant capable of handling complex, multi-step tasks.');
  parts.push('Think through problems carefully and provide thorough, well-reasoned responses.');
  parts.push('');

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
  parts.push('For complex tasks, break down your approach step by step.');

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
 * Includes retry logic for intermittent tool call failures.
 */
export async function execComplex(
  task: string,
  userId: string,
  options: ComplexExecOptions = {}
): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

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
  const systemPrompt = await buildSystemPrompt(userId);
  const messages = buildMessages(userId, task, opts.historyLimit);
  const tools = createMemoryTools(userId);

  let lastError: Error | null = null;

  // Retry loop for intermittent Groq tool call failures
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        logger.warn('Retrying after tool call error', { attempt, provider });
      }

      // Build generation options
      const generateOptions: Parameters<typeof generateText>[0] = {
        model,
        system: systemPrompt,
        messages,
        maxOutputTokens: opts.maxTokens,
        tools,
        toolChoice: 'auto',
        stopWhen: stepCountIs(10),
      };

      // Add extended thinking for Anthropic
      if (supportsThinking(provider)) {
        // @ts-expect-error - experimental_thinking is Anthropic-specific
        generateOptions.experimental_thinking = {
          enabled: true,
          budgetTokens: opts.budgetTokens,
        };
      }

      const result = await generateText(generateOptions);
      const { text, usage, steps, toolCalls } = result;

      logger.info('Complex task completed', {
        responseLength: text.length,
        inputTokens: usage?.inputTokens,
        outputTokens: usage?.outputTokens,
        provider,
        stepsCount: steps?.length || 0,
        toolCallsCount: toolCalls?.length || 0,
        attempt,
      });

      // Fallback: If no tools were called but the message looks like it should remember something
      if ((toolCalls?.length || 0) === 0 && shouldRemember(task)) {
        const extracted = extractUserInfo(task);
        if (extracted) {
          logger.info('Fallback pattern matching triggered', {
            key: extracted.key,
            value: extracted.value,
            file: extracted.file,
          });

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
      db.addMessage(userId, 'user', task);
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

      // Log error
      logger.error('AI SDK complex execution failed', {
        error: lastError.message,
        provider,
        attempt,
      });
      break;
    }
  }

  // Fallback to simple execution if enabled
  if (opts.fallbackToSimple) {
    logger.info('Falling back to simple execution');
    return execSimple(task, userId);
  }

  throw new Error('An error occurred processing your request.');
}
