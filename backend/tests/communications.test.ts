import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestApp, seedTestUser, cleanupTestData } from './helpers.js';
import { signToken } from '../src/lib/auth.js';
import { prisma } from '../src/lib/prisma.js';
import {
  buildTrackedEmailHtml,
  dateOnly,
  effectiveAnnouncementStatus,
  parseCalendarDate,
  resolveAudience,
  runDueBroadcasts,
  safeRedirectTarget,
  upcomingOccurrence,
} from '../src/routes/communications.js';

let app: Express;
let token: string;

beforeAll(async () => {
  app = createTestApp();
  token = (await seedTestUser()).token;
});

beforeEach(async () => {
  await cleanupTestData();
  token = (await seedTestUser()).token;
});

/** Creates a member row directly (fixtures don't need the full registry form). */
async function createMember(overrides: Record<string, unknown> = {}) {
  const suffix = Math.random().toString(36).slice(2, 8);
  return prisma.christian.create({
    data: {
      regNo: `REG-${suffix}`,
      nationalId: `ID-${suffix}`,
      baptismalName: 'Mary',
      secondName: 'Wanjiku',
      sirName: 'Kamau',
      phone: '+254700000001',
      diocese: 'Nairobi',
      parish: 'St. Mary',
      localChurch: 'Main',
      scc: 'St. Joseph',
      ...overrides,
    },
  });
}

/** A signed-in user with explicit panel/action permissions (non-super-admin). */
async function createUserWith(panels: Record<string, boolean>, actions: Record<string, boolean>) {
  const bcrypt = await import('bcryptjs');
  const email = `user-${Math.random().toString(36).slice(2, 8)}@test.com`;
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash('TestPass123!', 10),
      name: 'Restricted User',
      role: 'staff',
      panels,
      actions,
    },
  });
  return signToken({ id: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion });
}

// ── Pure logic ─────────────────────────────────────────────────────────────

describe('communicatons - announcement status derivation', () => {
  const now = new Date('2026-06-15T12:00:00.000Z');
  const past = new Date('2026-06-01T12:00:00.000Z');
  const future = new Date('2026-07-01T12:00:00.000Z');

  it('keeps an explicit draft a draft regardless of schedule', () => {
    expect(effectiveAnnouncementStatus('Draft', past, past, now)).toBe('Draft');
  });

  it('reports Scheduled before the publish time', () => {
    expect(effectiveAnnouncementStatus('Active', future, null, now)).toBe('Scheduled');
  });

  it('reports Active once the publish time has passed', () => {
    expect(effectiveAnnouncementStatus('Active', past, null, now)).toBe('Active');
  });

  it('treats publishAt === now as already live (not early)', () => {
    expect(effectiveAnnouncementStatus('Active', now, null, now)).toBe('Active');
  });

  it('reports Expired once the expiry has passed', () => {
    expect(effectiveAnnouncementStatus('Active', past, past, now)).toBe('Expired');
  });

  it('lets an expiry win over a passed publish time', () => {
    expect(effectiveAnnouncementStatus('Active', past, new Date('2026-06-15T11:59:59.000Z'), now)).toBe('Expired');
  });
});

describe('communications - upcomingOccurrence', () => {
  it('finds an occurrence inside the window and counts the years', () => {
    const from = new Date(2026, 5, 1); // 1 Jun 2026
    const result = upcomingOccurrence(new Date(2000, 5, 10), from, 30);
    expect(result).not.toBeNull();
    expect(result!.years).toBe(26);
    expect(result!.date.getTime()).toBe(new Date(2026, 5, 10).getTime());
  });

  it('returns null when the anchor falls outside the window', () => {
    const from = new Date(2026, 5, 1);
    expect(upcomingOccurrence(new Date(2000, 5, 10), from, 5)).toBeNull();
  });

  it('rolls a 29 February anchor to 1 March in a non-leap year', () => {
    const from = new Date(2026, 1, 25); // 25 Feb 2026 (2026 is not a leap year)
    const result = upcomingOccurrence(new Date(2000, 1, 29), from, 7);
    expect(result).not.toBeNull();
    expect(result!.date.getMonth()).toBe(2); // March
    expect(result!.date.getDate()).toBe(1);
  });

  it('looks into the next year when the window crosses the year boundary', () => {
    const from = new Date(2026, 11, 28); // 28 Dec 2026
    const result = upcomingOccurrence(new Date(1990, 0, 2), from, 10);
    expect(result).not.toBeNull();
    expect(result!.date.getFullYear()).toBe(2027);
    expect(result!.date.getMonth()).toBe(0);
    expect(result!.date.getDate()).toBe(2);
    expect(result!.years).toBe(37);
  });

  it('ignores an unparseable anchor', () => {
    expect(upcomingOccurrence(new Date('nope'), new Date(2026, 0, 1), 30)).toBeNull();
  });
});

