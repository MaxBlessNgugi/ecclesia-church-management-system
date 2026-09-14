// =============================================================================
// Communications routes — mounted at /api/communications
// -----------------------------------------------------------------------------
//   Announcements   /announcements             CRUD + pin/priority/schedule
//   Broadcasts      /broadcasts                list/create/delete + /:id/send
//   Events          /events                    list/create/delete + /:id/rsvps
//   Prayer requests /prayer-requests           CRUD + /:id/pray (prayer counter)
//   Celebrations    /celebrations              Birthdays, anniversaries, greetings
//
// DESIGN NOTES
//   - Every row is soft-deleted through lib/audit.ts (restorable from Trash).
//   - Announcement status is DERIVED on read from publishAt/expiresAt so a
//     scheduled post flips to Active without a background job.
//   - Broadcast counters record the real gateway result; Email open/click rates
//     come from the public tracking pixel and redirect below.
//   - Prayer-request privacy is enforced on read: callers without edit rights
//     on this panel only ever receive 'Public' requests.
// =============================================================================
import { Router } from 'express';
import { z } from 'zod';
import { appPrisma, prisma } from '../lib/prisma.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { requireModule, loadPermissions } from '../middleware/perms.js';
import { AppError } from '../middleware/errorHandler.js';
import { emitChange } from '../lib/events.js';
import { softDelete, resolveActor } from '../lib/audit.js';
import { sendSms } from '../lib/sms.js';
import { sendMail } from '../lib/mailer.js';

const router = Router();

// ── Public email tracking ───────────────────────────────────────────────────
// Mail clients fetch these unauthenticated, so they live in their own router
// mounted BEFORE the '/api' root routers — those call requireAuth for every
// path that reaches them, which would answer these with 401.
export const communicationsTrackingRouter = Router();

/** 1×1 transparent GIF returned by the open pixel. */
const TRACKING_PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

/**
 * Accepts only absolute http(s) URLs as click-through targets. Everything else
 * (javascript:, data:, relative paths) is refused so this endpoint cannot be
 * used as an open redirector or an XSS vector.
 */
export function safeRedirectTarget(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** GET /track/open/:recipientId — records the first open, always returns the pixel. */
communicationsTrackingRouter.get('/track/open/:recipientId', async (req, res) => {
  try {
    const recipient = await prisma.broadcastRecipient.findUnique({
      where: { id: req.params.recipientId },
    });
    if (recipient && !recipient.openedAt) {
      await prisma.broadcastRecipient.update({
        where: { id: recipient.id },
        data: { openedAt: new Date() },
      });
      await prisma.broadcast.update({
        where: { id: recipient.broadcastId },
        data: { openCount: { increment: 1 } },
      });
    }
  } catch {
    // A failed count must never break the image for the recipient.
  }
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.type('gif').send(TRACKING_PIXEL);
});

/** GET /track/click/:recipientId?u=<url> — records the click, then redirects. */
communicationsTrackingRouter.get('/track/click/:recipientId', async (req, res) => {
  const target = safeRedirectTarget(req.query.u);
  if (!target) {
    res.status(400).json({ success: false, message: 'Invalid redirect target' });
    return;
  }
  try {
    const recipient = await prisma.broadcastRecipient.findUnique({
      where: { id: req.params.recipientId },
    });
    if (recipient && !recipient.clickedAt) {
      const now = new Date();
      await prisma.broadcastRecipient.update({
        where: { id: recipient.id },
        data: { clickedAt: now, openedAt: recipient.openedAt ?? now },
      });
      // A click implies an open even when the pixel was blocked by the client.
      await prisma.broadcast.update({
        where: { id: recipient.broadcastId },
        data: {
          clickCount: { increment: 1 },
          ...(recipient.openedAt ? {} : { openCount: { increment: 1 } }),
        },
      });
    }
  } catch {
    // Still redirect — the reader's click matters more than our analytics.
  }
  res.redirect(302, target);
});

router.use(requireAuth);
router.use(requireModule('communications'));

// ── Shared helpers ─────────────────────────────────────────────────────────

/** Local midnight of `d` — used so "today" comparisons ignore the time of day. */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Formats a Date as YYYY-MM-DD using LOCAL fields.
 * `toISOString().slice(0,10)` would convert to UTC first and shift the day
 * backwards in any positive-offset timezone, so a birthday the parish sees on
 * the 15th would be reported as the 14th.
 */
export function dateOnly(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Parses a date-only string (YYYY-MM-DD, what <input type="date"> produces) as
 * LOCAL midnight. `new Date('1996-09-15')` parses as UTC midnight instead and
 * lands on the 14th in every negative-offset timezone — which would move a
 * member's birthday by a day. Full ISO strings are passed through unchanged.
 */
export function parseCalendarDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnlyMatch) {
    return new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]));
  }
  return new Date(value);
}

