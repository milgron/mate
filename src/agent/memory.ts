export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface ConversationMemoryConfig {
  maxMessages?: number;
}

/**
 * Manages conversation history per user.
 */
export class ConversationMemory {
  private readonly conversations: Map<string, Message[]> = new Map();
  private readonly maxMessages: number;

  constructor(config: ConversationMemoryConfig = {}) {
    this.maxMessages = config.maxMessages ?? 100;
  }

  /**
   * Adds a message to a user's conversation history.
   */
  addMessage(userId: string, message: Message): void {
    let messages = this.conversations.get(userId);

    if (!messages) {
      messages = [];
      this.conversations.set(userId, messages);
    }

    messages.push(message);

    // Trim if exceeds max
    if (messages.length > this.maxMessages) {
      messages.shift();
    }
  }

  /**
   * Gets all messages for a user.
   */
  getMessages(userId: string): Message[] {
    return this.conversations.get(userId) ?? [];
  }

  /**
   * Clears conversation history for a user.
   */
  clear(userId: string): void {
    this.conversations.delete(userId);
  }

  /**
   * Clears all conversation history.
   */
  clearAll(): void {
    this.conversations.clear();
  }
}
