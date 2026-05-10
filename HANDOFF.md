# Concerto Web — Project Handoff

**Stack:** React 18 · TypeScript 5.5 · Vite 5.4 · Zustand 5 · Web Audio API  
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
    ├── App.tsx                 # BrowserRouter + route table + global <Toast />
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
    │   ├── DrawingPanel.tsx    # Bottom sheet: drawing cards, toggle/lock/delete,
    │   │                       # Shuffle button, Sheet navigation
    │   ├── DrawingPanel.css
    │   ├── OnboardingOverlay.tsx  # 3-slide swipeable first-launch tutorial;
    │   │                          # dismissal persisted in localStorage
    │   ├── OnboardingOverlay.css
    │   ├── TempoBar.tsx        # Fixed top bar: BPM display, range slider, tap-tempo
    │   ├── TempoBar.css
    │   ├── Toast.tsx           # Global toast renderer (reads toastStore)
    │   └── Toast.css
    │
    ├── constants/
    │   ├── instrumentMap.ts    # InstrumentName union, INSTRUMENT_MAP (hex→instrument),
    │   │                       # INSTRUMENT_GAIN (mix levels), getInstrumentForColor()
    │   └── limits.ts           # STROKE_GROUP_WINDOW_MS, STROKE_GROUP_PROXIMITY_PX
    │
    ├── hooks/
    │   └── useAmbientLoop.ts   # Self-scheduling 8th-note tick loop; fires each
    │                           # drawing's synth at its assigned beat position
    │
    ├── screens/
    │   ├── CanvasScreen.tsx    # Composes <Canvas>, <DrawingPanel>, <OnboardingOverlay>
    │   ├── ChordSheetScreen.tsx   # Chord diagram grid; guitar voicings for active
    │   │                          # drawings sorted left→right; Web Share / clipboard
    │   ├── ChordSheetScreen.css
    │   ├── DiscoverScreen.tsx     # Placeholder — "coming soon"
    │   ├── SharedCanvasScreen.tsx # Placeholder — reads :slug param, no data yet
    │   └── PlaceholderScreen.css
    │
    ├── store/
    │   ├── drawingsStore.ts    # DrawingObject[] state; add/update/remove/clear/shuffle
    │   ├── tempoStore.ts       # { bpm, setBpm } — single source of truth for tempo
    │   ├── toastStore.ts       # { toasts, showToast, dismissToast } — auto-dismiss
    │   └── useAppStore.ts      # { isPlaying } — currently unused placeholder
    │
    └── utils/
        ├── audioEngine.ts      # 9 Web Audio synth functions + unlockAudio() +
        │                       # playChord() dispatch entry point
        ├── beatPosition.ts     # seededRandom() + assignBeatPosition() — deterministic
        │                       # beat slot from drawing ID × instrument
        ├── colorNaming.ts      # STUB (not yet implemented)
        ├── formatTime.ts       # formatTime(ms) → "M:SS" string
        ├── pathSimplify.ts     # STUB (not yet implemented)
        ├── pathUtils.ts        # buildSmoothPath(), computeBoundingBox(), Point/BoundingBox
        ├── slugGenerator.ts    # STUB (not yet implemented)
        ├── soundMapping.ts     # mapDrawingToSound() — bbox geometry → note/chord/freq
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
| `zustand` | ^5.0.13 | Global state (drawings, tempo, toasts) |
| `@use-gesture/react` | ^10.3.1 | Pinch-to-zoom / two-finger pan on touch devices |

### Dev

| Package | Version | Purpose |
|---|---|---|
| `vite` | ^5.4.0 | Build tool and dev server |
| `@vitejs/plugin-react` | ^4.3.0 | Babel-based React fast refresh |
| `typescript` | ~5.5.0 | Type checker |
| `@types/react` | ^18.3.0 | React type definitions |
| `@types/react-dom` | ^18.3.0 | ReactDOM type definitions |

No Supabase client, no testing framework, no CSS preprocessor — all vanilla as of this writing.

---

## Routes

