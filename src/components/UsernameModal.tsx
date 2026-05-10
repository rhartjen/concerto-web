import React, { useRef, useState } from 'react';
import { useSessionStore } from '../store/sessionStore';
import './UsernameModal.css';

const USER_ID_KEY = 'concerto_user_id';
const VALID = /^[a-zA-Z0-9_]{3,20}$/;

export default function UsernameModal() {
  const { isLoaded, needsUsername, setUsername } = useSessionStore();
  const isReturning = Boolean(localStorage.getItem(USER_ID_KEY));

  const [value,   setValue]   = useState('');
  const [error,   setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Block the canvas with an opaque layer while the session is initialising so
  // the modal can't be skipped by a fast render before needsUsername is set.
  if (!isLoaded) return <div className="username-backdrop" />;
  if (!needsUsername) return null;

  function validate(v: string): string | null {
    if (v.length < 3)          return 'At least 3 characters';
    if (v.length > 20)         return 'At most 20 characters';
    if (!VALID.test(v))        return 'Letters, numbers, and underscores only';
    return null;
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setValue(e.target.value);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    const msg = validate(trimmed);
    if (msg) { setError(msg); return; }

    setLoading(true);
    setError(null);
    try {
      await setUsername(trimmed);
    } catch (err: unknown) {
      const pg = err as { code?: string; message?: string };
      if (pg?.code === '23505') {
        setError('Username taken');
      } else {
        setError('Something went wrong — try again');
      }
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="username-backdrop">
      <div className="username-card">
        <span className="username-title">
          {isReturning ? 'welcome back' : 'choose a username'}
        </span>
        <p className="username-body">
          {isReturning
            ? 'Pick a new username to re-join the canvas.'
            : 'Your username is how others see you on the canvas. No account needed.'}
        </p>

        <form className="username-form" onSubmit={handleSubmit} noValidate>
          <input
            ref={inputRef}
            className={`username-input${error ? ' username-input--error' : ''}`}
            type="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="your_name"
            value={value}
            onChange={handleChange}
            maxLength={20}
            disabled={loading}
            autoFocus
          />
          {error && <span className="username-error">{error}</span>}

          <button
            className="username-cta"
            type="submit"
            disabled={loading || value.trim().length < 3}
          >
            {loading ? 'joining…' : 'join canvas →'}
          </button>
        </form>
      </div>
    </div>
  );
}
