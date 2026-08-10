// =============================================================================
// Ecclesia CMS — Background Sync Service
// =============================================================================
//
// PURPOSE
//   Processes the offline write queue when the backend becomes reachable.
//   Runs as a singleton in the browser main thread (not a service worker)
//   and is triggered by the OfflineContext health checks.
//
// SYNC STRATEGY
//   1. Each health-check cycle, if status === 'online' and queue has items,
//      start processing.
//   2. Items are replayed in FIFO order (by createdAt).
//   3. Each item is sent to the backend via the original HTTP method.
//   4. On success → delete from queue. On failure → mark as failed.
//   5. The OfflineContext flips the UI to "Syncing" while the batch runs.
//
// CONFLICT HANDLING
//   First version uses "last write wins" — if the backend rejects the
//   replay (e.g. 409 Conflict), the item is marked failed and the user
//   is notified. Manual retry is available from the queue UI.
//
// RELATED FILES
//   - src/lib/db.ts              → Dexie queue operations
//   - src/context/OfflineContext.tsx → Triggers sync on connectivity change
//   - src/services/api.ts        → Enqueues mutations when offline
// =============================================================================
import { getPendingItems, markSynced, markFailed } from '../lib/db';
import type { QueueItem } from '../lib/db';

const BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '/api';

let isRunning = false;

/**
 * Get the stored JWT token for replaying authenticated requests.
 */
function getToken(): string | null {
  return localStorage.getItem('ecclesia_token') ?? sessionStorage.getItem('ecclesia_token');
}

/**
 * Replay a single queue item against the backend.
 */
async function replayItem(item: QueueItem): Promise<void> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const init: RequestInit = {
    method: item.method,
    headers,
  };

  // DELETE and some PATCH calls may not have a body
  if (item.method !== 'DELETE' && item.payload && Object.keys(item.payload).length > 0) {
    init.body = JSON.stringify(item.payload);
  }

  const url = `${BASE_URL}${item.endpoint}`;
  const res = await fetch(url, init);

  if (!res.ok) {
    let message = `Sync failed (${res.status})`;
    try {
      const body = await res.json();
      if (body && typeof body.error === 'string') message = body.error;
    } catch {
      // non-JSON error
    }
    throw new Error(message);
  }
}

/**
 * Process all pending queue items.
 * Returns the count of successfully synced items.
 */
export async function processQueue(
  onSyncStart?: () => void,
  onSyncEnd?: (syncedCount: number, failedCount: number) => void,
  onItemSynced?: (item: QueueItem) => void
): Promise<{ synced: number; failed: number }> {
  if (isRunning) return { synced: 0, failed: 0 };
  isRunning = true;
  onSyncStart?.();

  let synced = 0;
  let failed = 0;

  try {
    const items = await getPendingItems();

    for (const item of items) {
      try {
        await replayItem(item);
        await markSynced(item.id);
        synced++;
        onItemSynced?.(item);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        await markFailed(item.id, errorMsg);
        failed++;
        console.warn(`[Sync] Failed to sync item ${item.id}:`, errorMsg);
      }
    }
  } finally {
    isRunning = false;
    onSyncEnd?.(synced, failed);
  }

  return { synced, failed };
}


