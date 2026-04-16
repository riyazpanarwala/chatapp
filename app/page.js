'use client';
import { useChat } from '../lib/useChat';
import Sidebar from '../components/Sidebar';
import MessageList from '../components/MessageList';
import InputBar from '../components/InputBar';
import UsernameScreen from '../components/UsernameScreen';
import { useState } from 'react';

export default function Home() {
  const {
    username, initUsername, rooms, currentRoom,
    messages, roomUsers, typingUsers,
    isOnline, isConnected, error, setError,
    joinRoom, createRoom, sendMessage, handleTyping, leaveRoom,
  } = useChat();

  const [sidebarOpen, setSidebarOpen] = useState(true);

  if (!username) {
    return <UsernameScreen onSetUsername={initUsername} />;
  }

  return (
    <div className="app-layout">
      <div className={`status-bar ${isOnline ? 'online' : 'offline'}`}>
        <span>{isOnline ? (isConnected ? '🟢 Connected' : '🟡 Connecting...') : '🔴 Offline — messages will sync when back online'}</span>
        {error && (
          <span className="error-msg">⚠️ {error} <button onClick={() => setError('')}>✕</button></span>
        )}
      </div>

      <div className="chat-container">
        <button className="sidebar-toggle" onClick={() => setSidebarOpen(s => !s)}>
          {sidebarOpen ? '◀' : '▶'}
        </button>

        {sidebarOpen && (
          <Sidebar
            rooms={rooms}
            currentRoom={currentRoom}
            roomUsers={roomUsers}
            username={username}
            isOnline={isOnline}
            onJoinRoom={joinRoom}
            onCreateRoom={createRoom}
            onLeaveRoom={leaveRoom}
          />
        )}

        <main className="chat-main">
          {!currentRoom ? (
            <div className="empty-state">
              <div className="empty-icon">💬</div>
              <h2>Welcome, {username}!</h2>
              <p>Select a room from the sidebar or create a new one to start chatting.</p>
              {rooms.length === 0 && <p className="empty-hint">No rooms yet — create the first one!</p>}
            </div>
          ) : (
            <>
              <div className="chat-header">
                <div className="chat-header-info">
                  <span className="chat-room-name">💬 {currentRoom.name}</span>
                  <span className="chat-room-meta">
                    {roomUsers.filter(u => u.online).length} online · {roomUsers.length} members
                  </span>
                </div>
                {typingUsers.length > 0 && (
                  <div className="typing-bar">
                    <span className="typing-dots"><span /><span /><span /></span>
                    <span>{typingUsers.slice(0, 2).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing…</span>
                  </div>
                )}
              </div>

              <MessageList messages={messages} username={username} currentRoom={currentRoom} />
              <InputBar currentRoom={currentRoom} username={username} onSendMessage={sendMessage} onTyping={handleTyping} disabled={false} />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
