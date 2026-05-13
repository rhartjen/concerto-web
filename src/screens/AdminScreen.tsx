// ⚠️  SECURITY: VITE_ADMIN_SERVICE_KEY is inlined into the client bundle at
// build time. Any visitor to this URL can extract it from the source.
// For a real deployment, proxy admin mutations through a server-side Edge
// Function so the service role key never leaves the server.

import React, { useCallback, useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../lib/supabase';
import './AdminScreen.css';

console.log('[admin] module loading — VITE_SUPABASE_URL set:', !!import.meta.env.VITE_SUPABASE_URL,
  '| VITE_ADMIN_SERVICE_KEY set:', !!import.meta.env.VITE_ADMIN_SERVICE_KEY,
  '| VITE_ADMIN_PASSWORD set:', !!import.meta.env.VITE_ADMIN_PASSWORD);

if (!import.meta.env.VITE_ADMIN_SERVICE_KEY) {
  console.error('[admin] VITE_ADMIN_SERVICE_KEY is not set — all admin mutations will fail with RLS errors');
}

// Service-role client — bypasses all RLS. Only used in this file.
// persistSession/autoRefreshToken disabled so this client never reads the
// anon session from localStorage; without this the Authorization header would
// carry the anonymous user JWT instead of the service role key, and RLS would
// block everything despite the correct apikey being set.
const admin = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL      ?? '',
  import.meta.env.VITE_ADMIN_SERVICE_KEY ?? '',
  {
    auth: {
      persistSession:     false,
      autoRefreshToken:   false,
      detectSessionInUrl: false,
    },
  },
);

const ADMIN_PW    = import.meta.env.VITE_ADMIN_PASSWORD ?? '';
const SESSION_KEY = 'concerto_admin_v1';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CanvasRow {
  id:           string;
  name:         string;
  slug:         string;
  is_active:    boolean;
  created_at:   string;
  drawingCount: number;
  userCount:    number;
}

interface UserRow {
  id:             string;
  username:       string;
  canvas_id:      string | null;
  last_active_at: string;
  drawingCount:   number;
}

interface BoundingBox {
  x:      number;
  y:      number;
  width:  number;
  height: number;
}

interface DrawingRow {
  id:           string;
  user_id:      string;
  username:     string;
  instrument:   string;
  note:         string;
  color:        string;
  created_at:   string;
  bounding_box: BoundingBox | null;
  path_data:    string;
}

type Tab = 'canvases' | 'users' | 'drawings';

// ── Password gate ─────────────────────────────────────────────────────────────

function PasswordGate({ onAuth }: { onAuth: () => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (ADMIN_PW && value === ADMIN_PW) {
      sessionStorage.setItem(SESSION_KEY, '1');
      onAuth();
    } else {
      setError(true);
      setValue('');
    }
  }

  return (
    <div className="a-gate">
      <form className="a-gate-form" onSubmit={submit}>
        <span className="a-wordmark">concerto admin</span>
        <input
          className={`a-input${error ? ' a-input--error' : ''}`}
          type="password"
          placeholder="password"
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(false); }}
          autoFocus
        />
        {error && <span className="a-hint a-hint--error">incorrect password</span>}
        <button className="a-btn a-btn--primary" type="submit">enter</button>
      </form>
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function Spinner() {
  return <p className="a-loading">loading…</p>;
}

function NoCanvas() {
  return <p className="a-loading">select a canvas first — Canvases tab → select</p>;
}

// ── Canvases tab ──────────────────────────────────────────────────────────────

