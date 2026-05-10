# Concerto Web — Project Handoff

**Stack:** React 18 · TypeScript 6 · Vite 5.4 · Zustand 5 · Web Audio API · Supabase  
**Entry point:** `src/main.tsx` → `src/App.tsx`  
**Dev server:** `npm run dev` (Vite HMR)  
**Build:** `npm run build` (tsc + Vite bundle → `dist/`)

---

## File / Folder Structure

```
concerto-web/
├── index.html                  # Vite HTML shell; loads Space Mono from Google Fonts
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
    ├── index.css               # CSS reset, :root colour tokens, Space Mono import
    ├── App.css                 # (minimal, mostly superseded by component CSS)
    │
    ├── assets/
    │   ├── hero.png            # Unused placeholder from Vite scaffold
    │   ├── react.svg           # Unused
    │   └── vite.svg            # Unused
    │
    ├── components/
    │   ├── Canvas.tsx          # Core canvas: drawing, pan/zoom, audio unlock,
    │   │                       # stroke grouping logic, MergeRing animation
    │   ├── Canvas.css
    │   ├── ColorPicker.tsx     # 9-swatch instrument selector; reads INSTRUMENT_MAP
    │   ├── ColorPicker.css
    │   ├── DrawingPanel.tsx    # Bottom sheet / sidebar: drawing cards with mute,
    │   │                       # volume slider, delete/hide; Shuffle + Sheet buttons
    │   ├── DrawingPanel.css
    │   ├── OnboardingOverlay.tsx  # 3-slide swipeable first-launch tutorial;
    │   │                          # dismissal persisted in localStorage
    │   ├── OnboardingOverlay.css
    │   ├── TempoBar.tsx        # Fixed top bar: BPM display, range slider, tap-tempo
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
    │   │                       # CANVAS_WIDTH, CANVAS_HEIGHT
    │   └── musicalKey.ts       # SCALE_INTERVALS library (7 named scales), GLOBAL_KEY,
    │                           # GLOBAL_SCALE (currently C major), snapToScale() helper
    │
    ├── hooks/
    │   └── useAmbientLoop.ts   # Self-scheduling 8th-note tick loop; fires each
    │                           # drawing's synth at its assigned beat position; routes
    │                           # audio through per-drawing GainNode
    │
    ├── screens/
    │   ├── CanvasScreen.tsx    # Composes <Canvas>, <DrawingPanel>, <OnboardingOverlay>
    │   ├── AdminScreen.tsx     # Password-gated admin dashboard; Canvases / Users /
    │   │                       # Drawings tabs; uses service-role Supabase client
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
    │   │                       # optimistic UI with rollback on rejection
    │   ├── sessionStore.ts     # Anonymous auth init; userId, username, canvasId,
    │   │                       # needsUsername, isLoaded; setUsername action
    │   ├── tempoStore.ts       # { bpm, setBpm } — single source of truth for tempo
    │   ├── toastStore.ts       # { toasts, showToast, dismissToast } — auto-dismiss
    │   └── useAppStore.ts      # { isPlaying } — currently unused placeholder
    │
    └── utils/
        ├── audioEngine.ts      # 9 Web Audio synth functions; global reverb convolver;
        │                       # per-drawing GainNode map; unlockAudio(), playChord(),
        │                       # setDrawingVolume(), removeDrawingGain()
        ├── beatPosition.ts     # seededRandom() + assignBeatPosition() — deterministic
        │                       # beat slot from drawing ID × instrument
        ├── colorNaming.ts      # STUB (not yet implemented)
        ├── formatTime.ts       # formatTime(ms) → "M:SS" string
        ├── pathSimplify.ts     # STUB (not yet implemented)
        ├── pathUtils.ts        # buildSmoothPath(), computeBoundingBox(), Point/BoundingBox
        ├── slugGenerator.ts    # STUB (not yet implemented)
        ├── soundMapping.ts     # mapDrawingToSound() — bbox geometry → diatonic note/
        │                       # chord/freq within GLOBAL_KEY + GLOBAL_SCALE
        └── strokeGrouping.ts   # Groupable interface, bboxDistance(), unionBoundingBox(),
                                # findGroupTarget() — proximity + time window merge logic
```

---

## Installed Dependencies

### Runtime

