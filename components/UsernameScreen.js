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
      <div className="username-card">
        <div className="logo-mark">⚡</div>
        <h1 className="logo-text">FluxChat</h1>
        <p className="logo-sub">Real-time · Offline-first · Encrypted</p>
        <div className="username-form">
          <input
            className="username-input"
            placeholder="Choose your username..."
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            maxLength={24}
            autoFocus
          />
          <button
            className={`username-btn ${name.trim().length >= 2 ? 'ready' : ''}`}
            onClick={handleSubmit}
            disabled={name.trim().length < 2}
          >
            Enter Chat
          </button>
        </div>
        <p className="username-hint">2–24 characters · Stored locally</p>
      </div>
    </div>
  );
}
