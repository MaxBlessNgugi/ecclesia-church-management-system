// =============================================================================
// devOutbox — shared file-outbox mechanics for unconfigured mail/SMS channels
// -----------------------------------------------------------------------------
// The mailer (logs/outbox) and the SMS service (logs/sms-outbox) both keep a
// local record of "sent" messages when no real gateway is configured: one .txt
// per message, timestamped and address-sanitized, with a To/From header block,
// echoed to the console. This module is that one implementation.
//
// writeOutboxMessage throws on failure so channels can report the truth (a
// failed send) to callers instead of a fabricated success.
// =============================================================================

import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const sanitizeAddress = (value: string) => value.replace(/[^a-zA-Z0-9._@+,-]/g, '_');

export interface OutboxMessage {
  to: string;
  from: string;
  /** Channel-specific header lines between From: and Sent at: (e.g. Subject:). */
  headers?: string[];
  /** Message body. */
  body: string;
  /** Honesty note — e.g. "nothing was sent" — shown under the headers. */
  note: string;
  /** Console echo prefix, e.g. "[mailer]". */
  consoleTag: string;
}

/**
 * Persist one message to the outbox directory and echo the path to the
 * console. Returns the written file's path; throws if the write fails.
 */
export async function writeOutboxMessage(dir: string, message: OutboxMessage): Promise<string> {
  const sentAt = new Date().toISOString();
  const stamp = sentAt.replace(/[:.]/g, '-');
  // Random suffix so same-millisecond sends to the same address can't overwrite each other.
  const file = path.join(dir, `${stamp}-${sanitizeAddress(message.to)}-${randomBytes(4).toString('hex')}.txt`);
  const content = [
    `To:      ${message.to}`,
    `From:    ${message.from}`,
    ...(message.headers ?? []),
    `Sent at: ${sentAt}`,
    `Note:    ${message.note}`,
    '',
    message.body,
  ].join('\n');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(file, content, 'utf8');
  console.log(`${message.consoleTag} Outbox — message for ${message.to} written to ${file}`);
  return file;
}
