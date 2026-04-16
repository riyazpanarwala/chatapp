'use client';
import { useState } from 'react';

export default function Sidebar({ rooms, currentRoom, roomUsers, username, isOnline, onJoinRoom, onCreateRoom, onLeaveRoom, onSetUsername }) {
  const [view, setView] = useState('rooms'); // rooms | users | create
  const [joinRoomId, setJoinRoomId] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(null);
  const [createName, setCreateName] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [newUsername, setNewUsername] = useState('');

  const handleJoin = (room) => {
    if (room.hasPassword) {
      setShowPasswordPrompt(room);
    } else {
      onJoinRoom(room.id, '');
    }
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

  return (
    <aside className="sidebar">
      {/* Header */}
      <div className="sidebar-header">
        <div className="user-badge">
          <div className={`status-dot ${isOnline ? 'online' : 'offline'}`} />
          <span className="username-label">{username || 'Anonymous'}</span>
        </div>
        {currentRoom && (
          <button onClick={onLeaveRoom} className="leave-btn" title="Leave Room">✕</button>
        )}
      </div>

      {/* Tabs */}
      <div className="sidebar-tabs">
        <button className={`tab ${view === 'rooms' ? 'active' : ''}`} onClick={() => setView('rooms')}>Rooms</button>
        {currentRoom && (
          <button className={`tab ${view === 'users' ? 'active' : ''}`} onClick={() => setView('users')}>
            Users <span className="badge">{roomUsers.length}</span>
          </button>
        )}
        <button className={`tab ${view === 'create' ? 'active' : ''}`} onClick={() => setView('create')}>+ New</button>
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
                <div className="room-icon">{room.hasPassword ? '🔒' : '💬'}</div>
                <div className="room-info">
                  <span className="room-name">{room.name}</span>
                  <span className="room-meta">{room.userCount} online</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Users List */}
        {view === 'users' && currentRoom && (
          <div className="user-list">
            <p className="section-title">In {currentRoom.name}</p>
            {roomUsers.map(u => (
              <div key={u.username} className="user-item">
                <div className={`status-dot ${u.online ? 'online' : 'offline'}`} />
                <span className={u.username === username ? 'you' : ''}>{u.username}</span>
                {u.username === username && <span className="you-tag">you</span>}
              </div>
            ))}
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

      {/* Password Prompt Modal */}
      {showPasswordPrompt && (
        <div className="modal-overlay" onClick={() => setShowPasswordPrompt(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>🔒 {showPasswordPrompt.name}</h3>
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
