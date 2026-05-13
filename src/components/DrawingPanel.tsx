import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Volume2, VolumeX, Eye, EyeOff, X } from 'lucide-react';
import { useDrawingsStore, type DrawingObject } from '../store/drawingsStore';
import { useSessionStore } from '../store/sessionStore';
import { useViewportStore } from '../store/useViewportStore';
import { setDrawingVolume, removeDrawingGain } from '../utils/audioEngine';
import { panToDrawing } from '../utils/canvasNavigation';
import './DrawingPanel.css';

// ─── AnimatedCardInfo ─────────────────────────────────────────────────────────
// Fades in the label+note pair when sound mapping changes (e.g. after shuffle).

function chordLabel(d: DrawingObject): string {
  const freqs   = d.soundMapping.frequency;
  const isMinor = freqs.length >= 2 && freqs[1] / freqs[0] < 1.22;
  return `${d.soundMapping.note.replace(/\d+$/, '')} ${isMinor ? 'min' : 'maj'}`;
}

function AnimatedCardInfo({ drawing }: { drawing: DrawingObject }) {
  const label   = chordLabel(drawing);
  const instruc = drawing.instrument;
  const key     = `${label}|${instruc}`;
  const ref     = useRef<HTMLDivElement>(null);
  const prevKey = useRef(key);

  useEffect(() => {
    if (key === prevKey.current || !ref.current) return;
    prevKey.current = key;
    ref.current.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 220, easing: 'ease-out' },
    );
  }, [key]);

  const secondary = drawing.username ? `${drawing.username} · ${instruc}` : instruc;

  return (
    <div ref={ref} className="card-info">
      <span className="card-note-name">{label}</span>
      <span className="card-freq">{secondary}</span>
    </div>
  );
}

// ─── OwnCard ─────────────────────────────────────────────────────────────────
// Card for drawings created by the current user.

function OwnCard({ drawing, onNavigate }: { drawing: DrawingObject; onNavigate: () => void }) {
  const update    = useDrawingsStore((s) => s.updateDrawing);
  const remove    = useDrawingsStore((s) => s.removeDrawing);
  const setVolume = useDrawingsStore((s) => s.setVolume);

  const muted = drawing.isMuted;

  return (
    <div className="drawing-card">
      <div className="card-main-row">
        <div className="card-nav-area" onClick={onNavigate}>
          <span
            className="card-swatch"
            style={{ background: drawing.strokeColor }}
          />
          <AnimatedCardInfo drawing={drawing} />
        </div>

        <button
          className="card-icon-btn"
          onClick={() => update(drawing.id, { isMuted: !muted })}
          aria-label={muted ? 'Unmute' : 'Mute'}
          title={muted ? 'Unmute' : 'Mute'}
        >
          {muted
            ? <VolumeX size={14} color="var(--danger)" strokeWidth={1.5} />
            : <Volume2 size={14} color="var(--accent)" strokeWidth={1.5} />
          }
        </button>

        <button
          className="card-icon-btn card-icon-btn--danger"
          onClick={() => { removeDrawingGain(drawing.id); remove(drawing.id); }}
          aria-label="Delete"
          title="Delete"
        >
          <X size={13} strokeWidth={1.5} />
        </button>
      </div>

      <div className="card-slider-row">
        <input
          type="range"
          min={0}
          max={100}
          value={drawing.volume}
          disabled={muted}
          className={`card-volume-slider${muted ? ' card-volume-slider--muted' : ''}`}
          style={{ '--val': drawing.volume } as React.CSSProperties}
          aria-label="Volume"
          onChange={(e) => {
            const val = Number(e.target.value);
            setVolume(drawing.id, val);
            setDrawingVolume(drawing.id, val / 100);
          }}
        />
      </div>
    </div>
  );
}

// ─── CanvasCard ───────────────────────────────────────────────────────────────
// Card for drawings created by other users.