| Package | Version | Purpose |
|---|---|---|
| `react` | ^18.3.1 | UI framework |
| `react-dom` | ^18.3.1 | DOM renderer |
| `react-router-dom` | ^6.30.3 | Client-side routing (`BrowserRouter`) |
| `zustand` | ^5.0.13 | Global state (drawings, session, tempo, toasts) |
| `@supabase/supabase-js` | ^2.105.4 | Auth, database, realtime subscriptions |
| `@use-gesture/react` | ^10.3.1 | Pinch-to-zoom / two-finger pan on touch devices |

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
  canvasId:     string;          // FK to canvases.id
  path:         string;          // SVG path data; may contain multiple M subpaths after merges
  boundingBox:  BoundingBox;     // { x, y, width, height } in canvas coordinates
  position:     { x: number; y: number };  // top-left of boundingBox
  strokeColor:  string;          // hex, e.g. "#E84040"
  strokeWidth:  number;          // always 4 (STROKE_WIDTH constant)
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
| `is_deleted` | boolean | soft-delete flag |
| `created_at` | timestamptz | |

**SQL migration required for `volume` on existing databases:**
```sql
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS volume numeric NOT NULL DEFAULT 70;
```

---

## Instrument Palette

Nine instruments, one per color swatch. All synths are in `src/utils/audioEngine.ts` using the Web Audio API only (no external audio library). All connect through a global reverb convolver and master `DynamicsCompressor`.

| Hex | Label | Instrument | Synthesis character |
|---|---|---|---|
| `#E84040` | 808 | `808 bass` | Three sine harmonics (1×, 2×, 3×); pitch drops from `freq` to `freq × 0.8` over 300 ms; WaveShaperNode soft-clip; lowpass Q=2.2. Fires every 2 beats. |
| `#E87830` | KICK | `kick drum` | Fixed 150→40 Hz sine sweep (80 ms) + 12 ms noise click transient; local hard-limiter (`DynamicsCompressor` threshold −3 dB, ratio 20). Fires on beat 1 only. |
| `#D4A028` | SNARE | `snare drum` | White noise through bandpass at 2000 Hz (Q=1.33); 2 ms attack, 120 ms decay. Fires on beats 2 and 4. |
| `#D4CC48` | HHAT | `hi-hat` | White noise through highpass >8 kHz; alternates closed (40 ms) / open (200 ms) on every quarter note. |
| `#96C440` | CHIME | `chimes` | Four inharmonic sine partials (1.000×, 2.756×, 5.404×, 8.933×); higher partials decay faster; ±15% velocity randomization per trigger. |
| `#58C498` | PAD | `synth pad` | Two detuned sawtooths per chord tone (±7 cents); LPF sweeps 300→2500 Hz over 400 ms attack; 600 ms release swell. Fires once per measure. |
| `#4A90E8` | HORN | `horn/bass` | Additive synthesis: odd harmonics 1, 3, 5, 7× (closed-cylinder series); WaveShaperNode (25 units); LPF at 3200 Hz; ±3 Hz LFO breath on fundamental. |
| `#A09CFF` | LEAD | `synth lead` | Four additive sine harmonics (1×, 2×, 3×, 4×); 5 ms portamento glide between notes; 1/8-note feedback delay (30% FB, 28% wet); ±12 cents LFO vibrato on detune. |
| `#D46E88` | VOX | `vocal pad` | Sawtooth through two parallel formant bandpass filters (800 Hz / Q=10, 1200 Hz / Q=15); 600 ms attack; 800 ms release. |

### Mix Gain Constants (`INSTRUMENT_GAIN` in `instrumentMap.ts`)

```
kick drum:  1.00   snare drum: 0.90   hi-hat: 0.50
808 bass:   0.85   synth lead: 0.70   horn/bass: 0.65
chimes:     0.60   synth pad:  0.55   vocal pad: 0.45
```

Signal chain per drawing:
`synth → perDrawingGainNode (drawing.volume / 100) → masterComp → ctx.destination`  
`synth → reverbSend → convolverNode → reverbReturn → masterComp` (parallel, bypasses per-drawing gain)

Effective peak: `AMPLITUDE (0.38) × LOOP_VOLUME (0.45) × INSTRUMENT_GAIN × drawingGain`

---

## Audio Scheduling

`src/hooks/useAmbientLoop.ts` runs a self-scheduling `setTimeout` loop at **8th-note resolution** (`beatMs / 2`). Uses a `nextTickTimeRef` wall-clock anchor to prevent cumulative drift — each tick advances by exactly one `cycleMs`, and the next `setTimeout` delay is computed as `nextTickTimeRef − Date.now()`. The global tick counter (`tickRef`) never resets.

`unlockAudio()` is called on the first `pointerdown` anywhere on the page (not just on the canvas), ensuring audio plays as soon as drawings load.

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

Each drawing's `beatPosition` is seeded from its `id` string via a deterministic hash + LCG. Same ID always produces the same result.

