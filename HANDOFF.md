# Concerto Web — Project Handoff

> **Formerly:** Symphonvas. Renamed to **Concerto** at the start of the current development phase.

**Stack:** React 18 · TypeScript 6 · Vite 5.4 · Zustand 5 · Web Audio API · Supabase  
**Entry point:** `src/main.tsx` → `src/App.tsx`  
**Dev server:** `npm run dev` (Vite HMR)  
**Build:** `npm run build` (tsc + Vite bundle → `dist/`)

---

## File / Folder Structure

```
concerto-web/
├── index.html                  # Vite HTML shell; loads DM Sans (300,500) + DM Mono (400,500)
│                               # from Google Fonts; theme-color #f0f2f5; apple-mobile-web-app-
│                               # status-bar-style: default
├── package.json
├── tsconfig.json               # Project references root
├── tsconfig.app.json           # App source tsconfig (strict, bundler resolution)
├── tsconfig.node.json          # Vite config tsconfig
├── vite.config.ts              # @vitejs/plugin-react, no special aliases
├── eslint.config.js
│
├── public/                     # Copied verbatim into dist/
│   ├── manifest.json           # PWA manifest (name, icons, display: standalone)
│   ├── favicon.svg
│   ├── icon-180.svg
│   └── icons.svg
│
└── src/
    ├── main.tsx                # ReactDOM.createRoot, mounts <App />
    ├── App.tsx                 # BrowserRouter + route table + global <Toast /> +
    │                           # global <UsernameModal />
    ├── index.css               # CSS reset; :root CSS custom properties (full light-theme
    │                           # token system); global DM Sans font
    ├── App.css                 # Empty (Vite scaffold cleared)
    │
    ├── assets/
    │   ├── hero.png            # Unused placeholder from Vite scaffold
    │   ├── react.svg           # Unused
    │   └── vite.svg            # Unused
    │
    ├── components/
    │   ├── Canvas.tsx          # Core canvas: drawing, pan/zoom, audio unlock,
    │   │                       # stroke grouping, MergeRing + NavRing animations,
    │   │                       # sidebar pan-to-drawing, pinch zoom, viewport mode
    │   │                       # toggle, brush size, minimap (desktop only)
    │   ├── Canvas.css
    │   ├── ColorPicker.tsx     # 9-swatch instrument selector + brush size slider
    │   │                       # (2–40 px range with live color-matched preview dot);
    │   │                       # reads INSTRUMENT_MAP and useBrushStore
    │   ├── ColorPicker.css
    │   ├── DrawingPanel.tsx    # Bottom sheet / sidebar: drawing cards with mute,
    │   │                       # volume slider, delete/hide, canvas pan-on-tap;
    │   │                       # Shuffle + Sheet buttons; viewport mode label;
    │   │                       # "Sounds in view" count in viewport mode;
    │   │                       # uses lucide-react icons (Volume2, VolumeX, Eye,
    │   │                       # EyeOff, X) at size=14 strokeWidth=1.5
    │   ├── DrawingPanel.css
    │   ├── OnboardingOverlay.tsx  # 3-slide swipeable first-launch tutorial;
    │   │                          # dismissal persisted in localStorage
    │   ├── OnboardingOverlay.css
    │   ├── TempoBar.tsx        # Fixed top bar: "Concerto" wordmark + "90 BPM" pill button
    │   │                       # that opens a position: fixed popover card containing a
    │   │                       # large BPM readout, full-width slider, and tap-tempo button.
    │   │                       # Popover anchors left or right based on screen-edge proximity.
    │   │                       # Closes on outside tap, pill re-tap, or canvas draw start.
    │   ├── TempoBar.css
    │   ├── Toast.tsx           # Global toast renderer (reads toastStore)
    │   ├── Toast.css
    │   ├── UsernameModal.tsx   # Full-screen blocking modal on first visit; username
    │   │                       # validation (3–20 chars, [a-zA-Z0-9_]); calls
    │   │                       # sessionStore.setUsername; handles duplicate error
    │   └── UsernameModal.css
    │
    ├── constants/
    │   ├── instrumentMap.ts    # InstrumentName union, INSTRUMENT_MAP (hex→instrument),
    │   │                       # INSTRUMENT_GAIN (mix levels), getInstrumentForColor()
    │   ├── limits.ts           # STROKE_GROUP_WINDOW_MS, STROKE_GROUP_PROXIMITY_PX,
    │   │                       # CANVAS_WIDTH, CANVAS_HEIGHT, MAX_SIMULTANEOUS_MELODIC,
    │   │                       # BRUSH_SIZE_MIN, BRUSH_SIZE_MAX
    │   └── musicalKey.ts       # SCALE_INTERVALS library (7 named scales), GLOBAL_KEY=9
    │                           # (A), GLOBAL_SCALE=pentatonic minor (A C D E G),
    │                           # snapToScale() helper
    │
    ├── hooks/
    │   ├── useAmbientLoop.ts   # Self-scheduling 8th-note tick loop; fires each
    │   │                       # drawing's synth at its beat position; percussion/
    │   │                       # melodic split; melodic voice cap (MAX_SIMULTANEOUS_MELODIC=4);
    │   │                       # voice leading (≥3-semitone gap enforcement);
    │   │                       # viewport mode filter; routes through per-drawing GainNode
    │   └── useViewportAudio.ts # Subscribes to viewportState + drawingsStore; calls
    │                           # setViewportGain(id, 0|1) with 33ms time-constant fade
    │                           # when drawings enter/leave the visible canvas area;
    │                           # only active when viewportMode is on
    │
    ├── lib/
    │   └── supabase.ts         # Hand-written Database type (Tables<T> helper),
    │                           # anon supabase client; includes stroke_width column
    │
    ├── screens/
    │   ├── CanvasScreen.tsx    # Composes <Canvas>, <DrawingPanel>, <OnboardingOverlay>
    │   ├── AdminScreen.tsx     # Password-gated admin dashboard; Canvases / Users /
    │   │                       # Drawings tabs; uses service-role Supabase client;
    │   │                       # removeUser: hard-deletes drawings first (FK constraint),
    │   │                       # then hard-deletes user row;
    │   │                       # Drawings tab: 60×60 SVG thumbnails, sortable Size
    │   │                       # column, flag-large-drawings toggle (>4000px), bulk
    │   │                       # flag & delete oversized action with confirmation
    │   ├── AdminScreen.css
    │   ├── ChordSheetScreen.tsx   # Chord diagram grid; guitar voicings for active
    │   │                          # drawings sorted left→right; Web Share / clipboard
    │   ├── ChordSheetScreen.css
    │   ├── DiscoverScreen.tsx     # Placeholder — "coming soon"
    │   ├── SharedCanvasScreen.tsx # Placeholder — reads :slug param, renders nothing
    │   └── PlaceholderScreen.css
    │
    ├── store/
    │   ├── drawingsStore.ts    # DrawingObject[] state; add/update/merge/remove/
    │   │                       # toggleHidden/setVolume/clear/shuffle;
    │   │                       # Supabase sync (initial fetch + realtime channel);
    │   │                       # optimistic UI with rollback; session guard on delete;
    │   │                       # real Supabase error surfaced in toast on failure
    │   ├── sessionStore.ts     # Anonymous auth init; userId, username, canvasId,
    │   │                       # needsUsername, isLoaded; setUsername action;
    │   │                       # visibilitychange listener refreshes session on focus
    │   ├── tempoStore.ts       # { bpm, setBpm } — single source of truth for tempo
    │   ├── toastStore.ts       # { toasts, showToast, dismissToast } — auto-dismiss
    │   ├── useAppStore.ts      # { isPlaying } — currently unused placeholder
    │   ├── useBrushStore.ts    # { brushSize, setBrushSize } — 2–40 px, default 8;
    │   │                       # persisted to localStorage (key: concerto_brush_size)
    │   └── useViewportStore.ts # { viewportMode, visibleDrawingIds, setViewportMode,
    │                           # setVisibleDrawingIds } — not persisted; default off
    │
    └── utils/
        ├── audioEngine.ts      # 9 Web Audio synth functions; global reverb convolver;
        │                       # per-drawing GainNode map (drawingVolumes + viewportGains
        │                       # two-layer model); unlockAudio(), playChord(),
        │                       # setDrawingVolume(), setViewportGain(), resetViewportGains(),
        │                       # removeDrawingGain(); 808 redesigned (sub-bass only,
        │                       # punch envelope, no pitch sweep, 120Hz LPF)
        ├── beatPosition.ts     # seededRandom() + assignBeatPosition() — deterministic
        │                       # beat slot from drawing ID × instrument
        ├── canvasNavigation.ts # Module-level singleton bridge: registerPanHandler() /
        │                       # panToDrawing() — lets DrawingPanel trigger an animated
        │                       # canvas pan without coupling to Canvas.tsx internals
        ├── colorNaming.ts      # STUB (not yet implemented)
        ├── formatTime.ts       # formatTime(ms) → "M:SS" string
        ├── pathSimplify.ts     # STUB (not yet implemented)
        ├── pathUtils.ts        # buildSmoothPath(), computeBoundingBox(), Point/BoundingBox
        ├── sessionGuard.ts     # ensureValidSession() — calls supabase.auth.getUser()
        │                       # (server-round-trip validation, no token rotation);
        │                       # returns { userId } or null; used before all Supabase writes
        ├── slugGenerator.ts    # STUB (not yet implemented)
        ├── soundMapping.ts     # mapDrawingToSound() — bbox geometry → diatonic note/
        │                       # chord/freq within GLOBAL_KEY + GLOBAL_SCALE;
        │                       # brushSize explicitly excluded (visual-only, documented)
        ├── strokeGrouping.ts   # Groupable interface, bboxDistance(), unionBoundingBox(),
        │                       # findGroupTarget() — proximity + time window merge logic
        └── viewportState.ts    # Module-level singleton: updateViewportTransform(),
                                # getViewportTransform(), subscribeViewport() — published
                                # imperatively from applyTransform() on every pan/zoom frame;
                                # read by useViewportAudio without React re-renders
```