| Path | Screen | Status |
|---|---|---|
| `/` | `CanvasScreen` | Fully implemented |
| `/chords` | `ChordSheetScreen` | Fully implemented |
| `/discover` | `DiscoverScreen` | Placeholder |
| `/s/:slug` | `SharedCanvasScreen` | Placeholder — reads slug, renders nothing |

---

## DrawingObject Type

Defined in `src/store/drawingsStore.ts`.

```typescript
export interface DrawingObject {
  id:           string;       // "stroke-{base36 timestamp}-{base36 counter}"
  path:         string;       // SVG path data (may contain multiple M subpaths after grouping)
  boundingBox:  BoundingBox;  // { x, y, width, height } in canvas coordinates
  position:     { x: number; y: number };  // top-left of boundingBox
  strokeColor:  string;       // hex, e.g. "#E84040"
  strokeWidth:  number;       // always 4 (constant STROKE_WIDTH in Canvas.tsx)
  instrument:   InstrumentName;
  isActive:     boolean;      // false = muted; drawing still rendered
  isLocked:     boolean;      // true = excluded from shuffle and stroke grouping
  createdAt:    number;       // Date.now() at creation; refreshed on each group merge
  soundMapping: SoundMapping; // { note, chord, frequency[], instrument }
  beatPosition: number;       // 1 | 1.5 | 2 | 2.5 | 3 | 3.5 | 4 | 4.5
                              // assigned at creation from seeded random; re-assigned on shuffle
}
```

`BoundingBox` and `SoundMapping` are defined in `src/utils/pathUtils.ts` and `src/utils/soundMapping.ts` respectively.

---

## Instrument Palette

Nine instruments, one per color swatch. All synths are implemented in `src/utils/audioEngine.ts` using the Web Audio API only (no external audio library).

| Hex | Label | Instrument | Synthesis character |
|---|---|---|---|
| `#E84040` | 808 | `808 bass` | Sine osc; pitch drops from `freq` to `freq × 0.8` over 300 ms; long sustain, slow exponential release; low-pass Q=2.2. Fires every 2 beats. |
| `#E87830` | KICK | `kick drum` | Fixed 150 → 40 Hz sine sweep (80 ms) + 12 ms noise click transient; `DynamicsCompressor` hard limiter. Fires on beat 1 of each measure. |
| `#D4A028` | SNARE | `snare drum` | White noise through bandpass at 2000 Hz (Q=1.33 ≈ 1500–3000 Hz); 2 ms attack, 120 ms decay. Fires on beats 2 and 4. |
| `#D4CC48` | HHAT | `hi-hat` | White noise through highpass >8 kHz; alternates closed (40 ms) / open (200 ms) on every beat. |
| `#96C440` | CHIME | `chimes` | Triangle osc; ±15% velocity randomization per trigger; 6-tap multi-delay reverb tail (up to 1.6 s). |
| `#58C498` | PAD | `synth pad` | Three detuned sawtooths (±9 cents); 400 ms attack, 600 ms release swell; gentle low-pass. Fires every 4 beats (once per measure). |
| `#4A90E8` | HORN | `horn/bass` | Square wave through 900 Hz bandpass (50/50 wet/dry); 80 ms attack; ±3 Hz LFO pitch wobble (breath); decays at ~35% of beat duration. |
| `#A09CFF` | LEAD | `synth lead` | Sawtooth, 13 ms attack, 5.5 Hz LFO vibrato; staccato gate cuts off at 60% of beat duration. |
| `#D46E88` | VOX | `vocal pad` | Sawtooth through parallel "ah" formant bandpass filters (650 / 1100 / 2700 Hz); 600 ms attack; 800 ms release. Lowest gain of all pads. |

### Mix Gain Constants (`INSTRUMENT_GAIN` in `instrumentMap.ts`)

```
kick drum:  1.00   snare drum: 0.90   hi-hat: 0.50
808 bass:   0.85   synth lead: 0.70   horn/bass: 0.65
chimes:     0.60   synth pad:  0.55   vocal pad: 0.45
```

