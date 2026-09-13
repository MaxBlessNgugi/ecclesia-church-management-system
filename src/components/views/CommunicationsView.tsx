// =============================================================================
// CommunicationsView — congregation communication & pastoral care panel
// -----------------------------------------------------------------------------
// Five sub-tabs (CommunicationsSubTab in src/types.ts):
//   1. Announcements            internal posts: targeting, priority, pin, schedule
//   2. Broadcasts (SMS / Email) bulk sends with real delivery reporting
//   3. Events & Calendar        events with RSVP tracking (list + month calendar)
//   4. Prayer Requests          privacy-graded requests, prayer counter, praise
//   5. Birthdays & Anniversaries upcoming celebrations + greeting sends
//
// Every mutation goes through communicationsApi to the /api/communications
// router — there is no local-only state, so a reload always shows what the
// database holds. Delivery counters come from the gateway result (email
// open/click rates are deliberately absent: they would need a tracking pixel).
// =============================================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AnnouncementPriority,
  AnnouncementRecord,
  AnnouncementStatus,
  BroadcastChannel,
  BroadcastRecord,
  CelebrationsResponse,
  ChurchEventRecord,
  CommunicationsSubTab,
  EventRsvpRecord,
  EventRsvpStatus,
  PrayerPrivacy,
  PrayerRequestRecord,
  PrayerStatus,
} from '../../types';
import { communicationsApi } from '../../services/api';
import { usePermissions } from '../../permissions';
import { DeleteConfirmationModal } from '../DeleteConfirmationModal';
import { useToast } from '../Toast';

const SUB_TAB_LABELS: Record<CommunicationsSubTab, string> = {
  announcements: 'ANNOUNCEMENTS',
  broadcasts: 'BROADCASTS (SMS / EMAIL)',
  events: 'EVENTS & CALENDAR',
  prayer: 'PRAYER REQUESTS',
  celebrations: 'BIRTHDAYS & ANNIVERSARIES',
};

const ANNOUNCEMENT_CATEGORIES = ['General', 'Service', 'Event', 'Youth', 'Ministry', 'Urgent'];
const ANNOUNCEMENT_AUDIENCES = ['Everyone', 'Members only', 'Ministry Leaders', 'Youth', 'Elders/Board'];
const ANNOUNCEMENT_STATUSES: AnnouncementStatus[] = ['Active', 'Scheduled', 'Expired', 'Draft'];

const EVENT_CATEGORIES = ['Service', 'Conference', 'Retreat', 'Outreach', 'Meeting', 'Wedding', 'Funeral'];
/** Colour tags offered when creating an event (Warm Ember palette + neutrals). */
const EVENT_COLORS = ['#c65d3b', '#1e1e1e', '#2f6f4f', '#7a4f9c', '#b07d1a', '#3d6b9c'];

const PRAYER_CATEGORIES = ['Healing', 'Family', 'Guidance', 'Provision', 'Bereavement', 'Praise', 'Salvation', 'General'];
const PRAYER_PRIVACIES: PrayerPrivacy[] = ['Public', 'Leaders Only', 'Pastoral Private'];

/** Message templates offered by the broadcast composer. */
const BROADCAST_TEMPLATES: Array<{ name: string; body: string }> = [
  { name: 'Birthday', body: 'Happy birthday! We thank God for your life and pray His blessings over you this year.' },
  { name: 'Event reminder', body: 'Reminder: our upcoming service starts soon. We look forward to worshipping with you.' },
  { name: 'Prayer request', body: 'Please remember our parish in prayer this week. Your prayers carry us.' },
  { name: 'Welcome', body: 'Welcome to our parish family! We are glad you are with us.' },
  { name: 'Anniversary', body: 'Happy anniversary! May God continue to bless your union with grace and joy.' },
];

/** SMS segment count for the composer's cost hint (160 chars per segment). */
const SMS_SEGMENT_LENGTH = 160;