---

## Design System (Light Theme)

Complete Y2K minimalist light theme applied in `src/index.css` via CSS custom properties:

```css
:root {
  --bg:          #f0f2f5;   /* page background */
  --surface:     #ffffff;   /* cards, panels, popovers */
  --border:      #dde2ea;   /* all 1px borders */
  --accent:      #7aafd4;   /* primary blue */
  --accent-2:    #b8cfe8;   /* lighter blue for hover borders */
  --text-primary:   #2a2d35;
  --text-secondary: #8a92a0;
  --muted:          #c8cdd6;
  --canvas-bg:   #e8ebf0;   /* canvas gradient target */
  --canvas-dot:  #d0d5de;   /* 1px dot grid at 24px spacing */
  --danger:      #d95f6e;
  --surface-hover: #f7f9fc;
}
```

**Typography:** DM Sans (300/500) for all UI text; DM Mono (400/500) for data readouts (BPM values, note names, usernames).

**Components:** white surfaces, 1px `--border` outlines, 6px border-radius, no drop shadows, outlined buttons with accent-on-hover, 12px slider thumbs with `border: 2px solid var(--surface); box-shadow: 0 0 0 1px var(--accent)`.

**Icons:** `lucide-react` at `size={14} strokeWidth={1.5}` throughout DrawingPanel (Volume2, VolumeX, Eye, EyeOff, X).

