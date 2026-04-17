'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { v4 as uuidv4 } from 'uuid';

const EmojiPicker = dynamic(() => import('emoji-picker-react'), { ssr: false });

export default function InputBar({ currentRoom, username, roomUsers, onSendMessage, onTyping, disabled }) {
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [mentionQuery, setMentionQuery] = useState(null); // { query, start }
  const [mentionResults, setMentionResults] = useState([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const inputRef = useRef(null);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const fileInputRef = useRef(null);

  // Detect @mention typing
  const detectMention = useCallback((value, cursorPos) => {
    const beforeCursor = value.slice(0, cursorPos);
    const match = beforeCursor.match(/@(\w*)$/);
    if (match) {
      const query = match[1].toLowerCase();
      const start = beforeCursor.length - match[0].length;
      const results = (roomUsers || [])
        .map(u => u.username)
        .filter(u => u !== username && u.toLowerCase().startsWith(query))
        .slice(0, 5);
      setMentionQuery({ query, start, full: match[0] });
      setMentionResults(results);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
      setMentionResults([]);
    }
  }, [roomUsers, username]);

  const insertMention = useCallback((selectedUser) => {
    if (!mentionQuery) return;
    const before = text.slice(0, mentionQuery.start);
    const after = text.slice(mentionQuery.start + mentionQuery.full.length);
    const newText = `${before}@${selectedUser} ${after}`;
    setText(newText);
    setMentionQuery(null);
    setMentionResults([]);
    setTimeout(() => {
      const pos = before.length + selectedUser.length + 2;
      inputRef.current?.setSelectionRange(pos, pos);
      inputRef.current?.focus();
    }, 0);
  }, [text, mentionQuery]);

  const send = useCallback(() => {
    if (!text.trim() || disabled) return;
    onSendMessage(text.trim(), 'text');
    setText('');
    setShowEmoji(false);
    setMentionQuery(null);
    setMentionResults([]);
  }, [text, disabled, onSendMessage]);

  const handleKey = (e) => {
    // Handle mention picker navigation
    if (mentionResults.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => (i + 1) % mentionResults.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => (i - 1 + mentionResults.length) % mentionResults.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionResults[mentionIndex]); return; }
      if (e.key === 'Escape') { setMentionQuery(null); setMentionResults([]); return; }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    } else {
      onTyping?.();
    }
  };

  const handleChange = (e) => {
    const val = e.target.value;
    setText(val);
    detectMention(val, e.target.selectionStart);
  };

  const onEmojiClick = (emojiData) => {
    setText(prev => prev + emojiData.emoji);
    inputRef.current?.focus();
  };

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.files?.[0]) {
          const f = data.files[0];
          const type = file.type.startsWith('image/') ? 'image' : 'file';
          onSendMessage(f.url, type, { fileName: f.name, fileSize: f.size });
        }
      } catch (err) {
        const reader = new FileReader();
        reader.onload = () => {
          const type = file.type.startsWith('image/') ? 'image' : 'file';
          onSendMessage(reader.result, type, { fileName: file.name, fileSize: file.size });
        };
        reader.readAsDataURL(file);
      }
    }
    e.target.value = '';
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = e => chunksRef.current.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => onSendMessage(reader.result, 'audio');
        reader.readAsDataURL(blob);
      };
      recorder.start();
      mediaRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch (err) {
      alert('Microphone access denied');
    }
  };

  const stopRecording = () => {
    mediaRef.current?.stop();
    clearInterval(timerRef.current);
    setIsRecording(false);
    setRecordingTime(0);
  };

  const takeScreenshot = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      stream.getTracks().forEach(t => t.stop());
      onSendMessage(canvas.toDataURL('image/png'), 'screenshot');
    } catch (err) {
      console.error('Screenshot error:', err);
    }
  };

  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  if (!currentRoom) return null;

  return (
    <div className="input-bar-wrapper">
      {showEmoji && (
        <div className="emoji-popup">
          <EmojiPicker onEmojiClick={onEmojiClick} width="100%" height={350} theme="dark" />
        </div>
      )}

      {/* @mention autocomplete */}
      {mentionResults.length > 0 && (
        <div className="mention-popup">
          <div className="mention-header">Mention someone</div>
          {mentionResults.map((u, i) => (
            <div
              key={u}
              className={`mention-item ${i === mentionIndex ? 'active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); insertMention(u); }}
            >
              <span className="mention-avatar">{u[0].toUpperCase()}</span>
              <span className="mention-name">{u}</span>
            </div>
          ))}
        </div>
      )}

      <div className="input-bar">
        <button className="icon-btn" onClick={() => setShowEmoji(s => !s)} title="Emoji">😊</button>

        <div className="input-wrap">
          {isRecording ? (
            <div className="recording-indicator">
              <span className="rec-dot" />
              <span>Recording {fmt(recordingTime)}</span>
            </div>
          ) : (
            <textarea
              ref={inputRef}
              className="chat-input"
              placeholder={`Message ${currentRoom.name}… (@ to mention)`}
              value={text}
              onChange={handleChange}
              onKeyDown={handleKey}
              rows={1}
              disabled={disabled}
            />
          )}
        </div>

        <input ref={fileInputRef} type="file" multiple accept="*/*" onChange={handleFileChange} style={{ display: 'none' }} />
        <button className="icon-btn" onClick={() => fileInputRef.current?.click()} title="Attach file">📎</button>
        <button className="icon-btn" onClick={isRecording ? stopRecording : startRecording} title="Voice message">
          {isRecording ? '⏹' : '🎤'}
        </button>
        <button className="icon-btn" onClick={takeScreenshot} title="Share screenshot">🖥️</button>

        <button
          className={`send-btn ${text.trim() ? 'active' : ''}`}
          onClick={send}
          disabled={!text.trim() || disabled}
        >
          ➤
        </button>
      </div>
    </div>
  );
}
