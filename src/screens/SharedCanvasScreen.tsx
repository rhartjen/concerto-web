import { useNavigate, useParams } from 'react-router-dom';
import './PlaceholderScreen.css';

export default function SharedCanvasScreen() {
  const navigate    = useNavigate();
  const { slug }    = useParams<{ slug: string }>();

  return (
    <div className="placeholder-screen">
      <span className="placeholder-title">SHARED CANVAS</span>
      <span className="placeholder-hint">{slug}</span>
      <button className="placeholder-back" onClick={() => navigate('/')}>
        ← Back to Canvas
      </button>
    </div>
  );
}