---

## Installed Dependencies

### Runtime

| Package | Version | Purpose |
|---|---|---|
| `react` | ^18.3.1 | UI framework |
| `react-dom` | ^18.3.1 | DOM renderer |
| `react-router-dom` | ^6.30.3 | Client-side routing (`BrowserRouter`) |
| `zustand` | ^5.0.13 | Global state (drawings, session, tempo, toasts, brush, viewport) |
| `@supabase/supabase-js` | ^2.105.4 | Auth, database, realtime subscriptions |
| `@use-gesture/react` | ^10.3.1 | Pinch-to-zoom / two-finger pan on touch devices |
| `lucide-react` | latest | Thin-stroke icons (Volume2, VolumeX, Eye, EyeOff, X) |

### Dev

| Package | Version | Purpose |
|---|---|---|
| `vite` | ^5.4.0 | Build tool and dev server |
| `@vitejs/plugin-react` | ^4.3.0 | Babel-based React fast refresh |
| `typescript` | ^6.0.3 | Type checker |
| `@types/react` | ^18.3.0 | React type definitions |
| `@types/react-dom` | ^18.3.0 | ReactDOM type definitions |
| `@types/node` | ^25.6.2 | Node type definitions (used in vite config) |
| `gh-pages` | ^6.3.0 | `npm run deploy` pushes `dist/` to `gh-pages` branch |

---

## Routes

| Path | Screen | Status |
|---|---|---|
| `/` | `CanvasScreen` | Fully implemented |
| `/chords` | `ChordSheetScreen` | Fully implemented |
| `/discover` | `DiscoverScreen` | Placeholder |
| `/s/:slug` | `SharedCanvasScreen` | Placeholder — reads slug, renders nothing |
| `/admin` | `AdminScreen` | Fully implemented; password-gated |

---

## DrawingObject Type

Defined in `src/store/drawingsStore.ts`.

```typescript
export interface DrawingObject {
  id:           string;          // UUID (crypto.randomUUID() at creation)
  userId:       string;          // auth.users.id of the creator; used for ownership checks
  username:     string | null;   // display name fetched from users table; null for unknown
  canvasId:     string;          // FK to canvases.id
  path:         string;          // SVG path data; may contain multiple M subpaths after merges
  boundingBox:  BoundingBox;     // { x, y, width, height } in canvas coordinates
  position:     { x: number; y: number };  // top-left of boundingBox
  strokeColor:  string;          // hex, e.g. "#E84040"
  strokeWidth:  number;          // brush size at draw time (2–40); read from useBrushStore
                                 // via brushSizeRef; persisted to DB as stroke_width;
                                 // legacy DB rows without the column fall back to 4
  instrument:   InstrumentName;  // derived from strokeColor via getInstrumentForColor()
  isActive:     boolean;         // false if toggled off in DrawingPanel
  isLocked:     boolean;         // true = excluded from shuffle and stroke grouping
  isMuted:      boolean;         // session-only; audio loop skips muted drawings;
                                 // cleared automatically when isActive is toggled
  volume:       number;          // per-drawing volume 0–100; default 70; persisted to DB
  createdAt:    number;          // Date.now() at creation; refreshed on each group merge
  soundMapping: SoundMapping;    // { note, chord, frequency[], instrument }
  beatPosition: number;          // 1 | 1.5 | 2 | 2.5 | 3 | 3.5 | 4 | 4.5
                                 // seeded from id × instrument; re-assigned on shuffle
}
```