describe('communications - calendar dates stay on the day the parish wrote', () => {
  it('parses a date-only string as local midnight, not UTC midnight', () => {
    const parsed = parseCalendarDate('1996-09-15');
    expect(parsed.getFullYear()).toBe(1996);
    expect(parsed.getMonth()).toBe(8);
    expect(parsed.getDate()).toBe(15);
    expect(parsed.getHours()).toBe(0);
  });

  it('formats a local date without rolling it back a day', () => {
    expect(dateOnly(new Date(1996, 8, 15))).toBe('1996-09-15');
  });

  it('leaves a full ISO timestamp to the normal parser', () => {
    const iso = '2026-09-15T10:30:00.000Z';
    expect(parseCalendarDate(iso).getTime()).toBe(new Date(iso).getTime());
  });
});

describe('communications - resolveAudience', () => {
  it('rejects an Email broadcast to the member registry (no member emails exist)', async () => {
    await expect(resolveAudience('Everyone', 'Email')).rejects.toThrow(/no email address on file/i);
  });

  it('accepts a custom recipient list for either channel', async () => {
    const result = await resolveAudience('Custom list', 'Email', [' a@b.com ', '', 'c@d.com']);
    expect(result.map((r) => r.address)).toEqual(['a@b.com', 'c@d.com']);
  });

  it('resolves SMS recipients from the member registry, filtering blanks', async () => {
    await createMember({ phone: '+254700000111' });
    await createMember({ phone: '' });
    const result = await resolveAudience('Everyone', 'SMS');
    expect(result).toHaveLength(1);
    expect(result[0].address).toBe('+254700000111');
    expect(result[0].name).toContain('Mary');
  });

  it('narrows a Ministry audience by small christian community', async () => {
    await createMember({ scc: 'Choir', phone: '+254700000222' });
    await createMember({ scc: 'Youth', phone: '+254700000333' });
    const result = await resolveAudience('Ministry: Choir', 'SMS');
    expect(result.map((r) => r.address)).toEqual(['+254700000222']);
  });
});

// ── Announcements over HTTP ────────────────────────────────────────────────

describe('communications - announcements API', () => {
  it('creates, lists and deletes an announcement', async () => {
    const created = await request(app)
      .post('/api/communications/announcements')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Harvest', content: 'Thanksgiving service', audience: 'Everyone' });

    expect(created.status).toBe(201);
    expect(created.body.status).toBe('Draft');

    const listed = await request(app)
      .get('/api/communications/announcements')
      .set('Authorization', `Bearer ${token}`);
    expect(listed.body).toHaveLength(1);

    const removed = await request(app)
      .delete(`/api/communications/announcements/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(removed.status).toBe(204);

    const after = await request(app)
      .get('/api/communications/announcements')
      .set('Authorization', `Bearer ${token}`);
    expect(after.body).toHaveLength(0);

    // Soft delete: the row survives for Trash & Audit.
    expect(await prisma.announcement.count()).toBe(1);
  });

  it('shows a future-published announcement as Scheduled and a lapsed one as Expired', async () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    await request(app)
      .post('/api/communications/announcements')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Soon', content: 'x', status: 'Active', publishAt: future });

    await request(app)
      .post('/api/communications/announcements')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Lapsed', content: 'x', status: 'Active', publishAt: past, expiresAt: past });

    const listed = await request(app)
      .get('/api/communications/announcements')
      .set('Authorization', `Bearer ${token}`);

    const byTitle = Object.fromEntries(listed.body.map((a: { title: string; status: string }) => [a.title, a.status]));
    expect(byTitle.Soon).toBe('Scheduled');
    expect(byTitle.Lapsed).toBe('Expired');
  });

  it('pins an announcement and keeps it above newer unpinned ones', async () => {
    const first = await request(app)
      .post('/api/communications/announcements')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Older', content: 'x' });

    await request(app)
      .post('/api/communications/announcements')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Newer', content: 'x' });

    await request(app)
      .patch(`/api/communications/announcements/${first.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ pinned: true });

    const listed = await request(app)
      .get('/api/communications/announcements')
      .set('Authorization', `Bearer ${token}`);
    expect(listed.body[0].title).toBe('Older');
  });
});

