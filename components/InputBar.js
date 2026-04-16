'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { v4 as uuidv4 } from 'uuid';
import * as socketClient from '../lib/socket';

const EmojiPicker = dynamic(() => import('emoji-picker-react'), { ssr: false });

export default function InputBar({ currentRoom, username, onSendMessage, onTyping, disabled }) {
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const inputRef = useRef(null);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const fileInputRef = useRef(null);

  const send = useCallback(() => {
    if (!text.trim() || disabled) return;
    onSendMessage(text.trim(), 'text');
    setText('');
    setShowEmoji(false);
  }, [text, disabled, onSendMessage]);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    } else {
      onTyping?.();
    }
  };

  const onEmojiClick = (emojiData) => {
    setText(prev => prev + emojiData.emoji);
    inputRef.current?.focus();
  };

  // File upload
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
        console.error('Upload error:', err);
        // Fallback: read as data URL
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

  // Voice recording
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

  // Screenshot
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
      const dataUrl = canvas.toDataURL('image/png');
      onSendMessage(dataUrl, 'screenshot');
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
              placeholder={`Message ${currentRoom.name}...`}
              value={text}
              onChange={e => setText(e.target.value)}
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
