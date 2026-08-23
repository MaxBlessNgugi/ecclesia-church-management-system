// =============================================================================
// useRealtime — React hook for subscribing to Socket.IO data-change events
// =============================================================================
//
// PURPOSE
//   Provides a clean way for components to subscribe to real-time data changes
//   for a specific resource. When any user creates, updates, or deletes a
//   record, the backend broadcasts a 'data:change' event via Socket.IO. This
//   hook filters those events by resource name and invokes a callback.
//
// USAGE
//   useRealtime('christians', ({ action, data }) => {
//     if (action === 'created') setChristians(prev => [data, ...prev]);
//     if (action === 'updated') setChristians(prev => prev.map(c => c.id === data.id ? data : c));
//     if (action === 'deleted') setChristians(prev => prev.filter(c => c.id !== data.id));
//   });
//
// EVENT CONTRACT (from backend)
//   { resource: string, action: 'created'|'updated'|'deleted', data: any, timestamp: string }
//
// RESOURCE NAMES
//   christians, contributions, transfers, billed-items, deaths,
//   deposits, creditors, debtors, expenses,
//   ledgers, ledger-movements,
//   inventory-items, deliveries, sales, stock-takes, stock-issues,
//   employees, payrolls, leaves, recruitments, recruitment-applicants,
//   users, settings
//
// RELATED FILES
//   - src/context/SocketContext.tsx → Provides the socket instance
//   - backend/src/lib/events.ts    → emitChange() broadcasts events
// =============================================================================
import { useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext';

interface DataChangePayload {
  resource: string;
  action: 'created' | 'updated' | 'deleted';
  data: any;
  timestamp: string;
}

/**
 * Subscribes to real-time data-change events for a specific resource.
 *
 * @param resource - The resource name to filter (e.g. 'christians', 'deposits')
 * @param onChange - Callback invoked when a matching event is received
 */
export function useRealtime(
  resource: string,
  onChange: (payload: { action: string; data: any }) => void
): void {
  const { socket } = useSocket();
  const onChangeRef = useRef(onChange);

  // Keep the callback reference fresh without re-registering the listener
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!socket) return;

    const handler = (payload: DataChangePayload) => {
      if (payload.resource === resource) {
        onChangeRef.current({ action: payload.action, data: payload.data });
      }
    };

    socket.on('data:change', handler);
    return () => {
      socket.off('data:change', handler);
    };
  }, [socket, resource]);
}
