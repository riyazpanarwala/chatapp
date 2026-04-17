'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

function StatusIcon({ status }) {
  const icons = { pending: '⏳', sent: '✓', delivered: '✓✓', read: '✓✓' };
  const colors = { pending: '#888', sent: '#aaa', delivered: '#aaa', read: '#60a5fa' };
  return <span style={{ color: colors[status] || '#888', fontSize: '10px' }}>{icons[status] || ''}</span>;
}

function ImageMessage({ content, fileName }) {
  return (
    <div className="media-msg">
      <img src={content} alt={fileName || 'image'} className="chat-image"
        onClick={() => window.open(content, '_blank')} />
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

function MentionText({ content, currentUsername }) {
  const parts = content.split(/(@\w+)/g);
  return (
    <p className="bubble-text">
      {parts.map((part, i) => {
        if (part.startsWith('@')) {
          const isMe = part.slice(1) === currentUsername;
          return <span key={i} className={`mention-tag ${isMe ? 'mention-me' : ''}`}>{part}</span>;
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
          onClick={(e) => { e.stopPropagation(); onToggle(emoji); }}
          title={users.join(', ')}
        >
          {emoji} <span>{users.length}</span>
        </button>
      ))}
    </div>
  );
}

// Rendered into document.body via portal — never clipped by overflow:auto
function ContextMenu({ x, y, isSelf, isPinned, onDelete, onEdit, onReact, onPin, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ x, y });

  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos({
      x: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)),
    });
  }, [x, y]);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const t = setTimeout(() => {
      document.addEventListener('mousedown', handler);
      document.addEventListener('touchstart', handler);
    }, 80);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [onClose]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={ref}
      className="context-menu"
      style={{ position: 'fixed', zIndex: 9999, top: pos.y, left: pos.x }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button className="ctx-btn" onMouseDown={() => { onReact(); onClose(); }}>😊 Add reaction</button>
      <button className="ctx-btn" onMouseDown={() => { onPin(); onClose(); }}>
        {isPinned ? '📌 Unpin message' : '📌 Pin message'}
      </button>
      {isSelf && <button className="ctx-btn" onMouseDown={() => { onEdit(); onClose(); }}>✏️ Edit message</button>}
      {isSelf && <button className="ctx-btn danger" onMouseDown={() => { onDelete(); onClose(); }}>🗑 Delete message</button>}
    </div>,
    document.body
  );
}

// Quick emoji picker shown above a message row
function QuickReactionPicker({ anchorRect, isSelf, onPick, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const t = setTimeout(() => {
      document.addEventListener('mousedown', handler);
      document.addEventListener('touchstart', handler);
    }, 80);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [onClose]);

  if (!anchorRect || typeof document === 'undefined') return null;

  const pickerWidth = 252; // 6 emojis × 36px + padding
  const top = Math.max(8, anchorRect.top - 52);
  const left = isSelf
    ? Math.max(8, anchorRect.right - pickerWidth)
    : Math.min(anchorRect.left, window.innerWidth - pickerWidth - 8);

  return createPortal(
    <div
      ref={ref}
      className="quick-reaction-picker"
      style={{ position: 'fixed', zIndex: 9999, top, left }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {REACTION_EMOJIS.map(e => (
        <button key={e} className="quick-reaction-btn" onMouseDown={() => { onPick(e); onClose(); }}>
          {e}
        </button>
      ))}
    </div>,
    document.body
  );
}

function EditBubble({ initialContent, onSave, onCancel }) {
  const [value, setValue] = useState(initialContent);
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.focus();
    const len = ref.current.value.length;
    ref.current.setSelectionRange(len, len);
  }, []);

  const save = () => { if (value.trim()) onSave(value.trim()); };

  return (
    <div className="edit-bubble" onMouseDown={(e) => e.stopPropagation()}>
      <textarea
        ref={ref}
        className="edit-input"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
          if (e.key === 'Escape') onCancel();
        }}
        rows={2}
      />
      <div className="edit-actions">
        <button className="edit-save-btn" onMouseDown={(e) => { e.stopPropagation(); save(); }}>Save</button>
        <button className="edit-cancel-btn" onMouseDown={(e) => { e.stopPropagation(); onCancel(); }}>Cancel</button>
        <span className="edit-hint">Enter · Esc to cancel</span>
      </div>
    </div>
  );
}

