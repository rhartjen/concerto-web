// ⚠️  SECURITY: VITE_ADMIN_SERVICE_KEY is inlined into the client bundle at
// build time. Any visitor to this URL can extract it from the source.
// For a real deployment, proxy admin mutations through a server-side Edge
// Function so the service role key never leaves the server.

import React, { useCallback, useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../lib/supabase';
import './AdminScreen.css';

// Service-role client — bypasses all RLS. Only used in this file.
const admin = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL        ?? '',
  import.meta.env.VITE_ADMIN_SERVICE_KEY   ?? '',
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

interface DrawingRow {
  id:         string;
  user_id:    string;
  username:   string;
  instrument: string;
  note:       string;
  color:      string;
  created_at: string;
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
  const [rows,     setRows]     = useState<CanvasRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [newName,  setNewName]  = useState('');
  const [newSlug,  setNewSlug]  = useState('');
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [cvRes, drRes, usRes] = await Promise.all([
      admin.from('canvases').select('id, name, slug, is_active, created_at').order('created_at'),
      admin.from('drawings').select('canvas_id').eq('is_deleted', false),
      admin.from('users').select('canvas_id').not('canvas_id', 'is', null),
    ]);

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
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

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

  async function removeUser(u: UserRow) {
    // Soft-delete all their drawings across all canvases, then remove the user row.
    await admin.from('drawings').update({ is_deleted: true }).eq('user_id', u.id);
    await admin.from('users').delete().eq('id', u.id);
    setUsers((prev) => prev.filter((x) => x.id !== u.id));
  }

  async function removeDrawings(u: UserRow) {
    await admin.from('drawings').update({ is_deleted: true })
      .eq('user_id', u.id)
      .eq('canvas_id', canvasId!);
    setUsers((prev) =>
      prev.map((x) => x.id === u.id ? { ...x, drawingCount: 0 } : x),
    );
  }

  if (!canvasId)   return <NoCanvas />;
  if (loading)     return <Spinner />;

  return (
    <div className="a-content">
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

function DrawingsTab({ canvasId }: { canvasId: string | null }) {
  const [drawings, setDrawings] = useState<DrawingRow[]>([]);
  const [loading,  setLoading]  = useState(false);
  // nukeStep: 0 = idle, 1 = awaiting confirm, 2 = in-progress
  const [nukeStep, setNukeStep] = useState<0 | 1 | 2>(0);

  const load = useCallback(async () => {
    if (!canvasId) return;
    setLoading(true);

    const drRes = await admin.from('drawings')
      .select('id, user_id, instrument, note, color, created_at')
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
        username: nameMap[d.user_id] ?? '(unknown)',
      })),
    );
    setLoading(false);
  }, [canvasId]);

  useEffect(() => { load(); }, [load]);

  async function softDelete(id: string) {
    await admin.from('drawings').update({ is_deleted: true }).eq('id', id);
    setDrawings((prev) => prev.filter((d) => d.id !== id));
  }

  async function nuke() {
    if (nukeStep === 0) { setNukeStep(1); return; }
    setNukeStep(2);
    await admin.from('drawings').update({ is_deleted: true }).eq('canvas_id', canvasId!);
    setDrawings([]);
    setNukeStep(0);
  }

  if (!canvasId) return <NoCanvas />;
  if (loading)   return <Spinner />;

  return (
    <div className="a-content">
      <div className="a-toolbar">
        <span className="a-count">
          {drawings.length} drawing{drawings.length !== 1 ? 's' : ''}
        </span>
        <div className="a-toolbar-right">
          {nukeStep === 0 && (
            <button className="a-btn a-btn--danger" onClick={nuke}>
              nuke canvas
            </button>
          )}
          {nukeStep === 1 && (
            <>
              <span className="a-hint a-hint--error">
                delete all {drawings.length} drawings?
              </span>
              <button className="a-btn a-btn--danger" onClick={nuke}>confirm</button>
              <button className="a-btn" onClick={() => setNukeStep(0)}>cancel</button>
            </>
          )}
          {nukeStep === 2 && <span className="a-loading">nuking…</span>}
        </div>
      </div>

      {drawings.length === 0 ? (
        <p className="a-loading">no drawings on this canvas</p>
      ) : (
        <table className="a-table">
          <thead>
            <tr>
              <th></th>
              <th>User</th>
              <th>Instrument</th>
              <th>Note</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {drawings.map((d) => (
              <tr key={d.id}>
                <td>
                  <span className="a-swatch" style={{ background: d.color }} />
                </td>
                <td>{d.username}</td>
                <td>{d.instrument}</td>
                <td>{d.note}</td>
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
            ))}
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
