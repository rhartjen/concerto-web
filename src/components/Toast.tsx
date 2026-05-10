import { useToastStore } from '../store/toastStore';
import './Toast.css';

export default function Toast() {
  const toasts = useToastStore((s) => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className="toast-item">{t.message}</div>
      ))}
    </div>
  );
}
