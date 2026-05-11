import { INSTRUMENT_MAP } from '../constants/instrumentMap';
import { BRUSH_SIZE_MIN, BRUSH_SIZE_MAX } from '../constants/limits';
import { useBrushStore } from '../store/useBrushStore';
import './ColorPicker.css';

interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
}

export default function ColorPicker({ value, onChange }: ColorPickerProps) {
  const brushSize    = useBrushStore((s) => s.brushSize);
  const setBrushSize = useBrushStore((s) => s.setBrushSize);

  // Preview dot display size: keep it within a fixed container so the pill
  // height stays constant regardless of the selected brush size.
  const dotDisplay = Math.max(2, Math.min(brushSize, 36));

  return (
    <div className="color-picker" onPointerDown={(e) => e.stopPropagation()}>
      {INSTRUMENT_MAP.map((entry) => (
        <button
          key={entry.hex}
          className={`color-swatch${value === entry.hex ? ' color-swatch--active' : ''}`}
          onClick={() => onChange(entry.hex)}
          aria-label={entry.instrument}
          title={entry.instrument}
        >
          <div className="swatch-circle" style={{ background: entry.hex }} />
          <span className="swatch-label">{entry.label}</span>
        </button>
      ))}

      <div className="brush-divider" />

      <div className="brush-size-control">
        <input
          type="range"
          className="brush-size-slider"
          min={BRUSH_SIZE_MIN}
          max={BRUSH_SIZE_MAX}
          step={1}
          value={brushSize}
          style={{
            '--brush-pct': `${((brushSize - BRUSH_SIZE_MIN) / (BRUSH_SIZE_MAX - BRUSH_SIZE_MIN)) * 100}%`,
          } as React.CSSProperties}
          onChange={(e) => setBrushSize(Number(e.target.value))}
          aria-label="Brush size"
        />
        <div className="brush-preview-dot-wrap">
          <div
            className="brush-preview-dot"
            style={{
              width:  dotDisplay,
              height: dotDisplay,
              background: value,
            }}
          />
        </div>
      </div>
    </div>
  );
}
