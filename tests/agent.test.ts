import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Orchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('Router', () => {
    it('should suggest simple mode for basic questions', async () => {
      const { suggestMode } = await import('../src/orchestrator/router.js');

      expect(suggestMode('What time is it?')).toBe('simple');
      expect(suggestMode('Hello')).toBe('simple');
      expect(suggestMode('How are you?')).toBe('simple');
    });

    it('should suggest flow mode for Spanish complex task keywords', async () => {
      const { suggestMode } = await import('../src/orchestrator/router.js');

      // Spanish imperatives that match COMPLEX_PATTERNS
      expect(suggestMode('investigá el problema')).toBe('flow');
      expect(suggestMode('analizá el código')).toBe('flow');
      expect(suggestMode('creá un proyecto nuevo')).toBe('flow');
      expect(suggestMode('compará estos dos archivos')).toBe('flow');
    });

    it('should suggest flow mode for English complex task keywords', async () => {
      const { suggestMode } = await import('../src/orchestrator/router.js');

      expect(suggestMode('research the problem')).toBe('flow');
      expect(suggestMode('analyze the codebase')).toBe('flow');
      expect(suggestMode('create a new feature')).toBe('flow');
      expect(suggestMode('build a component')).toBe('flow');
      expect(suggestMode('compare these options')).toBe('flow');
    });

    it('should suggest flow mode for step-by-step requests', async () => {
      const { suggestMode } = await import('../src/orchestrator/router.js');

      expect(suggestMode('do this step by step')).toBe('flow');
      expect(suggestMode('step-by-step instructions please')).toBe('flow');
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
      expect(result.output).toBeDefined();
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

    it('should handle command with arguments', async () => {
      const { BashTool } = await import('../src/agent/tools/bash.js');

      const tool = new BashTool({
        allowedCommands: ['ls'],
      });

      const result = await tool.execute({ command: 'ls -la' });

      expect(result.success).toBe(true);
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
      const testFile = path.join(tempDir, 'mate-test.txt');
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
      const testFile = path.join(tempDir, 'mate-write-test.txt');

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

describe('Mode Selector', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should track user mode with default simple', async () => {
    const {
      getUserMode,
      setUserMode,
    } = await import('../src/telegram/mode-selector.js');

    // Default mode is 'simple'
    expect(getUserMode('user1')).toBe('simple');

    // Set mode to flow
    setUserMode('user1', 'flow');
    expect(getUserMode('user1')).toBe('flow');

    // Set back to simple
    setUserMode('user1', 'simple');
    expect(getUserMode('user1')).toBe('simple');
  });

  it('should check flow mode correctly', async () => {
    const {
      getUserMode,
      setUserMode,
      isFlowMode,
    } = await import('../src/telegram/mode-selector.js');

    // Default is simple, not flow
    expect(isFlowMode('user2')).toBe(false);

    // Set to flow
    setUserMode('user2', 'flow');
    expect(isFlowMode('user2')).toBe(true);

    // Set back to simple
    setUserMode('user2', 'simple');
    expect(isFlowMode('user2')).toBe(false);
  });
});
