import { useRef } from 'react';
import { useTempoStore } from '../store/tempoStore';
import './TempoBar.css';

export default function TempoBar() {
  const bpm    = useTempoStore((s) => s.bpm);
  const setBpm = useTempoStore((s) => s.setBpm);
  const tapsRef = useRef<number[]>([]);

  function handleTap() {
    const now  = Date.now();
    const prev = tapsRef.current;

    // Reset sequence if the user paused for more than 3 seconds.
    if (prev.length > 0 && now - prev[prev.length - 1] > 3000) {
      tapsRef.current = [now];
      return;
    }

    const taps = [...prev.slice(-7), now]; // keep last 8 taps (7 intervals)
    tapsRef.current = taps;
    if (taps.length < 2) return;

    let total = 0;
    for (let i = 1; i < taps.length; i++) total += taps[i] - taps[i - 1];
    const newBpm = Math.round(60000 / (total / (taps.length - 1)));
    setBpm(Math.max(40, Math.min(180, newBpm)));
  }

  return (
    <div className="tempo-bar" onPointerDown={(e) => e.stopPropagation()}>
      <span className="tempo-wordmark">Concerto</span>
      <div className="tempo-divider" />
      <span className="tempo-bpm">{bpm}</span>
      <span className="tempo-unit">BPM</span>
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
  );
}