`BoundingBox` is defined in `src/utils/pathUtils.ts`.  
`SoundMapping` is defined in `src/utils/soundMapping.ts`.

### Store also holds

```typescript
hiddenIds: Set<string>  // other users' drawing IDs hidden locally; persisted to localStorage
                        // keyed per userId (concerto_hidden_drawing_ids:<uid>)
```

---

## Supabase Schema

Tables: `canvases`, `users`, `drawings`, `shared_snapshots`.

Key `drawings` columns (relevant to the client):

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | primary key |
| `canvas_id` | uuid | FK → canvases |
| `user_id` | uuid | FK → auth.users |
| `path_data` | text | SVG path string |
| `bounding_box` | jsonb | `{ x, y, width, height }` |
| `canvas_position` | jsonb | `{ x, y }` top-left |
| `color` | text | hex string |
| `instrument` | text | InstrumentName |
| `note` | text | root note name, e.g. "E4" |
| `chord` | jsonb | string[] of note names |
| `frequencies` | jsonb | number[] in Hz |
| `beat_position` | numeric | 1–4.5 |
| `volume` | numeric | 0–100, default 70 |
| `stroke_width` | integer | brush size 2–40; null on rows saved before this column was added |
| `is_deleted` | boolean | legacy soft-delete flag; client no longer writes this — use hard DELETE |
| `created_at` | timestamptz | |

**SQL migrations required on existing databases:**
```sql
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS volume numeric NOT NULL DEFAULT 70;
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS stroke_width integer DEFAULT 4;
```

### RLS Policies — `drawings` table

| Policy | Command | USING | WITH CHECK |
|---|---|---|---|
| `drawings_public_read` | SELECT | `is_deleted = false` | — |
| `drawings_insert_own` | INSERT | — | `user_id = auth.uid()` |
| `drawings_update_own` | UPDATE | `user_id = auth.uid() AND is_deleted = false` | `user_id = auth.uid()` |
| `drawings_delete_own` | DELETE | `user_id = auth.uid()` | — |

**Table-level grants required** (run once in SQL editor if not present):
```sql
GRANT DELETE ON public.drawings TO authenticated;
```

> **Note:** The `drawings_update_own` WITH CHECK was consistently producing `42501` errors on soft-delete despite valid JWTs and matching user IDs — root cause unknown (no triggers found, role was `authenticated`, sub matched). The client now uses hard DELETE instead of `UPDATE is_deleted=true` to bypass the UPDATE path entirely.

---

## Instrument Palette

Nine instruments, one per color swatch. All synths are in `src/utils/audioEngine.ts` using the Web Audio API only (no external audio library). All connect through a global reverb convolver and master `DynamicsCompressor`.

| Hex | Label | Instrument | Synthesis character |
|---|---|---|---|
| `#E84040` | 808 | `808 bass` | Single sine oscillator capped at 80 Hz (sub-bass only); 10 ms attack + 800 ms fixed-pitch decay; 120 Hz lowpass (Q=0.8); no pitch sweep. Fires every 2 beats. |
| `#E87830` | KICK | `kick drum` | Fixed 150→40 Hz sine sweep (80 ms) + 12 ms noise click transient; local hard-limiter (`DynamicsCompressor` threshold −3 dB, ratio 20). Fires on beat 1 only. |
| `#D4A028` | SNARE | `snare drum` | White noise through bandpass at 2000 Hz (Q=1.33); 2 ms attack, 120 ms decay. Fires on beats 2 and 4. |
| `#D4CC48` | HHAT | `hi-hat` | White noise through highpass >8 kHz; alternates closed (40 ms) / open (200 ms) on every quarter note. |
| `#96C440` | CHIME | `chimes` | Four inharmonic sine partials (1.000×, 2.756×, 5.404×, 8.933×); higher partials decay faster; ±15% velocity randomization per trigger. |
| `#58C498` | PAD | `synth pad` | Two detuned sawtooths per chord tone (±7 cents); LPF sweeps 300→2500 Hz; 280 ms attack (was 400 ms); 600 ms release swell. Fires once per measure. |
| `#4A90E8` | HORN | `horn/bass` | Additive synthesis: odd harmonics 1, 3, 5, 7× (closed-cylinder series); WaveShaperNode (25 units); LPF at 3200 Hz; ±3 Hz LFO breath on fundamental. |
| `#A09CFF` | LEAD | `synth lead` | Four additive sine harmonics (1×, 2×, 3×, 4×); 5 ms portamento glide; 1/8-note feedback delay (30% FB, 28% wet); ±12 cents LFO vibrato. |
| `#D46E88` | VOX | `vocal pad` | Sawtooth through two parallel formant bandpass filters (800 Hz / Q=10, 1200 Hz / Q=15); 420 ms attack (was 600 ms); 560 ms release. |

