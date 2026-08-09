// =============================================================================
// Structured JSON logger for the Ecclesia backend
// -----------------------------------------------------------------------------
// Outputs one JSON object per line to stdout, suitable for aggregation by
// external log collectors (e.g., PM2 logrotate, Fluentd, Loki). Each line
// contains: timestamp (ISO-8601), level, message, and an optional context
// object for extra metadata (userId, route, duration, etc.).
//
// Log-level gating
//   NODE_ENV=test → only error and warn are emitted (keeps test output clean)
//   otherwise     → all four levels (error, warn, info, debug) are active
//
// Usage:
//   import { logger } from './lib/logger.js';
//   logger.info('Server started', { port: 5000 });
//   logger.error('DB connection failed', { host: 'localhost', attempt: 3 });
//
// This module intentionally uses NO third-party dependencies — only Node.js
// built-ins (process.stdout.write, Date, JSON.stringify).
// =============================================================================
// Node.js built-in: process module for accessing NODE_ENV and writing to stdout
import process from 'node:process';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Ordered severity mapping so numeric comparison works for level gating.
 * Lower index = lower severity (more verbose).
 * Used to determine whether a log entry should be emitted based on the
 * configured minimum level.
 */
const LEVEL_ORDER: Record<string, number> = {
  debug: 0, // Most verbose; SQL queries, middleware tracing, cache hits
  info: 1,  // Normal lifecycle events; server start, backup completed, user login
  warn: 2,  // Degraded but non-fatal conditions; retryable failures, missing config
  error: 3, // Unrecoverable failures or critical conditions requiring attention
};

/**
 * Resolves the minimum log level from NODE_ENV.
 * In test mode, only warn and error are emitted to keep test output clean.
 * In all other environments, all four levels are active.
 *
 * @returns The minimum level label ('warn' for test, 'debug' for everything else).
 */
function resolveMinLevel(): string {
  // Suppress info and debug in test to reduce noise in CI output
  if (process.env.NODE_ENV === 'test') return 'warn';
  // All levels active in development and production
  return 'debug';
}

/**
 * Cached minimum log level so we only resolve NODE_ENV once per process lifetime.
 * This avoids repeated environment variable lookups on every log call.
 */
const MIN_LEVEL: string = resolveMinLevel();

/**
 * Serialises a structured log entry into a single-line JSON string and writes
 * it to stdout. The output is always a single line (no embedded newlines) so
 * log aggregation tools can safely split on newline boundaries.
 *
 * @param level  - The severity label (error, warn, info, debug).
 * @param message - Human-readable description of the event.
 * @param context - Optional key-value pairs attached as structured metadata.
 */
function writeLog(level: string, message: string, context?: Record<string, unknown>): void {
  // Build the log entry object with required fields
  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(), // ISO-8601 timestamp for consistent parsing
    level,                               // Severity label
    message,                             // Human-readable description
  };

  // Only include context if it's defined and non-empty (avoids empty objects in output)
  if (context !== undefined && Object.keys(context).length > 0) {
    entry.context = context;
  }

  // Serialize to compact single-line JSON and write to stdout with trailing newline.
  // Using process.stdout.write instead of console.log to avoid additional formatting.
  process.stdout.write(JSON.stringify(entry) + '\n');
}

// ---------------------------------------------------------------------------
// Public logger API
// ---------------------------------------------------------------------------

/**
 * Structured logger exposed as a singleton. Every method checks the current
 * NODE_ENV and silently no-ops when the message's severity is below the
 * configured threshold.
 *
 * @example
 *   import { logger } from './lib/logger.js';
 *   logger.info('Server started', { port: 5000 });
 *   logger.error('DB connection failed', { host: 'localhost', attempt: 3 });
 */
export const logger = {
  /**
   * Emit an error-level log entry. Errors are always logged regardless of
   * NODE_ENV — they represent unrecoverable failures or critical conditions
   * that demand immediate attention.
   *
   * @param message - Human-readable error description.
   * @param context - Optional metadata (e.g., { userId, route, stack }).
   */
  error(message: string, context?: Record<string, unknown>): void {
    // Error is always emitted regardless of MIN_LEVEL (highest severity)
    writeLog('error', message, context);
  },

  /**
   * Emit a warn-level log entry. Warnings indicate degraded but non-fatal
   * conditions (e.g., a retryable failure, a missing optional config).
   * Warn entries are also emitted in the test environment so CI can surface
   * important caveats without drowning in noise.
   *
   * @param message - Human-readable warning description.
   * @param context - Optional metadata (e.g., { attempt, maxRetries }).
   */
  warn(message: string, context?: Record<string, unknown>): void {
    // Only emit if warn severity meets or exceeds the minimum configured level
    if (LEVEL_ORDER['warn'] < LEVEL_ORDER[MIN_LEVEL]) return;
    writeLog('warn', message, context);
  },

  /**
   * Emit an info-level log entry. Info messages describe normal application
   * lifecycle events (server started, backup completed, user logged in).
   * Suppressed in the test environment.
   *
   * @param message - Human-readable informational description.
   * @param context - Optional metadata (e.g., { port, duration }).
   */
  info(message: string, context?: Record<string, unknown>): void {
    // Only emit if info severity meets or exceeds the minimum configured level
    if (LEVEL_ORDER['info'] < LEVEL_ORDER[MIN_LEVEL]) return;
    writeLog('info', message, context);
  },

  /**
   * Emit a debug-level log entry. Debug messages are highly verbose and
   * intended for local development only (SQL queries, middleware tracing,
   * cache hits). Suppressed in the test environment.
   *
   * @param message - Human-readable debug description.
   * @param context - Optional metadata (e.g., { query, durationMs }).
   */
  debug(message: string, context?: Record<string, unknown>): void {
    // Only emit if debug severity meets or exceeds the minimum configured level
    if (LEVEL_ORDER['debug'] < LEVEL_ORDER[MIN_LEVEL]) return;
    writeLog('debug', message, context);
  },
};