function CanvasesTab({ onSelect }: { onSelect: (id: string, name: string) => void }) {
  const [rows,      setRows]      = useState<CanvasRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [newName,   setNewName]   = useState('');
  const [newSlug,   setNewSlug]   = useState('');
  const [creating,  setCreating]  = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    console.log('[admin] CanvasesTab load() called');
    try {
      const [cvRes, drRes, usRes] = await Promise.all([
        admin.from('canvases').select('id, name, slug, is_active, created_at').order('created_at'),
        admin.from('drawings').select('canvas_id').eq('is_deleted', false),
        admin.from('users').select('canvas_id').not('canvas_id', 'is', null),
      ]);

      console.log('[admin] canvases fetch', { data: cvRes.data, error: cvRes.error });
      if (drRes.error) console.error('[admin] drawings count fetch failed', drRes.error);
      if (usRes.error) console.error('[admin] users count fetch failed', usRes.error);

      if (cvRes.error) {
        setFetchError(`Failed to load canvases: ${cvRes.error.message} (code: ${cvRes.error.code})`);
        return;
      }

      const dCounts: Record<string, number> = {};
      for (const d of drRes.data ?? []) {
        dCounts[d.canvas_id] = (dCounts[d.canvas_id] ?? 0) + 1;
      }

      const uCounts: Record<string, number> = {};
      for (const u of usRes.data ?? []) {
        if (u.canvas_id) uCounts[u.canvas_id] = (uCounts[u.canvas_id] ?? 0) + 1;
      }

      setRows(
        (cvRes.data ?? []).map((c) => ({
          ...c,
          drawingCount: dCounts[c.id] ?? 0,
          userCount:    uCounts[c.id] ?? 0,
        })),
      );
    } catch (err) {
      console.error('[admin] canvases load threw unexpectedly:', err);
      setFetchError(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    console.log('[admin] CanvasesTab mounted');
    load();
  }, [load]);

  async function toggleActive(c: CanvasRow) {
    await admin.from('canvases').update({ is_active: !c.is_active }).eq('id', c.id);
    load();
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newSlug.trim()) return;
    setCreating(true);
    setCreateErr(null);
    const { error } = await admin.from('canvases').insert({
      name: newName.trim(),
      slug: newSlug.trim().toLowerCase(),
    });
    if (error) {
      setCreateErr(error.message);
    } else {
      setNewName('');
      setNewSlug('');
      await load();
    }
    setCreating(false);
  }

  if (loading) return <Spinner />;

  return (
    <div className="a-content">
      {fetchError && <p className="a-hint a-hint--error">{fetchError}</p>}
      <table className="a-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Slug</th>
            <th>Drawings</th>
            <th>Users</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && !fetchError && (
            <tr><td colSpan={6} style={{ textAlign: 'center', opacity: 0.5 }}>
              no canvases found — create one below
            </td></tr>
          )}
          {rows.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td><code className="a-code">{c.slug}</code></td>
              <td>{c.drawingCount}</td>
              <td>{c.userCount}</td>
              <td>
                <span className={`a-badge ${c.is_active ? 'a-badge--green' : 'a-badge--red'}`}>
                  {c.is_active ? 'active' : 'inactive'}
                </span>
              </td>
              <td className="a-cell-actions">
                <button className="a-btn" onClick={() => onSelect(c.id, c.name)}>
                  select
                </button>
                <button
                  className={`a-btn ${c.is_active ? 'a-btn--danger' : 'a-btn--green'}`}
                  onClick={() => toggleActive(c)}
                >
                  {c.is_active ? 'deactivate' : 'activate'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="a-subpanel">
        <span className="a-subpanel-title">Create canvas</span>
        <form className="a-form-row" onSubmit={handleCreate}>
          <input
            className="a-input a-input--sm"
            placeholder="Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <input
            className="a-input a-input--sm"
            placeholder="slug"
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value)}
          />
          <button
            className="a-btn a-btn--primary"
            type="submit"
            disabled={creating || !newName.trim() || !newSlug.trim()}
          >
            {creating ? 'creating…' : 'create'}
          </button>
        </form>
        {createErr && <span className="a-hint a-hint--error">{createErr}</span>}
      </div>
    </div>
  );
}

// ── Users tab ─────────────────────────────────────────────────────────────────

