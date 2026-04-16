'use client';
import { useEffect, useRef } from 'react';

function StatusIcon({ status }) {
  const icons = { pending: '⏳', sent: '✓', delivered: '✓✓', read: '✓✓' };
  const colors = { pending: '#888', sent: '#aaa', delivered: '#aaa', read: '#60a5fa' };
  return (
    <span style={{ color: colors[status] || '#888', fontSize: '10px' }}>
      {icons[status] || ''}
    </span>
  );
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

export default function MessageList({ messages, username, onRead }) {
  const bottomRef = useRef(null);
  const observerRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const formatTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (ts) => {
    const d = new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString();
  };

  let lastDate = '';

  return (
    <div className="message-list">
      {messages.map((msg, i) => {
        const isSelf = msg.sender === username;
        const msgDate = formatDate(msg.timestamp);
        const showDate = msgDate !== lastDate;
        if (showDate) lastDate = msgDate;

        return (
          <div key={msg.id}>
            {showDate && (
              <div className="date-divider">
                <span>{msgDate}</span>
              </div>
            )}
            <div className={`msg-wrapper ${isSelf ? 'self' : 'other'}`}>
              {!isSelf && <div className="avatar">{msg.sender[0]?.toUpperCase()}</div>}
              <div className={`bubble ${isSelf ? 'bubble-self' : 'bubble-other'} ${msg.status === 'pending' ? 'pending' : ''}`}>
                {!isSelf && <span className="bubble-sender">{msg.sender}</span>}
                {msg.type === 'text' && <p className="bubble-text">{msg.content}</p>}
                {(msg.type === 'image' || msg.type === 'screenshot') && (
                  <ImageMessage content={msg.content} fileName={msg.fileName} />
                )}
                {msg.type === 'audio' && <AudioMessage content={msg.content} />}
                {msg.type === 'file' && (
                  <FileMessage content={msg.content} fileName={msg.fileName} fileSize={msg.fileSize} />
                )}
                <div className="bubble-meta">
                  <span className="bubble-time">{formatTime(msg.timestamp)}</span>
                  {isSelf && <StatusIcon status={msg.status} />}
                </div>
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
