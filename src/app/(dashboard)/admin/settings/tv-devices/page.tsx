'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Copy,
  Loader2,
  Monitor,
  Plus,
  RefreshCw,
  Trash2,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

interface TvDevice {
  id: string;
  name: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

interface RegisterResult {
  device: TvDevice;
  token: string;
}

// Local-only convenience cache: the admin browser that registered a device
// keeps its plaintext token here so we can offer click-to-open later. Server
// still only stores bcrypt hashes — this is purely a UX shortcut tied to the
// admin's own browser. Other browsers see no Open button and have to revoke
// + re-register if they want one. Keys are device ids; value is the token.
const TOKEN_CACHE_KEY = 'sector7.tv.adminTokens';

function loadCachedTokens(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(TOKEN_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function persistCachedTokens(map: Record<string, string>) {
  try {
    localStorage.setItem(TOKEN_CACHE_KEY, JSON.stringify(map));
  } catch {
    // localStorage can be unavailable in private mode — fall through silently
  }
}

export default function TvDevicesPage() {
  const [devices, setDevices] = useState<TvDevice[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState('');
  const [registering, setRegistering] = useState(false);
  const [justCreated, setJustCreated] = useState<RegisterResult | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [cachedTokens, setCachedTokens] = useState<Record<string, string>>({});

  // Hydrate the token cache from localStorage on mount (SSR safety).
  useEffect(() => {
    setCachedTokens(loadCachedTokens());
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/tv/devices', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const json = (await res.json()) as { data: TvDevice[] };
      setDevices(json.data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load TV devices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleRegister() {
    const name = newName.trim();
    if (!name) {
      toast.error('Name is required');
      return;
    }
    setRegistering(true);
    try {
      const res = await fetch('/api/admin/tv/devices', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to register device');
        return;
      }
      const result = json.data as RegisterResult;
      setJustCreated(result);
      setCachedTokens((prev) => {
        const next = { ...prev, [result.device.id]: result.token };
        persistCachedTokens(next);
        return next;
      });
      setNewName('');
      refresh();
    } catch (err) {
      console.error(err);
      toast.error('Network error');
    } finally {
      setRegistering(false);
    }
  }

  async function handleRevoke(id: string, name: string) {
    if (!confirm(`Revoke "${name}"? The TV will stop loading data within seconds.`)) return;
    setRevokingId(id);
    try {
      const res = await fetch(`/api/admin/tv/devices/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json();
        toast.error(json.error ?? 'Failed to revoke');
        return;
      }
      toast.success(`Revoked ${name}`);
      setCachedTokens((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        persistCachedTokens(next);
        return next;
      });
      refresh();
    } catch (err) {
      console.error(err);
      toast.error('Network error');
    } finally {
      setRevokingId(null);
    }
  }

  function openTv(deviceId: string) {
    const token = cachedTokens[deviceId];
    if (!token) {
      toast.error('Token not saved on this browser — revoke and re-register to open from here');
      return;
    }
    const url = `${window.location.origin}/tv?token=${token}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Monitor className="size-6 text-orange-500" />
            TV Devices
          </h1>
          <p className="text-sm text-muted-foreground">
            Register and manage the leaderboard TVs in this gym.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refresh}
          disabled={loading}
          aria-label="Refresh devices"
        >
          <RefreshCw className={loading ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </div>

      {/* Token-just-created card — click to open on this device, or copy for elsewhere */}
      {justCreated && (
        <div className="rounded-2xl border-2 border-emerald-500/50 bg-emerald-500/10 p-6 space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="size-6 text-emerald-400 mt-1 shrink-0" />
            <div className="flex-1 space-y-1">
              <div className="font-semibold text-lg">Device registered</div>
              <p className="text-sm text-muted-foreground">
                Click <strong>Open TV</strong> to launch the leaderboard on this device, or copy the
                URL / token to set it up on the actual TV. The token is shown only once — copy it
                now if you need it later.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={justCreated.token}
              className="font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(justCreated.token);
                toast.success('Token copied');
              }}
            >
              <Copy /> Copy token
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                const url = `${window.location.origin}/tv?token=${justCreated.token}`;
                window.open(url, '_blank', 'noopener,noreferrer');
              }}
            >
              <Monitor /> Open TV
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const url = `${window.location.origin}/tv?token=${justCreated.token}`;
                navigator.clipboard.writeText(url);
                toast.success('TV URL copied');
              }}
            >
              <ExternalLink /> Copy /tv URL
            </Button>
            <Button variant="ghost" onClick={() => setJustCreated(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* Register form */}
      <div className="rounded-2xl bg-card p-5 ring-1 ring-border/50 space-y-3">
        <div className="font-semibold">Register a new TV</div>
        <div className="flex gap-2">
          <Input
            placeholder='e.g. "Main Floor TV" or "Cardio Wall"'
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRegister();
            }}
            disabled={registering}
          />
          <Button onClick={handleRegister} disabled={registering || !newName.trim()}>
            {registering ? <Loader2 className="animate-spin" /> : <Plus />}
            Register
          </Button>
        </div>
      </div>

      {/* Device list */}
      <div className="space-y-2">
        <div className="text-sm font-medium text-muted-foreground">
          Registered devices {devices ? `(${devices.length})` : ''}
        </div>
        {devices === null ? (
          <div className="space-y-2">
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
          </div>
        ) : devices.length === 0 ? (
          <div className="rounded-2xl bg-card p-8 ring-1 ring-border/50 text-center">
            <div className="text-muted-foreground">
              No devices yet. Register one above to get a TV running.
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {devices.map((d) => {
              const hasToken = Boolean(cachedTokens[d.id]) && !d.revokedAt;
              return (
                <div
                  key={d.id}
                  role={hasToken ? 'button' : undefined}
                  tabIndex={hasToken ? 0 : undefined}
                  onClick={hasToken ? () => openTv(d.id) : undefined}
                  onKeyDown={
                    hasToken
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openTv(d.id);
                          }
                        }
                      : undefined
                  }
                  className={`flex items-center justify-between rounded-2xl bg-card p-4 ring-1 ring-border/50 ${
                    hasToken
                      ? 'cursor-pointer transition hover:bg-card/70 hover:ring-orange-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500'
                      : ''
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold truncate">{d.name}</span>
                      {d.revokedAt ? (
                        <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-400">
                          Revoked
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400">
                          Active
                        </span>
                      )}
                      {hasToken && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2 py-0.5 text-xs text-orange-400">
                          <ExternalLink className="size-3" /> Click to open
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Created {formatDate(d.createdAt)}
                      {d.lastSeenAt && ` · Last seen ${formatRelative(d.lastSeenAt)}`}
                    </div>
                  </div>
                  {!d.revokedAt && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRevoke(d.id, d.name);
                      }}
                      disabled={revokingId === d.id}
                    >
                      {revokingId === d.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                      Revoke
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}
