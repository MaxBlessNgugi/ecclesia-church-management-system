// =============================================================================
// Real-time event broadcaster — emitChange() for route handlers
// =============================================================================
//
// PURPOSE
//   Provides a simple function that every mutation route calls after a
//   successful create/update/delete. It broadcasts a 'data:change' event
//   via Socket.IO so all connected clients update their UI in real time.
//
// USAGE (in any route handler)
//   import { emitChange } from '../lib/events.js';
//
//   // After a successful create:
//   emitChange('christians', 'created', createdRecord);
//
//   // After a successful update:
//   emitChange('christians', 'updated', updatedRecord);
//
//   // After a soft-delete:
//   emitChange('christians', 'deleted', { id: recordId });
//
// EVENT CONTRACT (server → client via Socket.IO)
//   Event name: 'data:change'
//   Payload: { resource: string, action: string, data: any, timestamp: string }
//
// RESOURCE NAMES (standardized across frontend/backend)
//   christians, contributions, transfers, billed-items, deaths,
//   deposits, creditors, debtors, expenses,
//   ledgers, ledger-movements,
//   inventory-items, deliveries, sales, stock-takes, stock-issues,
//   employees, payrolls, leaves, recruitments, recruitment-applicants,
//   users, settings
//
// RELATED FILES
//   - backend/src/lib/socket.ts → getIO() returns the Socket.IO server
//   - src/hooks/useRealtime.ts  → Frontend listener for 'data:change'
// =============================================================================
import { getIO } from './socket.js';

/**
 * Broadcasts a data-change event to all connected Socket.IO clients.
 *
 * @param resource - The resource name (e.g. 'christians', 'deposits')
 * @param action   - The action performed: 'created' | 'updated' | 'deleted'
 * @param data     - The record data (full record for created/updated, { id } for deleted)
 */
export function emitChange(resource: string, action: 'created' | 'updated' | 'deleted', data: any): void {
  try {
    const io = getIO();
    io.emit('data:change', {
      resource,
      action,
      data,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Socket.IO may not be initialized yet during startup, or there are no
    // connected clients. Silently ignore — the HTTP response still succeeds.
  }
}