function CanvasCard({ drawing, onNavigate }: { drawing: DrawingObject; onNavigate: () => void }) {
  const update       = useDrawingsStore((s) => s.updateDrawing);
  const toggleHidden = useDrawingsStore((s) => s.toggleHidden);
  const setVolume    = useDrawingsStore((s) => s.setVolume);
  const hiddenIds    = useDrawingsStore((s) => s.hiddenIds);

  const muted  = drawing.isMuted;
  const hidden = hiddenIds.has(drawing.id);

  return (
    <div className={`drawing-card${hidden ? ' drawing-card--hidden' : ''}`}>
      <div className="card-main-row">
        <div className="card-nav-area" onClick={onNavigate}>
          <span
            className="card-swatch"
            style={{ background: drawing.strokeColor }}
          />
          <AnimatedCardInfo drawing={drawing} />
        </div>

        <button
          className="card-icon-btn"
          onClick={() => update(drawing.id, { isMuted: !muted })}
          aria-label={muted ? 'Unmute' : 'Mute'}
          title={muted ? 'Unmute' : 'Mute'}
        >
          {muted
            ? <VolumeX size={14} color="var(--danger)" strokeWidth={1.5} />
            : <Volume2 size={14} color="var(--accent)" strokeWidth={1.5} />
          }
        </button>

        <button
          className="card-icon-btn"
          onClick={() => toggleHidden(drawing.id)}
          aria-label={hidden ? 'Show on canvas' : 'Hide from canvas'}
          title={hidden ? 'Show on canvas' : 'Hide from canvas'}
        >
          {hidden
            ? <EyeOff size={14} color="var(--muted)" strokeWidth={1.5} />
            : <Eye    size={14} color="var(--text-secondary)" strokeWidth={1.5} />
          }
        </button>
      </div>

      <div className="card-slider-row">
        <input
          type="range"
          min={0}
          max={100}
          value={drawing.volume}
          disabled={muted}
          className={`card-volume-slider${muted ? ' card-volume-slider--muted' : ''}`}
          style={{ '--val': drawing.volume } as React.CSSProperties}
          aria-label="Volume"
          onChange={(e) => {
            const val = Number(e.target.value);
            setVolume(drawing.id, val);
            setDrawingVolume(drawing.id, val / 100);
          }}
        />
      </div>
    </div>
  );
}

// ─── SectionHeader ────────────────────────────────────────────────────────────

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="panel-section-header">
      <span className="panel-section-label">{label}</span>
      <span className="panel-section-count">{count}</span>
    </div>
  );
}

// ─── DrawingPanel ─────────────────────────────────────────────────────────────

export default function DrawingPanel() {
  const navigate             = useNavigate();
  const drawings      = useDrawingsStore((s) => s.drawings);
  const shuffleMutes  = useDrawingsStore((s) => s.shuffleMutes);
  const currentUserId = useSessionStore((s) => s.userId);
  const viewportMode  = useViewportStore((s) => s.viewportMode);
  const visibleIds    = useViewportStore((s) => s.visibleDrawingIds);

  const [open,      setOpen]      = useState(false);
  const [shuffling, setShuffling] = useState(false);

  const ownDrawings = drawings
    .filter((d) => d.userId === currentUserId)
    .filter((d) => !viewportMode || visibleIds.has(d.id));
  const othersDrawings = drawings
    .filter((d) => d.userId !== currentUserId)
    .filter((d) => !viewportMode || visibleIds.has(d.id));

  function toggle() { setOpen((v) => !v); }

  function handleShuffle() {
    shuffleMutes();
    setShuffling(true);
    setTimeout(() => setShuffling(false), 400);
  }

  const canShuffle = drawings.length >= 2;
  const hasAudible = drawings.some((d) => !d.isMuted);
  const total      = drawings.length;

  const audibleInView = viewportMode
    ? [...visibleIds].filter((id) => {
        const d = drawings.find((dd) => dd.id === id);
        return d && !d.isMuted;
      }).length
    : 0;

  function handleNavigate(drawing: DrawingObject) {
    panToDrawing(drawing);
    // On mobile the panel slides up as a drawer — auto-close it so the canvas is visible.
    if (window.innerWidth < 768) setOpen(false);
  }

  return (
    <div className={`drawing-panel${open ? ' drawing-panel--open' : ''}`}>

      {/* ── Handle ── */}
      <div
        className="panel-handle"
        onClick={toggle}
        role="button"
        aria-expanded={open}
        aria-label="Toggle drawing panel"
      >
        <div className="panel-pill" />
        <div className="panel-handle-row">
          <span className="panel-label">
            {viewportMode
              ? `Sounds in view: ${audibleInView}`
              : total === 0 ? 'no strokes' : `${total} stroke${total !== 1 ? 's' : ''}`
            }
          </span>
          <div className="panel-actions">
            {hasAudible && (
              <button
                className="panel-btn"
                onClick={(e) => { e.stopPropagation(); navigate('/chords'); }}
              >
                Sheet
              </button>
            )}
            {canShuffle && (
              <button
                className={`panel-btn panel-btn--accent${shuffling ? ' panel-btn--bounce' : ''}`}
                onClick={(e) => { e.stopPropagation(); handleShuffle(); }}
              >
                Shuffle
              </button>
            )}
            <span className="panel-chevron">{open ? '▾' : '▴'}</span>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className={`panel-list${open ? ' panel-list--scrollable' : ''}`}>

        {/* Your Drawings */}
        <SectionHeader label="Your Drawings" count={ownDrawings.length} />
        {ownDrawings.length === 0 ? (
          <p className="panel-empty-text">draw something to get started</p>
        ) : (
          ownDrawings.map((d) => <OwnCard key={d.id} drawing={d} onNavigate={() => handleNavigate(d)} />)
        )}

        {/* Canvas — other users */}
        {othersDrawings.length > 0 && (
          <>
            <SectionHeader label="Canvas" count={othersDrawings.length} />
            {othersDrawings.map((d) => <CanvasCard key={d.id} drawing={d} onNavigate={() => handleNavigate(d)} />)}
          </>
        )}

      </div>
    </div>
  );
}
