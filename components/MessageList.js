'use client';
import { useEffect, useRef, useState, useCallback } from 'react';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

function StatusIcon({ status }) {
  const icons = { pending: '⏳', sent: '✓', delivered: '✓✓', read: '✓✓' };
  const colors = { pending: '#888', sent: '#aaa', delivered: '#aaa', read: '#60a5fa' };
  return <span style={{ color: colors[status] || '#888', fontSize: '10px' }}>{icons[status] || ''}</span>;
}

function ImageMessage({ content, fileName }) {
  return (
    <div className="media-msg">
      <img src={content} alt={fileName || 'image'} className="chat-image" onClick={() => window.open(content, '_blank')} />
      {fileName && <span className="file-name">{fileName}</span>}
    </div>
  );
}

function AudioMessage({ content }) {
  return (
    <div className="audio-msg">
      <span className="audio-icon">🎤</span>
      <audio controls src={content} className="audio-player" />
    </div>
  );
}

function FileMessage({ content, fileName, fileSize }) {
  const size = fileSize ? `${(fileSize / 1024).toFixed(1)} KB` : '';
  return (
    <a href={content} download={fileName} className="file-msg" target="_blank" rel="noreferrer">
      <span className="file-icon">📎</span>
      <div className="file-info">
        <span className="file-name">{fileName || 'File'}</span>
        {size && <span className="file-size">{size}</span>}
      </div>
      <span className="download-icon">⬇</span>
    </a>
  );
}

// Renders text with @mentions highlighted
function MentionText({ content, currentUsername }) {
  const parts = content.split(/(@\w+)/g);
  return (
    <p className="bubble-text">
      {parts.map((part, i) => {
        if (part.startsWith('@')) {
          const mentioned = part.slice(1);
          const isMe = mentioned === currentUsername;
          return (
            <span key={i} className={`mention-tag ${isMe ? 'mention-me' : ''}`}>
              {part}
            </span>
          );
        }
        return part;
      })}
    </p>
  );
}

function ReactionBar({ reactions = {}, username, onToggle }) {
  const entries = Object.entries(reactions).filter(([, users]) => users.length > 0);
  if (entries.length === 0) return null;
  return (
    <div className="reaction-bar">
      {entries.map(([emoji, users]) => (
        <button
          key={emoji}
          className={`reaction-pill ${users.includes(username) ? 'reacted' : ''}`}
          onClick={() => onToggle(emoji)}
          title={users.join(', ')}
        >
          {emoji} <span>{users.length}</span>
        </button>
      ))}
    </div>
  );
}

function ReactionPicker({ onPick, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  return (
    <div ref={ref} className="reaction-picker">
      {REACTION_EMOJIS.map(e => (
        <button key={e} className="reaction-pick-btn" onClick={() => { onPick(e); onClose(); }}>{e}</button>
      ))}
    </div>
  );
}

function ContextMenu({ x, y, isSelf, isPinned, onDelete, onEdit, onReact, onPin, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    setTimeout(() => document.addEventListener('mousedown', h), 0);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  // Clamp to viewport
  const style = { position: 'fixed', zIndex: 300, top: y, left: x };

  return (
    <div ref={ref} className="context-menu" style={style}>
      <button className="ctx-btn" onClick={onReact}>😊 Add reaction</button>
      <button className="ctx-btn" onClick={onPin}>{isPinned ? '📌 Unpin' : '📌 Pin message'}</button>
      {isSelf && <button className="ctx-btn" onClick={onEdit}>✏️ Edit message</button>}
      {isSelf && <button className="ctx-btn danger" onClick={onDelete}>🗑 Delete</button>}
    </div>
  );
}

function EditBubble({ initialContent, onSave, onCancel }) {
  const [value, setValue] = useState(initialContent);
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSave(value.trim()); }
    if (e.key === 'Escape') onCancel();
  };

  return (
    <div className="edit-bubble">
      <textarea
        ref={ref}
        className="edit-input"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKey}
        rows={2}
      />
      <div className="edit-actions">
        <button className="edit-save-btn" onClick={() => onSave(value.trim())}>Save</button>
        <button className="edit-cancel-btn" onClick={onCancel}>Cancel</button>
        <span className="edit-hint">Enter to save · Esc to cancel</span>
      </div>
    </div>
  );
}

