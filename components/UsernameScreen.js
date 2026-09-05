'use client';
import { useState } from 'react';

export default function UsernameScreen({ onSetUsername }) {
  const [name, setName] = useState('');

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length < 2) return;
    onSetUsername(trimmed);
  };

  return (
    <div className="username-screen">
      <div className="username-glow-orb" />
      <div className="username-card">
        <div className="logo-badge-wrap">
          <div className="logo-mark" aria-hidden="true" />
        </div>
        <h1 className="logo-text">
          FluxChat <span className="logo-text-sub">BY PANARWALA</span>
        </h1>
        <div className="feature-chips-row">
          <span className="feature-chip">⚡ Real-Time</span>
          <span className="feature-chip">🛡️ Offline-First</span>
          <span className="feature-chip">💬 Instant Sync</span>
        </div>
        <div className="username-form">
          <div className="username-input-wrapper">
            <input
              className="username-input"
              placeholder="Enter your username..."
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              maxLength={24}
              autoFocus
            />
          </div>
          <button
            className={`username-btn ${name.trim().length >= 2 ? 'ready' : ''}`}
            onClick={handleSubmit}
            disabled={name.trim().length < 2}
          >
            Launch Experience →
          </button>
        </div>
        <p className="username-hint">2–24 characters · Saved to local browser storage</p>
      </div>
    </div>
  );
}
