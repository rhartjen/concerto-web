import { useEffect, useRef, useState } from 'react';
import { useTempoStore } from '../store/tempoStore';
import './TempoBar.css';

export default function TempoBar() {
  const bpm    = useTempoStore((s) => s.bpm);
  const setBpm = useTempoStore((s) => s.setBpm);
  const tapsRef = useRef<number[]>([]);
  const pillRef = useRef<HTMLButtonElement>(null);
  const popRef  = useRef<HTMLDivElement>(null);
  const [open,     setOpen]     = useState(false);
  const [popStyle, setPopStyle] = useState<React.CSSProperties>({});

  function handleTap() {
    const now  = Date.now();
    const prev = tapsRef.current;

    if (prev.length > 0 && now - prev[prev.length - 1] > 3000) {
      tapsRef.current = [now];
      return;
    }

    const taps = [...prev.slice(-7), now];
    tapsRef.current = taps;
    if (taps.length < 2) return;

    let total = 0;
    for (let i = 1; i < taps.length; i++) total += taps[i] - taps[i - 1];
    const newBpm = Math.round(60000 / (total / (taps.length - 1)));
    setBpm(Math.max(40, Math.min(180, newBpm)));
  }

  function openPopover() {
    if (!pillRef.current) return;
    const rect          = pillRef.current.getBoundingClientRect();
    const POPOVER_WIDTH = 220;
    const MARGIN        = 8;
    const style: React.CSSProperties = { top: rect.bottom + 6 };

    if (rect.left + POPOVER_WIDTH + MARGIN > window.innerWidth) {
      // Pill is near the right edge — anchor popover's right to pill's right
      style.right = window.innerWidth - rect.right;
    } else {
      style.left = rect.left;
    }

    setPopStyle(style);
    setOpen(true);
  }

  function handlePillClick() {
    if (open) setOpen(false);
    else openPopover();
  }

  // Close when the user taps outside the popover (including canvas draw start)
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (popRef.current?.contains(e.target as Node))  return;
      if (pillRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener('pointerdown', onDown, { capture: true });
    return () => document.removeEventListener('pointerdown', onDown, { capture: true });
  }, [open]);

  return (
    <>
      <div className="tempo-bar" onPointerDown={(e) => e.stopPropagation()}>
        <span className="tempo-wordmark">Concerto</span>
        <div className="tempo-divider" />
        <button
          ref={pillRef}
          className={`tempo-pill${open ? ' tempo-pill--open' : ''}`}
          onClick={handlePillClick}
        >
          {bpm} <span className="tempo-pill-unit">BPM</span>
        </button>
      </div>

      {open && (
        <div
          ref={popRef}
          className="tempo-popover"
          style={popStyle}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="tempo-popover-readout">
            <span className="tempo-popover-value">{bpm}</span>
            <span className="tempo-popover-unit">BPM</span>
          </div>
          <input
            className="tempo-slider"
            type="range"
            min={40}
            max={180}
            step={1}
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
          />
          <button className="tempo-tap" onPointerDown={handleTap}>TAP</button>
        </div>
      )}
    </>
  );
}
