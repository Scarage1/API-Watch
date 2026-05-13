/**
 * IndexedDB persistence layer for API-Watch.
 *
 * Replaces localStorage for large datasets (history, collections, cache).
 * Uses the `idb` library for a clean Promise-based API.
 *
 * Schema:
 *   - history: Request history entries (indexed by timestamp, method)
 *   - collections: Saved API collections
 *   - cache: General-purpose key-value cache
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

// ── Schema ───────────────────────────────────────────────────
interface ApiWatchDB extends DBSchema {
  history: {
    key: string;
    value: {
      id: string;
      request_method: string;
      request_url: string;
      request_headers: Record<string, string>;
      request_body: string | null;
      success: boolean;
      status_code: number | null;
      response_time: number;
      response_size: number;
      response_body: string | null;
      response_headers: Record<string, string>;
      error: string | null;
      error_type: string | null;
      retry_count: number;
      timestamp: string;
    };
    indexes: {
      'by-timestamp': string;
      'by-method': string;
      'by-status': number;
      'by-url': string;
    };
  };
  collections: {
    key: string;
    value: {
      id: string;
      name: string;
      description: string;
      requests: unknown[];
      folders: unknown[];
      createdAt: string;
      updatedAt: string;
    };
    indexes: {
      'by-name': string;
      'by-updated': string;
    };
  };
  cache: {
    key: string;
    value: {
      key: string;
      data: unknown;
      expiresAt: number; // Unix ms
    };
  };
}

const DB_NAME = 'apiwatch';
const DB_VERSION = 1;

// ── Database instance (singleton) ────────────────────────────
let dbPromise: Promise<IDBPDatabase<ApiWatchDB>> | null = null;

function getDB(): Promise<IDBPDatabase<ApiWatchDB>> {
  if (!dbPromise) {
    dbPromise = openDB<ApiWatchDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // History store
        if (!db.objectStoreNames.contains('history')) {
          const historyStore = db.createObjectStore('history', { keyPath: 'id' });
          historyStore.createIndex('by-timestamp', 'timestamp');
          historyStore.createIndex('by-method', 'request_method');
          historyStore.createIndex('by-status', 'status_code');
          historyStore.createIndex('by-url', 'request_url');
        }

        // Collections store
        if (!db.objectStoreNames.contains('collections')) {
          const collectionStore = db.createObjectStore('collections', { keyPath: 'id' });
          collectionStore.createIndex('by-name', 'name');
          collectionStore.createIndex('by-updated', 'updatedAt');
        }

        // Cache store
        if (!db.objectStoreNames.contains('cache')) {
          db.createObjectStore('cache', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

// ── History API ──────────────────────────────────────────────
export const historyDB = {
  async add(entry: ApiWatchDB['history']['value']): Promise<void> {
    const db = await getDB();
    await db.put('history', entry);
  },

  async addBatch(entries: ApiWatchDB['history']['value'][]): Promise<void> {
    const db = await getDB();
    const tx = db.transaction('history', 'readwrite');
    await Promise.all([
      ...entries.map((e) => tx.store.put(e)),
      tx.done,
    ]);
  },

  async getAll(limit = 100, offset = 0): Promise<ApiWatchDB['history']['value'][]> {
    const db = await getDB();
    const all = await db.getAllFromIndex('history', 'by-timestamp');
    // Reverse for newest-first, then paginate
    return all.reverse().slice(offset, offset + limit);
  },

  async getByMethod(method: string, limit = 50): Promise<ApiWatchDB['history']['value'][]> {
    const db = await getDB();
    const results = await db.getAllFromIndex('history', 'by-method', method);
    return results.reverse().slice(0, limit);
  },

  async search(query: string, limit = 50): Promise<ApiWatchDB['history']['value'][]> {
    const db = await getDB();
    const all = await db.getAll('history');
    const lowerQuery = query.toLowerCase();
    return all
      .filter((e) =>
        e.request_url.toLowerCase().includes(lowerQuery) ||
        e.request_method.toLowerCase().includes(lowerQuery)
      )
      .reverse()
      .slice(0, limit);
  },

  async count(): Promise<number> {
    const db = await getDB();
    return db.count('history');
  },

  async delete(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('history', id);
  },

  async clear(): Promise<void> {
    const db = await getDB();
    await db.clear('history');
  },

  /** Cursor-based pagination for large datasets */
  async getCursor(
    cursor: string | null,
    limit = 50,
    direction: 'prev' | 'next' = 'prev'
  ): Promise<{ items: ApiWatchDB['history']['value'][]; nextCursor: string | null }> {
    const db = await getDB();
    const tx = db.transaction('history', 'readonly');
    const index = tx.store.index('by-timestamp');
    
    const items: ApiWatchDB['history']['value'][] = [];
    let idbCursor = await index.openCursor(
      cursor ? IDBKeyRange.upperBound(cursor, true) : null,
      direction
    );

    while (idbCursor && items.length < limit) {
      items.push(idbCursor.value);
      idbCursor = await idbCursor.continue();
    }

    const nextCursor = idbCursor ? (idbCursor.value.timestamp as string) : null;
    return { items, nextCursor };
  },
};

// ── Cache API ────────────────────────────────────────────────
export const cacheDB = {
  async get<T>(key: string): Promise<T | null> {
    const db = await getDB();
    const entry = await db.get('cache', key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      await db.delete('cache', key);
      return null;
    }
    return entry.data as T;
  },

  async set(key: string, data: unknown, ttlMs = 3600_000): Promise<void> {
    const db = await getDB();
    await db.put('cache', {
      key,
      data,
      expiresAt: Date.now() + ttlMs,
    });
  },

  async delete(key: string): Promise<void> {
    const db = await getDB();
    await db.delete('cache', key);
  },

  async clear(): Promise<void> {
    const db = await getDB();
    await db.clear('cache');
  },
};

// ── Migration helper (localStorage → IndexedDB) ─────────────
export async function migrateFromLocalStorage(): Promise<{ migrated: number }> {
  const MIGRATED_KEY = 'apiwatch_idb_migrated';
  if (localStorage.getItem(MIGRATED_KEY) === 'true') {
    return { migrated: 0 };
  }

  let migrated = 0;

  // Migrate history
  const historyRaw = localStorage.getItem('apiwatch-history');
  if (historyRaw) {
    try {
      const entries = JSON.parse(historyRaw);
      if (Array.isArray(entries) && entries.length > 0) {
        await historyDB.addBatch(
          entries.map((e: Record<string, unknown>, i: number) => ({
            id: (e.id as string) || `migrated-${i}-${Date.now()}`,
            request_method: (e.request_method as string) || 'GET',
            request_url: (e.request_url as string) || '',
            request_headers: (e.request_headers as Record<string, string>) || {},
            request_body: (e.request_body as string) || null,
            success: (e.success as boolean) ?? false,
            status_code: (e.status_code as number) || null,
            response_time: (e.response_time as number) || 0,
            response_size: (e.response_size as number) || 0,
            response_body: (e.response_body as string) || null,
            response_headers: (e.response_headers as Record<string, string>) || {},
            error: (e.error as string) || null,
            error_type: (e.error_type as string) || null,
            retry_count: (e.retry_count as number) || 0,
            timestamp: (e.timestamp as string) || new Date().toISOString(),
          }))
        );
        migrated = entries.length;
      }
    } catch {
      console.warn('[idb] Failed to migrate history from localStorage');
    }
  }

  localStorage.setItem(MIGRATED_KEY, 'true');
  return { migrated };
}
