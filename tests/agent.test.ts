import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { handlers } from './mocks/handlers.js';

// Setup MSW server
const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Claude Agent', () => {
  describe('createAgent', () => {
    it('should create an agent with API key', async () => {
      const { createAgent } = await import('../src/agent/agent.js');

      const agent = createAgent({
        apiKey: 'test-api-key',
      });

      expect(agent).toBeDefined();
      // Default model is Haiku
      expect(agent.config.model).toBe('claude-haiku-4-5-20251001');
    });
  });

  describe('processMessage', () => {
    it('should process a simple text message', async () => {
      const { createAgent } = await import('../src/agent/agent.js');

      const agent = createAgent({
        apiKey: 'test-api-key',
      });

      const response = await agent.processMessage('user123', 'Hello, Claude!');

      expect(response).toContain('Hello, Claude!');
    });

    it('should maintain conversation history per user', async () => {
      const { createAgent } = await import('../src/agent/agent.js');

      const agent = createAgent({
        apiKey: 'test-api-key',
      });

      await agent.processMessage('user123', 'First message');
      await agent.processMessage('user123', 'Second message');

      const history = agent.getHistory('user123');
      expect(history.length).toBeGreaterThanOrEqual(2);
    });

    it('should separate conversation history between users', async () => {
      const { createAgent } = await import('../src/agent/agent.js');

      const agent = createAgent({
        apiKey: 'test-api-key',
      });

      await agent.processMessage('user1', 'Message from user 1');
      await agent.processMessage('user2', 'Message from user 2');

      const history1 = agent.getHistory('user1');
      const history2 = agent.getHistory('user2');

      expect(history1).not.toEqual(history2);
    });
  });

  describe('clearHistory', () => {
    it('should clear conversation history for a user', async () => {
      const { createAgent } = await import('../src/agent/agent.js');

      const agent = createAgent({
        apiKey: 'test-api-key',
      });

      await agent.processMessage('user123', 'Test message');
      expect(agent.getHistory('user123').length).toBeGreaterThan(0);

      agent.clearHistory('user123');
      expect(agent.getHistory('user123').length).toBe(0);
    });
  });
});

describe('Tools', () => {
  describe('BashTool', () => {
    it('should execute allowed commands', async () => {
      const { BashTool } = await import('../src/agent/tools/bash.js');

      const tool = new BashTool({
        allowedCommands: ['echo', 'ls', 'pwd'],
      });

      const result = await tool.execute({ command: 'echo "hello"' });

      expect(result.success).toBe(true);
      expect(result.output).toContain('hello');
    });

    it('should reject disallowed commands', async () => {
      const { BashTool } = await import('../src/agent/tools/bash.js');

      const tool = new BashTool({
        allowedCommands: ['echo', 'ls'],
      });

      const result = await tool.execute({ command: 'rm -rf /' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not allowed');
    });

    it('should have timeout protection', async () => {
      const { BashTool } = await import('../src/agent/tools/bash.js');

      const tool = new BashTool({
        allowedCommands: ['sleep'],
        timeoutMs: 100,
      });

      const result = await tool.execute({ command: 'sleep 10' });

      expect(result.success).toBe(false);
      expect(result.error?.toLowerCase()).toContain('timed out');
    });
  });

  describe('FileTool', () => {
    it('should read files within allowed paths', async () => {
      const { FileTool } = await import('../src/agent/tools/file.js');
      const fs = await import('fs/promises');
      const path = await import('path');
      const os = await import('os');

      // Create a temp file
      const tempDir = os.tmpdir();
      const testFile = path.join(tempDir, 'jarvis-test.txt');
      await fs.writeFile(testFile, 'test content');

      const tool = new FileTool({
        allowedPaths: [tempDir],
      });

      const result = await tool.read(testFile);

      expect(result.success).toBe(true);
      expect(result.content).toBe('test content');

      // Cleanup
      await fs.unlink(testFile);
    });

    it('should reject reading files outside allowed paths', async () => {
      const { FileTool } = await import('../src/agent/tools/file.js');

      const tool = new FileTool({
        allowedPaths: ['/tmp/allowed'],
      });

      const result = await tool.read('/etc/passwd');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not allowed');
    });

    it('should write files within allowed paths', async () => {
      const { FileTool } = await import('../src/agent/tools/file.js');
      const fs = await import('fs/promises');
      const path = await import('path');
      const os = await import('os');

      const tempDir = os.tmpdir();
      const testFile = path.join(tempDir, 'jarvis-write-test.txt');

      const tool = new FileTool({
        allowedPaths: [tempDir],
      });

      const result = await tool.write(testFile, 'written content');

      expect(result.success).toBe(true);

      const content = await fs.readFile(testFile, 'utf-8');
      expect(content).toBe('written content');

      // Cleanup
      await fs.unlink(testFile);
    });
  });
});

describe('Memory', () => {
  describe('ConversationMemory', () => {
    it('should store and retrieve messages', async () => {
      const { ConversationMemory } = await import('../src/agent/memory.js');

      const memory = new ConversationMemory();

      memory.addMessage('user123', { role: 'user', content: 'Hello' });
      memory.addMessage('user123', { role: 'assistant', content: 'Hi there!' });

      const messages = memory.getMessages('user123');

      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual({ role: 'user', content: 'Hello' });
      expect(messages[1]).toEqual({ role: 'assistant', content: 'Hi there!' });
    });

    it('should limit message history', async () => {
      const { ConversationMemory } = await import('../src/agent/memory.js');

      const memory = new ConversationMemory({ maxMessages: 3 });

      memory.addMessage('user123', { role: 'user', content: 'Message 1' });
      memory.addMessage('user123', { role: 'assistant', content: 'Response 1' });
      memory.addMessage('user123', { role: 'user', content: 'Message 2' });
      memory.addMessage('user123', { role: 'assistant', content: 'Response 2' });

      const messages = memory.getMessages('user123');

      expect(messages).toHaveLength(3);
      // First message should be dropped
      expect(messages[0]).toEqual({ role: 'assistant', content: 'Response 1' });
    });

    it('should clear messages for a user', async () => {
      const { ConversationMemory } = await import('../src/agent/memory.js');

      const memory = new ConversationMemory();

      memory.addMessage('user123', { role: 'user', content: 'Hello' });
      memory.clear('user123');

      expect(memory.getMessages('user123')).toHaveLength(0);
    });
  });
});
