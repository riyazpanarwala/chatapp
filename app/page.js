'use client';
import { useChat } from '../lib/useChat';
import Sidebar from '../components/Sidebar';
import MessageList from '../components/MessageList';
import InputBar from '../components/InputBar';
import UsernameScreen from '../components/UsernameScreen';
import GlobalSearch from '../components/GlobalSearch';
import RoomSettings from '../components/RoomSettings';
import { useState, useEffect } from 'react';
import { MessageIcon, MailIcon, SearchIcon, BellIcon, XIcon } from '../lib/icons';

export default function Home() {
  const {
    username, initUsername,
    rooms, currentRoom,
    messages, roomUsers, typingUsers,
    isOnline, isConnected, isJoiningRoom, error, setError,
    pinnedMessages,
    onlineUsers,
    notifications, dismissNotification,
    dmList,
    unreadCounts,
    searchQuery, setSearchQuery,
    globalSearchResults, isGlobalSearching, searchAllMessages,
    hasMoreMessages, isLoadingOlder, loadMoreMessages, loadMessageContext,
    avatar, updateAvatar,
    joinRoom, createRoom, sendMessage, handleTyping, leaveRoom,
    editMessage, deleteMessage, markMessageRead, toggleReaction, pinMessage,
    openDM, forwardMessage, manageRoom,
  } = useChat();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [showRoomSettings, setShowRoomSettings] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [pendingJump, setPendingJump] = useState(null);

  useEffect(() => { setReplyingTo(null); setShowRoomSettings(false); }, [currentRoom?.id]);
  useEffect(() => {
    if (!pendingJump || currentRoom?.id !== pendingJump.roomId) return;
    const target = document.getElementById(`message-${pendingJump.messageId}`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setPendingJump(null);
      return;
    }
    if (pendingJump.loading) return;
    setPendingJump(current => current ? { ...current, loading: true } : current);
    loadMessageContext(pendingJump.messageId).then(found => {
      if (!found) setPendingJump(current => current?.messageId === pendingJump.messageId ? null : current);
    });
  }, [pendingJump, currentRoom?.id, messages.length, loadMessageContext]);

  useEffect(() => {
    const saved = localStorage.getItem('chat_sidebar_open');
    if (saved !== null) setSidebarOpen(saved === 'true');
  }, []);

  const toggleSidebar = () => {
    setSidebarOpen(open => {
      const next = !open;
      localStorage.setItem('chat_sidebar_open', String(next));
      return next;
    });
  };

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
        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span className={`status-dot ${isOnline && isConnected ? 'online' : 'offline'}`} />
          {isOnline
            ? (isConnected ? 'Connected' : 'Connecting…')
            : 'Offline — messages will sync when back online'}
        </span>
        {error && (
          <span className="error-msg">{error} <button onClick={() => setError('')} aria-label="Dismiss error"><XIcon size={12} /></button></span>
        )}
      </div>

      {/* Mention / DM notifications */}
      {notifications.length > 0 && (
        <div className="notif-stack">
          {notifications.slice(0, 3).map(n => (
            <div key={n.id} className="notif-toast">
              <div className="notif-body">
                <span className="notif-icon">{n.type === 'mention' ? <BellIcon size={17} /> : <MailIcon size={17} />}</span>
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
                <button className="notif-close" onClick={() => dismissNotification(n.id)} aria-label="Dismiss notification"><XIcon size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="chat-container">
        <button
          className="sidebar-toggle"
          onClick={toggleSidebar}
          aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          aria-expanded={sidebarOpen}
        >
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
            unreadCounts={unreadCounts}
            avatar={avatar}
            onJoinRoom={joinRoom}
            onCreateRoom={createRoom}
            onLeaveRoom={leaveRoom}
            onOpenDM={openDM}
            onUpdateAvatar={updateAvatar}
          />
        )}

        <main className="chat-main">
          {isJoiningRoom && !currentRoom ? (
            <MessageList messages={[]} username={username} isLoading />
          ) : !currentRoom ? (
            <div className="empty-state">
              <div className="empty-icon"><MessageIcon size={30} /></div>
              <h2>Welcome, {username}!</h2>
              <p>Select a room from the sidebar or create a new one to start chatting.</p>
              {rooms.length === 0 && <p className="empty-hint">No rooms yet — create the first one!</p>}
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="chat-header">
                <div className="chat-header-info">
                  <span className="chat-room-name" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {currentRoom.isDM ? <MailIcon size={16} /> : <MessageIcon size={16} />} {currentRoom.name}
                  </span>
                  <span className="chat-room-meta">
                    {roomUsers.filter(u => u.online).length} online · {roomUsers.length} members
                  </span>
                  {currentRoom.description && <span className="chat-room-description">{currentRoom.description}</span>}
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
                    <SearchIcon size={16} />
                  </button>
                  <button className="icon-btn" title="Search everywhere" onClick={() => setShowGlobalSearch(true)}>⌕</button>
                  {!currentRoom.isDM && ['owner', 'admin', 'mod'].includes(currentRoom.role) && (
                    <button className="icon-btn" title="Room management" onClick={() => setShowRoomSettings(true)}>⚙</button>
                  )}
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
                    <button className="search-clear" onClick={() => setSearchQuery('')} aria-label="Clear search"><XIcon size={13} /></button>
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
                onMessageRead={markMessageRead}
                onToggleReaction={toggleReaction}
                onPinMessage={pinMessage}
                currentRoom={currentRoom}
                roomUsers={roomUsers}
                isLoading={isJoiningRoom}
                hasMoreMessages={hasMoreMessages}
                isLoadingOlder={isLoadingOlder}
                onLoadMore={loadMoreMessages}
                onReplyMessage={setReplyingTo}
                onForwardMessage={forwardMessage}
                forwardTargets={[
                  ...rooms.map(room => ({ id: room.id, name: room.name, isDM: false })),
                  ...dmList.map(dm => ({ id: dm.roomId, name: dm.with, isDM: true })),
                ]}
              />

              <InputBar
                currentRoom={currentRoom}
                username={username}
                roomUsers={roomUsers}
                onSendMessage={sendMessage}
                onTyping={handleTyping}
                disabled={isJoiningRoom}
                replyingTo={replyingTo}
                onCancelReply={() => setReplyingTo(null)}
              />
            </>
          )}
        </main>
      </div>
      {showGlobalSearch && (
        <GlobalSearch
          results={globalSearchResults}
          loading={isGlobalSearching}
          onSearch={searchAllMessages}
          onClose={() => setShowGlobalSearch(false)}
          onOpen={(roomId, messageId) => { setPendingJump({ roomId, messageId }); joinRoom(roomId, ''); }}
        />
      )}
      {showRoomSettings && currentRoom && (
        <RoomSettings room={currentRoom} users={roomUsers} username={username} onManage={manageRoom} onClose={() => setShowRoomSettings(false)} />
      )}
    </div>
  );
}
