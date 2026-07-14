'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { SmileIcon, PaperclipIcon, MicIcon, StopIcon, MonitorIcon, VideoIcon, SendIcon, ClockIcon } from '../lib/icons';

const WEBRTC_BASE = 'https://webrtc-video-app-one.vercel.app';

function buildVideoCallUrl(roomId, userName) {
  return `${WEBRTC_BASE}/join/${encodeURIComponent(roomId)}?name=${encodeURIComponent(userName)}`;
}

export default function InputBar({ currentRoom, username, roomUsers, onSendMessage, onTyping, disabled, replyingTo, onCancelReply }) {
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [EmojiPicker, setEmojiPicker] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [mentionQuery, setMentionQuery] = useState(null);
  const [mentionResults, setMentionResults] = useState([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [isStartingCall, setIsStartingCall] = useState(false);
  const inputRef = useRef(null);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const fileInputRef = useRef(null);
  const emojiImportRef = useRef(null);

  const toggleEmojiPicker = useCallback(async () => {
    if (showEmoji) {
      setShowEmoji(false);
      return;
    }
    setShowEmoji(true);
    if (!emojiImportRef.current) {
      emojiImportRef.current = import('emoji-picker-react');
    }
    const module = await emojiImportRef.current;
    setEmojiPicker(() => module.default);
  }, [showEmoji]);

  // Detect @mention typing
  const detectMention = useCallback((value, cursorPos) => {
    const beforeCursor = value.slice(0, cursorPos);
    const match = beforeCursor.match(/@(\w*)$/);
    if (match) {
      const query = match[1].toLowerCase();
      const start = beforeCursor.length - match[0].length;
      const specialMentions = currentRoom?.isDM ? [] : ['everyone', 'here'];
      const results = [...specialMentions, ...(roomUsers || [])
        .map(u => u.username)
        .filter(u => u !== username)]
        .filter(u => u.toLowerCase().startsWith(query))
        .slice(0, 5);
      setMentionQuery({ query, start, full: match[0] });
      setMentionResults(results);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
      setMentionResults([]);
    }
  }, [roomUsers, username, currentRoom?.isDM]);

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
    onSendMessage(text.trim(), 'text', replyingTo ? { replyTo: {
      id: replyingTo.id,
      sender: replyingTo.sender,
      content: replyingTo.type === 'text' ? replyingTo.content.slice(0, 240) : `[${replyingTo.type}]`,
    } } : {});
    setText('');
    setShowEmoji(false);
    setMentionQuery(null);
    setMentionResults([]);
    onCancelReply?.();
  }, [text, disabled, onSendMessage, replyingTo, onCancelReply]);

  // ── Video Call ─────────────────────────────────────────────────────────────
  const startVideoCall = useCallback(async () => {
    if (!username || !currentRoom || isStartingCall) return;
    setIsStartingCall(true);

    try {
      // Generate a unique call room ID
      const callRoomId = `${currentRoom.id}-${uuidv4().slice(0, 8)}`;
      const callUrl = buildVideoCallUrl(callRoomId, username);

      // Send a special video-call message into the chat
      onSendMessage(callUrl, 'video-call', {
        callRoomId,
        callerName: username,
        callUrl,
      });

      // Open the call for the initiator immediately
      window.open(callUrl, '_blank', 'noopener,noreferrer');
    } finally {
      setIsStartingCall(false);
    }
  }, [username, currentRoom, isStartingCall, onSendMessage]);
  // ──────────────────────────────────────────────────────────────────────────

  const handleKey = (e) => {
    if (mentionResults.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => (i + 1) % mentionResults.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => (i - 1 + mentionResults.length) % mentionResults.length); return; }
      if (e.key === 'Home') { e.preventDefault(); setMentionIndex(0); return; }
      if (e.key === 'End') { e.preventDefault(); setMentionIndex(mentionResults.length - 1); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionResults[mentionIndex]); return; }
      if (e.key === 'Escape') { setMentionQuery(null); setMentionResults([]); return; }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }

    if (e.key === 'Escape' && showEmoji) {
      e.preventDefault();
      setShowEmoji(false);
      return;
    }
  };

  const handleChange = (e) => {
    const val = e.target.value;
    setText(val);
    detectMention(val, e.target.selectionStart);
    if (val.trim()) onTyping?.();
  };

  const onEmojiClick = (emojiData) => {
    setText(prev => prev + emojiData.emoji);
    inputRef.current?.focus();
  };

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) {
        alert(`${file.name} exceeds the 10 MB upload limit.`);
        continue;
      }
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed');
        if (data.files?.[0]) {
          const f = data.files[0];
          const type = file.type.startsWith('image/') ? 'image' : 'file';
          onSendMessage(f.url, type, { fileName: f.name, fileSize: f.size });
        }
      } catch (err) {
        alert(err.message || `Could not upload ${file.name}`);
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
      {replyingTo && (
        <div className="reply-composer">
          <div><strong>Replying to {replyingTo.sender}</strong><span>{replyingTo.type === 'text' ? replyingTo.content : `[${replyingTo.type}]`}</span></div>
          <button type="button" onClick={onCancelReply} aria-label="Cancel reply">×</button>
        </div>
      )}
      {showEmoji && (
        <div className="emoji-popup" id="emoji-picker-popup" role="dialog" aria-label="Choose an emoji">
          {EmojiPicker ? (
            <EmojiPicker
              onEmojiClick={onEmojiClick}
              width="100%"
              height={350}
              theme="dark"
              lazyLoadEmojis
              previewConfig={{ showPreview: false }}
            />
          ) : (
            <div className="emoji-picker-loading" aria-busy="true">Loading emoji…</div>
          )}
        </div>
      )}

      {/* @mention autocomplete */}
      {mentionResults.length > 0 && (
        <div className="mention-popup" id="mention-listbox" role="listbox" aria-label="Mention someone">
          <div className="mention-header">Mention someone</div>
          {mentionResults.map((u, i) => (
            <div
              key={u}
              id={`mention-option-${i}`}
              role="option"
              aria-selected={i === mentionIndex}
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
        <button
          className="icon-btn"
          onClick={toggleEmojiPicker}
          title="Emoji"
          aria-label="Choose an emoji"
          aria-expanded={showEmoji}
          aria-controls="emoji-picker-popup"
          aria-haspopup="dialog"
        >
          <SmileIcon size={17} />
        </button>

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
              aria-autocomplete="list"
              aria-controls={mentionResults.length > 0 ? 'mention-listbox' : undefined}
              aria-expanded={mentionResults.length > 0}
              aria-activedescendant={mentionResults.length > 0 ? `mention-option-${mentionIndex}` : undefined}
              rows={1}
              disabled={disabled}
            />
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.txt,.csv,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        <button className="icon-btn" onClick={() => fileInputRef.current?.click()} title="Attach file">
          <PaperclipIcon size={17} />
        </button>
        <button className="icon-btn" onClick={isRecording ? stopRecording : startRecording} title="Voice message">
          {isRecording ? <StopIcon size={16} /> : <MicIcon size={17} />}
        </button>
        <button className="icon-btn" onClick={takeScreenshot} title="Share screenshot">
          <MonitorIcon size={17} />
        </button>

        {/* ── Video Call Button ── */}
        <button
          className={`icon-btn video-call-btn ${isStartingCall ? 'calling' : ''}`}
          onClick={startVideoCall}
          disabled={disabled || isStartingCall}
          title="Start video call"
        >
          {isStartingCall ? <ClockIcon size={17} /> : <VideoIcon size={17} />}
        </button>

        <button
          className={`send-btn ${text.trim() ? 'active' : ''}`}
          onClick={send}
          disabled={!text.trim() || disabled}
          title="Send"
        >
          <SendIcon size={16} />
        </button>
      </div>
    </div>
  );
}
