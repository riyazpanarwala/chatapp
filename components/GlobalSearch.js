'use client';
import { useEffect, useState } from 'react';

export default function GlobalSearch({ results, loading, onSearch, onOpen, onClose }) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => onSearch(query), 250);
    return () => clearTimeout(timer);
  }, [query, onSearch]);

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal global-search-modal" role="dialog" aria-modal="true" onMouseDown={event => event.stopPropagation()}>
        <div className="modal-title-row"><h3>Search all messages</h3><button className="icon-btn" onClick={onClose}>×</button></div>
        <input className="sidebar-input" placeholder="Search every room and DM…" value={query} onChange={event => setQuery(event.target.value)} autoFocus />
        <div className="global-results">
          {loading && <p className="empty-hint">Searching…</p>}
          {!loading && query.length >= 2 && results.length === 0 && <p className="empty-hint">No messages found.</p>}
          {results.map(result => (
            <button key={`${result.roomId}-${result.id}`} className="global-result" onClick={() => { onOpen(result.roomId, result.id); onClose(); }}>
              <span className="global-result-room">{result.isDM ? 'DM' : '#'} {result.roomName}</span>
              <strong>{result.sender}</strong>
              <span>{result.content}</span>
              <time>{new Date(result.timestamp).toLocaleString()}</time>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
