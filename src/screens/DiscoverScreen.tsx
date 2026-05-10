import { useNavigate } from 'react-router-dom';
import './PlaceholderScreen.css';

export default function DiscoverScreen() {
  const navigate = useNavigate();
  return (
    <div className="placeholder-screen">
      <span className="placeholder-title">DISCOVER</span>
      <span className="placeholder-hint">coming soon</span>
      <button className="placeholder-back" onClick={() => navigate('/')}>
        ← Back to Canvas
      </button>
    </div>
  );
}
