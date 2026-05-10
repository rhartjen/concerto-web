import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDrawingsStore, type DrawingObject } from '../store/drawingsStore';
import { useToastStore } from '../store/toastStore';
import './ChordSheetScreen.css';

// ─── Guitar chord voicings ─────────────────────────────────────────────────
// frets: [low-E, A, D, G, B, high-E] — -1 = muted, 0 = open, n = absolute fret
// startFret: first fret shown (1 = nut position with thick top bar)

type Voicing = { frets: number[]; startFret: number };

const VOICINGS: Record<string, Voicing> = {
  'C major': { frets: [-1, 3, 2, 0, 1, 0],  startFret: 1 },
  'D major': { frets: [-1, -1, 0, 2, 3, 2], startFret: 1 },
  'E major': { frets: [0, 2, 2, 1, 0, 0],   startFret: 1 },
  'G major': { frets: [3, 2, 0, 0, 0, 3],   startFret: 1 },
  'A major': { frets: [-1, 0, 2, 2, 2, 0],  startFret: 1 },
  'C minor': { frets: [-1, 3, 5, 5, 4, 3],  startFret: 3 },
  'D minor': { frets: [-1, -1, 0, 2, 3, 1], startFret: 1 },
  'E minor': { frets: [0, 2, 2, 0, 0, 0],   startFret: 1 },
  'G minor': { frets: [3, 5, 5, 3, 3, 3],   startFret: 3 },
  'A minor': { frets: [-1, 0, 2, 2, 1, 0],  startFret: 1 },
};
const FALLBACK: Voicing = { frets: [-1, -1, -1, -1, -1, -1], startFret: 1 };

const TEAL = '#3ed4c4';

// ─── Helpers ──────────────────────────────────────────────────────────────

function chordLabel(d: DrawingObject): string {
  const root    = d.soundMapping.note.replace(/\d+$/, '');
  const freqs   = d.soundMapping.frequency;
  const isMinor = freqs.length >= 2 && freqs[1] / freqs[0] < 1.22;
  return `${root} ${isMinor ? 'minor' : 'major'}`;
}

function sortedActive(drawings: DrawingObject[]): DrawingObject[] {
  return drawings
    .filter((d) => d.isActive)
    .sort((a, b) => {
      const ax = a.boundingBox.x + a.boundingBox.width / 2;
      const bx = b.boundingBox.x + b.boundingBox.width / 2;
      return ax - bx;
    });
}

// ─── ChordBox ─────────────────────────────────────────────────────────────

const S_GAP  = 12;
const F_GAP  = 20;
const N_STR  = 6;
const N_FRT  = 4;
const L_PAD  = 12;
const HEAD_H = 20;
const BOX_W  = L_PAD + S_GAP * (N_STR - 1) + 22;
const BOX_H  = HEAD_H + F_GAP * N_FRT + 10;

function ChordBox({ label, accentColor }: { label: string; accentColor: string }) {
  const { frets, startFret } = VOICINGS[label] ?? FALLBACK;
  const gridR = L_PAD + S_GAP * (N_STR - 1);

  return (
    <svg width={BOX_W} height={BOX_H}>
      {/* Fret lines */}
      {Array.from({ length: N_FRT + 1 }, (_, f) => (
        <line
          key={`f${f}`}
          x1={L_PAD} y1={HEAD_H + f * F_GAP}
          x2={gridR}  y2={HEAD_H + f * F_GAP}
          stroke={f === 0 && startFret === 1 ? '#2a3060' : '#151b3a'}
          strokeWidth={f === 0 && startFret === 1 ? 3 : 1}
        />
      ))}

      {/* String lines */}
      {Array.from({ length: N_STR }, (_, s) => (
        <line
          key={`s${s}`}
          x1={L_PAD + s * S_GAP} y1={HEAD_H}
          x2={L_PAD + s * S_GAP} y2={HEAD_H + F_GAP * N_FRT}
          stroke="#151b3a"
          strokeWidth={1}
        />
      ))}

      {/* Fret position label for barre chords */}
      {startFret > 1 && (
        <text x={gridR + 4} y={HEAD_H + F_GAP * 0.85} fontSize={8} fill="#363c62">
          {`${startFret}fr`}
        </text>
      )}

      {/* Per-string indicators */}
      {frets.map((fret, s) => {
        const cx = L_PAD + s * S_GAP;
        if (fret < 0) {
          return (
            <text key={s} x={cx} y={HEAD_H - 5} fontSize={9} fill="#252a44" textAnchor="middle">
              ×
            </text>
          );
        }
        if (fret === 0) {
          return (
            <circle key={s} cx={cx} cy={HEAD_H - 8} r={4} fill="none" stroke={accentColor} strokeWidth={1.4} />
          );
        }
        const relFret = fret - startFret + 1;
        const cy = HEAD_H + (relFret - 0.5) * F_GAP;
        return <circle key={s} cx={cx} cy={cy} r={5} fill={accentColor} />;
      })}
    </svg>
  );
}