| Instrument | Weighted slot pool |
|---|---|
| chimes | `[1, 1, 2, 2, 3, 3, 4, 4, 2.5, 4.5]` — on-beats 2× the weight of off-beats |
| horn/bass | `[1, 3]` — downbeats only |
| synth lead | `[2, 3, 4]` — never beat 1 (avoids kick clash) |
| vocal pad | `[1, 3]` — same pool as horns; rate controlled by scheduler |
| all others | `1` (sentinel; pattern-based instruments ignore this field) |

`beatPosition` is recomputed when the instrument changes via shuffle.

### Per-Drawing Phase Humanization

Each drawing has a deterministic ±30 ms phase nudge (`seededPhase(id)`) seeded from `id + '\x01'` — a different LCG suffix than `beatPosition.ts` to prevent correlation between a drawing's beat slot and its timing nudge. Combined with the spatial left-to-right delay (0–`maxOff` ms based on canvas X position), the final play delay per drawing is:

```
delay = max(0, spatialOffset + phaseNudge)
```

---

## Sound Mapping (`src/utils/soundMapping.ts`)

All melodic drawings are mapped into **GLOBAL_SCALE** (C major by default, defined in `src/constants/musicalKey.ts`). Changing `GLOBAL_KEY` and `GLOBAL_SCALE` retunes the entire canvas with no other changes needed.

| Geometry dimension | Maps to |
|---|---|
| Bounding-box diagonal length | Scale degree index (short stroke → high degree, long → low degree) |
| Bounding-box area | Octave 3–6 (small area → octave 6, large area → octave 3) |

Chord type: always a **diatonic triad** (scale degrees 1-3-5 walking GLOBAL_SCALE from the root). No chromatic clashes are possible. No frequency jitter.

Percussion instruments (`kick drum`, `snare drum`, `hi-hat`) return a fixed C2 placeholder; their synth functions ignore the frequency array entirely.

Output shape: `{ note: "E4", chord: ["E4", "G4", "B4"], frequency: [329.63, 392.00, 493.88], instrument }`.

---

## Stroke Grouping

`src/utils/strokeGrouping.ts` + `Canvas.tsx` `finishStroke`.

When a stroke is committed, `findGroupTarget` scans existing own-user drawings for one meeting all three conditions simultaneously:

1. **Same color** (same instrument)
2. **`createdAt` within `STROKE_GROUP_WINDOW_MS` (2000 ms)**
3. **Bounding-box distance ≤ `STROKE_GROUP_PROXIMITY_PX` (200 canvas units)**

Bounding-box distance is the Euclidean minimum gap between two AABBs (0 when overlapping).

On a match, `Canvas.tsx` merges inline: appends SVG path data, unions bounding boxes, re-runs `mapDrawingToSound` on combined geometry, calls `mergeDrawing(target.id, ...)`, resets `createdAt` to extend the window. A `MergeRing` SVG circle (r: 0→60, opacity: 0.8→0, 600 ms) fires at the merged drawing's centre. Locked drawings cannot be merged into.

Constants are tunable in `src/constants/limits.ts`:
```typescript
export const STROKE_GROUP_WINDOW_MS    = 2000;
export const STROKE_GROUP_PROXIMITY_PX = 200;
export const CANVAS_WIDTH  = 8000;
export const CANVAS_HEIGHT = 8000;
```

---

## Supabase Sync

`drawingsStore.ts` handles all backend sync. It runs once when `sessionStore` signals `isLoaded && canvasId`.

**Initial hydration:** fetches all non-deleted drawings for the canvas, merges them into the store (preserving any optimistic drawings created during the async fetch — existing IDs are skipped).

**Realtime channel:** subscribes to `postgres_changes` on `drawings` filtered by `canvas_id`. On INSERT from another user, adds to store. On UPDATE with `is_deleted: true`, removes from store. On UPDATE from another user's merge, updates geometry/sound while preserving local client-only state (`isActive`, `isLocked`, `isMuted`).

**Optimistic writes:** `addDrawing` writes to store immediately, then invokes the `create-drawing` Edge Function. On 4xx rejection (rate limit, drawing cap, canvas inactive), rolls back and shows a toast. On 404/5xx/network failure, falls back to a direct Supabase insert.

---

## What's Fully Working

