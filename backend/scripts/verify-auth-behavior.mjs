// Behavioral verification of the auth/session changes against the LIVE server.
// Drives the full lifecycle over real HTTP + WebSocket and asserts state:
//   login → /me → socket connect → version bump → REST 401 + socket reject →
//   change-password rotation → forgot-password → outbox → reset → re-login →
//   mail-settings round-trip. Exits non-zero on any failure.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { io } from 'socket.io-client';

const prisma = new PrismaClient();
const BASE = 'http://localhost:5000/api';
const EMAIL = 'behav@test.com';
let failures = 0;

function ok(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failures++;
}

async function api(method, p, { token, body } = {}) {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* 204 etc. */ }
  return { status: res.status, body: json };
}

function trySocketConnect(token) {
  return new Promise((resolve) => {
    const s = io('http://localhost:5000', {
      auth: token ? { token } : {},
      transports: ['websocket'],
      reconnection: false,
      timeout: 5000,
    });
    let settled = false;
    const done = (r) => { if (!settled) { settled = true; try { s.disconnect(); } catch {} resolve(r); } };
    s.on('connect', () => done({ ok: true }));
    s.on('connect_error', (e) => done({ ok: false, error: e.message }));
    setTimeout(() => done({ ok: false, error: 'timeout' }), 6000);
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  // ── 0. Seed a dedicated super admin ──────────────────────────────────────
  const passwordHash = await bcrypt.hash('BehavPass1!', 10);
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { passwordHash, role: 'super_admin', isActive: true, isDeleted: false, tokenVersion: 0, loginFailedAttempts: 0, lockedUntil: null, resetTokenHash: null, resetTokenExpires: null },
    create: { email: EMAIL, passwordHash, name: 'Behavior Verify', role: 'super_admin', isActive: true },
  });
  ok('seed user exists with tokenVersion=0', user.tokenVersion === 0);
  // Reset the mail-settings singleton so assertions start from defaults.
  await prisma.mailSettings.deleteMany();

  // ── 1. Login + /me ───────────────────────────────────────────────────────
  const login = await api('POST', '/auth/login', { body: { email: EMAIL, password: 'BehavPass1!' } });
  ok('login 200 with token', login.status === 200 && typeof login.body?.token === 'string');
  const token = login.body.token;
  const me = await api('GET', '/auth/me', { token });
  ok('/me 200 with valid token', me.status === 200 && me.body?.email === EMAIL);

  // ── 2. Socket connects with valid token ─────────────────────────────────
  const s1 = await trySocketConnect(token);
  ok('socket connects with valid token', s1.ok, s1.error ?? '');

  // ── 3. Version bump behind the token's back ─────────────────────────────
  await prisma.user.update({ where: { id: user.id }, data: { tokenVersion: { increment: 1 } } });
  const replay = await api('GET', '/auth/me', { token });
  ok('REST rejects old token after version bump (401)', replay.status === 401);
  const s2 = await trySocketConnect(token);
  ok('socket REJECTS old token after version bump', !s2.ok, `error: ${s2.error}`);
  const s3 = await trySocketConnect(null);
  ok('socket rejects missing token', !s3.ok, `error: ${s3.error}`);

  // ── 4. change-password rotation ──────────────────────────────────────────
  const relogin = await api('POST', '/auth/login', { body: { email: EMAIL, password: 'BehavPass1!' } });
  const tok2 = relogin.body.token;
  const change = await api('PUT', '/auth/change-password', { token: tok2, body: { currentPassword: 'BehavPass1!', newPassword: 'BehavPass2!' } });
  ok('change-password 200 and returns rotated token', change.status === 200 && typeof change.body?.token === 'string', `status=${change.status}`);
  const oldAfterChange = await api('GET', '/auth/me', { token: tok2 });
  ok('old token dead after change-password (401)', oldAfterChange.status === 401);
  const newTok = change.body.token;
  const meNew = await api('GET', '/auth/me', { token: newTok });
  ok('rotated token works (200)', meNew.status === 200);
  const loginOldPw = await api('POST', '/auth/login', { body: { email: EMAIL, password: 'BehavPass1!' } });
  ok('old password rejected after change', loginOldPw.status === 401);
  const loginNewPw = await api('POST', '/auth/login', { body: { email: EMAIL, password: 'BehavPass2!' } });
  ok('new password accepted', loginNewPw.status === 200);

  // ── 5. forgot-password → outbox → reset → re-login ──────────────────────
  const outboxDir = path.resolve('logs/outbox');
  fs.rmSync(outboxDir, { recursive: true, force: true });
  const forgot = await api('POST', '/auth/forgot-password', { body: { email: EMAIL } });
  ok('forgot-password 200 ok:true', forgot.status === 200 && forgot.body?.ok === true);
  await wait(2000);
  const files = fs.existsSync(outboxDir) ? fs.readdirSync(outboxDir) : [];
  const mine = files.filter((f) => f.includes('behav'));
  ok('reset email written to dev outbox', mine.length === 1, `files=${JSON.stringify(files)}`);
  let code = null;
  if (mine.length === 1) {
    const content = fs.readFileSync(path.join(outboxDir, mine[0]), 'utf8');
    code = content.match(/reset code is:\s*\n\s*([A-Za-z0-9]{8})/)?.[1] ?? null;
  }
  ok('outbox email contains 8-char code', Boolean(code), `code=${code}`);

  const reset = await api('POST', '/auth/reset-password', { body: { token: code, newPassword: 'BehavPass3!' } });
  ok('reset-password 200', reset.status === 200, `status=${reset.status} body=${JSON.stringify(reset.body)}`);
  const tok3 = loginNewPw.body.token;
  const staleAfterReset = await api('GET', '/auth/me', { token: tok3 });
  ok('pre-reset token dead after reset (401)', staleAfterReset.status === 401);
  const loginReset = await api('POST', '/auth/login', { body: { email: EMAIL, password: 'BehavPass3!' } });
  ok('login works with password set via reset code', loginReset.status === 200);

  // Anti-enumeration: unknown email answers ok but sends nothing.
  const forgotUnknown = await api('POST', '/auth/forgot-password', { body: { email: 'unknown@nowhere.test' } });
  await wait(1500);
  const filesAfter = fs.existsSync(outboxDir) ? fs.readdirSync(outboxDir) : [];
  ok('unknown email: ok response, NO outbox email', forgotUnknown.status === 200 && !filesAfter.some((f) => f.includes('unknown@nowhere')), `files=${JSON.stringify(filesAfter)}`);

  // ── 6. Mail settings live round-trip ─────────────────────────────────────
  const adminTok = loginReset.body.token;
  const get1 = await api('GET', '/admin/mail-settings', { token: adminTok });
  ok('GET mail-settings 200, password masked, mode reported', get1.status === 200 && get1.body?.hasSmtpPass === false && ['db', 'env', 'dev-outbox'].includes(get1.body?.mode), `mode=${get1.body?.mode}`);
  const put1 = await api('PUT', '/admin/mail-settings', { token: adminTok, body: { enabled: true, smtpHost: 'smtp.behav.invalid', smtpPort: 2525, smtpSecure: false, smtpUser: 'u', smtpPass: 'p@ssw0rdX', fromAddress: 'E <n@t.invalid>' } });
  ok('PUT mail-settings 200 and mode switches to db', put1.status === 200 && put1.body?.mode === 'db', `mode=${put1.body?.mode}`);
  const get2 = await api('GET', '/admin/mail-settings', { token: adminTok });
  ok('stored password masked on GET (never plaintext)', get2.body?.smtpPass === '••••••••••••••••' && get2.body?.hasSmtpPass === true);
  const verify = await api('POST', '/admin/mail-settings/verify', { token: adminTok, body: { enabled: true, smtpHost: '127.0.0.1', smtpPort: 1, smtpSecure: false, smtpUser: 'u', smtpPass: 'x', fromAddress: 'E <n@t.invalid>', to: EMAIL } });
  ok('verify against dead SMTP → clean 502', verify.status === 502 && /Verification email failed/.test(verify.body?.message ?? ''), `status=${verify.status}`);
  const put2 = await api('PUT', '/admin/mail-settings', { token: adminTok, body: { enabled: false, smtpHost: '', smtpPort: 587, smtpSecure: false, smtpUser: '', smtpPass: '••••••••••••••••', fromAddress: 'ECCLESIA <no-reply@ecclesia.local>' } });
  const get3 = await api('GET', '/admin/mail-settings', { token: adminTok });
  ok('disabled settings fall back (mode leaves db)', put2.status === 200 && get3.body?.mode !== 'db' && get3.body?.enabled === false, `mode=${get3.body?.mode}`);

  console.log(failures === 0 ? '\nALL BEHAVIORAL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
} catch (e) {
  console.error('SCRIPT ERROR:', e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
