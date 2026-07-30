'use client';
import { useState } from 'react';
import { MessageIcon, LockIcon, MailIcon, PlusIcon, XIcon } from '../lib/icons';

export default function Sidebar({ rooms, currentRoom, roomUsers, username, avatar, unreadCounts = {}, isOnline, onlineUsers, dmList, onJoinRoom, onCreateRoom, onLeaveRoom, onOpenDM, onUpdateAvatar }) {
  const [view, setView] = useState('rooms'); // rooms | users | create | dms
  const [joinPassword, setJoinPassword] = useState('');
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(null);
  const [createName, setCreateName] = useState('');
  const [createPassword, setCreatePassword] = useState('');

  const handleJoin = (room) => {
    if (room.hasPassword) setShowPasswordPrompt(room);
    else onJoinRoom(room.id, '');
  };

  const handlePasswordJoin = () => {
    if (!showPasswordPrompt) return;
    onJoinRoom(showPasswordPrompt.id, joinPassword);
    setJoinPassword('');
    setShowPasswordPrompt(null);
  };

  const handleCreate = () => {
    if (!createName.trim()) return;
    onCreateRoom(createName.trim(), createPassword);
    setCreateName('');
    setCreatePassword('');
    setView('rooms');
  };

  const otherOnlineUsers = (onlineUsers || []).filter(u => u !== username);

  const handleAvatar = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) return;
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch('/api/avatar', { method: 'POST', body: form });
      const data = await response.json();
      if (response.ok && data.files?.[0]?.url) onUpdateAvatar(data.files[0].url);
    } catch (error) {
      console.error('Avatar upload failed:', error);
    }
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-brand" style={{ padding: '12px 16px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: '#f3f4f6', letterSpacing: '-0.01em' }}>
          FluxChat <span style={{ fontSize: '0.65rem', color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>by Panarwala</span>
        </h2>
      </div>
      <div className="sidebar-header">
        <div className="user-badge">
          <label className="profile-avatar" title="Change profile picture">
            {avatar ? <img src={avatar} alt="" /> : username?.[0]?.toUpperCase()}
            <input type="file" accept="image/*" onChange={handleAvatar} hidden />
          </label>
          <div className={`status-dot ${isOnline ? 'online' : 'offline'}`} />
          <span className="username-label">{username || 'Anonymous'}</span>
        </div>
        {currentRoom && (
          <button onClick={onLeaveRoom} className="leave-btn" title="Leave Room">
            <XIcon size={13} />
          </button>
        )}
      </div>

      <div className="sidebar-tabs">
        <button className={`tab ${view === 'rooms' ? 'active' : ''}`} onClick={() => setView('rooms')}>Rooms</button>
        {currentRoom && (
          <button className={`tab ${view === 'users' ? 'active' : ''}`} onClick={() => setView('users')}>
            Users <span className="badge">{roomUsers.length}</span>
          </button>
        )}
        <button className={`tab ${view === 'dms' ? 'active' : ''}`} onClick={() => setView('dms')}>
          DMs {dmList.length > 0 && <span className="badge">{dmList.length}</span>}
        </button>
        <button className={`tab ${view === 'create' ? 'active' : ''}`} onClick={() => setView('create')} title="Create room" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <PlusIcon size={15} />
        </button>
      </div>

      <div className="sidebar-body">
        {/* Rooms List */}
        {view === 'rooms' && (
          <div className="room-list">
            {rooms.length === 0 && <p className="empty-hint">No rooms yet. Create one!</p>}
            {rooms.map(room => (
              <div
                key={room.id}
                className={`room-item ${currentRoom?.id === room.id ? 'active' : ''}`}
                onClick={() => handleJoin(room)}
              >
                <div className="room-icon">{room.hasPassword ? <LockIcon size={14} /> : <MessageIcon size={14} />}</div>
                <div className="room-info">
                  <span className="room-name">{room.name}</span>
                  <span className="room-meta">{room.userCount} online</span>
                </div>
                {!!unreadCounts[room.id] && <span className="unread-badge">{Math.min(unreadCounts[room.id], 99)}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Users in room — with DM button */}
        {view === 'users' && currentRoom && (
          <div className="user-list">
            <p className="section-title">In {currentRoom.name}</p>
            {roomUsers.map(u => (
              <div key={u.username} className="user-item">
                <div className="member-avatar">{u.avatar ? <img src={u.avatar} alt="" /> : u.username[0].toUpperCase()}</div>
                <div className={`status-dot ${u.online ? 'online' : 'offline'}`} />
                <span className={u.username === username ? 'you' : ''}>{u.username}</span>
                {u.role && u.role !== 'member' && <span className="role-tag">{u.role}</span>}
                {u.username === username
                  ? <span className="you-tag">you</span>
                  : (
                    <button
                      className="dm-btn"
                      title={`Message ${u.username}`}
                      onClick={() => { onOpenDM(u.username); }}
                    >
                      <MailIcon size={13} />
                    </button>
                  )
                }
              </div>
            ))}
          </div>
        )}

        {/* Direct Messages */}
        {view === 'dms' && (
          <div className="room-list">
            <p className="section-title">Direct Messages</p>
            {dmList.length === 0 && (
              <p className="empty-hint">No DMs yet. Click the mail icon next to a user in a room.</p>
            )}
            {dmList.map(dm => (
              <div
                key={dm.roomId}
                className={`room-item ${currentRoom?.id === dm.roomId ? 'active' : ''}`}
                onClick={() => onJoinRoom(dm.roomId, '')}
              >
                <div className="room-icon"><MailIcon size={14} /></div>
                <div className="room-info">
                  <span className="room-name">{dm.with}</span>
                  <span className="room-meta">Direct message</span>
                </div>
                {!!unreadCounts[dm.roomId] && <span className="unread-badge">{Math.min(unreadCounts[dm.roomId], 99)}</span>}
              </div>
            ))}

            {otherOnlineUsers.length > 0 && (
              <>
                <p className="section-title" style={{ marginTop: 12 }}>Online now</p>
                {otherOnlineUsers.map(u => (
                  <div
                    key={u}
                    className="room-item"
                    onClick={() => onOpenDM(u)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="status-dot online" style={{ margin: '0 6px 0 8px' }} />
                    <div className="room-info">
                      <span className="room-name">{u}</span>
                      <span className="room-meta">Click to DM</span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* Create Room */}
        {view === 'create' && (
          <div className="create-form">
            <p className="section-title">Create Room</p>
            <input
              className="sidebar-input"
              placeholder="Room name..."
              value={createName}
              onChange={e => setCreateName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
            <input
              className="sidebar-input"
              type="password"
              placeholder="Password (optional)"
              value={createPassword}
              onChange={e => setCreatePassword(e.target.value)}
            />
            <button className="create-btn" onClick={handleCreate}>Create Room</button>
          </div>
        )}
      </div>

      {showPasswordPrompt && (
        <div className="modal-overlay" onClick={() => setShowPasswordPrompt(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <LockIcon size={16} /> {showPasswordPrompt.name}
            </h3>
            <p>This room requires a password</p>
            <input
              className="sidebar-input"
              type="password"
              placeholder="Enter password..."
              value={joinPassword}
              onChange={e => setJoinPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handlePasswordJoin()}
              autoFocus
            />
            <div className="modal-actions">
              <button className="create-btn" onClick={handlePasswordJoin}>Join</button>
              <button className="cancel-btn" onClick={() => setShowPasswordPrompt(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
