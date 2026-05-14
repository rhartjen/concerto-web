-- =============================================================================
-- Concerto — Supabase schema
-- Run this once in the SQL editor (Dashboard → SQL Editor → New query).
-- The editor runs as the service role and bypasses RLS, so the seed INSERT
-- at the bottom succeeds even though canvases has no client-write policy.
-- =============================================================================


-- ── Tables ────────────────────────────────────────────────────────────────────

CREATE TABLE canvases (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  slug       text        NOT NULL UNIQUE,
  width      int         NOT NULL DEFAULT 8000,
  height     int         NOT NULL DEFAULT 8000,
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- users.id mirrors auth.users.id — lets us use auth.uid() directly in policies.
CREATE TABLE users (
  id             uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username       text        NOT NULL UNIQUE,
  canvas_id      uuid        REFERENCES canvases(id) ON DELETE RESTRICT,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE drawings (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id       uuid        NOT NULL REFERENCES canvases(id)  ON DELETE RESTRICT,
  user_id         uuid        NOT NULL REFERENCES users(id)     ON DELETE RESTRICT,
  path_data       text        NOT NULL,
  canvas_position jsonb       NOT NULL, -- { x, y }
  bounding_box    jsonb       NOT NULL, -- { x, y, width, height }
  color           text        NOT NULL,
  instrument      text        NOT NULL,
  note            text        NOT NULL,
  chord           jsonb       NOT NULL, -- string[]
  frequencies     jsonb       NOT NULL, -- number[]
  beat_position   numeric     NOT NULL, -- 1 | 1.5 | 2 | 2.5 … 4.5
  is_deleted      boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE shared_snapshots (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id          uuid        NOT NULL REFERENCES canvases(id) ON DELETE RESTRICT,
  user_id            uuid        NOT NULL REFERENCES users(id)    ON DELETE RESTRICT,
  active_drawing_ids jsonb       NOT NULL, -- uuid[]
  chord_sheet_data   jsonb       NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  view_count         int         NOT NULL DEFAULT 0
);


-- ── Indexes ───────────────────────────────────────────────────────────────────
-- slug already indexed by the UNIQUE constraint on canvases.

-- Most drawing queries filter by canvas, and almost always exclude deleted rows.
CREATE INDEX idx_drawings_canvas_active
  ON drawings (canvas_id)
  WHERE is_deleted = false;

-- Secondary index for user-scoped queries (own drawings panel, etc.).
CREATE INDEX idx_drawings_user_id
  ON drawings (user_id);

-- Snapshot lookups are always by canvas.
CREATE INDEX idx_snapshots_canvas_id
  ON shared_snapshots (canvas_id);

-- Finding which users are on a canvas.
CREATE INDEX idx_users_canvas_id
  ON users (canvas_id);


-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE canvases         ENABLE ROW LEVEL SECURITY;
ALTER TABLE users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE drawings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_snapshots ENABLE ROW LEVEL SECURITY;


-- canvases — public read; no client writes (service role only)
CREATE POLICY "canvases_public_read"
  ON canvases
  FOR SELECT
  USING (true);


-- users — public read
CREATE POLICY "users_public_read"
  ON users
  FOR SELECT
  USING (true);

-- users — anonymous auth: insert only the row that matches your own auth UID
CREATE POLICY "users_insert_own"
  ON users
  FOR INSERT
  WITH CHECK (id = auth.uid());

-- users — update only your own row
CREATE POLICY "users_update_own"
  ON users
  FOR UPDATE
  USING     (id = auth.uid())
  WITH CHECK (id = auth.uid());


-- drawings — public read of non-deleted rows only
CREATE POLICY "drawings_public_read"
  ON drawings
  FOR SELECT
  USING (is_deleted = false);

-- drawings — insert: row must belong to the authenticated user
CREATE POLICY "drawings_insert_own"
  ON drawings
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- drawings — update: only non-deleted rows you own; user_id cannot be changed
CREATE POLICY "drawings_update_own"
  ON drawings
  FOR UPDATE
  USING     (user_id = auth.uid() AND is_deleted = false)
  WITH CHECK (user_id = auth.uid());

-- drawings — delete: only your own rows (client hard-deletes, no soft-delete)
CREATE POLICY "drawings_delete_own"
  ON drawings
  FOR DELETE
  USING (user_id = auth.uid());


-- shared_snapshots — public read
CREATE POLICY "snapshots_public_read"
  ON shared_snapshots
  FOR SELECT
  USING (true);

-- shared_snapshots — insert only rows you own
CREATE POLICY "snapshots_insert_own"
  ON shared_snapshots
  FOR INSERT
  WITH CHECK (user_id = auth.uid());


-- ── Seed ─────────────────────────────────────────────────────────────────────

INSERT INTO canvases (name, slug)
VALUES ('Main Canvas', 'main');