All melodic instruments (PAD, HORN, LEAD, VOX, CHIME) pass through an 80 Hz HPF before their per-drawing GainNode to prevent sub-bass mud.

### Mix Gain Constants (`INSTRUMENT_GAIN` in `instrumentMap.ts`)

```
kick drum:  1.20   snare drum: 1.08   hi-hat:     0.50
808 bass:   0.85   synth lead: 0.42   horn/bass:  0.39
chimes:     0.36   synth pad:  0.33   vocal pad:  0.27
```

Signal chain per drawing:
```
synth → perDrawingGainNode (volume/100 × viewportGain) → masterComp → ctx.destination
synth → reverbSend → convolverNode → reverbReturn → masterComp   (parallel wet path)
```

Two-layer gain model: `drawingVolumes` map holds the user-set 0–1 volume; `viewportGains` map holds 0 or 1 based on viewport visibility. Effective gain = `volume × viewportGain`. Transitions use `setTargetAtTime` with a 33 ms time constant (~95% of target in 100 ms).

Effective peak: `AMPLITUDE (0.38) × LOOP_VOLUME (0.45) × INSTRUMENT_GAIN × drawingGain`

---

## Audio Scheduling

`src/hooks/useAmbientLoop.ts` runs a self-scheduling `setTimeout` loop at **8th-note resolution** (`beatMs / 2`). Uses a `nextTickTimeRef` wall-clock anchor to prevent cumulative drift.

`unlockAudio()` is called on the first `pointerdown` anywhere on the page.

### Harmonic Coherence

Global tonality is **A minor pentatonic** (`GLOBAL_KEY = 9`, `GLOBAL_SCALE = [0, 3, 5, 7, 10]`). All melodic drawings produce in-scale notes with no chromatic clashes. Chord tones are diatonic triads walking GLOBAL_SCALE (1-3-5).

Per-tick melodic voice management:
1. Percussion drawings fire unconditionally (pattern-based gating only)
2. Melodic drawings firing on this tick are capped at `MAX_SIMULTANEOUS_MELODIC = 4`
3. Voice leading: sorted by root frequency; any drawing whose root MIDI is within 3 semitones of the previously played root is skipped

### `shouldFire(instrument, tick, beatPosition)` — gating rules

| Instrument | Rule |
|---|---|
| kick drum | `tick % 8 === 0` (beat 1 of each 4/4 measure) |
| snare drum | `tick % 8 === 2 \|\| tick % 8 === 6` (beats 2 and 4) |
| hi-hat | `tick % 2 === 0` (every quarter note) |
| 808 bass | `tick % 8 === 0 \|\| tick % 8 === 4` (every 2 beats) |
| synth pad | `tick % 8 === 0` (downbeat of every measure) |
| vocal pad | `tick % 16 === beatPosToTick(beatPosition)` (every 2 measures at assigned slot) |
| chimes / horn / lead | `tick % 8 === beatPosToTick(beatPosition)` (every measure at assigned slot) |

`beatPosToTick(p) = Math.round((p − 1) × 2)` maps beat positions 1…4.5 to tick offsets 0…7.

### Beat Position Assignment (`src/utils/beatPosition.ts`)

Each drawing's `beatPosition` is seeded from its `id` string via a deterministic hash + LCG.

| Instrument | Weighted slot pool |
|---|---|
| chimes | `[1, 1, 2, 2, 3, 3, 4, 4, 2.5, 4.5]` — on-beats 2× the weight of off-beats |
| horn/bass | `[1, 3]` — downbeats only |
| synth lead | `[2, 3, 4]` — never beat 1 (avoids kick clash) |
| vocal pad | `[1, 3]` — same pool as horns; rate controlled by scheduler |
| all others | `1` (sentinel; pattern-based instruments ignore this field) |

### Per-Drawing Phase Humanization

Each drawing has a deterministic ±30 ms phase nudge (`seededPhase(id)`) plus a spatial left-to-right delay (0–`maxOff` ms based on canvas X position). Final play delay = `max(0, spatialOffset + phaseNudge)`.

---

## Sound Mapping (`src/utils/soundMapping.ts`)

All melodic drawings are mapped into **A minor pentatonic** (`GLOBAL_KEY=9`, `GLOBAL_SCALE=[0,3,5,7,10]`). Changing both constants in `musicalKey.ts` retunes the entire canvas instantly.

| Geometry dimension | Maps to |
|---|---|
| Bounding-box diagonal length | Scale degree index (short stroke → high degree, long → low) |
| Bounding-box area | Octave 3–6 (small area → octave 6, large area → octave 3) |

Chord type: always a **diatonic triad** (scale degrees 1-3-5 walking GLOBAL_SCALE from the root).

Percussion instruments return a fixed C2 placeholder; their synth functions ignore the frequency array.

**brushSize is explicitly excluded** from all sound mapping logic — it is a visual-only property. This is documented in the JSDoc of `mapDrawingToSound`.

Output shape: `{ note: "A4", chord: ["A4", "C5", "E5"], frequency: [440.00, 523.25, 659.25], instrument }`.