Applied as: `peak = 0.38 (AMPLITUDE) × 0.45 (LOOP_VOLUME) × INSTRUMENT_GAIN[instrument]`

---

## Audio Scheduling

`src/hooks/useAmbientLoop.ts` runs a self-scheduling `setTimeout` loop at **8th-note resolution** (`beatMs / 2`). The global tick counter (`tickRef`) never resets.

### `shouldFire(instrument, tick, beatPosition)` — gating rules

| Instrument | Rule |
|---|---|
| kick drum | `tick % 8 === 0` (beat 1 of each 4/4 measure) |
| snare drum | `tick % 8 === 2 \|\| tick % 8 === 6` (beats 2 and 4) |
| hi-hat | `tick % 2 === 0` (every quarter note) |
| 808 bass | `tick % 8 === 0 \|\| tick % 8 === 4` (every 2 beats) |
| synth pad | `tick % 8 === 0` (downbeat of every measure) |
| vocal pad | `tick % 16 === beatPosToTick(beatPosition)` (every 2 measures) |
| chimes / horn / lead | `tick % 8 === beatPosToTick(beatPosition)` (every measure at assigned slot) |

`beatPosToTick(p) = Math.round((p − 1) × 2)` maps beat positions 1…4.5 to tick offsets 0…7.

### Beat Position Assignment (`src/utils/beatPosition.ts`)

Each drawing's `beatPosition` is seeded from its `id` string via a deterministic hash + LCG. Same ID always produces the same result.

| Instrument | Weighted slot pool |
|---|---|
| chimes | `[1,1, 2,2, 3,3, 4,4, 2.5, 4.5]` — on-beats 2× the weight of off-beats |
| horn/bass | `[1, 3]` — downbeats only |
| synth lead | `[2, 3, 4]` — never beat 1 (avoids kick clash) |
| vocal pad | `[1, 3]` — same pool as horns; rate controlled by scheduler |
| all others | `1` (sentinel; pattern-based instruments ignore this field) |

`beatPosition` is recomputed when the instrument changes via shuffle.

---

## Stroke Grouping

`src/utils/strokeGrouping.ts` + `src/components/Canvas.tsx` `finishStroke`.

When a stroke is committed, `findGroupTarget` scans existing drawings for one that meets all three conditions simultaneously:

1. **Same color** (same instrument)
2. **`createdAt` within `STROKE_GROUP_WINDOW_MS` (2000 ms)**
3. **Bounding-box distance ≤ `STROKE_GROUP_PROXIMITY_PX` (200 canvas units)**

Bounding-box distance is the Euclidean minimum gap between two AABBs (0 when overlapping).

On a match, `Canvas.tsx` performs the merge inline:
- Appends new SVG path data (`target.path + ' ' + incomingPath`) so both strokes render as one `<path>` element
- Unions the bounding boxes
- Re-runs `mapDrawingToSound` on the combined geometry
- Calls `updateDrawing(target.id, ...)` — no new store row
- Resets `createdAt: Date.now()` on the target to extend the window for the next stroke

A `MergeRing` SVG circle (r: 0 → 60, opacity: 0.8 → 0, 600 ms) is rendered at the merged drawing's centre using the Web Animations API. Locked drawings cannot receive new strokes via grouping.

Both constants are tunable in `src/constants/limits.ts`:
```typescript
export const STROKE_GROUP_WINDOW_MS    = 2000;
export const STROKE_GROUP_PROXIMITY_PX = 200;
```

---

## Sound Mapping Logic (`src/utils/soundMapping.ts`)

Each drawing maps deterministically to a note and chord in **C major pentatonic**:

| Geometry | Maps to |
|---|---|
| Bounding-box diagonal length | Scale degree (short → high A, long → low C) |
| Horizontal centre of bbox | Octave 3–6 (left → bass, right → treble) |
| Aspect ratio (width / height) | Chord quality (wide → major, tall → minor) |

Output: `{ note: "E5", chord: ["E5","G#5","B5"], frequency: [659.25, 830.61, 987.77], instrument }`.