export default function MessageList({
  messages, username, pinnedMessages = [],
  onDeleteMessage, onEditMessage, onToggleReaction, onPinMessage,
  searchQuery,
}) {
  const bottomRef = useRef(null);
  const [contextMenu, setContextMenu] = useState(null); // { x, y, msg }
  const [reactionPicker, setReactionPicker] = useState(null); // { anchorRect, msg }
  const [editingId, setEditingId] = useState(null);
  const [showPinned, setShowPinned] = useState(false);

  useEffect(() => {
    if (!searchQuery) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, [messages.length, searchQuery]);

  const closeAll = useCallback(() => {
    setContextMenu(null);
    setReactionPicker(null);
  }, []);

  const openContextMenu = useCallback((e, msg) => {
    e.preventDefault();
    e.stopPropagation();
    setReactionPicker(null);
    setContextMenu({ x: e.clientX, y: e.clientY, msg });
  }, []);

  const openReactionPicker = useCallback((e, msg) => {
    e.stopPropagation();
    setContextMenu(null);
    const row = e.currentTarget.closest?.('.msg-wrapper') ?? e.currentTarget;
    setReactionPicker({ anchorRect: row.getBoundingClientRect(), msg });
  }, []);

  const formatTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const formatDate = (ts) => {
    const d = new Date(ts), today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    const y = new Date(today); y.setDate(today.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return 'Yesterday';
    return d.toLocaleDateString();
  };

  let lastDate = '';

  return (
    <div className="message-list">

      {/* ── Pinned banner ─────────────────────────────────────────────── */}
      {pinnedMessages.length > 0 && (
        <div className="pinned-banner" onClick={() => setShowPinned(s => !s)}>
          <span className="pin-icon">📌</span>
          <span className="pin-preview">
            {showPinned
              ? 'Hide pinned messages'
              : (pinnedMessages[pinnedMessages.length - 1]?.content?.slice(0, 60) ?? '') +
                (pinnedMessages[pinnedMessages.length - 1]?.content?.length > 60 ? '…' : '')}
          </span>
          <span className="pin-count">{pinnedMessages.length}</span>
          <span className="pin-chevron">{showPinned ? '▲' : '▼'}</span>
        </div>
      )}

      {showPinned && pinnedMessages.length > 0 && (
        <div className="pinned-list">
          {pinnedMessages.map(p => (
            <div key={p.id} className="pinned-item">
              <span className="pinned-sender">{p.sender}</span>
              <span className="pinned-content">{p.content}</span>
              <button className="unpin-btn" onMouseDown={(e) => { e.stopPropagation(); onPinMessage(p.id); }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* ── Search header ─────────────────────────────────────────────── */}
      {searchQuery && (
        <div className="search-header">
          🔍 {messages.length} result{messages.length !== 1 ? 's' : ''} for &ldquo;{searchQuery}&rdquo;
        </div>
      )}

      {/* ── Messages ──────────────────────────────────────────────────── */}
      {messages.map((msg) => {
        const isSelf = msg.sender === username;
        const msgDate = formatDate(msg.timestamp);
        const showDate = !searchQuery && msgDate !== lastDate;
        if (showDate) lastDate = msgDate;
        const isPinned = pinnedMessages.some(p => p.id === msg.id);
        const isEditing = editingId === msg.id;

        return (
          <div key={msg.id}>
            {showDate && <div className="date-divider"><span>{msgDate}</span></div>}

            <div
              className={`msg-wrapper ${isSelf ? 'self' : 'other'} ${isPinned ? 'is-pinned' : ''}`}
              onContextMenu={(e) => !msg.deleted && openContextMenu(e, msg)}
            >
              {/* Avatar for others */}
              {!isSelf && <div className="avatar">{msg.sender?.[0]?.toUpperCase()}</div>}

              {/* Bubble + reactions */}
              <div className="bubble-col">
                <div className={`bubble ${isSelf ? 'bubble-self' : 'bubble-other'} ${msg.status === 'pending' ? 'pending' : ''}`}>
                  {!isSelf && !msg.deleted && <span className="bubble-sender">{msg.sender}</span>}

                  {isEditing ? (
                    <EditBubble
                      initialContent={msg.content}
                      onSave={(val) => { onEditMessage(msg.id, val); setEditingId(null); }}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : msg.deleted ? (
                    <p className="bubble-text deleted-msg">🚫 This message was deleted</p>
                  ) : msg.type === 'text' ? (
                    <MentionText content={msg.content} currentUsername={username} />
                  ) : (msg.type === 'image' || msg.type === 'screenshot') ? (
                    <ImageMessage content={msg.content} fileName={msg.fileName} />
                  ) : msg.type === 'audio' ? (
                    <AudioMessage content={msg.content} />
                  ) : msg.type === 'file' ? (
                    <FileMessage content={msg.content} fileName={msg.fileName} fileSize={msg.fileSize} />
                  ) : null}

                  {!msg.deleted && !isEditing && (
                    <div className="bubble-meta">
                      {msg.edited && <span className="edited-label">edited</span>}
                      {isPinned && <span className="pinned-label">📌</span>}
                      <span className="bubble-time">{formatTime(msg.timestamp)}</span>
                      {isSelf && <StatusIcon status={msg.status} />}
                    </div>
                  )}
                </div>

                {/* Reaction pills */}
                {!msg.deleted && (
                  <ReactionBar
                    reactions={msg.reactions}
                    username={username}
                    onToggle={(emoji) => onToggleReaction(msg.id, emoji)}
                  />
                )}
              </div>

              {/* Hover action bar — shown via CSS :hover on .msg-wrapper */}
              {!msg.deleted && !isEditing && (
                <div className={`msg-actions ${isSelf ? 'actions-self' : 'actions-other'}`}>
                  <button
                    className="msg-action-btn"
                    title="Add reaction"
                    onMouseDown={(e) => openReactionPicker(e, msg)}
                  >😊</button>
                  <button
                    className="msg-action-btn"
                    title="More options"
                    onMouseDown={(e) => openContextMenu(e, msg)}
                  >···</button>
                </div>
              )}
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />

      {/* Portal menus */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isSelf={contextMenu.msg.sender === username}
          isPinned={pinnedMessages.some(p => p.id === contextMenu.msg.id)}
          onDelete={() => onDeleteMessage(contextMenu.msg.id)}
          onEdit={() => setEditingId(contextMenu.msg.id)}
          onReact={() => {
            const msg = contextMenu.msg;
            const rect = contextMenu;
            setContextMenu(null);
            setReactionPicker({
              anchorRect: { top: rect.y, left: rect.x, right: rect.x + 200 },
              msg,
            });
          }}
          onPin={() => onPinMessage(contextMenu.msg.id)}
          onClose={closeAll}
        />
      )}

      {reactionPicker && (
        <QuickReactionPicker
          anchorRect={reactionPicker.anchorRect}
          isSelf={reactionPicker.msg.sender === username}
          onPick={(emoji) => onToggleReaction(reactionPicker.msg.id, emoji)}
          onClose={() => setReactionPicker(null)}
        />
      )}
    </div>
  );
}
