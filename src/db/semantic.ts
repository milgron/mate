import * as lancedb from '@lancedb/lancedb';
import { embed, getEmbeddingDimension } from '../services/embeddings.js';
import { logger } from '../utils/logger.js';

/**
 * Memory types for categorization.
 */
export type MemoryType = 'fact' | 'preference' | 'note';

/**
 * Memory record structure stored in LanceDB.
 * Index signature required for LanceDB compatibility.
 */
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
  [key: string]: string | number | number[] | MemoryType | undefined;
}

/**
 * Search result with similarity score.
 */
export interface MemorySearchResult extends Memory {
  _distance?: number;
}

/**
 * Semantic memory database using LanceDB for vector storage.
 * Provides efficient similarity search for user memories.
 */
class SemanticMemoryDB {
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private initialized = false;

  /**
   * Connect to the LanceDB database and initialize the memories table.
   */
  async connect(): Promise<void> {
    if (this.initialized) return;

    const dataDir = process.env.DATA_DIR || './data';
    const dbPath = `${dataDir}/semantic-memory`;

    logger.info('Connecting to semantic memory database', { path: dbPath });

    this.db = await lancedb.connect(dbPath);

    // Try to open existing table or create new one
    const tables = await this.db.tableNames();

    if (tables.includes('memories')) {
      this.table = await this.db.openTable('memories');
      logger.info('Opened existing memories table');
    } else {
      // Create table with initial dummy record (LanceDB requires at least one record)
      const dimension = getEmbeddingDimension();
      const initRecord: Memory = {
        id: '__init__',
        user_id: '__system__',
        type: 'fact',
        key: '__init__',
        content: '__init__',
        vector: new Array(dimension).fill(0),
        importance: 0,
        created_at: Date.now(),
        last_accessed: Date.now(),
      };

      this.table = await this.db.createTable('memories', [initRecord]);

      // Create index on user_id for efficient filtering
      await this.table.createIndex('user_id');

      logger.info('Created new memories table with index');
    }

    this.initialized = true;
  }

  /**
   * Store a memory in the database.
   * If a memory with the same key exists, it will be updated.
   */
  async store(
    userId: string,
    key: string,
    content: string,
    type: MemoryType = 'fact',
    importance = 0.7
  ): Promise<void> {
    if (!this.table) throw new Error('Database not connected');

    const startTime = Date.now();

    // Generate embedding for the key-value pair
    const vector = await embed(`${key}: ${content}`);

    const memory: Memory = {
      id: `${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      user_id: userId,
      type,
      key,
      content,
      vector,
      importance,
      created_at: Date.now(),
      last_accessed: Date.now(),
    };

    // Check for existing memory with same key and delete it
    const existing = await this.findByKey(userId, key);
    if (existing) {
      await this.table.delete(`id = '${existing.id}'`);
      logger.debug('Replaced existing memory', { userId, key });
    }

    await this.table.add([memory]);

    const storeTime = Date.now() - startTime;
    logger.info('Stored memory', {
      userId,
      key,
      type,
      storeTimeMs: storeTime,
    });
  }

  /**
   * Search memories using semantic similarity.
   * Returns the most relevant memories for the query.
   */
  async search(
    userId: string,
    query: string,
    limit = 5,
    minScore = 0.3
  ): Promise<MemorySearchResult[]> {
    if (!this.table) throw new Error('Database not connected');

    const startTime = Date.now();

    const vector = await embed(query);

    const results = await this.table
      .search(vector)
      .where(`user_id = '${userId}'`)
      .limit(limit)
      .toArray();

    // Filter by minimum similarity score (lower distance = higher similarity)
    // Distance is typically 0-2 for normalized vectors (0 = identical, 2 = opposite)
    const filtered = results.filter((r: MemorySearchResult) => {
      const distance = r._distance ?? 2;
      return distance < (2 - minScore * 2); // Convert minScore to distance threshold
    });

    const searchTime = Date.now() - startTime;
    logger.debug('Searched memories', {
      userId,
      query: query.slice(0, 50),
      found: filtered.length,
      searchTimeMs: searchTime,
    });

    return filtered as MemorySearchResult[];
  }

  /**
   * Find a specific memory by key (exact match).
   */
  async findByKey(userId: string, key: string): Promise<Memory | null> {
    if (!this.table) throw new Error('Database not connected');

    try {
      // Use query for exact key match
      const results = await this.table
        .query()
        .where(`user_id = '${userId}' AND key = '${key}'`)
        .limit(1)
        .toArray();

      return (results[0] as Memory) || null;
    } catch {
      // If query fails, fall back to vector search
      const vector = await embed(key);
      const results = await this.table
        .search(vector)
        .where(`user_id = '${userId}'`)
        .limit(10)
        .toArray();

      // Find exact key match in results
      const match = results.find((r: Memory) => r.key.toLowerCase() === key.toLowerCase());
      return (match as Memory) || null;
    }
  }

  /**
   * Get all memories for a user.
   * Useful for building the system prompt context.
   */
  async getAllForUser(userId: string): Promise<Memory[]> {
    if (!this.table) throw new Error('Database not connected');

    const results = await this.table
      .query()
      .where(`user_id = '${userId}'`)
      .toArray();

    // Filter out init record
    return (results as Memory[]).filter(m => m.id !== '__init__');
  }

  /**
   * Delete a memory by key.
   */
  async delete(userId: string, key: string): Promise<boolean> {
    if (!this.table) throw new Error('Database not connected');

    const existing = await this.findByKey(userId, key);
    if (!existing) return false;

    await this.table.delete(`id = '${existing.id}'`);
    logger.info('Deleted memory', { userId, key });
    return true;
  }

  /**
   * Delete all memories for a user.
   */
  async deleteAllForUser(userId: string): Promise<number> {
    if (!this.table) throw new Error('Database not connected');

    const memories = await this.getAllForUser(userId);
    if (memories.length === 0) return 0;

    for (const memory of memories) {
      await this.table.delete(`id = '${memory.id}'`);
    }

    logger.info('Deleted all memories for user', { userId, count: memories.length });
    return memories.length;
  }

  /**
   * Update the last_accessed timestamp for a memory.
   */
  async touch(memoryId: string): Promise<void> {
    if (!this.table) throw new Error('Database not connected');

    await this.table.update({
      where: `id = '${memoryId}'`,
      values: { last_accessed: Date.now() },
    });
  }

  /**
   * Get memory count for a user.
   */
  async countForUser(userId: string): Promise<number> {
    const memories = await this.getAllForUser(userId);
    return memories.length;
  }
}

// Singleton instance
let instance: SemanticMemoryDB | null = null;

/**
 * Get the semantic memory database instance.
 * Initializes the connection if not already connected.
 */
export async function getSemanticDB(): Promise<SemanticMemoryDB> {
  if (!instance) {
    instance = new SemanticMemoryDB();
    await instance.connect();
  }
  return instance;
}

/**
 * Check if the semantic database is initialized.
 */
export function isSemanticDBInitialized(): boolean {
  return instance !== null && instance['initialized'];
}
