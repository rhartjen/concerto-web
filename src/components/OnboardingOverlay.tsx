import React, { useEffect, useRef, useState } from 'react';
import './OnboardingOverlay.css';

// ─── Persistence ──────────────────────────────────────────────────────────────
// expo-file-system flag replaced with localStorage.

const LS_KEY = 'concerto_onboarding_v1';

function checkFirstLaunch(): boolean {
  try { return !localStorage.getItem(LS_KEY); }
  catch { return false; }
}

function markSeen(): void {
  try { localStorage.setItem(LS_KEY, '1'); } catch { /* private-mode guard */ }
}

// ─── SVG Illustrations ────────────────────────────────────────────────────────

function DrawIcon({ accent }: { accent: string }) {
  return (
    <svg width={160} height={108} viewBox="0 0 160 108">
      <rect x="16" y="10" width="128" height="88" rx="10"
        fill="none" stroke={accent} strokeWidth={1.5} opacity={0.2} />
      <path
        d="M 32 72 Q 55 28 80 56 Q 106 84 128 40"
        fill="none" stroke={accent} strokeWidth={3.5}
        strokeLinecap="round" strokeLinejoin="round" opacity={0.88}
      />
      <circle cx={128} cy={40} r={4.5} fill={accent} opacity={0.95} />
      <circle cx={139} cy={32} r={2.8} fill={accent} opacity={0.55} />
      <circle cx={146} cy={44} r={2.0} fill={accent} opacity={0.30} />
    </svg>
  );
}

function ToggleIcon({ accent }: { accent: string }) {
  const rows: { y: number; active: boolean; w: number }[] = [
    { y: 22, active: true,  w: 88  },
    { y: 54, active: false, w: 68  },
    { y: 86, active: true,  w: 108 },
  ];
  return (
    <svg width={160} height={108} viewBox="0 0 160 108">
      {rows.map(({ y, active, w }, i) => (
        <g key={i}>
          <rect x={10} y={y - 8} width={w} height={16} rx={6}
            fill={accent} opacity={active ? 0.18 : 0.06} />
          <rect x={124} y={y - 8} width={26} height={16} rx={8}
            fill={active ? accent : '#151C38'} opacity={active ? 0.55 : 0.45} />
          <circle
            cx={active ? 141 : 129} cy={y}
            r={6.5}
            fill={active ? accent : '#222A50'}
          />
        </g>
      ))}
    </svg>
  );
}

function ExportIcon({ accent }: { accent: string }) {
  const dots: [number, number][] = [
    [44, 36], [58, 31], [72, 42], [86, 36],
    [44, 62], [58, 57], [72, 52],
  ];
  return (
    <svg width={160} height={108} viewBox="0 0 160 108">
      <rect x={22} y={10} width={84} height={92} rx={9}
        fill="none" stroke={accent} strokeWidth={1.5} opacity={0.28} />
      {[32, 50, 68, 86].map((y) => (
        <line key={y} x1={30} y1={y} x2={98} y2={y}
          stroke={accent} strokeWidth={0.8} opacity={0.18} />
      ))}
      {[44, 58, 72, 86].map((x) => (
        <line key={x} x1={x} y1={22} x2={x} y2={90}
          stroke={accent} strokeWidth={0.8} opacity={0.14} />
      ))}
      {dots.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={3.5} fill={accent} opacity={0.72} />
      ))}
      <path
        d="M 128 76 L 128 34 M 118 44 L 128 34 L 138 44"
        stroke={accent} strokeWidth={2.8}
        fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.92}
      />
      <path
        d="M 119 58 L 119 78 L 137 78 L 137 58"
        stroke={accent} strokeWidth={1.6}
        fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.35}
      />
    </svg>
  );
}

// ─── Slide data ───────────────────────────────────────────────────────────────

interface Slide {
  accent: string;
  title:  string;
  body:   string;
  Icon:   React.FC<{ accent: string }>;
}

const SLIDES: Slide[] = [
  {
    accent: '#3ED4C4',
    title:  'draw to compose',
    body:   'Each mark on the canvas becomes a chord. Stroke length sets pitch, horizontal position sets octave, and orientation determines major or minor.',
    Icon:   DrawIcon,
  },
  {
    accent: '#E8982A',
    title:  'build your arrangement',
    body:   'Toggle drawings on and off to layer your progression. Lock a drawing to protect it from shuffling. Up to five voices play each cycle.',
    Icon:   ToggleIcon,
  },
  {
    accent: '#A09CFF',
    title:  'export a chord sheet',
    body:   'Active chords are ordered left to right by canvas position. Tap Sheet to preview a printable chord diagram and share it as a PNG.',
    Icon:   ExportIcon,
  },
];

// ─── OnboardingOverlay ────────────────────────────────────────────────────────

export default function OnboardingOverlay() {
  const [show, setShow] = useState(() => checkFirstLaunch());
  const [page, setPage] = useState(0);
  const scrollRef       = useRef<HTMLDivElement>(null);

  // Keep page in sync when the user swipes manually.
  function handleScroll() {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const p  = Math.round(el.scrollLeft / el.clientWidth);
    if (p !== page) setPage(p);
  }

  function dismiss() {
    markSeen();
    setShow(false);
  }

  function handleNext() {
    if (!scrollRef.current) return;
    if (page < SLIDES.length - 1) {
      const next = page + 1;
      scrollRef.current.scrollTo({ left: next * scrollRef.current.clientWidth, behavior: 'smooth' });
      setPage(next);
    } else {
      dismiss();
    }
  }

  // Prevent body scroll while overlay is open.
  useEffect(() => {
    if (!show) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [show]);

  if (!show) return null;

  const slide  = SLIDES[page];
  const isLast = page === SLIDES.length - 1;

  return (
    <div className="onboarding-backdrop">

      <button className="onboarding-skip" onClick={dismiss}>skip</button>

      {/* ── Swipeable cards ── */}
      <div
        ref={scrollRef}
        className="onboarding-scroll"
        onScroll={handleScroll}
      >
        {SLIDES.map((s, i) => (
          <div key={i} className="onboarding-page">
            <div
              className="onboarding-card"
              style={{ borderTopColor: s.accent + '55' }}
            >
              <s.Icon accent={s.accent} />
              <span
                className="onboarding-card-title"
                style={{ color: s.accent }}
              >
                {s.title}
              </span>
              <p className="onboarding-card-body">{s.body}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Page dots ── */}
      <div className="onboarding-dots">
        {SLIDES.map((s, i) => (
          <div
            key={i}
            className={`onboarding-dot${i === page ? ' onboarding-dot--active' : ''}`}
            style={i === page ? { background: s.accent } : undefined}
          />
        ))}
      </div>

      {/* ── CTA ── */}
      <button
        className="onboarding-cta"
        onClick={handleNext}
        style={{
          borderColor:     slide.accent + '55',
          backgroundColor: isLast ? slide.accent + '1C' : 'transparent',
          color:           slide.accent,
        }}
      >
        {isLast ? 'get started' : 'continue →'}
      </button>

    </div>
  );
}