/**
 * Derives an announcement's live status from its schedule.
 * Draft is an explicit author choice and is never overridden by the clock;
 * everything else moves Scheduled → Active → Expired on its own.
 */
export function effectiveAnnouncementStatus(
  storedStatus: string,
  publishAt: Date | null,
  expiresAt: Date | null,
  now: Date = new Date(),
): 'Draft' | 'Scheduled' | 'Active' | 'Expired' {
  if (storedStatus === 'Draft') return 'Draft';
  if (publishAt && publishAt.getTime() > now.getTime()) return 'Scheduled';
  if (expiresAt && expiresAt.getTime() < now.getTime()) return 'Expired';
  return 'Active';
}

/**
 * Next occurrence of a month/day anchor (birthday or wedding anniversary)
 * within `[from, from + days]`.
 *
 * Returns null when the anchor does not fall in the window, or when the anchor
 * itself is invalid. Non-leap years place a Feb-29 anchor on Mar 1, which is
 * how the calendar rolls it.
 */
export function upcomingOccurrence(
  anchor: Date,
  from: Date,
  days: number,
): { date: Date; years: number } | null {
  if (Number.isNaN(anchor.getTime())) return null;
  const month = anchor.getMonth();
  const day = anchor.getDate();
  const windowEnd = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);

  // Walk the anchor's year and the next one so a window spanning New Year
  // (e.g. late December looking 30 days ahead) still finds the occurrence.
  for (const year of [from.getFullYear(), from.getFullYear() + 1]) {
    const candidate = new Date(year, month, day);
    if (candidate.getTime() < from.getTime()) continue;
    if (candidate.getTime() > windowEnd.getTime()) continue;
    return { date: candidate, years: year - anchor.getFullYear() };
  }
  return null;
}

/** Full display name for a Christian row. */
function christianName(c: { baptismalName: string; secondName: string; sirName: string }): string {
  return [c.baptismalName, c.secondName, c.sirName].filter(Boolean).join(' ').trim();
}

/**
 * One row per address: the recipient table is keyed by (broadcastId, address),
 * so an address repeated in the audience would leave only one row.
 */
