// =============================================================================
// SMS service — Africa's Talking integration
// -----------------------------------------------------------------------------
// sendSms() is the single entry point used by routes. It reads the SmsSettings
// singleton, lazily initialises the Africa's Talking SDK, and sends the message.
//
// Credentials are stored in the sms_settings table and are NEVER returned in
// API responses (the route masks apiKey the same way admin.ts masks M-Pesa
// credentials).
//
// Environment:
//   AT_API_KEY / AT_USERNAME — fallback env vars for quick local testing.
// =============================================================================
import AfricasTalking from 'africastalking';
import { appPrisma } from '../lib/prisma.js';

/** Sends an SMS message (or array of messages) via Africa's Talking. */
export async function sendSms(
  to: string | string[],
  message: string,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const settings = await appPrisma.smsSettings.findUnique({ where: { id: 'default' } });

  if (!settings?.enabled || !settings.apiKey) {
    throw new Error('SMS is not configured. Enable it in Administration → SMS Settings first.');
  }

  const at = AfricasTalking({
    apiKey: settings.apiKey,
    username: settings.username || process.env.AT_USERNAME || 'sandbox',
  });

  try {
    const result = await at.SMS.send({
      to: Array.isArray(to) ? to : [to],
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

/** Masks the stored API key for safe transport to the frontend. */
export function maskApiKey(value: string | null | undefined): string {
  return value ? '••••••••••••••••' : '';
}