export default function MessageList({ messages, username, pinnedMessages = [], onDeleteMessage, onEditMessage, onToggleReaction, onPinMessage, searchQuery }) {
  const bottomRef = useRef(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [reactionPickerFor, setReactionPickerFor] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [showPinned, setShowPinned] = useState(false);

  useEffect(() => {
    if (!searchQuery) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, searchQuery]);

  const formatTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const formatDate = (ts) => {
    const d = new Date(ts), today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    const y = new Date(today); y.setDate(today.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return 'Yesterday';
    return d.toLocaleDateString();
  };

  const handleContextMenu = (e, msg) => {
    e.preventDefault();
    setReactionPickerFor(null);
    // Clamp to viewport
    const x = Math.min(e.clientX, window.innerWidth - 200);
    const y = Math.min(e.clientY, window.innerHeight - 180);
    setContextMenu({ x, y, msg });
  };

  const closeAll = useCallback(() => { setContextMenu(null); setReactionPickerFor(null); }, []);

  let lastDate = '';

  return (
    <div className="message-list" onClick={closeAll}>

      {/* Pinned messages banner */}
      {pinnedMessages.length > 0 && (
        <div className="pinned-banner" onClick={(e) => { e.stopPropagation(); setShowPinned(s => !s); }}>
          <span className="pin-icon">📌</span>
          <span className="pin-preview">
            {showPinned ? 'Hide pinned messages' : pinnedMessages[pinnedMessages.length - 1]?.content?.slice(0, 60) + (pinnedMessages[pinnedMessages.length - 1]?.content?.length > 60 ? '…' : '')}
          </span>
          <span className="pin-count">{pinnedMessages.length}</span>
          <span className="pin-chevron">{showPinned ? '▲' : '▼'}</span>
        </div>
      )}

      {/* Pinned messages list expanded */}
      {showPinned && pinnedMessages.length > 0 && (
        <div className="pinned-list">
          {pinnedMessages.map(p => (
            <div key={p.id} className="pinned-item">
              <span className="pinned-sender">{p.sender}</span>
              <span className="pinned-content">{p.content}</span>
              <button className="unpin-btn" onClick={(e) => { e.stopPropagation(); onPinMessage(p.id); }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Search results header */}
      {searchQuery && (
        <div className="search-header">
          🔍 {messages.length} result{messages.length !== 1 ? 's' : ''} for &ldquo;{searchQuery}&rdquo;
        </div>
      )}

      {/* Messages */}
      {messages.map((msg) => {
        const isSelf = msg.sender === username;
        const msgDate = formatDate(msg.timestamp);
        const showDate = !searchQuery && msgDate !== lastDate;
        if (showDate) lastDate = msgDate;
        const isPinned = pinnedMessages.some(p => p.id === msg.id);

        return (
          <div key={msg.id}>
            {showDate && (
              <div className="date-divider"><span>{msgDate}</span></div>
            )}
            <div
              className={`msg-wrapper ${isSelf ? 'self' : 'other'} ${isPinned ? 'is-pinned' : ''}`}
              onContextMenu={(e) => !msg.deleted && handleContextMenu(e, msg)}
            >
              {!isSelf && <div className="avatar">{msg.sender[0]?.toUpperCase()}</div>}
              <div className="bubble-col">
                <div className={`bubble ${isSelf ? 'bubble-self' : 'bubble-other'} ${msg.status === 'pending' ? 'pending' : ''}`}>
                  {!isSelf && !msg.deleted && <span className="bubble-sender">{msg.sender}</span>}

                  {/* Message content */}
                  {editingId === msg.id ? (
                    <EditBubble
                      initialContent={msg.content}
                      onSave={(val) => { if (val) onEditMessage(msg.id, val); setEditingId(null); }}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : msg.deleted ? (
                    <p className="bubble-text deleted-msg">🚫 Message deleted</p>
                  ) : msg.type === 'text' ? (
                    <MentionText content={msg.content} currentUsername={username} />
                  ) : (msg.type === 'image' || msg.type === 'screenshot') ? (
                    <ImageMessage content={msg.content} fileName={msg.fileName} />
                  ) : msg.type === 'audio' ? (
                    <AudioMessage content={msg.content} />
                  ) : msg.type === 'file' ? (
                    <FileMessage content={msg.content} fileName={msg.fileName} fileSize={msg.fileSize} />
                  ) : null}

                  {!msg.deleted && editingId !== msg.id && (
                    <div className="bubble-meta">
                      {msg.edited && <span className="edited-label">edited</span>}
                      {isPinned && <span className="pinned-label">📌</span>}
                      <span className="bubble-time">{formatTime(msg.timestamp)}</span>
                      {isSelf && <StatusIcon status={msg.status} />}
                    </div>
                  )}
                </div>

                {/* Reactions */}
                {!msg.deleted && (
                  <ReactionBar
                    reactions={msg.reactions}
                    username={username}
                    onToggle={(emoji) => onToggleReaction(msg.id, emoji)}
                  />
                )}

                {/* Inline reaction picker */}
                {reactionPickerFor === msg.id && (
                  <ReactionPicker
                    onPick={(emoji) => { onToggleReaction(msg.id, emoji); setReactionPickerFor(null); }}
                    onClose={() => setReactionPickerFor(null)}
                  />
                )}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isSelf={contextMenu.msg.sender === username}
          isPinned={pinnedMessages.some(p => p.id === contextMenu.msg.id)}
          onDelete={() => { onDeleteMessage(contextMenu.msg.id); closeAll(); }}
          onEdit={() => { setEditingId(contextMenu.msg.id); closeAll(); }}
          onReact={() => { setReactionPickerFor(contextMenu.msg.id); closeAll(); }}
          onPin={() => { onPinMessage(contextMenu.msg.id); closeAll(); }}
          onClose={closeAll}
        />
      )}
    </div>
  );
}