function dedupeByAddress(list: Array<{ name: string; address: string }>) {
  const seen = new Set<string>();
  return list.filter((r) => {
    const key = r.address.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Resolves a broadcast audience to concrete addresses for the chosen channel.
 *
 * Members only have phone numbers on file (the registry has no email column),
 * so an Email broadcast to a member audience is rejected rather than silently
 * sending nothing — Staff (employees) and Custom list are the addressable
 * email audiences.
 */
export async function resolveAudience(
  audience: string,
  channel: 'SMS' | 'Email',
  customRecipients: string[] = [],
): Promise<Array<{ name: string; address: string }>> {
  const wantsSms = channel === 'SMS';

  if (audience === 'Custom list') {
    return dedupeByAddress(
      customRecipients
        .map((r) => r.trim())
        .filter(Boolean)
        .map((address) => ({ name: address, address })),
    );
  }

  if (audience === 'Staff') {
    const staff = await appPrisma.employee.findMany({});
    return dedupeByAddress(
      staff.map((e) => ({ name: e.name, address: wantsSms ? e.phone : e.email })),
    );
  }

  // Remaining audiences are drawn from the member registry.
  if (!wantsSms) {
    throw new AppError(
      'Members have no email address on file. Choose the Staff audience or a custom recipient list for Email broadcasts.',
      400,
      'BAD_REQUEST',
    );
  }

  const where: Record<string, unknown> = {};
  if (audience === 'Active members') where.status = 'Active';
  else if (audience.startsWith('Ministry: ')) where.scc = audience.slice('Ministry: '.length);

  const members = await appPrisma.christian.findMany({ where });
  return dedupeByAddress(members.map((c) => ({ name: christianName(c), address: c.phone })));
}

// ── Announcements ──────────────────────────────────────────────────────────

const announcementInput = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  category: z.string().default('General'),
  audience: z.string().default('Everyone'),
  priority: z.enum(['Normal', 'High', 'Urgent']).default('Normal'),
  pinned: z.boolean().default(false),
  publishAt: z.coerce.date().nullish(),
  expiresAt: z.coerce.date().nullish(),
  /** Explicit author intent: 'Draft' keeps it unpublished, 'Active' publishes. */
  status: z.enum(['Draft', 'Active']).default('Draft'),
});

/** Shapes a Prisma Announcement row for the API, with the derived status. */
function announcementResponse(row: {
  id: string; title: string; content: string; category: string; audience: string;
  priority: string; status: string; pinned: boolean; publishAt: Date | null;
  expiresAt: Date | null; authorName: string; createdAt: Date;
}) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    category: row.category,
    audience: row.audience,
    priority: row.priority,
    status: effectiveAnnouncementStatus(row.status, row.publishAt, row.expiresAt),
    pinned: row.pinned,
    publishAt: row.publishAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    authorName: row.authorName,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get('/announcements', async (_req, res, next) => {
  try {
    const rows = await appPrisma.announcement.findMany({
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    });
    res.json(rows.map(announcementResponse));
  } catch (e) { next(e); }
});

router.post('/announcements', async (req: AuthRequest, res, next) => {
  try {
    const data = announcementInput.parse(req.body);
    const actor = await resolveActor(req.user!.id);
    const created = await appPrisma.announcement.create({
      data: {
        title: data.title,
        content: data.content,
        category: data.category,
        audience: data.audience,
        priority: data.priority,
        status: data.status,
        pinned: data.pinned,
        publishAt: data.publishAt ?? null,
        expiresAt: data.expiresAt ?? null,
        authorName: actor.name ?? '',
      },
    });
    const payload = announcementResponse(created);
    res.status(201).json(payload);
    emitChange('announcements', 'created', payload);
  } catch (e) { next(e); }
});

router.patch('/announcements/:id', async (req, res, next) => {
  try {
    const data = announcementInput.partial().parse(req.body);
    const updated = await appPrisma.announcement.update({
      where: { id: req.params.id },
      data: {
        ...data,
        publishAt: data.publishAt === undefined ? undefined : data.publishAt ?? null,
        expiresAt: data.expiresAt === undefined ? undefined : data.expiresAt ?? null,
      },
    });
    const payload = announcementResponse(updated);
    res.json(payload);
    emitChange('announcements', 'updated', payload);
  } catch (e) { next(e); }
});

router.delete('/announcements/:id', async (req: AuthRequest, res, next) => {
  try {
    const actor = await resolveActor(req.user!.id);
    await softDelete('Announcement', req.params.id, actor);
    res.status(204).end();
    emitChange('announcements', 'deleted', { id: req.params.id });
  } catch (e) { next(e); }
});

// ── Broadcasts ─────────────────────────────────────────────────────────────

const broadcastInput = z.object({
  channel: z.enum(['SMS', 'Email']).default('SMS'),
  subject: z.string().default(''),
  body: z.string().min(1),
  audience: z.string().default('Everyone'),
  scheduledAt: z.coerce.date().nullish(),
  /** Required for the 'Custom list' audience; persisted for scheduled sends. */
  customRecipients: z.array(z.string()).default([]),
});

interface BroadcastRow {
  id: string; channel: string; subject: string; body: string; audience: string;
  status: string; scheduledAt: Date | null; sentAt: Date | null;
  totalRecipients: number; sentCount: number; failedCount: number;
  openCount: number; clickCount: number;
  errorMessage: string | null; createdAt: Date; customRecipients?: unknown;
}

/** Recipients stored with a broadcast (populated for the 'Custom list' audience). */
function storedRecipients(row: { customRecipients?: unknown }): string[] {
  return Array.isArray(row.customRecipients) ? (row.customRecipients as string[]) : [];
}

function broadcastResponse(row: BroadcastRow) {
  return {
    id: row.id,
    channel: row.channel as 'SMS' | 'Email',
    subject: row.subject,
    body: row.body,
    audience: row.audience,
    status: row.status as 'Draft' | 'Scheduled' | 'Sent' | 'Failed',
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    sentAt: row.sentAt?.toISOString() ?? null,
    totalRecipients: row.totalRecipients,
    sentCount: row.sentCount,
    failedCount: row.failedCount,
    // Email engagement (0 for SMS — there is nothing to open or click).
    openCount: row.openCount,
    clickCount: row.clickCount,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Escapes text before it is interpolated into the HTML email body. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Builds the HTML part of a broadcast email: the message with every http(s)
 * link rewritten to the click-tracking redirect, plus a 1×1 open pixel.
 *
 * Both need `baseUrl` — the server's own public address — so when it is not
 * known the caller sends the plain-text body instead of emitting links that
 * could not resolve.
 */
export function buildTrackedEmailHtml(body: string, recipientId: string, baseUrl: string): string {
  const escaped = escapeHtml(body).replace(/\n/g, '<br>');
  const linked = escaped.replace(
    /https?:\/\/[^\s<]+/g,
    (url) =>
      `<a href="${baseUrl}/api/communications/track/click/${recipientId}?u=${encodeURIComponent(url)}">${url}</a>`,
  );
  return [
    '<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1c1c;line-height:1.6">',
    `  <p style="font-size:15px;margin:0 0 16px">${linked}</p>`,
    '  <hr style="border:none;border-top:1px solid #e1e3e3;margin:24px 0">',
    '  <p style="font-size:11px;color:#444748;margin:0">Sent from the parish communications panel.</p>',
    '</div>',
    `<img src="${baseUrl}/api/communications/track/open/${recipientId}" width="1" height="1" alt="" style="display:block;border:0" />`,
  ].join('\n');
}

router.get('/broadcasts', async (_req, res, next) => {
  try {
    const rows = await appPrisma.broadcast.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(rows.map(broadcastResponse));
  } catch (e) { next(e); }
});

router.post('/broadcasts', async (req, res, next) => {
  try {
    const data = broadcastInput.parse(req.body);
    const created = await appPrisma.broadcast.create({
      data: {
        channel: data.channel,
        subject: data.subject,
        body: data.body,
        audience: data.audience,
        scheduledAt: data.scheduledAt ?? null,
        customRecipients: data.customRecipients.length ? data.customRecipients : undefined,
        status: data.scheduledAt ? 'Scheduled' : 'Draft',
      },
    });
    const payload = broadcastResponse(created);
    res.status(201).json(payload);
    emitChange('broadcasts', 'created', payload);
  } catch (e) { next(e); }
});

/**
 * POST /broadcasts/:id/send — resolve the audience and dispatch now.
 *
 * The broadcast row always records the outcome (Sent/Failed + counters) so the
 * delivery report reflects what really happened, including when the SMS gateway
 * is not configured.
 */
router.post('/broadcasts/:id/send', async (req, res, next) => {
  try {
    const { customRecipients } = z
      .object({ customRecipients: z.array(z.string()).default([]) })
      .parse(req.body ?? {});

    // The server's own address, used to build the tracking pixel / click
    // redirects. Absent when the Host header is missing (raw HTTP/1.0 tools).
    const host = req.get('host');
    const baseUrl = host ? `${req.protocol}://${host}` : '';

    const payload = await dispatchBroadcast(req.params.id, customRecipients, baseUrl);
    // Nothing went out: report it as a failure so the UI can surface the reason
    // instead of showing a green "sent" banner.
    res.status(payload.status === 'Failed' ? 400 : 200).json(payload);
  } catch (e) { next(e); }
});

/**
 * Resolves a broadcast's audience, dispatches it, and records the outcome on
 * the row (status + counters + reason). Shared by the send route and the
 * scheduled-broadcast dispatcher so both behave identically.
 */
export async function dispatchBroadcast(
  id: string,
  customRecipients: string[] = [],
  baseUrl = '',
) {
  const existing = await appPrisma.broadcast.findUnique({ where: { id } });
  if (!existing) throw new AppError('Broadcast not found', 404, 'NOT_FOUND');

  const channel = existing.channel as 'SMS' | 'Email';
  // A scheduled 'Custom list' broadcast carries its list on the row; an
  // immediate send may pass a fresher list from the composer.
  const recipientsInput = customRecipients.length ? customRecipients : storedRecipients(existing);

  // Every early exit records WHY on the row, so the delivery report is a
  // truthful record of the attempt instead of a silent no-op.
  const failWith = async (message: string) => {
    const failed = await appPrisma.broadcast.update({
      where: { id: existing.id },
      data: {
        status: 'Failed',
        errorMessage: message,
        totalRecipients: 0,
        sentCount: 0,
        failedCount: 0,
        openCount: 0,
        clickCount: 0,
      },
    });
    const payload = broadcastResponse(failed);
    emitChange('broadcasts', 'updated', payload);
    return payload;
  };

  let recipients: Array<{ name: string; address: string }>;
  try {
    recipients = await resolveAudience(existing.audience, channel, recipientsInput);
  } catch (err) {
    return failWith(err instanceof Error ? err.message : 'The audience could not be resolved');
  }

  if (recipients.length === 0) {
    return failWith('No recipients matched the selected audience');
  }

  // The recipient rows back the open/click tracking and per-address delivery
  // outcome. Each dispatch is a fresh attempt, so the previous rows are
  // replaced and the engagement counters restart at zero.
  await prisma.broadcastRecipient.deleteMany({ where: { broadcastId: existing.id } });
  await appPrisma.broadcast.update({
    where: { id: existing.id },
    data: { openCount: 0, clickCount: 0 },
  });
  await appPrisma.broadcastRecipient.createMany({
    data: recipients.map((r) => ({ broadcastId: existing.id, name: r.name, address: r.address })),
  });
  const recipientRows = await appPrisma.broadcastRecipient.findMany({
    where: { broadcastId: existing.id },
  });
  const setRecipientStatus = (status: 'Sent' | 'Failed', error: string | null) =>
    appPrisma.broadcastRecipient.updateMany({
      where: { broadcastId: existing.id },
      data: { status, error },
    });

  let sentCount = 0;
  let failedCount = 0;
  let errorMessage: string | null = null;

  if (channel === 'SMS') {
    // Africa's Talking accepts the whole recipient list in one call.
    try {
      const result = await sendSms(recipients.map((r) => r.address), existing.body);
      if (result.success) sentCount = recipients.length;
      else {
        failedCount = recipients.length;
        errorMessage = result.error ?? 'SMS gateway rejected the message';
      }
    } catch (err) {
      failedCount = recipients.length;
      errorMessage = err instanceof Error ? err.message : 'SMS send failed';
    }
    await setRecipientStatus(sentCount > 0 ? 'Sent' : 'Failed', errorMessage);
  } else {
    const subject = existing.subject || 'Message from the parish';
    for (const row of recipientRows) {
      // Each email gets its own tracking pixel / click redirects, which is what
      // makes an open or click attributable to this recipient.
      const html = baseUrl ? buildTrackedEmailHtml(existing.body, row.id, baseUrl) : undefined;
      const result = await sendMail(row.address, subject, existing.body, html);
      if (result.sent) sentCount += 1;
      else {
        failedCount += 1;
        errorMessage = errorMessage ?? result.error ?? 'Email delivery failed';
      }
      await appPrisma.broadcastRecipient.update({
        where: { id: row.id },
        data: { status: result.sent ? 'Sent' : 'Failed', error: result.sent ? null : result.error ?? null },
      });
    }
  }

  const updated = await appPrisma.broadcast.update({
    where: { id: existing.id },
    data: {
      status: sentCount === 0 ? 'Failed' : 'Sent',
      sentAt: new Date(),
      totalRecipients: recipients.length,
      sentCount,
      failedCount,
      errorMessage,
    },
  });

  const payload = broadcastResponse(updated);
  emitChange('broadcasts', 'updated', payload);
  return payload;
}

/**
 * Dispatches every broadcast whose schedule has come due.
 * Called on an interval by the server (see backend/src/lib/broadcastScheduler.ts).
 * Each row is dispatched independently so one bad audience cannot block the rest.
 */
export async function runDueBroadcasts(now: Date = new Date()) {
  const due = await appPrisma.broadcast.findMany({
    where: { status: 'Scheduled', scheduledAt: { lte: now } },
  });
  const results = [];
  for (const row of due) {
    try {
      // No request to read a Host header from, so scheduled sends build their
      // tracking links from APP_BASE_URL (unset ⇒ sent without tracking).
      results.push(await dispatchBroadcast(row.id, [], process.env.APP_BASE_URL ?? ''));
    } catch (err) {
      results.push({ id: row.id, status: 'Failed', errorMessage: String(err) });
    }
  }
  return results;
}

router.delete('/broadcasts/:id', async (req: AuthRequest, res, next) => {
  try {
    const actor = await resolveActor(req.user!.id);
    await softDelete('Broadcast', req.params.id, actor);
    res.status(204).end();
    emitChange('broadcasts', 'deleted', { id: req.params.id });
  } catch (e) { next(e); }
});

// ── Events & RSVPs ─────────────────────────────────────────────────────────

const eventInput = z.object({
  title: z.string().min(1),
  category: z.string().default('Service'),
  ministry: z.string().default(''),
  startAt: z.coerce.date(),
  endAt: z.coerce.date().nullish(),
  location: z.string().default(''),
  description: z.string().default(''),
  color: z.string().default('#c65d3b'),
  rsvpRequired: z.boolean().default(false),
  capacity: z.number().int().positive().nullish(),
});

/**
 * The soft-delete filter only rewrites the top-level `where`, so a nested
 * `include` still returns deleted RSVPs — they would inflate the badge and keep
 * holding a capacity seat.
 */
const liveRsvps = { rsvps: { where: { isDeleted: false } } };

function eventResponse(row: {
  id: string; title: string; category: string; ministry: string; startAt: Date;
  endAt: Date | null; location: string; description: string; color: string;
  rsvpRequired: boolean; capacity: number | null;
  rsvps?: Array<{ status: string }>;
}) {
  const rsvps = row.rsvps ?? [];
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    ministry: row.ministry,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt?.toISOString() ?? null,
    location: row.location,
    description: row.description,
    color: row.color,
    rsvpRequired: row.rsvpRequired,
    capacity: row.capacity,
    rsvpCount: rsvps.length,
    goingCount: rsvps.filter((r) => r.status === 'Going').length,
  };
}

router.get('/events', async (_req, res, next) => {
  try {
    const rows = await appPrisma.churchEvent.findMany({
      orderBy: { startAt: 'asc' },
      include: liveRsvps,
    });
    res.json(rows.map(eventResponse));
  } catch (e) { next(e); }
});

router.post('/events', async (req, res, next) => {
  try {
    const data = eventInput.parse(req.body);
    const created = await appPrisma.churchEvent.create({
      data: { ...data, endAt: data.endAt ?? null, capacity: data.capacity ?? null },
      include: liveRsvps,
    });
    const payload = eventResponse(created);
    res.status(201).json(payload);
    emitChange('church-events', 'created', payload);
  } catch (e) { next(e); }
});

router.delete('/events/:id', async (req: AuthRequest, res, next) => {
  try {
    const actor = await resolveActor(req.user!.id);
    await softDelete('ChurchEvent', req.params.id, actor);
    res.status(204).end();
    emitChange('church-events', 'deleted', { id: req.params.id });
  } catch (e) { next(e); }
});

router.get('/events/:id/rsvps', async (req, res, next) => {
  try {
    const rows = await appPrisma.eventRsvp.findMany({
      where: { eventId: req.params.id },
      orderBy: { createdAt: 'asc' },
    });
    res.json(rows.map((r) => ({
      id: r.id,
      eventId: r.eventId,
      name: r.name,
      phone: r.phone,
      status: r.status as 'Going' | 'Maybe' | 'Declined',
      createdAt: r.createdAt.toISOString(),
    })));
  } catch (e) { next(e); }
});

router.post('/events/:id/rsvps', async (req, res, next) => {
  try {
    const data = z
      .object({
        name: z.string().min(1),
        phone: z.string().default(''),
        status: z.enum(['Going', 'Maybe', 'Declined']).default('Going'),
      })
      .parse(req.body);

    const event = await appPrisma.churchEvent.findUnique({
      where: { id: req.params.id },
      include: liveRsvps,
    });
    if (!event) throw new AppError('Event not found', 404, 'NOT_FOUND');

    // Capacity is only a promise we can keep for "Going" responses.
    if (data.status === 'Going' && event.capacity != null) {
      const going = event.rsvps.filter((r) => r.status === 'Going').length;
      if (going >= event.capacity) {
        throw new AppError('This event has reached its RSVP capacity', 409, 'CONFLICT');
      }
    }

    const created = await appPrisma.eventRsvp.create({
      data: { eventId: event.id, name: data.name, phone: data.phone, status: data.status },
    });
    const payload = {
      id: created.id,
      eventId: created.eventId,
      name: created.name,
      phone: created.phone,
      status: created.status as 'Going' | 'Maybe' | 'Declined',
      createdAt: created.createdAt.toISOString(),
    };
    res.status(201).json(payload);
    emitChange('church-events', 'updated', { id: event.id });
  } catch (e) { next(e); }
});

router.delete('/events/:id/rsvps/:rsvpId', async (req: AuthRequest, res, next) => {
  try {
    const actor = await resolveActor(req.user!.id);
    await softDelete('EventRsvp', req.params.rsvpId, actor);
    res.status(204).end();
    emitChange('church-events', 'updated', { id: req.params.id });
  } catch (e) { next(e); }
});

// ── Prayer requests ────────────────────────────────────────────────────────

const prayerInput = z.object({
  requesterName: z.string().min(1),
  request: z.string().min(1),
  category: z.string().default('General'),
  privacy: z.enum(['Public', 'Leaders Only', 'Pastoral Private']).default('Public'),
});

function prayerResponse(row: {
  id: string; requesterName: string; request: string; category: string;
  privacy: string; status: string; answeredAt: Date | null; praiseReport: string | null;
  prayCount: number; createdAt: Date;
}) {
  return {
    id: row.id,
    requesterName: row.requesterName,
    request: row.request,
    category: row.category,
    privacy: row.privacy as 'Public' | 'Leaders Only' | 'Pastoral Private',
    status: row.status as 'Open' | 'Answered' | 'Archived',
    answeredAt: row.answeredAt?.toISOString() ?? null,
    praiseReport: row.praiseReport,
    prayCount: row.prayCount,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * GET /prayer-requests — privacy-filtered list.
 * Non-public requests are only returned to callers who can edit this panel,
 * so a viewer account never sees pastoral-care confidences.
 */
router.get('/prayer-requests', async (req: AuthRequest, res, next) => {
  try {
    const perms = await loadPermissions(req.user!.id);
    const canSeePrivate = perms.actions.edit !== false;
    const rows = await appPrisma.prayerRequest.findMany({
      where: canSeePrivate ? {} : { privacy: 'Public' },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    res.json(rows.map(prayerResponse));
  } catch (e) { next(e); }
});

router.post('/prayer-requests', async (req, res, next) => {
  try {
    const created = await appPrisma.prayerRequest.create({ data: prayerInput.parse(req.body) });
    const payload = prayerResponse(created);
    res.status(201).json(payload);
    emitChange('prayer-requests', 'created', payload);
  } catch (e) { next(e); }
});

router.patch('/prayer-requests/:id', async (req, res, next) => {
  try {
    const data = z
      .object({
        status: z.enum(['Open', 'Answered', 'Archived']).optional(),
        praiseReport: z.string().optional(),
        category: z.string().optional(),
        privacy: z.enum(['Public', 'Leaders Only', 'Pastoral Private']).optional(),
      })
      .parse(req.body);

    const existing = await appPrisma.prayerRequest.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError('Prayer request not found', 404, 'NOT_FOUND');

    // Marking a request answered stamps the time once and keeps the praise
    // report; re-opening it clears the stamp so the UI stays consistent.
    const answeredAt =
      data.status === undefined
        ? undefined
        : data.status === 'Answered'
          ? existing.answeredAt ?? new Date()
          : null;

    const updated = await appPrisma.prayerRequest.update({
      where: { id: existing.id },
      data: { ...data, answeredAt },
    });
    const payload = prayerResponse(updated);
    res.json(payload);
    emitChange('prayer-requests', 'updated', payload);
  } catch (e) { next(e); }
});

/** POST /prayer-requests/:id/pray — count one more person praying. */
router.post('/prayer-requests/:id/pray', async (req, res, next) => {
  try {
    const updated = await appPrisma.prayerRequest.update({
      where: { id: req.params.id },
      data: { prayCount: { increment: 1 } },
    });
    const payload = prayerResponse(updated);
    res.json(payload);
    emitChange('prayer-requests', 'updated', payload);
  } catch (e) { next(e); }
});

router.delete('/prayer-requests/:id', async (req: AuthRequest, res, next) => {
  try {
    const actor = await resolveActor(req.user!.id);
    await softDelete('PrayerRequest', req.params.id, actor);
    res.status(204).end();
    emitChange('prayer-requests', 'deleted', { id: req.params.id });
  } catch (e) { next(e); }
});

// ── Celebrations (birthdays & anniversaries) ───────────────────────────────

const CELEBRATION_RANGES = { week: 7, month: 31, upcoming: 90 } as const;

/**
 * GET /celebrations?range=week|month|upcoming
 *
 * Birthdays come from the optional Christian.dateOfBirth column and wedding
 * anniversaries from the marriage sacrament's date. Members with neither date
 * on file are returned separately (`unrecorded`) so the panel can prompt staff
 * to capture them instead of silently omitting people.
 */
router.get('/celebrations', async (req, res, next) => {
  try {
    const range = z
      .enum(['week', 'month', 'upcoming'])
      .default('week')
      .parse(req.query.range ?? 'week');
    const days = CELEBRATION_RANGES[range];
    const today = startOfDay(new Date());

    const members = await appPrisma.christian.findMany();

    const birthdays: Array<{ id: string; name: string; date: string; turning: number; phone: string; household: string }> = [];
    const anniversaries: Array<{ id: string; name: string; date: string; years: number; phone: string; household: string }> = [];
    const unrecorded: Array<{ id: string; name: string; phone: string }> = [];

    for (const m of members) {
      const name = christianName(m);
      const dob = m.dateOfBirth;
      const marriage = (m.marriage as { date?: string } | null) ?? null;

      if (dob) {
        const next = upcomingOccurrence(startOfDay(dob), today, days);
        if (next) {
          birthdays.push({
            id: m.id,
            name,
            date: dateOnly(next.date),
            turning: next.years,
            phone: m.phone,
            household: m.scc,
          });
        }
      } else if (!marriage?.date) {
        unrecorded.push({ id: m.id, name, phone: m.phone });
      }

      if (marriage?.date) {
        const marriageDate = new Date(marriage.date);
        const next = upcomingOccurrence(startOfDay(marriageDate), today, days);
        if (next) {
          anniversaries.push({
            id: m.id,
            name,
            date: dateOnly(next.date),
            years: next.years,
            phone: m.phone,
            household: m.scc,
          });
        }
      }
    }

    const byDate = (a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date);
    // Greetings already sent, so the UI never offers the same one twice (and
    // can un-mark a mis-send).
    const rows = await appPrisma.celebrationGreeting.findMany();
    const greetings = rows.map((g) => ({
      id: g.id,
      christianId: g.christianId,
      kind: g.kind as 'Birthday' | 'Anniversary',
      occasionDate: dateOnly(g.occasionDate),
      channel: g.channel as 'SMS' | 'Email',
    }));
    res.json({
      range,
      birthdays: birthdays.sort(byDate),
      anniversaries: anniversaries.sort(byDate),
      unrecorded,
      greetings,
    });
  } catch (e) { next(e); }
});

/**
 * POST /celebrations/greetings — send a birthday/anniversary greeting and
 * record it. Members have phone numbers but no email address on file, so an
 * Email greeting requires an explicit recipient address.
 */
router.post('/celebrations/greetings', async (req: AuthRequest, res, next) => {
  try {
    const data = z
      .object({
        christianId: z.string(),
        kind: z.enum(['Birthday', 'Anniversary']),
        /** Calendar date of the occasion being celebrated (YYYY-MM-DD or ISO). */
        occasionDate: z.union([z.string(), z.date()]),
        channel: z.enum(['SMS', 'Email']).default('SMS'),
        message: z.string().min(1),
        /** Email recipients have no address on file — caller supplies one. */
        recipient: z.string().optional(),
      })
      .parse(req.body);

    const member = await appPrisma.christian.findUnique({ where: { id: data.christianId } });
    if (!member) throw new AppError('Member not found', 404, 'NOT_FOUND');

    const address = data.channel === 'SMS' ? member.phone : data.recipient?.trim();
    if (!address) {
      throw new AppError(
        data.channel === 'SMS'
          ? 'This member has no phone number on file'
          : 'Email greetings need an explicit recipient address',
        400,
        'BAD_REQUEST',
      );
    }

    // The two gateways report different outcome shapes — normalize to one so
    // the failure reason can be surfaced either way.
    const outcome =
      data.channel === 'SMS'
        ? await sendSms(address, data.message)
            .then((r) => ({ sent: r.success, error: r.error }))
            .catch((err: unknown) => ({
              sent: false,
              error: err instanceof Error ? err.message : 'SMS send failed',
            }))
        : await sendMail(address, 'Greetings from the parish', data.message);

    if (!outcome.sent) {
      throw new AppError(outcome.error ?? 'Greeting could not be delivered', 400, 'BAD_REQUEST');
    }

    const occasionDate = startOfDay(parseCalendarDate(data.occasionDate));
    const greeting = await appPrisma.celebrationGreeting.upsert({
      where: {
        christianId_kind_occasionDate: {
          christianId: member.id,
          kind: data.kind,
          occasionDate,
        },
      },
      create: {
        christianId: member.id,
        kind: data.kind,
        occasionDate,
        channel: data.channel,
      },
      update: { channel: data.channel, isDeleted: false, deletedAt: null },
    });

    const payload = {
      id: greeting.id,
      christianId: greeting.christianId,
      kind: greeting.kind as 'Birthday' | 'Anniversary',
      occasionDate: dateOnly(greeting.occasionDate),
      channel: greeting.channel as 'SMS' | 'Email',
    };
    res.status(201).json(payload);
    emitChange('celebration-greetings', 'created', payload);
  } catch (e) { next(e); }
});

/** PATCH /celebrations/members/:id — record a member's date of birth. */
router.patch('/celebrations/members/:id', async (req, res, next) => {
  try {
    const { dateOfBirth } = z
      .object({ dateOfBirth: z.union([z.string(), z.date()]).nullable() })
      .parse(req.body);

    const updated = await appPrisma.christian.update({
      where: { id: req.params.id },
      data: { dateOfBirth: dateOfBirth === null ? null : parseCalendarDate(dateOfBirth) },
    });
    res.json({
      id: updated.id,
      name: christianName(updated),
      dateOfBirth: updated.dateOfBirth ? dateOnly(updated.dateOfBirth) : null,
    });
    emitChange('christians', 'updated', { id: updated.id });
  } catch (e) { next(e); }
});

export default router;
