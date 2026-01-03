import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = process.env.DATA_DIR || '/app/data';
const DB_PATH = path.join(DATA_DIR, 'conversations.db');

export interface Message {
  id: number;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

/**
 * SQLite-based conversation memory (short-term).
 * Stores recent messages for context in conversations.
 */
class ConversationDB {
  private db: Database.Database;

  constructor() {
    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    this.db = new Database(DB_PATH);
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
      CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
    `);
  }

  /**
   * Add a message to the conversation history.
   */
  addMessage(userId: string, role: 'user' | 'assistant', content: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO messages (user_id, role, content)
      VALUES (?, ?, ?)
    `);
    stmt.run(userId, role, content);
  }

  /**
   * Get the last N messages for a user.
   */
  getHistory(userId: string, limit: number = 30): Message[] {
    const stmt = this.db.prepare(`
      SELECT id, user_id as userId, role, content, created_at as createdAt
      FROM messages
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
    const rows = stmt.all(userId, limit) as Message[];
    // Reverse to get chronological order
    return rows.reverse();
  }

  /**
   * Clear all messages for a user.
   */
  clearHistory(userId: string): void {
    const stmt = this.db.prepare(`
      DELETE FROM messages WHERE user_id = ?
    `);
    stmt.run(userId);
  }

  /**
   * Get message count for a user.
   */
  getMessageCount(userId: string): number {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM messages WHERE user_id = ?
    `);
    const result = stmt.get(userId) as { count: number };
    return result.count;
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.db.close();
  }
}

// Singleton instance
let instance: ConversationDB | null = null;

export function getConversationDB(): ConversationDB {
  if (!instance) {
    instance = new ConversationDB();
  }
  return instance;
}

export function formatHistory(messages: Message[]): string {
  if (messages.length === 0) {
    return '';
  }

  return messages
    .map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
    .join('\n');
}
