// =============================================================================
// Scheduled-broadcast dispatcher
// -----------------------------------------------------------------------------
// The Communications composer lets an operator schedule a bulk SMS/Email. This
// timer is what actually sends it: every tick it asks the communications route
// for broadcasts whose scheduledAt has passed and dispatches them through the
// same code path as "Send now" (so delivery counters, failure reasons and the
// realtime broadcast are identical).
//
// The interval is deliberately coarse (a minute): parish messaging is not
// latency-sensitive, and a coarse tick keeps the query load negligible.
// `unref()` keeps the timer from holding the process open on shutdown.
// =============================================================================
import { runDueBroadcasts } from '../routes/communications.js';
import { logger } from './logger.js';

/** How often to look for due broadcasts. */
const TICK_MS = 60_000;

/**
 * Starts the dispatcher. A failed tick is logged and then ignored — the next
 * tick retries.
 */
export function startBroadcastScheduler(): void {
  const tick = async () => {
    try {
      const results = await runDueBroadcasts();
      if (results.length) {
        logger.info(`Broadcast scheduler dispatched ${results.length} scheduled broadcast(s)`);
      }
    } catch (err) {
      logger.error('Broadcast scheduler tick failed', { error: String(err) });
    }
  };

  const timer = setInterval(() => void tick(), TICK_MS);
  timer.unref?.();
  // Run once at startup so a broadcast that came due while the server was
  // offline is not stuck waiting for the first interval.
  void tick();
}
