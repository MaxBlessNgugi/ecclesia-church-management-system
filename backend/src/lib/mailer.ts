// =============================================================================
// Mailer — outbound email (nodemailer) with layered configuration
// =============================================================================
//
// PURPOSE
//   Sends transactional email (currently: password-reset codes) via a
//   configurable SMTP server. Configuration is resolved in this order:
//
//     1. DATABASE — the MailSettings singleton (id="default"), editable from
//        the first-run setup wizard and Administration. Used when enabled=true
//        and smtpHost is set. smtpPass is stored encrypted (lib/crypto.ts).
//     2. ENV VARS — SMTP_HOST / SMTP_PORT / SMTP_SECURE / SMTP_USER / SMTP_PASS
//        / MAIL_FROM in backend/.env (see .env.example).
//     3. DEV FALLBACK — when neither is configured, emails are not sent
//        anywhere but are written to backend/logs/outbox/*.txt and printed to
//        the backend console, so the reset code stays reachable locally.
//
// ERROR CONTRACT
//   sendMail NEVER throws — it resolves { sent, error } so callers (e.g. the
//   forgot-password route) can fire-and-forget without risking a 500 for the
//   user when the mail server is unreachable. Failures are logged to console.
//
// RELATED FILES
//   - backend/src/routes/auth.ts        → POST /forgot-password (the caller)
//   - backend/src/routes/admin.ts       → /mail-settings + /mail-settings/verify
//   - backend/prisma/schema.prisma      → MailSettings model
//   - backend/.env.example              → SMTP env var documentation
// =============================================================================

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { appPrisma } from './prisma.js';
import { decryptString } from './crypto.js';

/** Where dev-fallback emails are dropped (relative to the backend folder). */
const DEV_OUTBOX_DIR = path.resolve(process.cwd(), 'logs', 'outbox');

/** SMTP send timeout in milliseconds — fail fast instead of hanging requests. */
const SMTP_TIMEOUT_MS = 10_000;

/** Resolved, ready-to-use mail configuration. */
export interface MailConfig {
  mode: 'db' | 'env' | 'dev-outbox';
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  from: string;
}

/** Cached transporter — rebuilt whenever the resolved config changes. */
let cached: { key: string; transporter: Transporter } | null = null;

/**
 * Resolve the effective mail configuration from DB, then env, then dev mode.
 * Never throws — an unreadable DB row simply falls through to env/dev mode.
 */
export async function resolveMailConfig(): Promise<MailConfig> {
  // 1. DB singleton — wins when enabled with a host configured.
  try {
    const row = await appPrisma.mailSettings.findUnique({ where: { id: 'default' } });
    if (row?.enabled && row.smtpHost) {
      return {
        mode: 'db',
        host: row.smtpHost,
        port: row.smtpPort,
        secure: row.smtpSecure,
        user: row.smtpUser || undefined,
        pass: row.smtpPass ? decryptString(row.smtpPass) : undefined,
        from: row.fromAddress || 'ECCLESIA <no-reply@ecclesia.local>',
      };
    }
  } catch {
    // MailSettings table may not exist yet on un-migrated installs — fall through.
  }

  // 2. Environment variables — the classic deployment path.
  if (process.env.SMTP_HOST) {
    const port = Number(process.env.SMTP_PORT ?? 587);
    return {
      mode: 'env',
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
      user: process.env.SMTP_USER || undefined,
      pass: process.env.SMTP_PASS || undefined,
      from: process.env.MAIL_FROM || 'ECCLESIA <no-reply@ecclesia.local>',
    };
  }

  // 3. Dev fallback — write to the outbox instead of sending.
  return { mode: 'dev-outbox', from: process.env.MAIL_FROM || 'ECCLESIA <no-reply@ecclesia.local>' };
}

/**
 * Send an email. Never throws — failures are logged; callers fire-and-forget.
 *
 * With a real SMTP config (DB or env) the message is sent via SMTP; otherwise
 * it is written to backend/logs/outbox/<timestamp>-<sanitized-to>.txt and
 * printed to the backend console (dev fallback — no SMTP server needed locally).
 */
