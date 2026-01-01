import Anthropic from '@anthropic-ai/sdk';
import { ConversationMemory, Message } from './memory.js';
import { BashTool } from './tools/bash.js';
import { FileTool } from './tools/file.js';
import { UpdateTool } from './tools/update.js';
import { LogsTool } from './tools/logs.js';
import { MemoryTool } from './tools/memory.js';

export interface AgentConfig {
  apiKey: string;
  defaultModel?: string;
  thinkingModel?: string;
  systemPrompt?: string;
  maxTokens?: number;
  botName?: string;
}

const MODELS = {
  fast: 'claude-haiku-4-5-20251001',
  thinking: 'claude-opus-4-5-20251101',
};

/**
 * Detects if user wants deep thinking and extracts clean message.
 */
function parseThinkingRequest(message: string): { useThinking: boolean; cleanMessage: string } {
  const thinkingPatterns = [
    /^think hard[:\s]*/i,
    /^think deeply[:\s]*/i,
    /^use opus[:\s]*/i,
    /^thinking mode[:\s]*/i,
  ];

  for (const pattern of thinkingPatterns) {
    if (pattern.test(message)) {
      return {
        useThinking: true,
        cleanMessage: message.replace(pattern, '').trim(),
      };
    }
  }

  return { useThinking: false, cleanMessage: message };
}

export interface Agent {
  config: AgentConfig & { model: string };
  processMessage: (userId: string, message: string) => Promise<string>;
  getHistory: (userId: string) => Message[];
  clearHistory: (userId: string) => void;
}

const DEFAULT_BOT_NAME = 'clanker';

function getDefaultSystemPrompt(botName: string): string {
  return `You are ${botName}, a helpful AI assistant running on a Raspberry Pi.

You have persistent memory organized into categories that survives across sessions:
- todo: Tasks and action items to complete
- posts: Blog posts and content ideas
- today: Today's tasks (subset of todo for current day)
- memory: Important facts and things to remember
- random: Everything else

Use the remember/recall tools to store important information. When the user asks you to add tasks or todos, use category "todo". When they say "add to today" or "do this today", use category "today" or move items from todo to today with move_memory.

You can:
- Execute shell commands (bash)
- Read/write files (including to /app/data for persistent storage)
- Remember facts by category (remember, recall, list_memories, forget, move_memory)
- Check application logs (logs)
- Trigger self-updates (self_update)

Be concise and helpful. Proactively remember important things the user tells you.`;
}

/**
 * Creates a Claude agent with tools and conversation memory.
 */