/** Engagement rate for the delivery report (`0` when nothing was addressed). */
function ratePct(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** ISO string → value for an <input type="datetime-local">. */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** datetime-local value → ISO string (null when empty). */
function localToIso(local: string): string | null {
  return local ? new Date(local).toISOString() : null;
}

/** Human-readable date (YYYY-MM-DD or ISO). */
function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

/** Human-readable date + time. */
function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : `${d.toLocaleDateString()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Today's date as YYYY-MM-DD in local time (calendar comparisons). */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Shared badge styling for a status pill. */
function badgeClass(tone: 'green' | 'amber' | 'red' | 'gray' | 'terracotta'): string {
  const tones = {
    green: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    red: 'bg-red-50 text-red-800 border-red-200',
    gray: 'bg-[#f4f3f3] text-[#444748] border-[#e1e3e3]',
    terracotta: 'bg-[#c65d3b]/10 text-[#8c3d22] border-[#c65d3b]/30',
  };
  return `px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide ${tones[tone]}`;
}

const INPUT_CLASS =
  'w-full px-3 py-2 text-xs border border-[#c4c7c7] rounded bg-[#ffffff] focus:outline-none focus:border-[#1e1e1e]';

const AnnouncementTone: Record<AnnouncementStatus, 'green' | 'amber' | 'red' | 'gray'> = {
  Active: 'green',
  Scheduled: 'amber',
  Expired: 'gray',
  Draft: 'gray',
};

const BroadcastTone: Record<BroadcastRecord['status'], 'green' | 'amber' | 'red' | 'gray'> = {
  Sent: 'green',
  Scheduled: 'amber',
  Failed: 'red',
  Draft: 'gray',
};

interface CommunicationsViewProps {
  /** Sub-tab to open on mount (deep links / dashboard quick actions), as in the
   *  other sub-tabbed panels — later switches remount the panel. */
  initialSubTab?: CommunicationsSubTab;
}

/**
 * Communications panel: announcements, broadcasts, events, prayer requests and
 * celebrations. Owns its own data loading — each sub-tab fetches on activation.
 */
export const CommunicationsView: React.FC<CommunicationsViewProps> = ({ initialSubTab }) => {
  const { showSuccess, showError } = useToast();
  const perms = usePermissions();
  const canEdit = perms.canEdit('communications');
  const canDelete = perms.canDelete('communications');

  const [activeSubTab, setActiveSubTab] = useState<CommunicationsSubTab>(initialSubTab ?? 'announcements');

  // ── Announcements state ──────────────────────────────────────────────────
  const [announcements, setAnnouncements] = useState<AnnouncementRecord[]>([]);
  const [announcementFilter, setAnnouncementFilter] = useState<'All' | AnnouncementStatus>('All');
  const [editingAnnouncementId, setEditingAnnouncementId] = useState<string | null>(null);
  const [announcementForm, setAnnouncementForm] = useState({
    title: '',
    content: '',
    category: ANNOUNCEMENT_CATEGORIES[0],
    audience: ANNOUNCEMENT_AUDIENCES[0],
    priority: 'Normal' as AnnouncementPriority,
    pinned: false,
    publishAt: '',
    expiresAt: '',
  });

  // ── Broadcasts state ─────────────────────────────────────────────────────
  const [broadcasts, setBroadcasts] = useState<BroadcastRecord[]>([]);
  const [composer, setComposer] = useState({
    channel: 'SMS' as BroadcastChannel,
    subject: '',
    body: '',
    audience: 'Everyone',
    ministry: '',
    customRecipients: '',
    scheduledAt: '',
  });

  // ── Events state ─────────────────────────────────────────────────────────
  const [events, setEvents] = useState<ChurchEventRecord[]>([]);
  const [eventView, setEventView] = useState<'list' | 'calendar'>('list');
  const [calendarCursor, setCalendarCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [eventForm, setEventForm] = useState({
    title: '',
    category: EVENT_CATEGORIES[0],
    ministry: '',
    startAt: '',
    endAt: '',
    location: '',
    description: '',
    color: EVENT_COLORS[0],
    rsvpRequired: false,
    capacity: '',
  });
  const [rsvpEvent, setRsvpEvent] = useState<ChurchEventRecord | null>(null);
  const [rsvps, setRsvps] = useState<EventRsvpRecord[]>([]);
  const [rsvpForm, setRsvpForm] = useState({ name: '', phone: '', status: 'Going' as EventRsvpStatus });

  // ── Prayer requests state ────────────────────────────────────────────────
  const [prayers, setPrayers] = useState<PrayerRequestRecord[]>([]);
  const [prayerFilter, setPrayerFilter] = useState<'All' | PrayerStatus>('All');
  const [prayerForm, setPrayerForm] = useState({
    requesterName: '',
    request: '',
    category: PRAYER_CATEGORIES[0],
    privacy: 'Public' as PrayerPrivacy,
  });
  const [answeringRequest, setAnsweringRequest] = useState<PrayerRequestRecord | null>(null);
  const [praiseReport, setPraiseReport] = useState('');

  // ── Celebrations state ───────────────────────────────────────────────────
  const [celebrations, setCelebrations] = useState<CelebrationsResponse | null>(null);
  const [celebrationRange, setCelebrationRange] = useState<'week' | 'month' | 'upcoming'>('week');
  const [dobTargetId, setDobTargetId] = useState<string | null>(null);
  const [dobValue, setDobValue] = useState('');
  const [greetingTarget, setGreetingTarget] = useState<{
    christianId: string;
    name: string;
    kind: 'Birthday' | 'Anniversary';
    occasionDate: string;
  } | null>(null);
  const [greetingChannel, setGreetingChannel] = useState<BroadcastChannel>('SMS');
  const [greetingMessage, setGreetingMessage] = useState('');
  const [greetingRecipient, setGreetingRecipient] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<{ label: string; run: () => Promise<void> } | null>(null);

  // ── Data loaders ─────────────────────────────────────────────────────────

  const loadAnnouncements = useCallback(async () => {
    try {
      setAnnouncements(await communicationsApi.announcements.list());
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to load announcements');
    }
  }, [showError]);

  const loadBroadcasts = useCallback(async () => {
    try {
      setBroadcasts(await communicationsApi.broadcasts.list());
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to load broadcasts');
    }
  }, [showError]);

  const loadEvents = useCallback(async () => {
    try {
      setEvents(await communicationsApi.events.list());
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to load events');
    }
  }, [showError]);

  const loadPrayers = useCallback(async () => {
    try {
      setPrayers(await communicationsApi.prayerRequests.list());
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to load prayer requests');
    }
  }, [showError]);

  const loadCelebrations = useCallback(async () => {
    try {
      setCelebrations(await communicationsApi.celebrations.get(celebrationRange));
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to load celebrations');
    }
  }, [celebrationRange, showError]);

  // Fetch the active sub-tab's data whenever it becomes active.
  useEffect(() => {
    if (activeSubTab === 'announcements') void loadAnnouncements();
    if (activeSubTab === 'broadcasts') void loadBroadcasts();
    if (activeSubTab === 'events') void loadEvents();
    if (activeSubTab === 'prayer') void loadPrayers();
    if (activeSubTab === 'celebrations') void loadCelebrations();
  }, [activeSubTab, loadAnnouncements, loadBroadcasts, loadEvents, loadPrayers, loadCelebrations]);

  // Re-fetch celebrations when the range filter changes while that tab is open.
  useEffect(() => {
    if (activeSubTab === 'celebrations') void loadCelebrations();
  }, [celebrationRange, activeSubTab, loadCelebrations]);

  // ── Announcement actions ─────────────────────────────────────────────────

  const resetAnnouncementForm = () => {
    setEditingAnnouncementId(null);
    setAnnouncementForm({
      title: '',
      content: '',
      category: ANNOUNCEMENT_CATEGORIES[0],
      audience: ANNOUNCEMENT_AUDIENCES[0],
      priority: 'Normal',
      pinned: false,
      publishAt: '',
      expiresAt: '',
    });
  };

  const handleSaveAnnouncement = async () => {
    if (!announcementForm.title.trim() || !announcementForm.content.trim()) {
      showError('Title and content are required');
      return;
    }
    const payload = {
      title: announcementForm.title.trim(),
      content: announcementForm.content.trim(),
      category: announcementForm.category,
      audience: announcementForm.audience,
      priority: announcementForm.priority,
      pinned: announcementForm.pinned,
      publishAt: localToIso(announcementForm.publishAt),
      expiresAt: localToIso(announcementForm.expiresAt),
      // Anything with a schedule is published (the clock decides Scheduled vs
      // Active); an unscheduled post stays a draft until it is published.
      status: announcementForm.publishAt ? ('Active' as const) : ('Draft' as const),
    };
    try {
      if (editingAnnouncementId) {
        await communicationsApi.announcements.update(editingAnnouncementId, payload);
        showSuccess('Announcement updated');
      } else {
        await communicationsApi.announcements.create(payload);
        showSuccess('Announcement saved');
      }
      resetAnnouncementForm();
      await loadAnnouncements();
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to save announcement');
    }
  };

  const handlePublishAnnouncement = async (record: AnnouncementRecord) => {
    try {
      await communicationsApi.announcements.update(record.id, { status: 'Active' });
      await loadAnnouncements();
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to publish announcement');
    }
  };

  const handleTogglePin = async (record: AnnouncementRecord) => {
    try {
      await communicationsApi.announcements.update(record.id, { pinned: !record.pinned });
      await loadAnnouncements();
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to update announcement');
    }
  };

  // ── Broadcast actions ────────────────────────────────────────────────────

  /** Audience value sent to the API, folding in the ministry name when used. */
  const composerAudience = useMemo(() => {
    if (composer.audience === 'Ministry') {
      return composer.ministry.trim() ? `Ministry: ${composer.ministry.trim()}` : 'Ministry: ';
    }
    return composer.audience;
  }, [composer.audience, composer.ministry]);

  const customRecipients = useMemo(
    () => composer.customRecipients.split(/[\n,;]+/).map((r) => r.trim()).filter(Boolean),
    [composer.customRecipients],
  );

  const handleQueueBroadcast = async (sendNow: boolean) => {
    if (!composer.body.trim()) {
      showError('Write a message first');
      return;
    }
    if (composer.audience === 'Custom list' && customRecipients.length === 0) {
      showError('Add at least one recipient address');
      return;
    }
    try {
      const created = await communicationsApi.broadcasts.create({
        channel: composer.channel,
        subject: composer.subject.trim(),
        body: composer.body.trim(),
        audience: composerAudience,
        scheduledAt: sendNow ? null : localToIso(composer.scheduledAt),
        // Persisted so a scheduled custom-list send can still resolve its
        // recipients when the dispatcher picks it up.
        customRecipients,
      });
      if (sendNow) {
        await communicationsApi.broadcasts.send(created.id, customRecipients);
        showSuccess('Broadcast sent');
      } else {
        showSuccess('Broadcast scheduled');
      }
      setComposer((c) => ({ ...c, body: '', subject: '', customRecipients: '', scheduledAt: '' }));
      await loadBroadcasts();
    } catch (e) {
      // The send route returns the failed record with the gateway's reason, so
      // refresh the report list and surface the message.
      showError(e instanceof Error ? e.message : 'Broadcast failed');
      await loadBroadcasts();
    }
  };

  const handleResendBroadcast = async (record: BroadcastRecord) => {
    try {
      await communicationsApi.broadcasts.send(record.id, []);
      showSuccess('Broadcast re-sent');
      await loadBroadcasts();
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Broadcast failed');
      await loadBroadcasts();
    }
  };

  // ── Event actions ────────────────────────────────────────────────────────

  const handleSaveEvent = async () => {
    if (!eventForm.title.trim() || !eventForm.startAt) {
      showError('An event needs a title and a start time');
      return;
    }
    try {
      await communicationsApi.events.create({
        title: eventForm.title.trim(),
        category: eventForm.category,
        ministry: eventForm.ministry.trim(),
        startAt: new Date(eventForm.startAt).toISOString(),
        endAt: localToIso(eventForm.endAt),
        location: eventForm.location.trim(),
        description: eventForm.description.trim(),
        color: eventForm.color,
        rsvpRequired: eventForm.rsvpRequired,
        capacity: eventForm.capacity ? Number(eventForm.capacity) : null,
      });
      showSuccess('Event created');
      setEventForm((f) => ({ ...f, title: '', startAt: '', endAt: '', location: '', description: '', capacity: '' }));
      await loadEvents();
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to create event');
    }
  };

  const handleOpenRsvps = async (event: ChurchEventRecord) => {
    setRsvpEvent(event);
    setRsvpForm({ name: '', phone: '', status: 'Going' });
    try {
      setRsvps(await communicationsApi.events.listRsvps(event.id));
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to load RSVPs');
    }
  };

  const handleAddRsvp = async () => {
    if (!rsvpEvent || !rsvpForm.name.trim()) {
      showError('Enter the guest name');
      return;
    }
    try {
      await communicationsApi.events.addRsvp(rsvpEvent.id, {
        name: rsvpForm.name.trim(),
        phone: rsvpForm.phone.trim(),
        status: rsvpForm.status,
      });
      setRsvpForm({ name: '', phone: '', status: 'Going' });
      setRsvps(await communicationsApi.events.listRsvps(rsvpEvent.id));
      await loadEvents();
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to record RSVP');
    }
  };

  // ── Prayer actions ───────────────────────────────────────────────────────

  const handleSavePrayer = async () => {
    if (!prayerForm.requesterName.trim() || !prayerForm.request.trim()) {
      showError('Requester name and the request itself are required');
      return;
    }
    try {
      await communicationsApi.prayerRequests.create({
        requesterName: prayerForm.requesterName.trim(),
        request: prayerForm.request.trim(),
        category: prayerForm.category,
        privacy: prayerForm.privacy,
      });
      showSuccess('Prayer request recorded');
      setPrayerForm((f) => ({ ...f, requesterName: '', request: '' }));
      await loadPrayers();
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to save prayer request');
    }
  };

  const handlePray = async (record: PrayerRequestRecord) => {
    try {
      setPrayers((list) => list.map((p) => (p.id === record.id ? { ...p, prayCount: p.prayCount + 1 } : p)));
      await communicationsApi.prayerRequests.pray(record.id);
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to record prayer');
      await loadPrayers();
    }
  };

  const handleMarkAnswered = async () => {
    if (!answeringRequest) return;
    try {
      await communicationsApi.prayerRequests.update(answeringRequest.id, {
        status: 'Answered',
        praiseReport: praiseReport.trim(),
      });
      showSuccess('Marked as answered');
      setAnsweringRequest(null);
      setPraiseReport('');
      await loadPrayers();
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to update prayer request');
    }
  };

  // ── Celebration actions ──────────────────────────────────────────────────

  const greetingKey = (christianId: string, kind: string, date: string) => `${christianId}|${kind}|${date}`;

  const greetedBy = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of celebrations?.greetings ?? []) {
      map.set(greetingKey(g.christianId, g.kind, g.occasionDate), g.id);
    }
    return map;
  }, [celebrations]);

  const openGreeting = (christianId: string, name: string, kind: 'Birthday' | 'Anniversary', occasionDate: string) => {
    const first = name.split(' ')[0] || name;
    setGreetingTarget({ christianId, name, kind, occasionDate });
    setGreetingChannel('SMS');
    setGreetingRecipient('');
    setGreetingMessage(
      kind === 'Birthday'
        ? `Happy birthday, ${first}! We thank God for your life and pray His blessings over you this year.`
        : `Happy anniversary, ${first}! May God continue to bless your union with grace and joy.`,
    );
  };

  const handleSendGreeting = async () => {
    if (!greetingTarget) return;
    if (greetingChannel === 'Email' && !greetingRecipient.trim()) {
      showError('Enter an email address for this member');
      return;
    }
    try {
      await communicationsApi.celebrations.sendGreeting({
        christianId: greetingTarget.christianId,
        kind: greetingTarget.kind,
        occasionDate: greetingTarget.occasionDate,
        channel: greetingChannel,
        message: greetingMessage.trim(),
        recipient: greetingChannel === 'Email' ? greetingRecipient.trim() : undefined,
      });
      showSuccess(`Greeting sent to ${greetingTarget.name}`);
      setGreetingTarget(null);
      await loadCelebrations();
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to send greeting');
    }
  };

  const handleSaveDateOfBirth = async () => {
    if (!dobTargetId || !dobValue) return;
    try {
      // Send the calendar date as-is: the server anchors it to local midnight,
      // which keeps the birthday on the date the parish actually wrote down.
      await communicationsApi.celebrations.setDateOfBirth(dobTargetId, dobValue);
      showSuccess('Date of birth recorded');
      setDobTargetId(null);
      setDobValue('');
      await loadCelebrations();
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to record date of birth');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTarget.run();
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleteTarget(null);
    }
  };

  // ── Derived lists ────────────────────────────────────────────────────────

  const visibleAnnouncements = useMemo(
    () => (announcementFilter === 'All' ? announcements : announcements.filter((a) => a.status === announcementFilter)),
    [announcements, announcementFilter],
  );

  const visiblePrayers = useMemo(
    () => (prayerFilter === 'All' ? prayers : prayers.filter((p) => p.status === prayerFilter)),
    [prayers, prayerFilter],
  );

  /** Email cannot address the member registry — only staff or a custom list. */
  const audienceOptions = composer.channel === 'Email'
    ? ['Staff', 'Custom list']
    : ['Everyone', 'Active members', 'Staff', 'Ministry', 'Custom list'];

  const eventsByDay = useMemo(() => {
    const map = new Map<string, ChurchEventRecord[]>();
    for (const ev of events) {
      const key = new Date(ev.startAt).toLocaleDateString('en-CA'); // YYYY-MM-DD, local
      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    }
    return map;
  }, [events]);

  /** Calendar cells for the visible month (null = leading/trailing padding). */
  const calendarCells = useMemo(() => {
    const { year, month } = calendarCursor;
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<number | null> = Array.from({ length: firstWeekday }, () => null);
    for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calendarCursor]);

  const upcomingEvents = useMemo(() => {
    const now = Date.now();
    return events.filter((e) => new Date(e.startAt).getTime() >= now).length;
  }, [events]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Page header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#e1e3e3] pb-4">
        <div>
          <h2 className="text-2xl font-serif font-bold text-[#1a1c1c]">Communications</h2>
          <p className="text-xs text-[#444748] italic mt-1">
            "Announcements, broadcasts, events, prayer and celebrations — in one place."
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#444748]">
          <span className={badgeClass('terracotta')}>{upcomingEvents} upcoming</span>
        </div>
      </div>

      {/* Sub-tab bar */}
      <div className="flex border-b border-[#e1e3e3] gap-6 text-xs font-bold tracking-wider uppercase overflow-x-auto">
        {(Object.keys(SUB_TAB_LABELS) as CommunicationsSubTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveSubTab(tab)}
            className={`pb-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeSubTab === tab
                ? 'border-b-2 border-[#c65d3b] text-[#1a1c1c]'
                : 'text-[#444748] hover:text-[#1a1c1c]'
            }`}
          >
            {SUB_TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* ── 1. Announcements ──────────────────────────────────────────────── */}
      {activeSubTab === 'announcements' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              {(['All', ...ANNOUNCEMENT_STATUSES] as Array<'All' | AnnouncementStatus>).map((s) => (
                <button
                  key={s}
                  onClick={() => setAnnouncementFilter(s)}
                  className={`px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wide cursor-pointer ${
                    announcementFilter === s
                      ? 'bg-[#1e1e1e] text-white border-[#1e1e1e]'
                      : 'bg-[#ffffff] text-[#444748] border-[#e1e3e3] hover:border-[#1e1e1e]'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            {visibleAnnouncements.length === 0 && (
              <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 text-xs text-[#444748]">
                No announcements in this filter yet.
              </div>
            )}

            {visibleAnnouncements.map((a) => (
              <div key={a.id} className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-5 shadow-xs space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {a.pinned && <span className="material-symbols-outlined text-sm text-[#c65d3b]">push_pin</span>}
                      <h3 className="text-sm font-bold text-[#1a1c1c]">{a.title}</h3>
                      <span className={badgeClass(AnnouncementTone[a.status])}>{a.status}</span>
                      <span className={badgeClass(a.priority === 'Urgent' ? 'red' : a.priority === 'High' ? 'amber' : 'gray')}>
                        {a.priority}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#444748]">
                      {a.category} · Audience: {a.audience} · {a.authorName || 'System'} · {formatDate(a.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {canEdit && (
                      <button
                        onClick={() => void handleTogglePin(a)}
                        title={a.pinned ? 'Unpin' : 'Pin'}
                        className="p-1.5 rounded hover:bg-[#f4f3f3] cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-base text-[#444748]">push_pin</span>
                      </button>
                    )}
                    {canEdit && a.status === 'Draft' && (
                      <button
                        onClick={() => void handlePublishAnnouncement(a)}
                        title="Publish"
                        className="p-1.5 rounded hover:bg-[#f4f3f3] cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-base text-emerald-700">publish</span>
                      </button>
                    )}
                    {canEdit && (
                      <button
                        onClick={() => {
                          setEditingAnnouncementId(a.id);
                          setAnnouncementForm({
                            title: a.title,
                            content: a.content,
                            category: a.category,
                            audience: a.audience,
                            priority: a.priority,
                            pinned: a.pinned,
                            publishAt: toLocalInput(a.publishAt),
                            expiresAt: toLocalInput(a.expiresAt),
                          });
                        }}
                        title="Edit"
                        className="p-1.5 rounded hover:bg-[#f4f3f3] cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-base text-[#444748]">edit</span>
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() =>
                          setDeleteTarget({
                            label: a.title,
                            run: async () => {
                              await communicationsApi.announcements.remove(a.id);
                              await loadAnnouncements();
                            },
                          })
                        }
                        title="Delete"
                        className="p-1.5 rounded hover:bg-[#f4f3f3] cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-base text-[#ba1a1a]">delete</span>
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-[#1a1c1c] whitespace-pre-wrap">{a.content}</p>
                {(a.publishAt || a.expiresAt) && (
                  <p className="text-[11px] text-[#444748]">
                    {a.publishAt && <>Publishes {formatDateTime(a.publishAt)}</>}
                    {a.publishAt && a.expiresAt && ' · '}
                    {a.expiresAt && <>Expires {formatDateTime(a.expiresAt)}</>}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-5 shadow-xs space-y-3 h-fit">
            <h3 className="text-xs font-bold uppercase tracking-wide text-[#1a1c1c]">
              {editingAnnouncementId ? 'Edit announcement' : 'New announcement'}
            </h3>
            <input
              className={INPUT_CLASS}
              placeholder="Title"
              value={announcementForm.title}
              onChange={(e) => setAnnouncementForm({ ...announcementForm, title: e.target.value })}
            />
            <textarea
              className={`${INPUT_CLASS} h-28`}
              placeholder="Content"
              value={announcementForm.content}
              onChange={(e) => setAnnouncementForm({ ...announcementForm, content: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                className={INPUT_CLASS}
                value={announcementForm.category}
                onChange={(e) => setAnnouncementForm({ ...announcementForm, category: e.target.value })}
              >
                {ANNOUNCEMENT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <select
                className={INPUT_CLASS}
                value={announcementForm.audience}
                onChange={(e) => setAnnouncementForm({ ...announcementForm, audience: e.target.value })}
              >
                {ANNOUNCEMENT_AUDIENCES.map((a) => <option key={a}>{a}</option>)}
              </select>
              <select
                className={INPUT_CLASS}
                value={announcementForm.priority}
                onChange={(e) =>
                  setAnnouncementForm({ ...announcementForm, priority: e.target.value as AnnouncementPriority })
                }
              >
                {(['Normal', 'High', 'Urgent'] as AnnouncementPriority[]).map((p) => <option key={p}>{p}</option>)}
              </select>
              <label className="flex items-center gap-2 text-xs text-[#1a1c1c]">
                <input
                  type="checkbox"
                  className="accent-[#1e1e1e] w-4 h-4"
                  checked={announcementForm.pinned}
                  onChange={(e) => setAnnouncementForm({ ...announcementForm, pinned: e.target.checked })}
                />
                Pin to top
              </label>
            </div>
            <label className="block text-[11px] text-[#444748]">
              Publish at (blank = keep as draft)
              <input
                type="datetime-local"
                className={INPUT_CLASS}
                value={announcementForm.publishAt}
                onChange={(e) => setAnnouncementForm({ ...announcementForm, publishAt: e.target.value })}
              />
            </label>
            <label className="block text-[11px] text-[#444748]">
              Expires at (optional)
              <input
                type="datetime-local"
                className={INPUT_CLASS}
                value={announcementForm.expiresAt}
                onChange={(e) => setAnnouncementForm({ ...announcementForm, expiresAt: e.target.value })}
              />
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void handleSaveAnnouncement()}
                disabled={!canEdit}
                className={`flex-1 py-2 rounded text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] ${
                  canEdit ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
                }`}
              >
                {editingAnnouncementId ? 'Save changes' : 'Create announcement'}
              </button>
              {editingAnnouncementId && (
                <button
                  onClick={resetAnnouncementForm}
                  className="px-3 py-2 rounded text-xs font-bold bg-[#f4f3f3] hover:bg-[#eeeeee] cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 2. Broadcasts ─────────────────────────────────────────────────── */}
      {activeSubTab === 'broadcasts' && (
        <div className="space-y-6">
          <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2">
              {(['SMS', 'Email'] as BroadcastChannel[]).map((ch) => (
                <button
                  key={ch}
                  onClick={() => setComposer((c) => ({ ...c, channel: ch, audience: ch === 'Email' ? 'Staff' : 'Everyone' }))}
                  className={`px-3 py-1.5 rounded text-xs font-bold cursor-pointer ${
                    composer.channel === ch ? 'bg-[#1e1e1e] text-white' : 'bg-[#f4f3f3] text-[#1a1c1c] hover:bg-[#eeeeee]'
                  }`}
                >
                  {ch}
                </button>
              ))}
              <span className="text-[11px] text-[#444748]">
                {composer.channel === 'SMS'
                  ? 'Members are addressed by the phone number on their registry record.'
                  : 'Email reaches staff and any custom address — the registry stores no member email.'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <select
                className={INPUT_CLASS}
                value={composer.audience}
                onChange={(e) => setComposer({ ...composer, audience: e.target.value })}
              >
                {audienceOptions.map((a) => <option key={a}>{a}</option>)}
              </select>
              {composer.audience === 'Ministry' && (
                <input
                  className={INPUT_CLASS}
                  placeholder="Ministry / Jumuiya name"
                  value={composer.ministry}
                  onChange={(e) => setComposer({ ...composer, ministry: e.target.value })}
                />
              )}
              <select
                className={INPUT_CLASS}
                value=""
                onChange={(e) => {
                  const tpl = BROADCAST_TEMPLATES.find((t) => t.name === e.target.value);
                  if (tpl) setComposer((c) => ({ ...c, body: tpl.body }));
                }}
              >
                <option value="">Insert template…</option>
                {BROADCAST_TEMPLATES.map((t) => <option key={t.name}>{t.name}</option>)}
              </select>
            </div>

            {composer.audience === 'Custom list' && (
              <textarea
                className={`${INPUT_CLASS} h-16`}
                placeholder={composer.channel === 'SMS' ? 'Phone numbers, comma separated' : 'Email addresses, comma separated'}
                value={composer.customRecipients}
                onChange={(e) => setComposer({ ...composer, customRecipients: e.target.value })}
              />
            )}

            {composer.channel === 'Email' && (
              <input
                className={INPUT_CLASS}
                placeholder="Subject"
                value={composer.subject}
                onChange={(e) => setComposer({ ...composer, subject: e.target.value })}
              />
            )}

            <textarea
              className={`${INPUT_CLASS} h-28`}
              placeholder="Message"
              value={composer.body}
              onChange={(e) => setComposer({ ...composer, body: e.target.value })}
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[11px] text-[#444748]">
                {composer.body.length} characters
                {composer.channel === 'SMS' && ` · ${Math.max(1, Math.ceil(composer.body.length / SMS_SEGMENT_LENGTH))} SMS segment(s)`}
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="datetime-local"
                  className={INPUT_CLASS}
                  title="Schedule for later (leave blank to send now)"
                  value={composer.scheduledAt}
                  onChange={(e) => setComposer({ ...composer, scheduledAt: e.target.value })}
                />
                <button
                  onClick={() => void handleQueueBroadcast(false)}
                  disabled={!canEdit}
                  className={`px-3 py-2 rounded text-xs font-bold bg-[#f4f3f3] hover:bg-[#eeeeee] ${
                    canEdit ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
                  }`}
                >
                  {composer.scheduledAt ? 'Schedule' : 'Save draft'}
                </button>
                <button
                  onClick={() => void handleQueueBroadcast(true)}
                  disabled={!canEdit}
                  className={`px-4 py-2 rounded text-xs font-bold text-white bg-[#c65d3b] hover:bg-[#a94c2e] flex items-center gap-1.5 ${
                    canEdit ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
                  }`}
                >
                  <span className="material-symbols-outlined text-base">send</span>
                  Send now
                </button>
              </div>
            </div>
          </div>

          <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-5 shadow-xs">
            <h3 className="text-xs font-bold uppercase tracking-wide text-[#1a1c1c] mb-1">Delivery reports</h3>
            <p className="text-[11px] text-[#444748] mb-3">
              Opens and clicks come from a tracking pixel and link redirects in the email itself, so they
              only apply to Email sends.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wide text-[#444748] border-b border-[#e1e3e3]">
                    <th className="py-2 pr-3">Channel</th>
                    <th className="py-2 pr-3">Audience</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Recipients</th>
                    <th className="py-2 pr-3">Sent / Failed</th>
                    <th className="py-2 pr-3">Opened</th>
                    <th className="py-2 pr-3">Clicked</th>
                    <th className="py-2 pr-3">When</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {broadcasts.length === 0 && (
                    <tr><td colSpan={8} className="py-4 text-[#444748]">No broadcasts yet.</td></tr>
                  )}
                  {broadcasts.map((b) => (
                    <tr key={b.id} className="border-b border-[#f4f3f3] align-top">
                      <td className="py-2 pr-3 font-semibold text-[#1a1c1c]">{b.channel}</td>
                      <td className="py-2 pr-3">{b.audience}</td>
                      <td className="py-2 pr-3"><span className={badgeClass(BroadcastTone[b.status])}>{b.status}</span></td>
                      <td className="py-2 pr-3">{b.totalRecipients}</td>
                      <td className="py-2 pr-3">
                        <span className="text-emerald-700 font-semibold">{b.sentCount}</span>
                        {' / '}
                        <span className={b.failedCount ? 'text-red-700 font-semibold' : ''}>{b.failedCount}</span>
                      </td>
                      {/* Engagement only exists for Email (a tracking pixel and
                          link redirects); SMS has nothing to open or click. */}
                      <td className="py-2 pr-3">
                        {b.channel === 'Email' && b.status === 'Sent'
                          ? `${b.openCount} (${ratePct(b.openCount, b.totalRecipients)}%)`
                          : '—'}
                      </td>
                      <td className="py-2 pr-3">
                        {b.channel === 'Email' && b.status === 'Sent'
                          ? `${b.clickCount} (${ratePct(b.clickCount, b.totalRecipients)}%)`
                          : '—'}
                      </td>
                      <td className="py-2 pr-3 text-[#444748]">{formatDateTime(b.sentAt ?? b.scheduledAt ?? b.createdAt)}</td>
                      <td className="py-2">
                        <div className="flex items-center gap-1 justify-end">
                          {canEdit && (
                            <button onClick={() => void handleResendBroadcast(b)} title="Send again" className="p-1 rounded hover:bg-[#f4f3f3] cursor-pointer">
                              <span className="material-symbols-outlined text-base text-[#444748]">refresh</span>
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => setDeleteTarget({
                                label: `${b.channel} broadcast to ${b.audience}`,
                                run: async () => {
                                  await communicationsApi.broadcasts.remove(b.id);
                                  await loadBroadcasts();
                                },
                              })}
                              title="Delete"
                              className="p-1 rounded hover:bg-[#f4f3f3] cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-base text-[#ba1a1a]">delete</span>
                            </button>
                          )}
                        </div>
                        {b.errorMessage && <p className="text-[10px] text-red-700 max-w-[220px]">{b.errorMessage}</p>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── 3. Events & Calendar ──────────────────────────────────────────── */}
      {activeSubTab === 'events' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {(['list', 'calendar'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setEventView(v)}
                    className={`px-3 py-1.5 rounded text-xs font-bold cursor-pointer ${
                      eventView === v ? 'bg-[#1e1e1e] text-white' : 'bg-[#f4f3f3] text-[#1a1c1c] hover:bg-[#eeeeee]'
                    }`}
                  >
                    {v === 'list' ? 'List' : 'Calendar'}
                  </button>
                ))}
              </div>
              {eventView === 'calendar' && (
                <div className="flex items-center gap-2 text-xs">
                  <button
                    onClick={() => setCalendarCursor(({ year, month }) => (month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 }))}
                    className="p-1 rounded hover:bg-[#f4f3f3] cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-base">chevron_left</span>
                  </button>
                  <span className="font-semibold text-[#1a1c1c]">
                    {new Date(calendarCursor.year, calendarCursor.month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                  </span>
                  <button
                    onClick={() => setCalendarCursor(({ year, month }) => (month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 }))}
                    className="p-1 rounded hover:bg-[#f4f3f3] cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-base">chevron_right</span>
                  </button>
                </div>
              )}
            </div>

            {eventView === 'calendar' && (
              <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-4 shadow-xs">
                <div className="grid grid-cols-7 gap-1 text-[10px] font-bold uppercase tracking-wide text-[#444748] mb-2">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="text-center">{d}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {calendarCells.map((day, index) => {
                    if (day === null) return <div key={`pad-${index}`} className="min-h-[64px] rounded bg-[#f9f9f9]" />;
                    const iso = `${calendarCursor.year}-${pad2(calendarCursor.month + 1)}-${pad2(day)}`;
                    const dayEvents = eventsByDay.get(iso) ?? [];
                    const isToday = iso === todayIso();
                    return (
                      <div
                        key={iso}
                        className={`min-h-[64px] rounded border p-1.5 space-y-1 ${
                          isToday ? 'border-[#c65d3b] bg-[#c65d3b]/5' : 'border-[#e1e3e3] bg-[#ffffff]'
                        }`}
                      >
                        <div className={`text-[10px] font-bold ${isToday ? 'text-[#c65d3b]' : 'text-[#444748]'}`}>{day}</div>
                        {dayEvents.map((ev) => (
                          <div
                            key={ev.id}
                            title={`${ev.title} · ${formatDateTime(ev.startAt)}`}
                            className="text-[10px] px-1.5 py-0.5 rounded text-white truncate"
                            style={{ backgroundColor: ev.color }}
                          >
                            {ev.title}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {eventView === 'list' && (
              <div className="space-y-3">
                {events.length === 0 && (
                  <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 text-xs text-[#444748]">No events yet.</div>
                )}
                {events.map((ev) => {
                  const isUpcoming = new Date(ev.startAt).getTime() >= Date.now();
                  return (
                    <div
                      key={ev.id}
                      className={`bg-[#ffffff] border rounded-xl p-4 shadow-xs flex items-start gap-4 ${
                        isUpcoming ? 'border-[#c65d3b]' : 'border-[#e1e3e3]'
                      }`}
                    >
                      <div className="w-1.5 self-stretch rounded" style={{ backgroundColor: ev.color }} />
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold text-[#1a1c1c]">{ev.title}</h3>
                          <span className={badgeClass('gray')}>{ev.category}</span>
                          {isUpcoming && <span className={badgeClass('terracotta')}>Upcoming</span>}
                          {ev.rsvpRequired && <span className={badgeClass('amber')}>RSVP</span>}
                        </div>
                        <p className="text-[11px] text-[#444748]">
                          {formatDateTime(ev.startAt)}
                          {ev.endAt && ` – ${formatDateTime(ev.endAt)}`}
                          {ev.location && ` · ${ev.location}`}
                          {ev.ministry && ` · ${ev.ministry}`}
                        </p>
                        {ev.description && <p className="text-xs text-[#1a1c1c]">{ev.description}</p>}
                        <p className="text-[11px] text-[#444748]">
                          {ev.goingCount} going · {ev.rsvpCount} RSVP{ev.rsvpCount === 1 ? '' : 's'}
                          {ev.capacity != null && ` · capacity ${ev.capacity}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => void handleOpenRsvps(ev)}
                          title="Manage RSVPs"
                          className="px-2.5 py-1.5 rounded text-[11px] font-bold bg-[#f4f3f3] hover:bg-[#eeeeee] cursor-pointer"
                        >
                          RSVPs
                        </button>
                        {canDelete && (
                          <button
                            onClick={() => setDeleteTarget({
                              label: ev.title,
                              run: async () => {
                                await communicationsApi.events.remove(ev.id);
                                await loadEvents();
                              },
                            })}
                            title="Delete"
                            className="p-1.5 rounded hover:bg-[#f4f3f3] cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-base text-[#ba1a1a]">delete</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {rsvpEvent && (
              <div className="bg-[#ffffff] border border-[#1e1e1e] rounded-xl p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-[#1a1c1c]">
                    RSVPs — {rsvpEvent.title}
                  </h3>
                  <button onClick={() => setRsvpEvent(null)} className="text-xs text-[#444748] hover:text-[#1a1c1c] cursor-pointer">
                    Close
                  </button>
                </div>
                {rsvpEvent.capacity != null && (
                  <p className="text-[11px] text-[#444748]">
                    {rsvpEvent.goingCount} of {rsvpEvent.capacity} seats taken
                  </p>
                )}
                <div className="space-y-1">
                  {rsvps.length === 0 && <p className="text-xs text-[#444748]">No RSVPs recorded yet.</p>}
                  {rsvps.map((r) => (
                    <div key={r.id} className="flex items-center justify-between text-xs border-b border-[#f4f3f3] py-1.5">
                      <span className="text-[#1a1c1c]">
                        {r.name} {r.phone && <span className="text-[#444748]">· {r.phone}</span>}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className={badgeClass(r.status === 'Going' ? 'green' : r.status === 'Declined' ? 'red' : 'amber')}>
                          {r.status}
                        </span>
                        {canDelete && (
                          <button
                            onClick={async () => {
                              try {
                                await communicationsApi.events.removeRsvp(rsvpEvent.id, r.id);
                                setRsvps(await communicationsApi.events.listRsvps(rsvpEvent.id));
                                await loadEvents();
                              } catch (e) {
                                showError(e instanceof Error ? e.message : 'Failed to remove RSVP');
                              }
                            }}
                            title="Remove RSVP"
                            className="p-1 rounded hover:bg-[#f4f3f3] cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-sm text-[#ba1a1a]">close</span>
                          </button>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
                {canEdit && (
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <input className={INPUT_CLASS} placeholder="Name" value={rsvpForm.name} onChange={(e) => setRsvpForm({ ...rsvpForm, name: e.target.value })} />
                    <input className={INPUT_CLASS} placeholder="Phone" value={rsvpForm.phone} onChange={(e) => setRsvpForm({ ...rsvpForm, phone: e.target.value })} />
                    <select className={INPUT_CLASS} value={rsvpForm.status} onChange={(e) => setRsvpForm({ ...rsvpForm, status: e.target.value as EventRsvpStatus })}>
                      {(['Going', 'Maybe', 'Declined'] as EventRsvpStatus[]).map((s) => <option key={s}>{s}</option>)}
                    </select>
                    <button onClick={() => void handleAddRsvp()} className="py-2 rounded text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] cursor-pointer">
                      Add RSVP
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-5 shadow-xs space-y-3 h-fit">
            <h3 className="text-xs font-bold uppercase tracking-wide text-[#1a1c1c]">New event</h3>
            <input className={INPUT_CLASS} placeholder="Title" value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <select className={INPUT_CLASS} value={eventForm.category} onChange={(e) => setEventForm({ ...eventForm, category: e.target.value })}>
                {EVENT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <input className={INPUT_CLASS} placeholder="Ministry" value={eventForm.ministry} onChange={(e) => setEventForm({ ...eventForm, ministry: e.target.value })} />
            </div>
            <label className="block text-[11px] text-[#444748]">
              Starts
              <input type="datetime-local" className={INPUT_CLASS} value={eventForm.startAt} onChange={(e) => setEventForm({ ...eventForm, startAt: e.target.value })} />
            </label>
            <label className="block text-[11px] text-[#444748]">
              Ends (optional)
              <input type="datetime-local" className={INPUT_CLASS} value={eventForm.endAt} onChange={(e) => setEventForm({ ...eventForm, endAt: e.target.value })} />
            </label>
            <input className={INPUT_CLASS} placeholder="Location / campus" value={eventForm.location} onChange={(e) => setEventForm({ ...eventForm, location: e.target.value })} />
            <textarea className={`${INPUT_CLASS} h-20`} placeholder="Description" value={eventForm.description} onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} />
            <div className="flex items-center gap-2 flex-wrap">
              {EVENT_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setEventForm({ ...eventForm, color: c })}
                  title={c}
                  className={`w-5 h-5 rounded-full border-2 cursor-pointer ${eventForm.color === c ? 'border-[#1e1e1e]' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-[#1a1c1c]">
              <input
                type="checkbox"
                className="accent-[#1e1e1e] w-4 h-4"
                checked={eventForm.rsvpRequired}
                onChange={(e) => setEventForm({ ...eventForm, rsvpRequired: e.target.checked })}
              />
              RSVP required
            </label>
            {eventForm.rsvpRequired && (
              <input
                className={INPUT_CLASS}
                placeholder="Capacity (blank = unlimited)"
                value={eventForm.capacity}
                onChange={(e) => setEventForm({ ...eventForm, capacity: e.target.value.replace(/[^0-9]/g, '') })}
              />
            )}
            <button
              onClick={() => void handleSaveEvent()}
              disabled={!canEdit}
              className={`w-full py-2 rounded text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] ${
                canEdit ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
              }`}
            >
              Create event
            </button>
          </div>
        </div>
      )}

      {/* ── 4. Prayer requests ────────────────────────────────────────────── */}
      {activeSubTab === 'prayer' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              {(['All', 'Open', 'Answered', 'Archived'] as Array<'All' | PrayerStatus>).map((s) => (
                <button
                  key={s}
                  onClick={() => setPrayerFilter(s)}
                  className={`px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wide cursor-pointer ${
                    prayerFilter === s
                      ? 'bg-[#1e1e1e] text-white border-[#1e1e1e]'
                      : 'bg-[#ffffff] text-[#444748] border-[#e1e3e3] hover:border-[#1e1e1e]'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            {visiblePrayers.length === 0 && (
              <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 text-xs text-[#444748]">
                No prayer requests in this filter. Private requests are only visible to users who can edit this panel.
              </div>
            )}

            {visiblePrayers.map((p) => (
              <div key={p.id} className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-5 shadow-xs space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-[#1a1c1c]">{p.requesterName}</h3>
                      <span className={badgeClass('gray')}>{p.category}</span>
                      <span className={badgeClass(p.privacy === 'Public' ? 'green' : p.privacy === 'Leaders Only' ? 'amber' : 'red')}>
                        {p.privacy}
                      </span>
                      <span className={badgeClass(p.status === 'Answered' ? 'green' : p.status === 'Archived' ? 'gray' : 'terracotta')}>
                        {p.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#444748]">{formatDate(p.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => void handlePray(p)}
                      title="I prayed for this"
                      className="px-2.5 py-1.5 rounded text-[11px] font-bold bg-[#f4f3f3] hover:bg-[#eeeeee] flex items-center gap-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-sm">folded_hands</span>
                      Pray · {p.prayCount}
                    </button>
                    {canEdit && p.status !== 'Answered' && (
                      <button
                        onClick={() => {
                          setAnsweringRequest(p);
                          setPraiseReport(p.praiseReport ?? '');
                        }}
                        title="Mark as answered"
                        className="p-1.5 rounded hover:bg-[#f4f3f3] cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-base text-emerald-700">check_circle</span>
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => setDeleteTarget({
                          label: `prayer request from ${p.requesterName}`,
                          run: async () => {
                            await communicationsApi.prayerRequests.remove(p.id);
                            await loadPrayers();
                          },
                        })}
                        title="Delete"
                        className="p-1.5 rounded hover:bg-[#f4f3f3] cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-base text-[#ba1a1a]">delete</span>
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-[#1a1c1c] whitespace-pre-wrap">{p.request}</p>
                {p.status === 'Answered' && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-800 mb-1">
                      Praise report{p.answeredAt && ` · ${formatDate(p.answeredAt)}`}
                    </p>
                    <p className="text-xs text-emerald-900 whitespace-pre-wrap">{p.praiseReport || 'Answered.'}</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-4 h-fit">
            <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-5 shadow-xs space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[#1a1c1c]">Record a request</h3>
              <input
                className={INPUT_CLASS}
                placeholder="Requester name"
                value={prayerForm.requesterName}
                onChange={(e) => setPrayerForm({ ...prayerForm, requesterName: e.target.value })}
              />
              <textarea
                className={`${INPUT_CLASS} h-28`}
                placeholder="Prayer request"
                value={prayerForm.request}
                onChange={(e) => setPrayerForm({ ...prayerForm, request: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-2">
                <select className={INPUT_CLASS} value={prayerForm.category} onChange={(e) => setPrayerForm({ ...prayerForm, category: e.target.value })}>
                  {PRAYER_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
                <select className={INPUT_CLASS} value={prayerForm.privacy} onChange={(e) => setPrayerForm({ ...prayerForm, privacy: e.target.value as PrayerPrivacy })}>
                  {PRAYER_PRIVACIES.map((p) => <option key={p}>{p}</option>)}
                </select>
              </div>
              <button
                onClick={() => void handleSavePrayer()}
                disabled={!canEdit}
                className={`w-full py-2 rounded text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] ${
                  canEdit ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
                }`}
              >
                Save request
              </button>
            </div>

            {answeringRequest && (
              <div className="bg-[#ffffff] border border-emerald-300 rounded-xl p-5 shadow-xs space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wide text-[#1a1c1c]">
                  Praise report — {answeringRequest.requesterName}
                </h3>
                <textarea
                  className={`${INPUT_CLASS} h-24`}
                  placeholder="How was this prayer answered?"
                  value={praiseReport}
                  onChange={(e) => setPraiseReport(e.target.value)}
                />
                <div className="flex items-center gap-2">
                  <button onClick={() => void handleMarkAnswered()} className="flex-1 py-2 rounded text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 cursor-pointer">
                    Mark answered
                  </button>
                  <button onClick={() => setAnsweringRequest(null)} className="px-3 py-2 rounded text-xs font-bold bg-[#f4f3f3] hover:bg-[#eeeeee] cursor-pointer">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 5. Birthdays & Anniversaries ──────────────────────────────────── */}
      {activeSubTab === 'celebrations' && (
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            {([['week', 'This Week'], ['month', 'This Month'], ['upcoming', 'Upcoming']] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setCelebrationRange(value)}
                className={`px-3 py-1.5 rounded text-xs font-bold cursor-pointer ${
                  celebrationRange === value ? 'bg-[#1e1e1e] text-white' : 'bg-[#f4f3f3] text-[#1a1c1c] hover:bg-[#eeeeee]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {([
              ['Birthday', 'Birthdays', celebrations?.birthdays ?? []],
              ['Anniversary', 'Anniversaries', celebrations?.anniversaries ?? []],
            ] as const).map(([kind, title, entries]) => (
              <div key={kind} className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-5 shadow-xs space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wide text-[#1a1c1c] flex items-center gap-2">
                  <span className="material-symbols-outlined text-base text-[#c65d3b]">
                    {kind === 'Birthday' ? 'cake' : 'celebration'}
                  </span>
                  {title}
                </h3>
                {entries.length === 0 && <p className="text-xs text-[#444748]">Nobody in this window.</p>}
                {entries.map((entry) => {
                  const years = 'turning' in entry ? entry.turning : entry.years;
                  const isGreeted = greetedBy.has(greetingKey(entry.id, kind, entry.date));
                  return (
                    <div key={`${kind}-${entry.id}`} className="flex items-center justify-between gap-3 border-b border-[#f4f3f3] pb-2">
                      <div>
                        <p className="text-xs font-semibold text-[#1a1c1c]">{entry.name}</p>
                        <p className="text-[11px] text-[#444748]">
                          {formatDate(entry.date)} · {kind === 'Birthday' ? `turning ${years}` : `${years} years`}
                          {entry.household && ` · ${entry.household}`}
                          {entry.phone && ` · ${entry.phone}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isGreeted ? (
                          <span className={badgeClass('green')}>Greeted</span>
                        ) : (
                          <button
                            onClick={() => openGreeting(entry.id, entry.name, kind, entry.date)}
                            disabled={!canEdit}
                            className={`px-2.5 py-1.5 rounded text-[11px] font-bold bg-[#c65d3b] text-white hover:bg-[#a94c2e] ${
                              canEdit ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
                            }`}
                          >
                            Send greeting
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {greetingTarget && (
            <div className="bg-[#ffffff] border border-[#c65d3b] rounded-xl p-5 shadow-xs space-y-3 max-w-2xl">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[#1a1c1c]">
                {greetingTarget.kind} greeting — {greetingTarget.name}
              </h3>
              <div className="flex items-center gap-2">
                {(['SMS', 'Email'] as BroadcastChannel[]).map((ch) => (
                  <button
                    key={ch}
                    onClick={() => setGreetingChannel(ch)}
                    className={`px-3 py-1.5 rounded text-xs font-bold cursor-pointer ${
                      greetingChannel === ch ? 'bg-[#1e1e1e] text-white' : 'bg-[#f4f3f3] text-[#1a1c1c] hover:bg-[#eeeeee]'
                    }`}
                  >
                    {ch}
                  </button>
                ))}
                <span className="text-[11px] text-[#444748]">
                  {greetingChannel === 'SMS' ? 'Sent to the phone on the registry record.' : 'The registry stores no member email — enter one below.'}
                </span>
              </div>
              {greetingChannel === 'Email' && (
                <input
                  className={INPUT_CLASS}
                  placeholder="Email address"
                  value={greetingRecipient}
                  onChange={(e) => setGreetingRecipient(e.target.value)}
                />
              )}
              <textarea className={`${INPUT_CLASS} h-24`} value={greetingMessage} onChange={(e) => setGreetingMessage(e.target.value)} />
              <div className="flex items-center gap-2">
                <button onClick={() => void handleSendGreeting()} className="flex-1 py-2 rounded text-xs font-bold text-white bg-[#c65d3b] hover:bg-[#a94c2e] cursor-pointer">
                  Send greeting
                </button>
                <button onClick={() => setGreetingTarget(null)} className="px-3 py-2 rounded text-xs font-bold bg-[#f4f3f3] hover:bg-[#eeeeee] cursor-pointer">
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-5 shadow-xs space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-[#1a1c1c]">
              No date on file ({celebrations?.unrecorded.length ?? 0})
            </h3>
            <p className="text-[11px] text-[#444748]">
              The registry never captured a date of birth. Record one here and the member appears in birthday greetings.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
              {(celebrations?.unrecorded ?? []).map((m) => (
                <div key={m.id} className="border border-[#e1e3e3] rounded p-2 space-y-1">
                  <p className="text-xs font-semibold text-[#1a1c1c]">{m.name}</p>
                  <p className="text-[11px] text-[#444748]">{m.phone || 'No phone'}</p>
                  {dobTargetId === m.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="date"
                        className={INPUT_CLASS}
                        value={dobValue}
                        onChange={(e) => setDobValue(e.target.value)}
                      />
                      <button onClick={() => void handleSaveDateOfBirth()} className="px-2 py-1.5 rounded text-[11px] font-bold text-white bg-[#1e1e1e] cursor-pointer">
                        Save
                      </button>
                    </div>
                  ) : (
                    canEdit && (
                      <button
                        onClick={() => {
                          setDobTargetId(m.id);
                          setDobValue('');
                        }}
                        className="text-[11px] font-bold text-[#c65d3b] hover:underline cursor-pointer"
                      >
                        + Add date of birth
                      </button>
                    )
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <DeleteConfirmationModal
        open={deleteTarget !== null}
        title="Delete communication record"
        recordLabel={deleteTarget?.label ?? ''}
        confirmLabel="Delete"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void handleConfirmDelete()}
      />
    </div>
  );
};