// ─── ChordCard ─────────────────────────────────────────────────────────────

function ChordCard({ drawing, index }: { drawing: DrawingObject; index: number }) {
  const label     = chordLabel(drawing);
  const noteNames = drawing.soundMapping.chord
    .map((n) => n.replace(/\d+$/, ''))
    .join(' – ');
  const accent = drawing.strokeColor ?? TEAL;

  return (
    <div className="chord-card" style={{ borderColor: `${accent}18` }}>
      <div className="chord-card-top">
        <span className="chord-seq" style={{ color: accent }}>
          {String(index + 1).padStart(2, '0')}
        </span>
        <span className="chord-name">{label}</span>
      </div>
      <ChordBox label={label} accentColor={accent} />
      <span className="chord-notes">{noteNames}</span>
    </div>
  );
}

// ─── ChordSheetScreen ──────────────────────────────────────────────────────

export default function ChordSheetScreen() {
  const navigate   = useNavigate();
  const showToast  = useToastStore((s) => s.showToast);
  const drawings   = useDrawingsStore((s) => s.drawings);
  const sorted     = sortedActive(drawings);
  const sheetRef   = useRef<HTMLDivElement>(null);

  const dateStr = new Date().toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Chord Sheet', url: window.location.href });
      } catch {
        // user dismissed — no-op
      }
    } else {
      // Clipboard fallback for browsers without Web Share API
      try {
        await navigator.clipboard.writeText(window.location.href);
        showToast('Link copied to clipboard');
      } catch {
        showToast('Could not copy — please copy the URL manually');
      }
    }
  }

  return (
    <div className="chord-sheet-root">

      <div className="chord-sheet-header">
        <button className="chord-sheet-btn" onClick={() => navigate(-1)}>
          Close
        </button>
        <span className="chord-sheet-title">CHORD SHEET</span>
        <button
          className="chord-sheet-btn chord-sheet-share"
          onClick={handleShare}
          disabled={sorted.length === 0}
        >
          Share
        </button>
      </div>

      <p className="chord-sheet-meta">
        snapshot · {sorted.length} active chord{sorted.length !== 1 ? 's' : ''} · {dateStr}
      </p>

      {sorted.length === 0 ? (
        <div className="chord-sheet-empty">
          <p className="chord-sheet-empty-text">No active chords.</p>
          <p className="chord-sheet-empty-hint">Draw something on the canvas first.</p>
        </div>
      ) : (
        <div className="chord-sheet-scroll">
          <div ref={sheetRef} className="chord-sheet-capture">
            <div className="chord-sheet-cap-header">
              <span className="chord-sheet-cap-title">CHORD SHEET</span>
              <span className="chord-sheet-cap-date">{dateStr}</span>
            </div>
            <div className="chord-sheet-grid">
              {sorted.map((d, i) => (
                <ChordCard key={d.id} drawing={d} index={i} />
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