---

## Viewport Mode

Toggled via the crop-frame icon in the top nav bar. When active:

- `useViewportStore.viewportMode = true`
- `useViewportAudio` subscribes to `viewportState` (published imperatively from `applyTransform` on every pan/zoom frame) and the drawings store
- Drawings whose bounding boxes intersect the current viewport get `setViewportGain(id, 1)`; others get `setViewportGain(id, 0)` — 33 ms time-constant fade
- `useAmbientLoop` filters the active drawing list to `visibleDrawingIds` — drawings outside the viewport produce no audio even if unmuted
- `DrawingPanel` filters its card lists to visible drawings and shows "Sounds in view: N" in the handle
- Canvas gets a pulsing blue border (`canvas-container--viewport` CSS class)
- `useViewportStore.visibleDrawingIds` (`Set<string>`) is updated only when the set actually changes (reference equality check)

The viewport transform is published through `src/utils/viewportState.ts` — a module-level singleton with subscribe/notify — so `useViewportAudio` can react to pan/zoom without coupling to Canvas.tsx refs or causing React re-renders.

---

## Brush Size

`src/store/useBrushStore.ts` — `brushSize` (2–40 px, default 8). Persisted to `localStorage` under key `concerto_brush_size`.

In `Canvas.tsx`:
- `brushSize` from the store drives the live stroke preview (`strokeWidth={brushSize}` on the in-progress path)
- `brushSizeRef` (synced via `useEffect`) is read inside `finishStroke` to avoid stale closure
- New drawings get `strokeWidth: brushSizeRef.current` at creation time
- `DrawingObject.strokeWidth` is persisted to the DB as `stroke_width`; `rowToDrawing` falls back to `4` for legacy rows

In `ColorPicker.tsx`:
- Horizontal range slider (72 px) with accent-color fill track driven by `--brush-pct` CSS variable
- Live preview dot: 40×40 fixed container, inner circle scales 2–36 px (capped for layout stability), colored with the currently selected instrument color

**iOS touch fix:** the canvas container's native `touchmove` listener guards against `.color-picker` targets before calling `e.preventDefault()`, so the browser's native range-input drag is not suppressed. `touch-action: pan-x` is also set on the slider element.

---

## Stroke Grouping

`src/utils/strokeGrouping.ts` + `Canvas.tsx` `finishStroke`.

When a stroke is committed, `findGroupTarget` scans existing own-user drawings for one meeting all three conditions simultaneously:

1. **Same color** (same instrument)
2. **`createdAt` within `STROKE_GROUP_WINDOW_MS` (2000 ms)**
3. **Bounding-box distance ≤ `STROKE_GROUP_PROXIMITY_PX` (200 canvas units)**

On a match, `Canvas.tsx` merges inline: appends SVG path data, unions bounding boxes, re-runs `mapDrawingToSound` on combined geometry, calls `mergeDrawing(target.id, ...)`, resets `createdAt`. A `MergeRing` SVG circle (r: 0→60, opacity: 0.8→0, 600 ms) fires at the merged drawing's centre.

Sidebar card navigation triggers a `NavRing` pulse (r: 0→100, 600 ms) at the target drawing's centre after the 300 ms ease-in-out pan animation completes.

---

## Sidebar Navigation (DrawingPanel)

Clicking a drawing card's color swatch or label area calls `panToDrawing(drawing)` from `src/utils/canvasNavigation.ts`. This fires the registered pan handler in `Canvas.tsx` which:

1. Runs a 300 ms ease-in-out RAF animation to center the drawing's bounding box
2. On completion, mounts a `NavRing` SVG pulse at the drawing's canvas center
3. On mobile (< 768 px), auto-closes the DrawingPanel drawer so the canvas is visible

---

## Supabase Sync

`drawingsStore.ts` handles all backend sync. It runs once when `sessionStore` signals `isLoaded && canvasId`.

**Initial hydration:** fetches all non-deleted drawings for the canvas (`is_deleted = false`), batch-fetches usernames, merges into store (preserving optimistic drawings — existing IDs are skipped). All loaded drawings start `isMuted: true`.

**Realtime channel:** subscribes to `postgres_changes` on `drawings` filtered by `canvas_id`.
- `INSERT` from another user: adds to store (muted)
- `UPDATE` from another user's merge: updates geometry/sound while preserving local client-only state (isActive, isLocked, isMuted)
- `DELETE` from another client: removes from store by `payload.old.id`

**Optimistic writes:** `addDrawing` writes to store immediately, then invokes the `create-drawing` Edge Function. On 4xx rejection, rolls back and shows a toast with the server's error message. On 404/5xx/network failure, falls back to direct Supabase insert.

**Delete hardening (`removeDrawing`):**
1. Calls `ensureValidSession()` — validates JWT via `supabase.auth.getUser()` server round-trip; aborts with toast if session invalid
2. Checks `authUid === drawing.userId` — catches session rotation mismatches explicitly
3. Calls `.delete().eq('id', id).eq('user_id', authUid)` — hard DELETE (not soft-delete)
4. On failure, rolls back the optimistic removal and shows the exact Supabase error code + message

