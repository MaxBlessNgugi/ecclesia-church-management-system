// =============================================================================
// Ecclesia CMS — Dexie (IndexedDB) Database + Offline Write Queue
// =============================================================================
//
// PURPOSE
//   Provides a persistent local database for offline-first operation:
//   1. Offline queue: every mutation (create/update/delete) is staged here
//      when the network is unavailable. Items sync automatically when the
//      backend becomes reachable again.
//   2. Data cache: read-only snapshots of critical reference data (christians,
//      contributions, ledgers, etc.) so dropdowns and searches work offline.
//
// ARCHITECTURE
//   ┌──────────────────────────────────────────────────────────────────────────┐
//   │ Dexie DB ("ecclesia-offline")                                           │
//   │   ├── queue        — Pending mutations (entity, payload, status)         │
//   │   ├── cache        — Cached API snapshots keyed by resource path        │
//   │   └── meta         — App metadata (last sync timestamp, etc.)           │
//   └──────────────────────────────────────────────────────────────────────────┘
//
// QUEUE ITEM SHAPE
//   {
//     id:        string (client-generated UUID)
//     entity:    string (e.g. "christian", "contribution", "deposit", "expense")
//     operation: "create" | "update" | "delete"
//     endpoint:  string (e.g. "/christians", "/contributions")
//     method:    "POST" | "PATCH" | "PUT" | "DELETE"
//     payload:   Record<string, unknown>  (the request body)
//     status:    "pending" | "syncing" | "failed"
//     retryCount: number
//     createdAt: string (ISO timestamp)
//     updatedAt: string (ISO timestamp)
//     error?:    string (last sync error message)
//   }
//
// RELATED FILES
//   - src/services/sync.ts        → Background sync processor
//   - src/context/OfflineContext.tsx → React context for online/offline state
//   - src/services/api.ts         → Updated to queue mutations when offline
// =============================================================================
import Dexie, { type EntityTable } from 'dexie';
import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// Queue item type — represents a single pending mutation
// ---------------------------------------------------------------------------

export interface QueueItem {
  id: string;
  entity: string;
  operation: 'create' | 'update' | 'delete';
  endpoint: string;
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  payload: Record<string, unknown>;
  status: 'pending' | 'syncing' | 'failed';
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  error?: string;
  clientId?: string;
}

// ---------------------------------------------------------------------------
// Cache item type — stores API response snapshots for offline reads
// ---------------------------------------------------------------------------

export interface CacheItem {
  key: string;
  data: unknown;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Meta item type — app-level metadata
// ---------------------------------------------------------------------------

export interface MetaItem {
  key: string;
  value: unknown;
}

// ---------------------------------------------------------------------------
// Dexie database definition
// ---------------------------------------------------------------------------

class EcclesiaDB extends Dexie {
  queue!: EntityTable<QueueItem, 'id'>;
  cache!: EntityTable<CacheItem, 'key'>;
  meta!: EntityTable<MetaItem, 'key'>;

  constructor() {
    super('ecclesia-offline');
    this.version(1).stores({
      queue: 'id, entity, status, createdAt',
      cache: 'key, timestamp',
      meta: 'key',
    });
  }
}

export const db = new EcclesiaDB();

// ---------------------------------------------------------------------------
// Queue helpers
// ---------------------------------------------------------------------------

/**
 * Add a mutation to the offline queue.
 * Generates a client-side UUID so the backend can deduplicate on replay.
 */
export async function enqueue(item: Omit<QueueItem, 'id' | 'status' | 'retryCount' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const id = uuidv4();
  const now = new Date().toISOString();
  await db.queue.add({
    ...item,
    id,
    status: 'pending',
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

/**
 * Get all pending (unsynced) queue items.
 */
export async function getPendingItems(): Promise<QueueItem[]> {
  return db.queue.where('status').equals('pending').toArray();
}

/**
 * Get all failed queue items.
 */
export async function getFailedItems(): Promise<QueueItem[]> {
  return db.queue.where('status').equals('failed').toArray();
}

/**
 * Count pending queue items.
 */
export async function getPendingCount(): Promise<number> {
  return db.queue.where('status').equals('pending').count();
}

/**
 * Mark a queue item as syncing (in-progress).
 */
export async function markSyncing(id: string): Promise<void> {
  await db.queue.update(id, { status: 'syncing', updatedAt: new Date().toISOString() });
}

/**
 * Mark a queue item as synced (remove from queue).
 */
export async function markSynced(id: string): Promise<void> {
  await db.queue.delete(id);
}

/**
 * Mark a queue item as failed with an error message.
 */
export async function markFailed(id: string, error: string): Promise<void> {
  await db.queue.update(id, {
    status: 'failed',
    error,
    retryCount: (await db.queue.get(id))?.retryCount ?? 0 + 1,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Reset a failed item back to pending for retry.
 */
export async function retryItem(id: string): Promise<void> {
  await db.queue.update(id, {
    status: 'pending',
    error: undefined,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Clear the entire queue (use with caution).
 */
export async function clearQueue(): Promise<void> {
  await db.queue.clear();
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

/**
 * Store a cached API response with a timestamp.
 */
export async function setCache(key: string, data: unknown): Promise<void> {
  await db.cache.put({ key, data, timestamp: new Date().toISOString() });
}

/**
 * Retrieve a cached API response. Returns null if not found.
 */
export async function getCache<T = unknown>(key: string): Promise<T | null> {
  const item = await db.cache.get(key);
  return item ? (item.data as T) : null;
}

/**
 * Get the timestamp of a cached item.
 */
export async function getCacheTimestamp(key: string): Promise<string | null> {
  const item = await db.cache.get(key);
  return item?.timestamp ?? null;
}

/**
 * Remove a cached item.
 */
export async function clearCache(key: string): Promise<void> {
  await db.cache.delete(key);
}

// ---------------------------------------------------------------------------
// Meta helpers
// ---------------------------------------------------------------------------

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}

export async function getMeta<T = unknown>(key: string): Promise<T | null> {
  const item = await db.meta.get(key);
  return item ? (item.value as T) : null;
}
