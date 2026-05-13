'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CalendarDays,
  Loader2,
  Megaphone,
  Monitor,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import Link from 'next/link';

interface ControlState {
  pinnedPanel: string | null;
  shoutout: { message: string; expiresAt: string } | null;
}

interface Announcement {
  id: string;
  title: string;
  body: string;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TvEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  icon: string | null;
  eventAt: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const PANEL_OPTIONS: { key: string; label: string }[] = [
  { key: 'bench', label: '🏋️ Bench Press' },
  { key: 'squat', label: '🦵 Squat' },
  { key: 'deadlift', label: '💪 Deadlift' },
  { key: 'latestPRs', label: '⚡ Latest PRs' },
  { key: 'events', label: '📅 Upcoming Events' },
];

const SHOUTOUT_TTL_OPTIONS: { sec: number; label: string }[] = [
  { sec: 30, label: '30s' },
  { sec: 60, label: '1 min' },
  { sec: 180, label: '3 min' },
  { sec: 600, label: '10 min' },
];

export default function TvControlPage() {
  const [state, setState] = useState<ControlState | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(false);
  const [shoutoutText, setShoutoutText] = useState('');
  const [shoutoutTtl, setShoutoutTtl] = useState(60);
  const [submitting, setSubmitting] = useState(false);

  // Announcement form state — `editingId` null = create mode.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [annIcon, setAnnIcon] = useState('');
  const [annActive, setAnnActive] = useState(true);
  const [annExpiresAt, setAnnExpiresAt] = useState('');
  const [showForm, setShowForm] = useState(false);

  // Events list + form state
  const [events, setEvents] = useState<TvEvent[]>([]);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [evTitle, setEvTitle] = useState('');
  const [evDescription, setEvDescription] = useState('');
  const [evLocation, setEvLocation] = useState('');
  const [evIcon, setEvIcon] = useState('');
  const [evEventAt, setEvEventAt] = useState('');
  const [evActive, setEvActive] = useState(true);
  const [showEventForm, setShowEventForm] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [controlRes, annRes, evRes] = await Promise.all([
        fetch('/api/admin/tv-control', { cache: 'no-store' }),
        fetch('/api/admin/tv/announcements', { cache: 'no-store' }),
        fetch('/api/admin/tv/events', { cache: 'no-store' }),
      ]);
      if (!controlRes.ok) throw new Error(`Status ${controlRes.status}`);
      const controlJson = (await controlRes.json()) as { data: ControlState };
      setState(controlJson.data);
      if (annRes.ok) {
        const annJson = (await annRes.json()) as { data: Announcement[] };
        setAnnouncements(annJson.data);
      }
      if (evRes.ok) {
        const evJson = (await evRes.json()) as { data: TvEvent[] };
        setEvents(evJson.data);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load TV control state');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function resetForm() {
    setEditingId(null);
    setAnnTitle('');
    setAnnBody('');
    setAnnIcon('');
    setAnnActive(true);
    setAnnExpiresAt('');
    setShowForm(false);
  }

  function openCreate() {
    resetForm();
    setShowForm(true);
  }

  function openEdit(a: Announcement) {
    setEditingId(a.id);
    setAnnTitle(a.title);
    setAnnBody(a.body);
    setAnnIcon(a.icon ?? '');
    setAnnActive(a.isActive);
    // datetime-local needs `YYYY-MM-DDTHH:mm` without timezone.
    setAnnExpiresAt(a.expiresAt ? toLocalInputValue(a.expiresAt) : '');
    setShowForm(true);
  }

  async function saveAnnouncement() {
    const title = annTitle.trim();
    const body = annBody.trim();
    if (!title || !body) {
      toast.error('Title and body are required');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        title,
        body,
        icon: annIcon.trim() || null,
        isActive: annActive,
        expiresAt: annExpiresAt ? new Date(annExpiresAt).toISOString() : null,
      };
      const res = await fetch(
        editingId ? `/api/admin/tv/announcements/${editingId}` : '/api/admin/tv/announcements',
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to save announcement');
        return;
      }
      toast.success(editingId ? 'Announcement updated' : 'Announcement added');
      resetForm();
      refresh();
    } catch (err) {
      console.error(err);
      toast.error('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleAnnouncement(a: Announcement) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/tv/announcements/${a.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isActive: !a.isActive }),
      });
      if (!res.ok) {
        const json = await res.json();
        toast.error(json.error ?? 'Failed to update');
        return;
      }
      refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteAnnouncement(id: string) {
    if (!confirm('Delete this announcement?')) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/tv/announcements/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json();
        toast.error(json.error ?? 'Failed to delete');
        return;
      }
      toast.success('Announcement deleted');
      refresh();
    } finally {
      setSubmitting(false);
    }
  }

  // ── Events ─────────────────────────────────────────────────────────────
  function resetEventForm() {
    setEditingEventId(null);
    setEvTitle('');
    setEvDescription('');
    setEvLocation('');
    setEvIcon('');
    setEvEventAt('');
    setEvActive(true);
    setShowEventForm(false);
  }

  function openCreateEvent() {
    resetEventForm();
    setShowEventForm(true);
  }

  function openEditEvent(e: TvEvent) {
    setEditingEventId(e.id);
    setEvTitle(e.title);
    setEvDescription(e.description ?? '');
    setEvLocation(e.location ?? '');
    setEvIcon(e.icon ?? '');
    setEvEventAt(toLocalInputValue(e.eventAt));
    setEvActive(e.isActive);
    setShowEventForm(true);
  }

  async function saveEvent() {
    const title = evTitle.trim();
    if (!title) {
      toast.error('Title is required');
      return;
    }
    if (!evEventAt) {
      toast.error('Event date/time is required');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        title,
        description: evDescription.trim() || null,
        location: evLocation.trim() || null,
        icon: evIcon.trim() || null,
        eventAt: new Date(evEventAt).toISOString(),
        isActive: evActive,
      };
      const res = await fetch(
        editingEventId ? `/api/admin/tv/events/${editingEventId}` : '/api/admin/tv/events',
        {
          method: editingEventId ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to save event');
        return;
      }
      toast.success(editingEventId ? 'Event updated' : 'Event added');
      resetEventForm();
      refresh();
    } catch (err) {
      console.error(err);
      toast.error('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleEvent(e: TvEvent) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/tv/events/${e.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isActive: !e.isActive }),
      });
      if (!res.ok) {
        const json = await res.json();
        toast.error(json.error ?? 'Failed to update');
        return;
      }
      refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteEvent(id: string) {
    if (!confirm('Delete this event?')) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/tv/events/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json();
        toast.error(json.error ?? 'Failed to delete');
        return;
      }
      toast.success('Event deleted');
      refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function setPin(panel: string | null) {
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/tv-control', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pinnedPanel: panel }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to update');
        return;
      }
      setState((s) => (s ? { ...s, pinnedPanel: panel } : s));
      toast.success(
        panel ? `Pinned ${PANEL_OPTIONS.find((p) => p.key === panel)?.label}` : 'Pin cleared',
      );
    } catch (err) {
      console.error(err);
      toast.error('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  async function sendShoutout() {
    const msg = shoutoutText.trim();
    if (!msg) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/tv-control', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ shoutout: msg, shoutoutTtlSec: shoutoutTtl }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to broadcast');
        return;
      }
      toast.success(`Shoutout broadcast for ${shoutoutTtl}s`);
      setShoutoutText('');
      refresh();
    } catch (err) {
      console.error(err);
      toast.error('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  async function clearShoutout() {
    setSubmitting(true);
    try {
      await fetch('/api/admin/tv-control', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ shoutout: null }),
      });
      refresh();
    } finally {
      setSubmitting(false);
    }
  }

  const pinnedPanelLabel = state?.pinnedPanel
    ? (PANEL_OPTIONS.find((p) => p.key === state.pinnedPanel)?.label ?? state.pinnedPanel)
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Monitor className="size-6 text-orange-500" />
            TV Control
          </h1>
          <p className="text-sm text-muted-foreground">
            Pin a panel or broadcast a shoutout to the gym TV.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/settings/tv-devices">
            <Button variant="outline" size="sm">
              Manage Devices
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      {/* Pin panel */}
      <div className="rounded-2xl bg-card p-5 ring-1 ring-border/50 space-y-4">
        <div className="flex items-center gap-2">
          <Pin className="size-5 text-orange-400" />
          <div className="font-semibold">Pin a panel</div>
        </div>
        <p className="text-sm text-muted-foreground">
          When pinned, the TV stops rotating and stays on the chosen panel until you clear it.
        </p>
        {pinnedPanelLabel && (
          <div className="rounded-xl bg-orange-500/10 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-orange-300">
              <Pin className="size-4" />
              <span className="font-medium">Currently pinned:</span>
              <span>{pinnedPanelLabel}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setPin(null)} disabled={submitting}>
              <PinOff /> Clear
            </Button>
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {PANEL_OPTIONS.map((p) => {
            const isActive = state?.pinnedPanel === p.key;
            return (
              <Button
                key={p.key}
                variant={isActive ? 'default' : 'outline'}
                onClick={() => setPin(isActive ? null : p.key)}
                disabled={submitting}
                className="justify-start"
              >
                {p.label}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Shoutout */}
      <div className="rounded-2xl bg-card p-5 ring-1 ring-border/50 space-y-4">
        <div className="flex items-center gap-2">
          <Megaphone className="size-5 text-orange-400" />
          <div className="font-semibold">Broadcast a shoutout</div>
        </div>
        <p className="text-sm text-muted-foreground">
          A banner shown across the top of the TV for the chosen duration.
        </p>
        {state?.shoutout && (
          <div className="rounded-xl bg-orange-500/10 px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-xs uppercase tracking-wider text-orange-300">
                Currently broadcasting
              </div>
              <div className="font-semibold truncate">📣 {state.shoutout.message}</div>
              <div className="text-xs text-muted-foreground">
                Expires {new Date(state.shoutout.expiresAt).toLocaleTimeString()}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={clearShoutout} disabled={submitting}>
              Clear
            </Button>
          </div>
        )}
        <Input
          placeholder='e.g. "Welcome to leg day, Priya! 🦵"'
          value={shoutoutText}
          onChange={(e) => setShoutoutText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') sendShoutout();
          }}
          maxLength={500}
        />
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground mr-2">Show for:</span>
            {SHOUTOUT_TTL_OPTIONS.map((opt) => (
              <Button
                key={opt.sec}
                variant={shoutoutTtl === opt.sec ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShoutoutTtl(opt.sec)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
          <Button onClick={sendShoutout} disabled={submitting || !shoutoutText.trim()}>
            {submitting ? <Loader2 className="animate-spin" /> : <Megaphone />}
            Broadcast
          </Button>
        </div>
      </div>

      {/* Announcements */}
      <div className="rounded-2xl bg-card p-5 ring-1 ring-border/50 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Megaphone className="size-5 text-yellow-400" />
            <div className="font-semibold">Announcements</div>
          </div>
          {!showForm && (
            <Button size="sm" onClick={openCreate} disabled={submitting}>
              <Plus /> Add
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Full-screen slides shown in the TV rotation (e.g. promos, events). Each active,
          non-expired slide appears as one panel.
        </p>

        {showForm && (
          <div className="rounded-xl bg-muted/30 p-4 space-y-3 ring-1 ring-border/40">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-3">
              <div>
                <Label htmlFor="ann-title">Title</Label>
                <Input
                  id="ann-title"
                  placeholder="e.g. Free Kickboxing Trial"
                  value={annTitle}
                  onChange={(e) => setAnnTitle(e.target.value)}
                  maxLength={120}
                />
              </div>
              <div>
                <Label htmlFor="ann-icon">Icon (emoji)</Label>
                <Input
                  id="ann-icon"
                  placeholder="🥊"
                  value={annIcon}
                  onChange={(e) => setAnnIcon(e.target.value)}
                  maxLength={8}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="ann-body">Body</Label>
              <Textarea
                id="ann-body"
                placeholder="Saturday 9am — open to all members. Walk in or DM the front desk."
                value={annBody}
                onChange={(e) => setAnnBody(e.target.value)}
                maxLength={800}
                rows={4}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ann-expires">Expires (optional)</Label>
                <Input
                  id="ann-expires"
                  type="datetime-local"
                  value={annExpiresAt}
                  onChange={(e) => setAnnExpiresAt(e.target.value)}
                />
              </div>
              <div className="flex items-end gap-3 pb-1">
                <Switch id="ann-active" checked={annActive} onCheckedChange={setAnnActive} />
                <Label htmlFor="ann-active" className="cursor-pointer">
                  Active
                </Label>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={resetForm} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={saveAnnouncement} disabled={submitting}>
                {submitting ? <Loader2 className="animate-spin" /> : null}
                {editingId ? 'Save' : 'Add'}
              </Button>
            </div>
          </div>
        )}

        {announcements.length === 0 ? (
          <div className="text-sm text-muted-foreground italic">No announcements yet.</div>
        ) : (
          <div className="space-y-2">
            {announcements.map((a) => {
              const expired = a.expiresAt && new Date(a.expiresAt).getTime() <= Date.now();
              const liveOnTv = a.isActive && !expired;
              return (
                <div
                  key={a.id}
                  className="flex items-start gap-3 rounded-xl bg-muted/20 p-3 ring-1 ring-border/30"
                >
                  <div className="text-3xl shrink-0">{a.icon ?? '📣'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-semibold truncate">{a.title}</div>
                      {liveOnTv ? (
                        <span className="text-[10px] uppercase tracking-wider rounded-full bg-emerald-500/20 px-2 py-0.5 text-emerald-300">
                          Live on TV
                        </span>
                      ) : expired ? (
                        <span className="text-[10px] uppercase tracking-wider rounded-full bg-zinc-700/40 px-2 py-0.5 text-zinc-300">
                          Expired
                        </span>
                      ) : (
                        <span className="text-[10px] uppercase tracking-wider rounded-full bg-zinc-700/40 px-2 py-0.5 text-zinc-300">
                          Inactive
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground line-clamp-2 whitespace-pre-wrap">
                      {a.body}
                    </div>
                    {a.expiresAt && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Expires {new Date(a.expiresAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Switch
                      checked={a.isActive}
                      onCheckedChange={() => toggleAnnouncement(a)}
                      disabled={submitting}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(a)}
                      disabled={submitting}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteAnnouncement(a.id)}
                      disabled={submitting}
                    >
                      <Trash2 className="size-4 text-red-400" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Upcoming Events */}
      <div className="rounded-2xl bg-card p-5 ring-1 ring-border/50 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-5 text-sky-400" />
            <div className="font-semibold">Upcoming Events</div>
          </div>
          {!showEventForm && (
            <Button size="sm" onClick={openCreateEvent} disabled={submitting}>
              <Plus /> Add
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          A &ldquo;Coming Up&rdquo; board on the TV rotation. The next 5 active, future-dated events
          show up automatically — past events fall off on their own.
        </p>

        {showEventForm && (
          <div className="rounded-xl bg-muted/30 p-4 space-y-3 ring-1 ring-border/40">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-3">
              <div>
                <Label htmlFor="ev-title">Title</Label>
                <Input
                  id="ev-title"
                  placeholder="e.g. Beach Workout"
                  value={evTitle}
                  onChange={(e) => setEvTitle(e.target.value)}
                  maxLength={120}
                />
              </div>
              <div>
                <Label htmlFor="ev-icon">Icon (emoji)</Label>
                <Input
                  id="ev-icon"
                  placeholder="🏖️"
                  value={evIcon}
                  onChange={(e) => setEvIcon(e.target.value)}
                  maxLength={8}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ev-when">When</Label>
                <Input
                  id="ev-when"
                  type="datetime-local"
                  value={evEventAt}
                  onChange={(e) => setEvEventAt(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="ev-location">Location (optional)</Label>
                <Input
                  id="ev-location"
                  placeholder="e.g. Besant Nagar Beach"
                  value={evLocation}
                  onChange={(e) => setEvLocation(e.target.value)}
                  maxLength={200}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="ev-desc">Description (optional)</Label>
              <Textarea
                id="ev-desc"
                placeholder="Bring water and a friend. Meet at the lifeguard tower."
                value={evDescription}
                onChange={(e) => setEvDescription(e.target.value)}
                maxLength={800}
                rows={3}
              />
            </div>
            <div className="flex items-end gap-3 pb-1">
              <Switch id="ev-active" checked={evActive} onCheckedChange={setEvActive} />
              <Label htmlFor="ev-active" className="cursor-pointer">
                Active
              </Label>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={resetEventForm} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={saveEvent} disabled={submitting}>
                {submitting ? <Loader2 className="animate-spin" /> : null}
                {editingEventId ? 'Save' : 'Add'}
              </Button>
            </div>
          </div>
        )}

        {events.length === 0 ? (
          <div className="text-sm text-muted-foreground italic">No events yet.</div>
        ) : (
          <div className="space-y-2">
            {events.map((e) => {
              const past = new Date(e.eventAt).getTime() <= Date.now();
              const liveOnTv = e.isActive && !past;
              return (
                <div
                  key={e.id}
                  className="flex items-start gap-3 rounded-xl bg-muted/20 p-3 ring-1 ring-border/30"
                >
                  <div className="text-3xl shrink-0">{e.icon ?? '📅'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-semibold truncate">{e.title}</div>
                      {liveOnTv ? (
                        <span className="text-[10px] uppercase tracking-wider rounded-full bg-emerald-500/20 px-2 py-0.5 text-emerald-300">
                          Live on TV
                        </span>
                      ) : past ? (
                        <span className="text-[10px] uppercase tracking-wider rounded-full bg-zinc-700/40 px-2 py-0.5 text-zinc-300">
                          Past
                        </span>
                      ) : (
                        <span className="text-[10px] uppercase tracking-wider rounded-full bg-zinc-700/40 px-2 py-0.5 text-zinc-300">
                          Inactive
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {new Date(e.eventAt).toLocaleString()}
                      {e.location && <> · {e.location}</>}
                    </div>
                    {e.description && (
                      <div className="text-sm text-muted-foreground line-clamp-2 whitespace-pre-wrap mt-1">
                        {e.description}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Switch
                      checked={e.isActive}
                      onCheckedChange={() => toggleEvent(e)}
                      disabled={submitting}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditEvent(e)}
                      disabled={submitting}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteEvent(e.id)}
                      disabled={submitting}
                    >
                      <Trash2 className="size-4 text-red-400" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// Convert an ISO string to the format expected by `<input type="datetime-local">`,
// which is `YYYY-MM-DDTHH:mm` in local time (no timezone suffix).
function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
