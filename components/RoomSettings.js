'use client';
import { useEffect, useState } from 'react';

export default function RoomSettings({ room, users, username, onManage, onClose }) {
  const [description, setDescription] = useState(room.description || '');
  useEffect(() => setDescription(room.description || ''), [room.description]);
  const role = room.role || users.find(user => user.username === username)?.role || 'member';
  const canModerate = ['owner', 'admin', 'mod'].includes(role);
  const canAdmin = ['owner', 'admin'].includes(role);

  const run = async (action, targetUser, value) => {
    const result = await onManage(action, targetUser, value);
    if (action === 'delete-room' && !result?.error) onClose();
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal room-settings-modal" role="dialog" aria-modal="true" onMouseDown={event => event.stopPropagation()}>
        <div className="modal-title-row"><h3>Manage {room.name}</h3><button className="icon-btn" onClick={onClose}>×</button></div>
        <label className="field-label">Room description</label>
        <textarea className="sidebar-input room-description-input" value={description} maxLength={280} disabled={!canModerate} onChange={event => setDescription(event.target.value)} />
        {canModerate && <button className="create-btn" onClick={() => run('update-description', null, description)}>Save description</button>}

        <p className="section-title">Members</p>
        <div className="management-members">
          {users.map(member => (
            <div className="management-member" key={member.username}>
              <span>{member.username} {member.username === username && '(you)'}</span>
              <span className="role-tag">{member.role || 'member'}</span>
              {canAdmin && member.username !== username && member.role !== 'owner' && (
                <select value={member.role || 'member'} onChange={event => run('set-role', member.username, event.target.value)}>
                  <option value="member">Member</option><option value="mod">Moderator</option>{role === 'owner' && <option value="admin">Admin</option>}
                </select>
              )}
              {canModerate && member.username !== username && member.role !== 'owner' && <>
                <button className="cancel-btn" onClick={() => run('kick', member.username)}>Kick</button>
                <button className="delete-confirm-btn" onClick={() => confirm(`Ban ${member.username}?`) && run('ban', member.username)}>Ban</button>
              </>}
              {role === 'owner' && member.username !== username && <button className="cancel-btn" onClick={() => confirm(`Transfer ownership to ${member.username}?`) && run('transfer-owner', member.username)}>Make owner</button>}
            </div>
          ))}
        </div>
        {role === 'owner' && <button className="delete-confirm-btn delete-room-btn" onClick={() => confirm('Delete this room and its message history?') && run('delete-room')}>Delete room</button>}
      </div>
    </div>
  );
}