- Freehand drawing on an infinite canvas with smooth quadratic Bézier paths
- Pan (two-finger drag, mouse wheel) and pinch-to-zoom (0.15× – 8×)
- 9-instrument color picker; swatch taps correctly isolated from canvas pointer events
- Anonymous Supabase auth (`signInAnonymously`); session persisted across reloads
- Username modal on first visit with validation (3–20 chars, alphanumeric + underscore)
- Real-time multi-user drawing sync via Supabase Realtime postgres_changes
- Optimistic UI with rollback on server rejection (rate limit, cap, inactive canvas)
- `mapDrawingToSound` — diatonic, in-scale notes/chords with no frequency jitter
- All 9 Web Audio synths with distinct timbres and global reverb + master compressor
- Per-drawing GainNode: volume slider 0–100 per drawing with `setTargetAtTime` smooth ramping
- Volume persisted to Supabase with 400 ms debounce
- Muted state disables slider; `isActive` toggle always clears mute
- Other users' drawings hideable from canvas (client-only, persisted to localStorage)
- Tempo slider (40–180 BPM) and tap-tempo (up to 8-tap average, 3 s reset window)
- 8th-note scheduler with anti-drift wall-clock anchoring
- Per-instrument rhythm patterns + seeded beat positions for chimes/horn/lead/vocal
- Per-drawing ±30 ms seeded phase humanization independent of beat slot
- Spatial left→right playback delay proportional to canvas X position
- Polyphony cap: at most 5 concurrent voices per tick (sampled randomly above cap)
- Stroke grouping with 2 s window + 200 px proximity merge + MergeRing pulse
- DrawingPanel: mute toggle, per-drawing volume slider, delete (own), hide (others), shuffle
- Shuffle correctly reseeds `beatPosition` to match the new instrument
- Admin panel (`/admin`): list/create/activate canvases; view/remove users; view/delete/nuke drawings
- ChordSheetScreen: chord diagrams ordered left→right by canvas X position; Web Share API with clipboard fallback
- 3-slide onboarding overlay with swipe navigation; `localStorage` dismissal
- Toast notification system (auto-dismiss, stacks)
- PWA manifest with icons
- GitHub Actions CI deploy to GitHub Pages on push to `main`

---

## Known Issues / Stubs

| File / Area | Status | Notes |
|---|---|---|
| `utils/colorNaming.ts` | Stub | Exported as empty module; not called anywhere |
| `utils/pathSimplify.ts` | Stub | Exported as empty module; long paths are not reduced before storage |
| `utils/slugGenerator.ts` | Stub | Required for share-URL generation; not yet implemented |
| `store/useAppStore.ts` | Dead code | `isPlaying` state exists but nothing reads or writes it |
| `DiscoverScreen` | Placeholder | "coming soon" text only; no backend feed |
| `SharedCanvasScreen` | Placeholder | Reads `:slug` param; renders nothing |
| Onboarding copy | Mismatch | Slide 3 says "export as PNG" — no PNG export is implemented |
| `ChordSheetScreen` voicings | Partial | Guitar voicings cover only 10 named chords (C/D/E/G/A major + minor); anything else falls back to an all-muted diagram |
| Hi-hat `beatPosition` | Inert | Always `1` (sentinel); hi-hat fires on every quarter note regardless |
| Reverb not gated by per-drawing volume | By design (MVP) | Reverb sends originate from synth internals before the per-drawing GainNode; reducing drawing volume quiets the dry signal but not the reverb tail |
| `VITE_ADMIN_SERVICE_KEY` in bundle | Security note | Inlined at build time; the service-role key is extractable from the JS bundle. Acceptable for a small-scale project; should be moved behind a server-side proxy for any public deployment |
| `DEBUG_FORCE_MODAL = false` | Leftover debug flag | `UsernameModal.tsx` line 9; harmless but should be removed before a clean release |
| `volume` column migration | Manual step required | Existing Supabase instances need `ALTER TABLE drawings ADD COLUMN IF NOT EXISTS volume numeric NOT NULL DEFAULT 70;` |

---

## Remaining Prompt Queue

Work proceeds in this order. Each label corresponds to a prompt document in the project's prompt queue.

| Label | Feature | Notes |
|---|---|---|
| **G5** | — | Next queued prompt |
| **G6** | — | |
| **G7** | — | |
| **G8** | — | |
| **G9** | — | |
| **G10** | — | |
| **M7** | Chord sheet export | Image / PDF export of the ChordSheetScreen; replaces the placeholder slide-3 onboarding copy |
| **A5** | Viewport Mode | Deprioritized. Lock canvas transform; tap-to-trigger audio instead of loop cadence; full-screen visual feedback per drawing. `isPlaying` in `useAppStore` was scaffolded for this. Nothing in the current architecture blocks it. |

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

`.github/workflows/deploy.yml` triggers on every push to `main`. It builds with env vars injected from GitHub Actions secrets and deploys to `gh-pages` automatically — no manual steps needed after the initial secrets setup below.

### Setting GitHub Actions secrets

The CI workflow requires four secrets. Add them once at:

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
