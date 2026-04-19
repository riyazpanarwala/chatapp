'use client';
import { useEffect, useState } from 'react';

const WEBRTC_BASE = 'https://webrtc-video-app-one.vercel.app';

export function buildVideoCallUrl(roomId, userName) {
  return `${WEBRTC_BASE}/join/${encodeURIComponent(roomId)}?name=${encodeURIComponent(userName)}`;
}

export default function VideoCallNotification({ message, username, isSelf }) {
  const [countdown, setCountdown] = useState(null);

  const { callRoomId, callerName, callUrl } = message;

  // Parse expiry from message timestamp — calls expire after 5 min
  useEffect(() => {
    const expires = message.timestamp + 5 * 60 * 1000;
    const tick = () => {
      const left = Math.max(0, Math.ceil((expires - Date.now()) / 1000));
      setCountdown(left);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [message.timestamp]);

  const expired = countdown === 0;
  const joinUrl = buildVideoCallUrl(callRoomId, username);

  const fmt = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  return (
    <div className={`video-call-card ${expired ? 'expired' : ''}`}>
      <div className="vc-icon-wrap">
        <span className="vc-icon">{expired ? '📵' : '📹'}</span>
        {!expired && <span className="vc-pulse" />}
      </div>
      <div className="vc-info">
        <p className="vc-title">
          {isSelf
            ? 'You started a video call'
            : <><strong>{callerName}</strong> started a video call</>}
        </p>
        {expired ? (
          <p className="vc-sub expired-label">Call ended</p>
        ) : (
          <p className="vc-sub">
            <span className="vc-timer">{fmt(countdown)}</span> remaining
          </p>
        )}
      </div>
      {!expired && !isSelf && (
        <a
          href={joinUrl}
          target="_blank"
          rel="noreferrer"
          className="vc-join-btn"
        >
          Join ↗
        </a>
      )}
      {!expired && isSelf && (
        <a
          href={callUrl}
          target="_blank"
          rel="noreferrer"
          className="vc-rejoin-btn"
        >
          Rejoin ↗
        </a>
      )}
    </div>
  );
}
