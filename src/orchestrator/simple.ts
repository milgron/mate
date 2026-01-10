import { generateText, stepCountIs } from 'ai';
import { logger } from '../utils/logger.js';
import { getConversationDB } from '../db/conversations.js';
import { loadLongTermMemory, initLongTermMemory, getMemoryDir } from '../db/longterm.js';
import { getModel, getActiveProvider } from './providers.js';
import { createMemoryTools } from './tools.js';

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

  parts.push('=== MEMORY TOOLS ===');
  parts.push('You MUST use the available tools to persist user information.');
  parts.push('');
  parts.push('Available tools:');
  parts.push('- remember(key, value, file): Save facts to persistent memory');
  parts.push('- recall(key, file): Retrieve stored info from memory');
  parts.push('');
  parts.push('CRITICAL: When a user shares personal information (name, location, preferences),');
  parts.push('you MUST call the remember tool BEFORE responding with text.');
  parts.push('');
  parts.push('Examples of when to use remember:');
  parts.push('- "Me llamo Juan" → CALL remember(key="Name", value="Juan", file="about")');
  parts.push('- "Vivo en Madrid" → CALL remember(key="Location", value="Madrid", file="about")');
  parts.push('- "Prefiero respuestas cortas" → CALL remember(key="Response style", value="short", file="preferences")');
  parts.push('');
  parts.push('=== INSTRUCTIONS ===');
  parts.push(`- Memory files are stored in ${memoryDir}/`);
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
    const tools = createMemoryTools(userId);

    logger.debug('Tools available', {
      toolNames: Object.keys(tools),
      toolCount: Object.keys(tools).length,
    });

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
