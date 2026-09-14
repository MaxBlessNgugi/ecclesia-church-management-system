// =============================================================================
// SMS dev outbox — birthday greetings & broadcasts without a real gateway
// -----------------------------------------------------------------------------
// With SMS_DEV_OUTBOX=true and no Africa's Talking settings, sendSms() writes
// each message to backend/logs/sms-outbox/*.txt and reports success, so the
// full communications flow (greetings, broadcast dispatch) can be demoed
// locally. Without the flag the honest 'SMS is not configured' failure is
// preserved — the existing communications tests depend on it.
// =============================================================================
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { sendSms, isSmsDevOutbox } from '../src/lib/sms.js';

const OUTBOX_DIR = path.resolve(process.cwd(), 'logs', 'sms-outbox');

/** Files this test wrote — removed afterwards so the workspace stays clean. */
const written: string[] = [];

afterEach(async () => {
  delete process.env.SMS_DEV_OUTBOX;
  await Promise.all(written.map((f) => fs.rm(f, { force: true })));
  written.length = 0;
});

describe('SMS dev outbox', () => {
  it('keeps the honest failure when the opt-in flag is absent', async () => {
    delete process.env.SMS_DEV_OUTBOX;
    expect(isSmsDevOutbox()).toBe(false);
    await expect(sendSms('+254700000001', 'Hello')).rejects.toThrow(/not configured/i);
  });

  it('reports success and persists the message when SMS_DEV_OUTBOX=true', async () => {
    process.env.SMS_DEV_OUTBOX = 'true';
    expect(isSmsDevOutbox()).toBe(true);

    const to = '+254700000002';
    const result = await sendSms([to], 'Sunday service moves to 9am');
    expect(result.success).toBe(true);
    expect(result.messageId).toMatch(/^dev-outbox-/);
    expect(result.error).toBeUndefined();

    const files = (await fs.readdir(OUTBOX_DIR)).filter((f) => f.endsWith('.txt'));
    expect(files.length).toBeGreaterThan(0);
    const newest = files[files.length - 1];
    const file = path.join(OUTBOX_DIR, newest);
    written.push(file);

    const content = await fs.readFile(file, 'utf8');
    expect(content).toContain(to);
    expect(content).toContain('Sunday service moves to 9am');
    expect(content).toContain('nothing was sent');
  });

  it('reports a failed send instead of lying when the outbox cannot be written', async () => {
    process.env.SMS_DEV_OUTBOX = 'true';
    // Occupy the outbox path itself with a regular file — the portable way to
    // make the recursive mkdir fail (EEXIST) on Windows and POSIX alike.
    const backup = OUTBOX_DIR + '.test-backup';
    let hadDir = false;
    try {
      await fs.rm(backup, { recursive: true, force: true });
      try {
        await fs.rename(OUTBOX_DIR, backup);
        hadDir = true;
      } catch {
        // Outbox dir absent — nothing to park.
      }
      await fs.writeFile(OUTBOX_DIR, 'not a directory', 'utf8');

      const result = await sendSms('+254700000003', 'Should fail to persist');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/outbox write failed/i);
    } finally {
      await fs.rm(OUTBOX_DIR, { force: true });
      if (hadDir) await fs.rename(backup, OUTBOX_DIR);
    }
  });
});
