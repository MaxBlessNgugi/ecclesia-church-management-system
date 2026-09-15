// =============================================================================
// SMS service — Africa's Talking integration (+ dev outbox fallback)
// -----------------------------------------------------------------------------
// sendSms() is the single entry point used by routes. Delivery is resolved in
// this order:
//
//   1. DATABASE — the SmsSettings singleton (id="default"), editable via
//      /api/sms/settings. Used when enabled=true with an apiKey stored.
//   2. DEV OUTBOX — when SMS_DEV_OUTBOX=true in the environment and no real
//      gateway is configured, messages are NOT sent anywhere: each one is
//      written to backend/logs/sms-outbox/<timestamp>-<to>.txt and printed to
//      the backend console, and the send reports success. This lets birthday
//      greetings and broadcasts be demoed end-to-end without an Africa's
//      Talking account. It is an explicit opt-in so installs without the flag
//      keep the honest "SMS is not configured" failure.
//   3. Otherwise — throws 'not configured', which callers surface as a 400.
//
// Credentials are stored in the sms_settings table and are NEVER returned in
// API responses (the route masks apiKey the same way admin.ts masks M-Pesa
// credentials).
//
// Environment:
//   AT_API_KEY / AT_USERNAME — fallback env vars for quick local testing.
//   SMS_DEV_OUTBOX           — "true" enables the dev outbox (no gateway needed).
// =============================================================================
import AfricasTalking from 'africastalking';
import path from 'node:path';
import { appPrisma } from '../lib/prisma.js';
import { writeOutboxMessage } from './devOutbox.js';

/** Where dev-outbox SMS messages are dropped (relative to the backend folder). */
const DEV_SMS_OUTBOX_DIR = path.resolve(process.cwd(), 'logs', 'sms-outbox');

/**
 * Whether the dev outbox is enabled. Read per call (not cached at module
 * load) so tests and the preview server can toggle it via the environment.
 */
export function isSmsDevOutbox(): boolean {
  return ['true', '1', 'yes'].includes((process.env.SMS_DEV_OUTBOX || '').trim().toLowerCase());
}

/** Sends an SMS message (or array of messages) via Africa's Talking. */
export async function sendSms(
  to: string | string[],
  message: string,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const recipients = Array.isArray(to) ? to : [to];
  const settings = await appPrisma.smsSettings
    .findUnique({ where: { id: 'default' } })
    .catch(() => null);

  if (!settings?.enabled || !settings.apiKey) {
    if (isSmsDevOutbox()) {
      return writeToDevOutbox(recipients, message, settings);
    }
    throw new Error('SMS is not configured. Enable it in Administration → SMS Settings first.');
  }

  const at = AfricasTalking({
    apiKey: settings.apiKey,
    username: settings.username || process.env.AT_USERNAME || 'sandbox',
  });

  try {
    const result = await at.SMS.send({
      to: recipients,
      message,
      ...(settings.senderId ? { from: settings.senderId } : {}),
    }) as { SMSMessageData?: { Recipients?: Array<{ messageId?: string }> } };

    const SMSMessageData = result?.SMSMessageData;
    if (SMSMessageData?.Recipients?.length) {
      return { success: true, messageId: SMSMessageData.Recipients[0]?.messageId };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'SMS send failed' };
  }
}

/**
 * DEV OUTBOX — persist the message instead of sending it. Never throws; a
 * filesystem failure is reported as a failed send so callers record the truth.
 * The message id is the outbox filename, so an operator can match the two.
 */
async function writeToDevOutbox(
  recipients: string[],
  message: string,
  settings: { senderId: string | null; username: string | null } | null,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const file = await writeOutboxMessage(DEV_SMS_OUTBOX_DIR, {
      to: recipients.join(', '),
      from: settings?.senderId || settings?.username || process.env.AT_USERNAME || 'ECCLESIA (dev outbox)',
      body: message,
      note: 'SMS_DEV_OUTBOX is enabled — no gateway configured, nothing was sent.',
      consoleTag: '[sms]',
    });
    return { success: true, messageId: `dev-outbox-${path.basename(file, '.txt')}` };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[sms] Failed to write dev outbox message: ${error}`);
    return { success: false, error: `Dev outbox write failed: ${error}` };
  }
}

/** Masks the stored API key for safe transport to the frontend. */
export function maskApiKey(value: string | null | undefined): string {
  return value ? '••••••••••••••••' : '';
}
