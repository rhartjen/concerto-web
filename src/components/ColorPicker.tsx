import { INSTRUMENT_MAP } from '../constants/instrumentMap';
import './ColorPicker.css';

interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
}

export default function ColorPicker({ value, onChange }: ColorPickerProps) {
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
    </div>
  );
}