function UsersTab({ canvasId }: { canvasId: string | null }) {
  const [users,   setUsers]   = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!canvasId) return;
    setLoading(true);

    const [usRes, drRes] = await Promise.all([
      admin.from('users')
        .select('id, username, canvas_id, last_active_at')
        .eq('canvas_id', canvasId)
        .order('last_active_at', { ascending: false }),
      admin.from('drawings')
        .select('user_id')
        .eq('canvas_id', canvasId)
        .eq('is_deleted', false),
    ]);

    const dCounts: Record<string, number> = {};
    for (const d of drRes.data ?? []) {
      dCounts[d.user_id] = (dCounts[d.user_id] ?? 0) + 1;
    }

    setUsers(
      (usRes.data ?? []).map((u) => ({ ...u, drawingCount: dCounts[u.id] ?? 0 })),
    );
    setLoading(false);
  }, [canvasId]);

  useEffect(() => { load(); }, [load]);

  const [opError, setOpError] = useState<string | null>(null);

  async function removeUser(u: UserRow) {
    setOpError(null);

    // Step 1 — soft-delete all drawings for this user. Must happen before the
    // user row is deleted; drawings.user_id → users.id FK will reject the user
    // delete if any drawing rows still reference that id.
    const { error: drawErr } = await admin
      .from('drawings')
      .update({ is_deleted: true })
      .eq('user_id', u.id);

    if (drawErr) {
      console.error('[admin] removeUser — drawings soft-delete failed:', drawErr);
      setOpError(`Failed to soft-delete drawings: ${drawErr.message}`);
      return;
    }

    // Step 2 — delete the user row (service-role client bypasses RLS).
    const { error: userErr } = await admin
      .from('users')
      .delete()
      .eq('id', u.id);

    if (userErr) {
      // Rollback: restore drawings so the canvas stays consistent.
      console.error('[admin] removeUser — user row delete failed, reverting drawings soft-delete:', userErr);
      const { error: revertErr } = await admin
        .from('drawings')
        .update({ is_deleted: false })
        .eq('user_id', u.id);
      if (revertErr) {
        console.error('[admin] removeUser — drawings revert also failed:', revertErr);
      }
      setOpError(`Failed to remove user: ${userErr.message}`);
      return;
    }

    setUsers((prev) => prev.filter((x) => x.id !== u.id));
  }

  async function removeDrawings(u: UserRow) {
    setOpError(null);
    const { error } = await admin.from('drawings').update({ is_deleted: true })
      .eq('user_id', u.id)
      .eq('canvas_id', canvasId!);
    if (error) {
      console.error('[admin] removeDrawings failed:', error);
      setOpError(`Failed: ${error.message}`);
      return;
    }
    setUsers((prev) =>
      prev.map((x) => x.id === u.id ? { ...x, drawingCount: 0 } : x),
    );
  }

  if (!canvasId)   return <NoCanvas />;
  if (loading)     return <Spinner />;

  return (
    <div className="a-content">
      {opError && <p className="a-hint a-hint--error">{opError}</p>}
      {users.length === 0 ? (
        <p className="a-loading">no users on this canvas</p>
      ) : (
        <table className="a-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Drawings</th>
              <th>Last active</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>{u.drawingCount}</td>
                <td className="a-ts">{new Date(u.last_active_at).toLocaleString()}</td>
                <td className="a-cell-actions">
                  <button
                    className="a-btn"
                    onClick={() => removeDrawings(u)}
                    disabled={u.drawingCount === 0}
                  >
                    remove drawings
                  </button>
                  <button
                    className="a-btn a-btn--danger"
                    onClick={() => removeUser(u)}
                  >
                    remove user
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Drawings tab ──────────────────────────────────────────────────────────────

const LARGE_THRESHOLD = 4000;

function isLarge(d: DrawingRow): boolean {
  if (!d.bounding_box) return false;
  return d.bounding_box.width > LARGE_THRESHOLD || d.bounding_box.height > LARGE_THRESHOLD;
}

function getArea(d: DrawingRow): number {
  if (!d.bounding_box) return 0;
  return d.bounding_box.width * d.bounding_box.height;
}

function sizeLabel(d: DrawingRow): string {
  if (!d.bounding_box) return '—';
  return `${Math.round(d.bounding_box.width)} × ${Math.round(d.bounding_box.height)}`;
}

function PathThumb({ drawing }: { drawing: DrawingRow }) {
  const bb = drawing.bounding_box;
  if (!bb || !drawing.path_data) {
    return <div className="a-thumb a-thumb--empty" />;
  }
  const pad = Math.max(Math.max(bb.width, bb.height) * 0.06, 16);
  const vx  = bb.x - pad;
  const vy  = bb.y - pad;
  const vw  = Math.max(bb.width  + pad * 2, 32);
  const vh  = Math.max(bb.height + pad * 2, 32);
  // Keep displayed stroke at ~3px regardless of viewBox scale.
  const strokeWidth = Math.max(vw, vh) / 20;
  return (
    <svg
      className="a-thumb"
      width={60}
      height={60}
      viewBox={`${vx} ${vy} ${vw} ${vh}`}
    >
      <path
        d={drawing.path_data}
        fill="none"
        stroke={drawing.color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type SortKey = 'created_at' | 'size';

function SortTh({ label, col, current, dir, onSort }: {
  label:   string;
  col:     SortKey;
  current: SortKey;
  dir:     'asc' | 'desc';
  onSort:  (k: SortKey) => void;
}) {
  const active = col === current;
  return (
    <th
      className={`a-th-sort${active ? ' a-th-sort--active' : ''}`}
      onClick={() => onSort(col)}
    >
      {label}
      <span className="a-sort-arrow">{active ? (dir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}</span>
    </th>
  );
}

function DrawingsTab({ canvasId }: { canvasId: string | null }) {
  const [drawings, setDrawings] = useState<DrawingRow[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [opError,  setOpError]  = useState<string | null>(null);

  const [sortKey,  setSortKey]  = useState<SortKey>('created_at');
  const [sortDir,  setSortDir]  = useState<'asc' | 'desc'>('desc');
  const [flagMode, setFlagMode] = useState(false);

  // 0 = idle | 1 = confirm | 2 = in-progress
  const [nukeStep,      setNukeStep]      = useState<0 | 1 | 2>(0);
  const [oversizedStep, setOversizedStep] = useState<0 | 1 | 2>(0);

  const load = useCallback(async () => {
    if (!canvasId) return;
    setLoading(true);

    const drRes = await admin.from('drawings')
      .select('id, user_id, instrument, note, color, created_at, bounding_box, path_data')
      .eq('canvas_id', canvasId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });

    const uniqueIds = [...new Set((drRes.data ?? []).map((d) => d.user_id))];
    const usRes = uniqueIds.length > 0
      ? await admin.from('users').select('id, username').in('id', uniqueIds)
      : { data: [] as { id: string; username: string }[] };

    const nameMap: Record<string, string> = {};
    for (const u of usRes.data ?? []) nameMap[u.id] = u.username;

    setDrawings(
      (drRes.data ?? []).map((d) => ({
        ...d,
        bounding_box: d.bounding_box as BoundingBox | null,
        path_data:    d.path_data ?? '',
        username:     nameMap[d.user_id] ?? '(unknown)',
      })),
    );
    setLoading(false);
  }, [canvasId]);

  useEffect(() => { load(); }, [load]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const oversized = drawings.filter(isLarge);

  const sorted = [...drawings].sort((a, b) => {
    const cmp = sortKey === 'size'
      ? getArea(a) - getArea(b)
      : new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return sortDir === 'asc' ? cmp : -cmp;
  });

  // In flag mode, push oversized rows to the top, preserving sort within each group.
  const displayed = flagMode
    ? [...sorted.filter(isLarge), ...sorted.filter((d) => !isLarge(d))]
    : sorted;

  async function softDelete(id: string) {
    setOpError(null);
    const { error } = await admin.from('drawings').update({ is_deleted: true }).eq('id', id);
    if (error) {
      console.error('[admin] softDelete failed:', error);
      setOpError(`Delete failed: ${error.message}`);
      return;
    }
    setDrawings((prev) => prev.filter((d) => d.id !== id));
  }

  async function deleteOversized() {
    if (oversizedStep === 0) { setOversizedStep(1); return; }
    setOversizedStep(2);
    setOpError(null);
    const ids = drawings.filter(isLarge).map((d) => d.id);
    if (ids.length === 0) { setOversizedStep(0); return; }
    const { error } = await admin.from('drawings').update({ is_deleted: true }).in('id', ids);
    if (error) {
      console.error('[admin] deleteOversized failed:', error);
      setOversizedStep(0);
      setOpError(`Delete failed: ${error.message}`);
      return;
    }
    setDrawings((prev) => prev.filter((d) => !isLarge(d)));
    setOversizedStep(0);
    setFlagMode(false);
  }

  async function nuke() {
    if (nukeStep === 0) { setNukeStep(1); return; }
    setNukeStep(2);
    setOpError(null);
    const { error } = await admin
      .from('drawings').update({ is_deleted: true }).eq('canvas_id', canvasId!);
    if (error) {
      console.error('[admin] nuke failed:', error);
      setNukeStep(0);
      setOpError(`Nuke failed: ${error.message}`);
      return;
    }
    setDrawings([]);
    setNukeStep(0);
  }

  if (!canvasId) return <NoCanvas />;
  if (loading)   return <Spinner />;

  return (
    <div className="a-content">
      {opError && <p className="a-hint a-hint--error">{opError}</p>}

      <div className="a-toolbar">
        <span className="a-count">
          {drawings.length} drawing{drawings.length !== 1 ? 's' : ''}
          {oversized.length > 0 && (
            <span className="a-count-flag"> · {oversized.length} oversized</span>
          )}
        </span>

        <div className="a-toolbar-right">
          {/* Flag large drawings toggle */}
          <button
            className={`a-btn${flagMode ? ' a-btn--amber-active' : ' a-btn--amber'}`}
            onClick={() => setFlagMode((v) => !v)}
            disabled={oversized.length === 0}
          >
            flag large drawings
          </button>

          {/* Flag & delete all oversized */}
          {oversizedStep === 0 && (
            <button
              className="a-btn a-btn--danger"
              onClick={deleteOversized}
              disabled={oversized.length === 0}
            >
              flag &amp; delete oversized ({oversized.length})
            </button>
          )}
          {oversizedStep === 1 && (
            <>
              <span className="a-hint a-hint--error">
                delete {oversized.length} oversized drawing{oversized.length !== 1 ? 's' : ''}?
              </span>
              <button className="a-btn a-btn--danger" onClick={deleteOversized}>confirm</button>
              <button className="a-btn" onClick={() => setOversizedStep(0)}>cancel</button>
            </>
          )}
          {oversizedStep === 2 && <span className="a-loading">deleting…</span>}

          {/* Nuke canvas — hidden while oversized confirm is open */}
          {oversizedStep === 0 && nukeStep === 0 && (
            <button className="a-btn a-btn--danger" onClick={nuke}>nuke canvas</button>
          )}
          {oversizedStep === 0 && nukeStep === 1 && (
            <>
              <span className="a-hint a-hint--error">
                delete all {drawings.length} drawings?
              </span>
              <button className="a-btn a-btn--danger" onClick={nuke}>confirm</button>
              <button className="a-btn" onClick={() => setNukeStep(0)}>cancel</button>
            </>
          )}
          {oversizedStep === 0 && nukeStep === 2 && <span className="a-loading">nuking…</span>}
        </div>
      </div>

      {drawings.length === 0 ? (
        <p className="a-loading">no drawings on this canvas</p>
      ) : (
        <table className="a-table">
          <thead>
            <tr>
              <th className="a-col-thumb"></th>
              <th>User</th>
              <th>Instrument</th>
              <th>Note</th>
              <SortTh label="Size"    col="size"       current={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortTh label="Created" col="created_at" current={sortKey} dir={sortDir} onSort={toggleSort} />
              <th></th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((d) => {
              const large = isLarge(d);
              return (
                <tr key={d.id} className={large && flagMode ? 'a-row--flagged' : undefined}>
                  <td className="a-col-thumb">
                    <PathThumb drawing={d} />
                  </td>
                  <td>{d.username}</td>
                  <td>{d.instrument}</td>
                  <td>{d.note}</td>
                  <td>
                    {large && flagMode && (
                      <div><span className="a-warning-badge">⚠️ Large drawing</span></div>
                    )}
                    <span className="a-ts">{sizeLabel(d)}</span>
                  </td>
                  <td className="a-ts">{new Date(d.created_at).toLocaleString()}</td>
                  <td className="a-cell-actions">
                    <button
                      className="a-btn a-btn--danger"
                      onClick={() => softDelete(d.id)}
                    >
                      delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [tab,              setTab]              = useState<Tab>('canvases');
  const [selectedCanvasId, setSelectedCanvasId] = useState<string | null>(null);
  const [selectedName,     setSelectedName]     = useState<string | null>(null);

  function selectCanvas(id: string, name: string) {
    setSelectedCanvasId(id);
    setSelectedName(name);
  }

  return (
    <div className="a-shell">
      <header className="a-header">
        <span className="a-wordmark">concerto admin</span>
        {selectedName && (
          <span className="a-canvas-chip">{selectedName}</span>
        )}
        <button className="a-btn a-btn--ghost" onClick={onLogout}>log out</button>
      </header>

      <nav className="a-tabs">
        {(['canvases', 'users', 'drawings'] as Tab[]).map((t) => (
          <button
            key={t}
            className={`a-tab${tab === t ? ' a-tab--active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === 'canvases' && <CanvasesTab onSelect={selectCanvas} />}
      {tab === 'users'    && <UsersTab    canvasId={selectedCanvasId} />}
      {tab === 'drawings' && <DrawingsTab canvasId={selectedCanvasId} />}
    </div>
  );
}

// ── AdminScreen ───────────────────────────────────────────────────────────────

export default function AdminScreen() {
  const [authed, setAuthed] = useState(
    () => sessionStorage.getItem(SESSION_KEY) === '1',
  );

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    setAuthed(false);
  }

  if (!authed) return <PasswordGate onAuth={() => setAuthed(true)} />;
  return <Dashboard onLogout={logout} />;
}
