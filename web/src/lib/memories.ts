import * as lancedb from '@lancedb/lancedb';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'semantic-memory');

export type MemoryType = 'fact' | 'preference' | 'note';

export interface Memory {
  id: string;
  user_id: string;
  type: MemoryType;
  key: string;
  content: string;
  vector: number[];
  importance: number;
  created_at: number;
  last_accessed: number;
}

let db: lancedb.Connection | null = null;
let table: lancedb.Table | null = null;

async function connect(): Promise<lancedb.Table> {
  if (table) return table;

  db = await lancedb.connect(DB_PATH);
  const tables = await db.tableNames();

  if (tables.includes('memories')) {
    table = await db.openTable('memories');
  } else {
    throw new Error('Memories table not found. Has the bot been started?');
  }

  return table;
}

export async function getAllMemories(userId?: string): Promise<Memory[]> {
  const tbl = await connect();

  let results;
  if (userId) {
    results = await tbl
      .query()
      .where(`user_id = '${userId}'`)
      .toArray();
  } else {
    results = await tbl.query().toArray();
  }

  // Filter out init record and cast
  return (results as Memory[]).filter(m => m.id !== '__init__');
}

export async function searchMemories(userId: string, query: string, limit = 10): Promise<Memory[]> {
  const tbl = await connect();

  // For now, just filter by key/content containing the query (simple search)
  // TODO: Add vector search when embeddings are available in web
  const all = await getAllMemories(userId);

  const queryLower = query.toLowerCase();
  return all.filter(m =>
    m.key.toLowerCase().includes(queryLower) ||
    m.content.toLowerCase().includes(queryLower)
  ).slice(0, limit);
}

export async function deleteMemory(memoryId: string): Promise<boolean> {
  const tbl = await connect();

  try {
    await tbl.delete(`id = '${memoryId}'`);
    return true;
  } catch {
    return false;
  }
}

export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return new Date(timestamp).toLocaleDateString();
}

export function filterByTime(memories: Memory[], filter: string): Memory[] {
  const now = Date.now();
  const dayMs = 86400000;

  switch (filter) {
    case 'today':
      const todayStart = new Date().setHours(0, 0, 0, 0);
      return memories.filter(m => m.created_at >= todayStart);
    case 'week':
      return memories.filter(m => m.created_at >= now - 7 * dayMs);
    case 'month':
      return memories.filter(m => m.created_at >= now - 30 * dayMs);
    default:
      return memories;
  }
}