// ── Broadcasts over HTTP ───────────────────────────────────────────────────

describe('communications - broadcasts API', () => {
  it('records a failed send with real counters when the SMS gateway is not configured', async () => {
    await createMember({ phone: '+254700000444' });

    const draft = await request(app)
      .post('/api/communications/broadcasts')
      .set('Authorization', `Bearer ${token}`)
      .send({ channel: 'SMS', body: 'Hello parish', audience: 'Everyone' });
    expect(draft.status).toBe(201);
    expect(draft.body.status).toBe('Draft');

    const sent = await request(app)
      .post(`/api/communications/broadcasts/${draft.body.id}/send`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(sent.status).toBe(400);
    expect(sent.body.status).toBe('Failed');
    expect(sent.body.totalRecipients).toBe(1);
    expect(sent.body.sentCount).toBe(0);
    expect(sent.body.failedCount).toBe(1);
    expect(sent.body.errorMessage).toMatch(/not configured/i);
  });

  it('addresses a shared phone number once, not once per member', async () => {
    // Households commonly share one phone; the recipient table is keyed by
    // (broadcastId, address), so a duplicate would abort the whole send.
    await createMember({ phone: '+254700777666' });
    await createMember({ phone: '+254700777666' });

    const draft = await request(app)
      .post('/api/communications/broadcasts')
      .set('Authorization', `Bearer ${token}`)
      .send({ channel: 'SMS', body: 'Hello household', audience: 'Everyone' });

    const sent = await request(app)
      .post(`/api/communications/broadcasts/${draft.body.id}/send`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(sent.status).toBe(400); // gateway unconfigured — the attempt was made
    expect(sent.body.totalRecipients).toBe(1);
    expect(sent.body.errorMessage).toMatch(/not configured/i);
  });

  it('persists a custom recipient list so a later send can resolve it', async () => {
    const draft = await request(app)
      .post('/api/communications/broadcasts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        channel: 'SMS',
        body: 'Hello',
        audience: 'Custom list',
        customRecipients: ['+254700111222', '+254700333444'],
      });
    expect(draft.status).toBe(201);

    // Send without re-supplying the list — the row must carry it.
    const sent = await request(app)
      .post(`/api/communications/broadcasts/${draft.body.id}/send`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(sent.status).toBe(400);
    expect(sent.body.totalRecipients).toBe(2);
    expect(sent.body.failedCount).toBe(2);
  });

  it('rejects an Email broadcast to a member audience', async () => {
    const draft = await request(app)
      .post('/api/communications/broadcasts')
      .set('Authorization', `Bearer ${token}`)
      .send({ channel: 'Email', subject: 'Hi', body: 'Body', audience: 'Everyone' });

    const sent = await request(app)
      .post(`/api/communications/broadcasts/${draft.body.id}/send`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(sent.status).toBe(400);
    expect(sent.body.errorMessage).toMatch(/no email address on file/i);
  });
});

describe('communications - email tracking', () => {
  it('embeds an open pixel and a click redirect for the recipient', () => {
    const html = buildTrackedEmailHtml('See http://example.com/give today', 'rec-1', 'http://parish.local');
    expect(html).toContain('http://parish.local/api/communications/track/open/rec-1');
    expect(html).toContain(
      'http://parish.local/api/communications/track/click/rec-1?u=' + encodeURIComponent('http://example.com/give'),
    );
  });

  it('escapes HTML in the message body instead of letting it through', () => {
    const html = buildTrackedEmailHtml('<script>alert(1)</script>', 'rec-1', 'http://parish.local');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('refuses non-http(s) redirect targets', () => {
    expect(safeRedirectTarget('javascript:alert(1)')).toBeNull();
    expect(safeRedirectTarget('data:text/html,hi')).toBeNull();
    expect(safeRedirectTarget('/relative')).toBeNull();
    expect(safeRedirectTarget(undefined)).toBeNull();
    expect(safeRedirectTarget('https://example.com/x')).toBe('https://example.com/x');
  });

  it('records an open once and reports it on the delivery report', async () => {
    const draft = await request(app)
      .post('/api/communications/broadcasts')
      .set('Authorization', `Bearer ${token}`)
      .send({ channel: 'Email', subject: 'Hello', body: 'Body', audience: 'Custom list', customRecipients: ['a@example.com'] });

    await request(app)
      .post(`/api/communications/broadcasts/${draft.body.id}/send`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    const [row] = await prisma.broadcastRecipient.findMany({ where: { broadcastId: draft.body.id } });
    expect(row).toBeDefined();

    // The pixel is public: a mail client has no token.
    const pixel = await request(app).get(`/api/communications/track/open/${row.id}`);
    expect(pixel.status).toBe(200);
    expect(pixel.headers['content-type']).toContain('image/gif');

    // A second load is not counted twice.
    await request(app).get(`/api/communications/track/open/${row.id}`);

    const report = await request(app)
      .get('/api/communications/broadcasts')
      .set('Authorization', `Bearer ${token}`);
    const listed = report.body.find((b: { id: string }) => b.id === draft.body.id);
    expect(listed.openCount).toBe(1);
    expect(listed.clickCount).toBe(0);
  });

  it('records a click, implies the open, and redirects to the target', async () => {
    const draft = await request(app)
      .post('/api/communications/broadcasts')
      .set('Authorization', `Bearer ${token}`)
      .send({ channel: 'Email', subject: 'Hi', body: 'Body', audience: 'Custom list', customRecipients: ['b@example.com'] });
    await request(app)
      .post(`/api/communications/broadcasts/${draft.body.id}/send`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    const [row] = await prisma.broadcastRecipient.findMany({ where: { broadcastId: draft.body.id } });
    const click = await request(app).get(
      `/api/communications/track/click/${row.id}?u=${encodeURIComponent('https://example.com/give')}`,
    );
    expect(click.status).toBe(302);
    expect(click.headers.location).toBe('https://example.com/give');

    const report = await request(app)
      .get('/api/communications/broadcasts')
      .set('Authorization', `Bearer ${token}`);
    const listed = report.body.find((b: { id: string }) => b.id === draft.body.id);
    expect(listed.clickCount).toBe(1);
    expect(listed.openCount).toBe(1); // a click counts as an open too

    const rejected = await request(app).get(
      `/api/communications/track/click/${row.id}?u=javascript:alert(1)`,
    );
    expect(rejected.status).toBe(400);
  });

  it('keeps the tracking routes reachable without a token', async () => {
    const res = await request(app).get('/api/communications/track/open/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(200); // unknown id still returns the pixel (no probing signal)
  });
});

describe('communications - scheduled broadcast dispatcher', () => {
  it('dispatches a due broadcast and leaves a future one scheduled', async () => {
    await createMember({ phone: '+254700000555' });
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 3_600_000).toISOString();

    const due = await request(app)
      .post('/api/communications/broadcasts')
      .set('Authorization', `Bearer ${token}`)
      .send({ channel: 'SMS', body: 'Due now', audience: 'Everyone', scheduledAt: past });
    const later = await request(app)
      .post('/api/communications/broadcasts')
      .set('Authorization', `Bearer ${token}`)
      .send({ channel: 'SMS', body: 'Later', audience: 'Everyone', scheduledAt: future });

    expect(due.body.status).toBe('Scheduled');
    expect(later.body.status).toBe('Scheduled');

    const results = await runDueBroadcasts();
    expect(results).toHaveLength(1);

    const rows = await request(app)
      .get('/api/communications/broadcasts')
      .set('Authorization', `Bearer ${token}`);
    const byBody = Object.fromEntries(rows.body.map((b: { body: string; status: string; sentAt: string | null }) => [b.body, b]));

    // The due one was attempted (the gateway is unconfigured, so the attempt
    // is recorded as a failure rather than silently staying 'Scheduled').
    expect(byBody['Due now'].status).toBe('Failed');
    expect(byBody['Due now'].sentAt).not.toBeNull();
    // The future one is untouched.
    expect(byBody['Later'].status).toBe('Scheduled');
    expect(byBody['Later'].sentAt).toBeNull();
  });

  it('is a no-op when nothing is due', async () => {
    expect(await runDueBroadcasts()).toHaveLength(0);
  });
});

// ── Events & RSVP capacity ─────────────────────────────────────────────────

describe('communications - events API', () => {
  async function createEvent(capacity: number | null) {
    const res = await request(app)
      .post('/api/communications/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Youth Conference',
        startAt: new Date(Date.now() + 86_400_000).toISOString(),
        rsvpRequired: true,
        capacity,
      });
    expect(res.status).toBe(201);
    return res.body;
  }

  it('tracks RSVP counts on the event', async () => {
    const event = await createEvent(null);
    await request(app)
      .post(`/api/communications/events/${event.id}/rsvps`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Peter' });

    const listed = await request(app)
      .get('/api/communications/events')
      .set('Authorization', `Bearer ${token}`);
    expect(listed.body[0].goingCount).toBe(1);
    expect(listed.body[0].rsvpCount).toBe(1);
  });

  it('refuses a Going RSVP past capacity but still accepts Maybe', async () => {
    const event = await createEvent(1);

    const first = await request(app)
      .post(`/api/communications/events/${event.id}/rsvps`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Peter', status: 'Going' });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post(`/api/communications/events/${event.id}/rsvps`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Paul', status: 'Going' });
    expect(second.status).toBe(409);

    const maybe = await request(app)
      .post(`/api/communications/events/${event.id}/rsvps`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Paul', status: 'Maybe' });
    expect(maybe.status).toBe(201);
  });

  it('frees a capacity seat when an RSVP is deleted', async () => {
    const event = await createEvent(1);
    const first = await request(app)
      .post(`/api/communications/events/${event.id}/rsvps`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Peter', status: 'Going' });
    expect(first.status).toBe(201);

    const removed = await request(app)
      .delete(`/api/communications/events/${event.id}/rsvps/${first.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(removed.status).toBe(204);

    // The deleted RSVP must not linger in the event's counts…
    const listed = await request(app)
      .get('/api/communications/events')
      .set('Authorization', `Bearer ${token}`);
    expect(listed.body[0].rsvpCount).toBe(0);
    expect(listed.body[0].goingCount).toBe(0);

    // …nor keep holding the only seat.
    const replacement = await request(app)
      .post(`/api/communications/events/${event.id}/rsvps`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Paul', status: 'Going' });
    expect(replacement.status).toBe(201);
  });

  it('returns 404 for an RSVP against a missing event', async () => {
    const res = await request(app)
      .post('/api/communications/events/00000000-0000-0000-0000-000000000000/rsvps')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Peter' });
    expect(res.status).toBe(404);
  });
});

// ── Prayer privacy ─────────────────────────────────────────────────────────

describe('communications - prayer request privacy', () => {
  it('hides Leaders Only and Pastoral Private requests from users without edit rights', async () => {
    for (const privacy of ['Public', 'Leaders Only', 'Pastoral Private']) {
      await request(app)
        .post('/api/communications/prayer-requests')
        .set('Authorization', `Bearer ${token}`)
        .send({ requesterName: `${privacy} person`, request: 'Please pray', privacy });
    }

    // super_admin sees everything.
    const asAdmin = await request(app)
      .get('/api/communications/prayer-requests')
      .set('Authorization', `Bearer ${token}`);
    expect(asAdmin.body).toHaveLength(3);

    // A user who can view but not edit only receives the public request.
    const viewer = await createUserWith(
      { communications: true },
      { view: true, edit: false, delete: false },
    );
    const asViewer = await request(app)
      .get('/api/communications/prayer-requests')
      .set('Authorization', `Bearer ${viewer}`);
    expect(asViewer.body).toHaveLength(1);
    expect(asViewer.body[0].privacy).toBe('Public');
  });

  it('increments the prayer counter and records a praise report', async () => {
    const created = await request(app)
      .post('/api/communications/prayer-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({ requesterName: 'Grace', request: 'Healing for my mother', category: 'Healing' });

    const prayed = await request(app)
      .post(`/api/communications/prayer-requests/${created.body.id}/pray`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(prayed.body.prayCount).toBe(1);

    const answered = await request(app)
      .patch(`/api/communications/prayer-requests/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'Answered', praiseReport: 'She recovered fully.' });
    expect(answered.body.status).toBe('Answered');
    expect(answered.body.answeredAt).not.toBeNull();
    expect(answered.body.praiseReport).toBe('She recovered fully.');
  });
});

// ── Celebrations & greetings ───────────────────────────────────────────────

describe('communications - celebrations', () => {
  it('lists an upcoming birthday for a member with a date of birth on file', async () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 2);
    const birthday = new Date(1995, soon.getMonth(), soon.getDate());
    await createMember({ dateOfBirth: birthday });

    const res = await request(app)
      .get('/api/communications/celebrations?range=week')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.birthdays).toHaveLength(1);
    expect(res.body.birthdays[0].turning).toBe(soon.getFullYear() - 1995);
    expect(res.body.unrecorded).toHaveLength(0);
  });

  it('reports members with no birthday or marriage date separately', async () => {
    await createMember();
    const res = await request(app)
      .get('/api/communications/celebrations?range=week')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.birthdays).toHaveLength(0);
    expect(res.body.unrecorded).toHaveLength(1);
  });

  it('records a date of birth through the panel and then surfaces the birthday', async () => {
    const member = await createMember();
    const soon = new Date();
    soon.setDate(soon.getDate() + 1);

    const monthDay = `${String(soon.getMonth() + 1).padStart(2, '0')}-${String(soon.getDate()).padStart(2, '0')}`;
    const patched = await request(app)
      .patch(`/api/communications/celebrations/members/${member.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ dateOfBirth: `1990-${monthDay}` });
    expect(patched.status).toBe(200);
    expect(patched.body.dateOfBirth).toBe(`1990-${monthDay}`);

    const res = await request(app)
      .get('/api/communications/celebrations?range=week')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.birthdays).toHaveLength(1);
    // The birthday must land on the recorded calendar day, not shift by one.
    expect(res.body.birthdays[0].date).toBe(`${soon.getFullYear()}-${monthDay}`);
    expect(res.body.birthdays[0].turning).toBe(soon.getFullYear() - 1990);
  });

  it('sends an Email greeting through the dev outbox and records it once', async () => {
    const member = await createMember();

    const first = await request(app)
      .post('/api/communications/celebrations/greetings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        christianId: member.id,
        kind: 'Birthday',
        occasionDate: '2026-06-10',
        channel: 'Email',
        recipient: 'mary@example.com',
        message: 'Happy birthday!',
      });
    expect(first.status).toBe(201);
    expect(first.body.occasionDate).toBe('2026-06-10');

    // Re-sending the same occasion updates the existing row instead of duplicating.
    const second = await request(app)
      .post('/api/communications/celebrations/greetings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        christianId: member.id,
        kind: 'Birthday',
        occasionDate: '2026-06-10',
        channel: 'Email',
        recipient: 'mary@example.com',
        message: 'Happy birthday again!',
      });
    expect(second.status).toBe(201);
    expect(await prisma.celebrationGreeting.count()).toBe(1);

    const celebrations = await request(app)
      .get('/api/communications/celebrations?range=week')
      .set('Authorization', `Bearer ${token}`);
    expect(celebrations.body.greetings).toHaveLength(1);
    // The stored occasion must round-trip to the same calendar day, otherwise
    // the UI's "Greeted" badge would never match the listed occasion.
    expect(celebrations.body.greetings[0].occasionDate).toBe('2026-06-10');
  });

  it('refuses an SMS greeting when the member has no phone number', async () => {
    const member = await createMember({ phone: '' });
    const res = await request(app)
      .post('/api/communications/celebrations/greetings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        christianId: member.id,
        kind: 'Birthday',
        occasionDate: '2026-06-10',
        channel: 'SMS',
        message: 'Happy birthday!',
      });
    expect(res.status).toBe(400);
    expect(res.body.message ?? res.body.error).toMatch(/no phone number/i);
  });
});

// ── Permission gating ──────────────────────────────────────────────────────

describe('communications - permission gating', () => {
  it('denies access to a user without the communications panel', async () => {
    const blocked = await createUserWith(
      { communications: false },
      { view: true, edit: true, delete: true },
    );
    const res = await request(app)
      .get('/api/communications/announcements')
      .set('Authorization', `Bearer ${blocked}`);
    expect(res.status).toBe(403);
  });

  it('denies writes to a view-only user', async () => {
    const viewer = await createUserWith(
      { communications: true },
      { view: true, edit: false, delete: false },
    );
    const res = await request(app)
      .post('/api/communications/announcements')
      .set('Authorization', `Bearer ${viewer}`)
      .send({ title: 'Nope', content: 'x' });
    expect(res.status).toBe(403);
  });
});
