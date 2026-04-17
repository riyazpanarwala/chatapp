'use client';
import { useChat } from '../lib/useChat';
import Sidebar from '../components/Sidebar';
import MessageList from '../components/MessageList';
import InputBar from '../components/InputBar';
import UsernameScreen from '../components/UsernameScreen';
import { useState, useEffect } from 'react';

export default function Home() {
  const {
    username, initUsername,
    rooms, currentRoom,
    messages, roomUsers, typingUsers,
    isOnline, isConnected, error, setError,
    pinnedMessages,
    onlineUsers,
    notifications, dismissNotification,
    dmList,
    searchQuery, setSearchQuery,
    joinRoom, createRoom, sendMessage, handleTyping, leaveRoom,
    editMessage, deleteMessage, toggleReaction, pinMessage,
    openDM,
  } = useChat();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showSearch, setShowSearch] = useState(false);

  // Auto-dismiss notifications after 5s
  useEffect(() => {
    if (notifications.length === 0) return;
    const timer = setTimeout(() => {
      dismissNotification(notifications[0].id);
    }, 5000);
    return () => clearTimeout(timer);
  }, [notifications, dismissNotification]);

  if (!username) {
    return <UsernameScreen onSetUsername={initUsername} />;
  }

  return (
    <div className="app-layout">
      {/* Status bar */}
      <div className={`status-bar ${isOnline ? 'online' : 'offline'}`}>
        <span>
          {isOnline
            ? (isConnected ? '🟢 Connected' : '🟡 Connecting...')
            : '🔴 Offline — messages will sync when back online'}
        </span>
        {error && (
          <span className="error-msg">⚠️ {error} <button onClick={() => setError('')}>✕</button></span>
        )}
      </div>

      {/* Mention / DM notifications */}
      {notifications.length > 0 && (
        <div className="notif-stack">
          {notifications.slice(0, 3).map(n => (
            <div key={n.id} className="notif-toast">
              <div className="notif-body">
                <span className="notif-icon">{n.type === 'mention' ? '🔔' : '💌'}</span>
                <div className="notif-text">
                  <strong>{n.from}</strong>
                  {n.type === 'mention'
                    ? <span> mentioned you in <em>{n.roomName}</em></span>
                    : <span> wants to chat directly</span>}
                  {n.preview && <p className="notif-preview">{n.preview}</p>}
                </div>
              </div>
              <div className="notif-actions">
                {n.type === 'mention' && (
                  <button className="notif-action-btn" onClick={() => { joinRoom(n.roomId); dismissNotification(n.id); }}>
                    Go
                  </button>
                )}
                {n.type === 'dm' && (
                  <button className="notif-action-btn" onClick={() => { joinRoom(n.roomId); dismissNotification(n.id); }}>
                    Open
                  </button>
                )}
                <button className="notif-close" onClick={() => dismissNotification(n.id)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

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
            onlineUsers={onlineUsers}
            dmList={dmList}
            onJoinRoom={joinRoom}
            onCreateRoom={createRoom}
            onLeaveRoom={leaveRoom}
            onOpenDM={openDM}
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
              {/* Chat header */}
              <div className="chat-header">
                <div className="chat-header-info">
                  <span className="chat-room-name">
                    {currentRoom.isDM ? '💌' : '💬'} {currentRoom.name}
                  </span>
                  <span className="chat-room-meta">
                    {roomUsers.filter(u => u.online).length} online · {roomUsers.length} members
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {typingUsers.length > 0 && (
                    <div className="typing-bar">
                      <span className="typing-dots"><span /><span /><span /></span>
                      <span>{typingUsers.slice(0, 2).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing…</span>
                    </div>
                  )}

                  {/* Search toggle */}
                  <button
                    className={`icon-btn ${showSearch ? 'active-btn' : ''}`}
                    title="Search messages"
                    onClick={() => { setShowSearch(s => !s); if (showSearch) setSearchQuery(''); }}
                    style={{ marginLeft: 8 }}
                  >
                    🔍
                  </button>
                </div>
              </div>

              {/* Search bar */}
              {showSearch && (
                <div className="search-bar-wrap">
                  <input
                    className="search-input"
                    placeholder="Search messages…"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    autoFocus
                  />
                  {searchQuery && (
                    <button className="search-clear" onClick={() => setSearchQuery('')}>✕</button>
                  )}
                </div>
              )}

              <MessageList
                messages={messages}
                username={username}
                pinnedMessages={pinnedMessages}
                searchQuery={searchQuery}
                onDeleteMessage={deleteMessage}
                onEditMessage={editMessage}
                onToggleReaction={toggleReaction}
                onPinMessage={pinMessage}
                currentRoom={currentRoom}
              />

              <InputBar
                currentRoom={currentRoom}
                username={username}
                roomUsers={roomUsers}
                onSendMessage={sendMessage}
                onTyping={handleTyping}
                disabled={false}
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