---

## What's Fully Working

- Freehand drawing on an infinite canvas with smooth quadratic Bézier paths
- Pan (two-finger drag, mouse wheel) and pinch-to-zoom (0.15× – 8×)
- 9-instrument color picker; swatch taps correctly isolated from canvas pointer events
- `mapDrawingToSound` — deterministic pitch/octave/chord from stroke geometry
- All 9 Web Audio synths with distinct timbres and gain staging
- Tempo slider (40–180 BPM) and tap-tempo (up to 8-tap average, 3 s reset window)
- 8th-note-resolution beat scheduler with per-instrument rhythm patterns
- Deterministic, ID-seeded beat positions for chimes / horn / lead / vocal
- Stroke grouping with 2 s window + 200 px proximity merge + MergeRing pulse
- DrawingPanel: toggle active, lock, delete, shuffle sound mappings
- Shuffle correctly reseeds `beatPosition` to match the new instrument
- ChordSheetScreen: chord diagrams ordered left → right by canvas X position; Web Share API with clipboard fallback
- 3-slide onboarding overlay with swipe navigation; `localStorage` dismissal
- Toast notification system (auto-dismiss, stacks)
- PWA manifest with icons

---

## Known Issues / Stubs

| File / Area | Status | Notes |
|---|---|---|
| `utils/colorNaming.ts` | Stub | Exported as empty module; not called anywhere |
| `utils/pathSimplify.ts` | Stub | Exported as empty module; long paths are not reduced before storage |
| `utils/slugGenerator.ts` | Stub | Required for share-URL generation; not yet implemented |
| `store/useAppStore.ts` | Dead code | `isPlaying` state exists but nothing reads or writes it |
| `DiscoverScreen` | Placeholder | "coming soon" text only; no backend feed |
| `SharedCanvasScreen` | Placeholder | Reads `:slug` param; renders no data |
| Onboarding copy | Mismatch | Slide 3 says "export as PNG" — no PNG export is implemented |
| `ChordSheetScreen` voicings | Partial | Guitar voicings cover only 10 named chords; anything else falls back to an all-muted diagram |
| Hi-hat `beatPosition` | Inert | Always `1` (sentinel); hi-hat fires on every beat regardless of assigned slot |
| Low-BPM xOffset | Edge case | At ≤ 55 BPM, spatial spread can approach 40% of `cycleMs`, causing drawings near the right edge to audibly bleed into the next beat |
| No persistence | By design (for now) | Drawings live only in Zustand memory; a page refresh clears everything |

---

## Next Steps

### Backend — Queued (Prompts 13–21 from original plan)

The next major phase is Supabase integration. Planned work in order:

1. **Anonymous sessions** — create or restore a Supabase anonymous user on first load; store `session_id` in `localStorage`
2. **Drawing sync** — persist `DrawingObject` rows to a `drawings` table in real time; `addDrawing` / `updateDrawing` / `removeDrawing` mirror to Supabase
3. **Slug-based sharing** — implement `slugGenerator.ts`; write a `canvases` table row on share; `SharedCanvasScreen` fetches and renders read-only drawings by slug
4. **Row-level security (RLS)** — anonymous users can only read/write their own rows; shared canvases are publicly readable by slug
5. **Discover feed** — `DiscoverScreen` queries recently shared canvases; infinite scroll or paginated grid

`colorNaming.ts` and `pathSimplify.ts` stubs will be filled in as part of this phase (color names for the Discover feed; path simplification before writing SVG data to the database to stay within column size limits).

### Viewport Mode — Deprioritized, Not Abandoned (Prompt A5)

The original plan included a "Viewport Mode" that would lock the canvas transform and shift the interaction model from free-draw to a performance view: strokes trigger audio on tap rather than at loop cadence, drawings are displayed full-screen with visual feedback proportional to their sound. This feature is deliberately parked until the backend is stable. Nothing in the current architecture blocks it — `isPlaying` in `useAppStore` was scaffolded with this mode in mind.

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