export async function sendMail(to: string, subject: string, text: string, html?: string): Promise<void> {
  const cfg = await resolveMailConfig();
  try {
    if (cfg.mode === 'dev-outbox') {
      // ------------------------------------------------------------------
      // DEV FALLBACK — no SMTP configured. Persist the message so the code
      // is easy to find locally and log it to the backend console.
      // ------------------------------------------------------------------
      const safeTo = to.replace(/[^a-zA-Z0-9._@-]/g, '_');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const file = path.join(DEV_OUTBOX_DIR, `${stamp}-${safeTo}.txt`);
      const content = [
        `To:      ${to}`,
        `From:    ${cfg.from}`,
        `Subject: ${subject}`,
        `Sent at: ${new Date().toISOString()}`,
        '', text,
      ].join('\n');
      await fs.mkdir(DEV_OUTBOX_DIR, { recursive: true });
      await fs.writeFile(file, content, 'utf8');
      console.log(`[mailer] SMTP not configured — email written to ${file}`);
      return;
    }
    // Real SMTP send.
    await getTransporter(cfg).sendMail({ from: cfg.from, to, subject, text, html });
    console.log(`[mailer] Sent "${subject}" to ${to} via ${cfg.host}:${cfg.port}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[mailer] Failed to send "${subject}" to ${to}: ${message}`);
  }
}

function getTransporter(cfg: MailConfig): Transporter {
  const key = `${cfg.host}:${cfg.port}:${cfg.secure}:${cfg.user}:${cfg.pass}`;
  if (cached?.key === key) return cached.transporter;
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass ?? '' } : undefined,
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  });
  cached = { key, transporter };
  return transporter;
}

/**
 * Email a one-time password-reset code to a user.
 *
 * @param to        - The account's email address.
 * @param code      - The plaintext 8-character reset code (hashed in the DB).
 * @param name      - The user's display name for a personal greeting.
 * @param expiresAt - When the code stops working (a Date).
 */
export async function sendPasswordResetCode(
  to: string,
  code: string,
  name: string,
  expiresAt: Date
): Promise<void> {
  const minutes = Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / 60_000));
  const subject = 'Your ECCLESIA password reset code';
  const text = [
    `Hello ${name || 'there'},`,
    '',
    `We received a request to reset the password for your ECCLESIA account.`,
    `Your one-time reset code is:`,
    '',
    `    ${code}`,
    '',
    `This code expires in ${minutes} minutes and can be used once.`,
    `Enter it on the "I have a reset code" screen together with your new password.`,
    '',
    `If you did not request a password reset, you can safely ignore this email —`,
    `your current password remains valid.`,
    '',
    '— ECCLESIA Church Management System',
  ].join('\n');
  const html = [
    `<div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1c1c">`,
    `  <h2 style="margin:0 0 12px">Password reset</h2>`,
    `  <p style="font-size:14px;line-height:1.5">Hello ${name || 'there'},</p>`,
    `  <p style="font-size:14px;line-height:1.5">We received a request to reset the password for your ECCLESIA account.`,
    `  Your one-time reset code is:</p>`,
    `  <p style="text-align:center"><span style="display:inline-block;font-size:28px;letter-spacing:6px;font-weight:bold;padding:12px 24px;background:#f4f3f3;border:1px solid #e1e3e3;border-radius:8px">${code}</span></p>`,
    `  <p style="font-size:13px;line-height:1.5;color:#444748">This code expires in <strong>${minutes} minutes</strong> and can be used once.`,
    `  Enter it on the <em>"I have a reset code"</em> screen together with your new password.</p>`,
    `  <p style="font-size:12px;color:#444748">If you did not request a password reset, you can safely ignore this email — your current password remains valid.</p>`,
    `</div>`,
  ].join('\n');
  await sendMail(to, subject, text, html);
}
