import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// DrawingInsert mirrors the drawings table columns the client sends.
interface DrawingInsert {
  id:              string;
  canvas_id:       string;
  user_id:         string;
  path_data:       string;
  canvas_position: Record<string, number>;
  bounding_box:    Record<string, number>;
  color:           string;
  instrument:      string;
  note:            string;
  chord:           string[];
  frequencies:     number[];
  beat_position:   number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    // ── 1. Parse and validate request body ───────────────────────────────────
    let drawing: DrawingInsert, user_id: string, canvas_id: string;
    try {
      ({ drawing, user_id, canvas_id } = await req.json());
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    if (!drawing || !user_id || !canvas_id) {
      return json({ error: 'Missing required fields: drawing, user_id, canvas_id' }, 400);
    }

    // ── 2. Verify the caller's JWT matches the claimed user_id ───────────────
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    );

    const { data: { user }, error: authErr } = await anonClient.auth.getUser(token);
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);
    if (user.id !== user_id) return json({ error: 'Forbidden' }, 403);

    // ── Service role client — bypasses RLS for all checks and the insert ─────
    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    // ── 3. Canvas must be active ─────────────────────────────────────────────
    const { data: canvas } = await db
      .from('canvases')
      .select('is_active')
      .eq('id', canvas_id)
      .single();

    if (!canvas?.is_active) {
      return json({ error: 'Canvas is not active' }, 403);
    }

    // ── 4. Rate limit: ≤ 5 drawings per 60-second window ────────────────────
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count: recentCount } = await db
      .from('drawings')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user_id)
      .gte('created_at', since);

    if ((recentCount ?? 0) > 5) {
      return json({ error: 'Slow down' }, 429);
    }

    // ── 5. Per-user drawing cap: < 24 non-deleted drawings globally ──────────
    const { count: totalCount } = await db
      .from('drawings')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user_id)
      .eq('is_deleted', false);

    if ((totalCount ?? 0) >= 24) {
      return json({ error: 'Drawing limit reached' }, 400);
    }

    // ── 6. Insert — override user_id and canvas_id with server-verified values
    const { data: row, error: insertErr } = await db
      .from('drawings')
      .insert({
        ...drawing,
        user_id,    // always use the JWT-verified identity
        canvas_id,  // always use the request-level canvas_id
      })
      .select()
      .single();

    if (insertErr) {
      console.error('insert error:', insertErr.message);
      return json({ error: insertErr.message }, 500);
    }

    return json(row, 201);

  } catch (err) {
    console.error('unexpected error:', err);
    return json({ error: String(err) }, 500);
  }
});
