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

import fs from 'node:fs/promises';
import path from 'node:path';

const sanitizeAddress = (value: string) => value.replace(/[^a-zA-Z0-9._@+,-]/g, '_');

export interface OutboxWrite {
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
export async function writeOutboxMessage(dir: string, write: OutboxWrite): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `${stamp}-${sanitizeAddress(write.to)}.txt`);
  const content = [
    `To:      ${write.to}`,
    `From:    ${write.from}`,
    ...(write.headers ?? []),
    `Sent at: ${new Date().toISOString()}`,
    `Note:    ${write.note}`,
    '',
    write.body,
  ].join('\n');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(file, content, 'utf8');
  console.log(`${write.consoleTag} Outbox — message for ${write.to} written to ${file}`);
  return file;
}