export function createAgent(config: AgentConfig): Agent {
  const client = new Anthropic({
    apiKey: config.apiKey,
  });

  const botName = config.botName ?? DEFAULT_BOT_NAME;
  const systemPrompt = config.systemPrompt ?? getDefaultSystemPrompt(botName);

  const memory = new ConversationMemory({ maxMessages: 50 });

  // Initialize tools with sensible defaults
  const bashTool = new BashTool({
    allowedCommands: ['echo', 'ls', 'pwd', 'cat', 'head', 'tail', 'wc', 'date', 'whoami', 'git'],
    timeoutMs: 30000,
  });

  const fileTool = new FileTool({
    allowedPaths: [process.cwd(), '/tmp', '/app/data'],
  });

  const updateTool = new UpdateTool({
    triggerPath: '/var/jarvis/update-trigger',
  });

  const logsTool = new LogsTool(100);

  const memoryTool = new MemoryTool();

  // Build tool definitions
  const tools = [
    bashTool.getToolDefinition(),
    ...fileTool.getToolDefinitions(),
    updateTool.getToolDefinition(),
    logsTool.getToolDefinition(),
    ...memoryTool.getToolDefinitions(),
  ];

  /**
   * Executes a tool call and returns the result.
   */
  async function executeTool(
    name: string,
    input: Record<string, unknown>
  ): Promise<string> {
    switch (name) {
      case 'bash':
        const bashResult = await bashTool.execute({ command: input.command as string });
        return bashResult.success
          ? bashResult.output ?? 'Command executed successfully'
          : `Error: ${bashResult.error}`;

      case 'read_file':
        const readResult = await fileTool.read(input.path as string);
        return readResult.success
          ? readResult.content ?? ''
          : `Error: ${readResult.error}`;

      case 'write_file':
        const writeResult = await fileTool.write(
          input.path as string,
          input.content as string
        );
        return writeResult.success
          ? 'File written successfully'
          : `Error: ${writeResult.error}`;

      case 'list_files':
        const listResult = await fileTool.list(input.path as string);
        return listResult.success
          ? listResult.content ?? ''
          : `Error: ${listResult.error}`;

      case 'self_update':
        const updateResult = await updateTool.trigger();
        return updateResult.message;

      case 'logs':
        const logsResult = await logsTool.execute({ lines: input.lines as number });
        return logsResult.success
          ? logsResult.logs ?? 'No logs available'
          : `Error: ${logsResult.error}`;

      case 'remember':
        const rememberResult = await memoryTool.remember({
          key: input.key as string,
          value: input.value as string,
          category: input.category as string | undefined,
        });
        return rememberResult.success
          ? String(rememberResult.data)
          : `Error: ${rememberResult.error}`;

      case 'recall':
        const recallResult = await memoryTool.recall({
          key: input.key as string,
          category: input.category as string | undefined,
        });
        if (!recallResult.success) return `Error: ${recallResult.error}`;
        if (recallResult.data === null) return `No memory found for key: ${input.key}`;
        return JSON.stringify(recallResult.data, null, 2);

      case 'list_memories':
        const listMemoriesResult = await memoryTool.listMemories({
          category: input.category as string | undefined,
        });
        return listMemoriesResult.success
          ? JSON.stringify(listMemoriesResult.data, null, 2)
          : `Error: ${listMemoriesResult.error}`;

      case 'forget':
        const forgetResult = await memoryTool.forget({
          key: input.key as string,
          category: input.category as string | undefined,
        });
        return forgetResult.success
          ? String(forgetResult.data)
          : `Error: ${forgetResult.error}`;

      case 'move_memory':
        const moveResult = await memoryTool.moveMemory({
          key: input.key as string,
          fromCategory: input.fromCategory as string,
          toCategory: input.toCategory as string,
        });
        return moveResult.success
          ? String(moveResult.data)
          : `Error: ${moveResult.error}`;

      default:
        return `Unknown tool: ${name}`;
    }
  }

  /**
   * Processes a message and returns the response.
   */
  async function processMessage(userId: string, message: string): Promise<string> {
    // Set user context for memory tool
    memoryTool.setUser(userId);

    // Check for thinking mode trigger
    const { useThinking, cleanMessage } = parseThinkingRequest(message);
    const model = useThinking
      ? (config.thinkingModel ?? MODELS.thinking)
      : (config.defaultModel ?? MODELS.fast);

    // Add user message to memory (store original message)
    memory.addMessage(userId, { role: 'user', content: cleanMessage || message });

    // Build messages for API
    const messages = memory.getMessages(userId).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // Call Claude API
    let response = await client.messages.create({
      model,
      max_tokens: config.maxTokens ?? (useThinking ? 4096 : 1024),
      system: systemPrompt,
      messages,
      tools,
    });

    // Handle tool use loop
    while (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      // Execute each tool call
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (toolUse) => ({
          type: 'tool_result' as const,
          tool_use_id: toolUse.id,
          content: await executeTool(toolUse.name, toolUse.input as Record<string, unknown>),
        }))
      );

      // Continue conversation with tool results
      messages.push({
        role: 'assistant',
        content: response.content as unknown as string,
      });

      response = await client.messages.create({
        model,
        max_tokens: config.maxTokens ?? (useThinking ? 4096 : 1024),
        system: systemPrompt,
        messages: [
          ...messages,
          { role: 'user', content: toolResults as unknown as string },
        ],
        tools,
      });
    }

    // Extract text response
    const textBlocks = response.content.filter(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );
    const responseText = textBlocks.map((b) => b.text).join('\n');

    // Add assistant response to memory
    memory.addMessage(userId, { role: 'assistant', content: responseText });

    return responseText;
  }

  return {
    config: { ...config, model: config.defaultModel ?? MODELS.fast },
    processMessage,
    getHistory: (userId: string) => memory.getMessages(userId),
    clearHistory: (userId: string) => memory.clear(userId),
  };
}