> **Why hard-delete:** Soft-delete (`UPDATE is_deleted=true`) consistently produced `42501 WITH CHECK` RLS errors despite valid authenticated JWTs. After exhaustive investigation (confirmed policy exists, no triggers, JWT role=authenticated, sub matched drawing.userId), root cause was not found. Hard DELETE bypasses UPDATE WITH CHECK entirely; DELETE has only a USING clause which fails silently (0 rows) rather than 403.

**Session freshness:** `sessionStore.ts` registers a `visibilitychange` listener that calls `supabase.auth.refreshSession()` whenever the tab becomes visible. `ensureValidSession()` uses `getUser()` (not `refreshSession()`) to avoid a race condition where two concurrent refresh calls consume the same refresh token, leaving the client with a stale JWT.

---

## Admin Panel (`/admin`)

Password-gated via `VITE_ADMIN_PASSWORD` (checked client-side; session stored in `sessionStorage`).

Uses a separate service-role Supabase client (`VITE_ADMIN_SERVICE_KEY`) that bypasses all RLS — `persistSession: false`, `autoRefreshToken: false` so it never touches the anon session in `localStorage`.

**User deletion:** hard-deletes drawings first (`admin.from('drawings').delete().eq('user_id', u.id)`), then hard-deletes the user row. Order matters — `drawings.user_id` has a FK to `users.id`, so deleting the user before drawings violates the constraint.

**Drawings tab features (as of current build):**
- 60×60 SVG path thumbnails rendered from actual `path_data` with adaptive `strokeWidth = maxDim/20` (constant ~3px display regardless of drawing size)
- Sortable **Size** column showing `width × height` in canvas units; click to sort asc/desc
- **Flag large drawings** — amber toggle that floats drawings exceeding 4000 px in either dimension to the top and adds a "⚠️ Large drawing" badge (threshold = 50% of the 8000×8000 canvas)
- **Flag & delete oversized** — shows count in button; inline confirmation before batch hard-delete via `.in('id', ids)`
- Existing **nuke canvas** (delete all) remains unchanged

---

## What's Fully Working

- Freehand drawing on an infinite 8000×8000 canvas with smooth quadratic Bézier paths
- Pan (two-finger drag, mouse wheel) and pinch-to-zoom (0.25×–4×) with velocity clamping and RAF coalescing
- Pinch zoom stability: `isZoomingRef` blocks competing single-finger events; `onPointerCancel` resets pinch state; `MAX_PINCH_DELTA = 0.5` clamps spurious velocity spikes
- 9-instrument color picker with brush size slider; all controls isolated from canvas touch/pointer events on both desktop and iOS
- Brush size slider works on iOS Safari (touchmove guard + `touch-action: pan-x`)
- Brush size persists across sessions (localStorage); each drawing stores its own `strokeWidth`
- Anonymous Supabase auth (`signInAnonymously`); session refreshed on tab focus
- Username modal on first visit with validation (3–20 chars, alphanumeric + underscore)
- Real-time multi-user drawing sync via Supabase Realtime postgres_changes
- Optimistic UI with rollback on server rejection (rate limit, cap, inactive canvas)
- Hard-delete: own drawings delete cleanly; other clients remove via realtime DELETE event
- `mapDrawingToSound` — diatonic, in-scale notes/chords in A minor pentatonic, no jitter
- All 9 Web Audio synths with distinct timbres and global reverb + master compressor
- 808 bass: sub-bass only (≤80 Hz), punch envelope, no pitch sweep
- Per-drawing GainNode with two-layer volume model (user volume × viewport gain)
- Volume slider 0–100 per drawing with smooth `setTargetAtTime` ramping; persisted with 400 ms debounce
- Viewport mode: audio fades for off-screen drawings; DrawingPanel filters; pulsing border
- Harmonic coherence: A minor pentatonic, ≤4 simultaneous melodic voices, ≥3-semitone voice leading
- Minimap (desktop only, ≥768 px) — fully unmounted on mobile via `matchMedia` to prevent touch interception
- Sidebar card navigation: 300 ms ease-in-out pan + NavRing pulse + mobile drawer auto-close
- BPM popover: compact pill button in top bar opens floating popover with large readout, full-width slider, and tap-tempo; closes on outside tap or draw start
- Tempo slider (40–180 BPM) and tap-tempo (up to 8-tap average, 3 s reset window)
- 8th-note scheduler with anti-drift wall-clock anchoring
- Per-instrument rhythm patterns + seeded beat positions for chimes/horn/lead/vocal
- Per-drawing ±30 ms seeded phase humanization + spatial left→right delay
- Stroke grouping with 2 s window + 200 px proximity merge + MergeRing pulse
- DrawingPanel: mute toggle, volume slider, delete (own), hide (others), shuffle; pan-on-tap
- Shuffle correctly reseeds `beatPosition` to match the new instrument
- Admin panel: list/create/activate canvases; view/remove users (hard-delete); thumbnails, size sort, flag/delete oversized, nuke
- ChordSheetScreen: chord diagrams ordered left→right by canvas X; Web Share API with clipboard fallback
- 3-slide onboarding overlay with swipe navigation; `localStorage` dismissal
- Toast notification system (auto-dismiss, stacks)
- PWA manifest with icons
- GitHub Actions CI deploy to GitHub Pages on push to `main`

---

## Known Issues / Stubs

| File / Area | Status | Notes |
|---|---|---|
| `utils/colorNaming.ts` | Stub | Exported as empty module; not called anywhere |
| `utils/pathSimplify.ts` | Stub | Exported as empty module; long paths not reduced before storage |
| `utils/slugGenerator.ts` | Stub | Required for share-URL generation; not yet implemented |
| `store/useAppStore.ts` | Dead code | `isPlaying` state exists but nothing reads or writes it |
| `DiscoverScreen` | Placeholder | "coming soon" text only; no backend feed |
| `SharedCanvasScreen` | Placeholder | Reads `:slug` param; renders nothing |
| Onboarding copy | Mismatch | Slide 3 says "export as PNG" — no PNG export is implemented |
| `ChordSheetScreen` voicings | Partial | Guitar voicings cover only 10 named chords (C/D/E/G/A major + minor); anything else falls back to an all-muted diagram |
| Hi-hat `beatPosition` | Inert | Always `1` (sentinel); hi-hat fires on every quarter note regardless |
| Reverb not gated by per-drawing volume | By design (MVP) | Reverb sends originate before the per-drawing GainNode; reducing volume quiets the dry signal but not the reverb tail |
| `VITE_ADMIN_SERVICE_KEY` in bundle | Security note | Inlined at build time; extractable from the JS bundle. Acceptable for small-scale; move behind a server-side proxy for any public deployment |
| `DEBUG_FORCE_MODAL = false` | Leftover | `UsernameModal.tsx` line 9; harmless but should be removed before a clean release |
| `stroke_width` column migration | Manual step required | `ALTER TABLE drawings ADD COLUMN IF NOT EXISTS stroke_width integer DEFAULT 4;` |
| UPDATE WITH CHECK RLS mystery | Unresolved | `drawings_update_own` WITH CHECK `(auth.uid() = user_id)` returns 42501 despite valid authenticated JWT and matching IDs. No triggers found. Client now uses hard DELETE to avoid UPDATE path. Should investigate further if soft-delete history ever becomes a requirement. |

---

## Remaining Prompt Queue

| Label | Feature | Notes |
|---|---|---|
| **A5** | Viewport Mode — tap-to-trigger | The audio fade / filter aspect of Viewport Mode is fully implemented. What remains per the original A5 spec: lock canvas transform while in viewport mode; tap-to-trigger audio on individual drawings instead of the ambient loop cadence; full-screen visual feedback per drawing tap. `isPlaying` in `useAppStore` was scaffolded for this. Nothing in the current architecture blocks it. |
| **M7** | Chord sheet export | Image / PDF export of the ChordSheetScreen; replaces the "export as PNG" placeholder copy in onboarding slide 3. |

---

## Deployment

### Live URL

```
https://rhartjen.github.io/concerto-web/
```

### Manual deploy (from local machine)

Requires a valid `.env.local` with real values (see `.env.example`).

```bash
npm run deploy
```

This runs `npm run build` then pushes the `dist/` folder to the `gh-pages` branch via the `gh-pages` npm package.

### CI deploy (automatic)

`.github/workflows/deploy.yml` triggers on every push to `main`. It builds with env vars injected from GitHub Actions secrets and deploys to `gh-pages` automatically.

### Setting GitHub Actions secrets

**GitHub repo → Settings → Secrets and variables → Actions → New repository secret**

| Secret name | Where to find the value |
|---|---|
| `VITE_SUPABASE_URL` | Supabase dashboard → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase dashboard → Project Settings → API → `anon` `public` key |
| `VITE_ADMIN_PASSWORD` | Choose any strong password for the `/admin` route |
| `VITE_ADMIN_SERVICE_KEY` | Supabase dashboard → Project Settings → API → `service_role` key (keep private) |

`GITHUB_TOKEN` is automatically provided by GitHub Actions — no manual secret needed.

> **Security note:** `VITE_ADMIN_SERVICE_KEY` is inlined into the client bundle at build time. The `/admin` route is protected only by the `VITE_ADMIN_PASSWORD` check in the browser. Do not expose the deployed app URL publicly without additional access controls on that path.

### Enabling GitHub Pages (first-time setup)

1. Push to `main` once so the workflow creates the `gh-pages` branch.
2. Go to **GitHub repo → Settings → Pages**.
3. Under **Source**, select **Deploy from a branch**.
4. Set branch to `gh-pages`, directory to `/ (root)`.
5. Save — the live URL above will become active within a minute.
