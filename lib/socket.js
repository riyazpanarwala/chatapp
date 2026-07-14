import { io } from 'socket.io-client';
import { saveMessage, getPendingMessages, updateMessageStatus, messageExists } from './indexedDB';

let socket = null;
let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
const listeners = new Map();

export function getSocket() { return socket; }
export function getOnlineStatus() { return isOnline; }

export function initSocket(username, avatar = '') {
  if (socket?.connected) return socket;

  socket = io(typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000', {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  socket.on('connect', async () => {
    console.log('[Socket] Connected:', socket.id);
    isOnline = true;
    if (username) socket.emit('set-username', { username, avatar });
    await syncPendingMessages();
    emitLocal('connection-change', { online: true });
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
    emitLocal('connection-change', { online: false });
  });

  socket.on('connect_error', () => {
    isOnline = false;
    emitLocal('connection-change', { online: false });
  });

  const events = [
    'new-message', 'user-joined', 'user-left', 'room-users',
    'user-typing', 'user-stop-typing', 'message-read',
    'joined-room', 'room-created', 'rooms-list', 'rooms-updated',
    'room-error', 'username-set',
    // New events
    'message-deleted', 'reaction-updated',
    'message-edited',
    'pinned-messages-updated',
    'dm-room-ready', 'dm-invite',
    'online-users',
    'mention-notification',
    'room-activity', 'room-removed', 'room-settings-updated',
  ];
  events.forEach(ev => {
    socket.on(ev, (data) => emitLocal(ev, data));
  });

  if (typeof window !== 'undefined') {
    window.addEventListener('online', async () => {
      isOnline = true;
      emitLocal('connection-change', { online: true });
      if (!socket.connected) socket.connect();
      await syncPendingMessages();
    });
    window.addEventListener('offline', () => {
      isOnline = false;
      emitLocal('connection-change', { online: false });
    });
  }

  return socket;
}

async function syncPendingMessages() {
  try {
    const pending = await getPendingMessages();
    if (!pending.length) return;
    for (const msg of pending) {
      await sendMessage(msg, true);
    }
  } catch (e) {
    console.error('[Sync] Error:', e);
  }
}

export async function sendMessage(message, isRetry = false) {
  if (!isRetry) {
    await saveMessage({ ...message, status: 'pending' });
  }

  if (!socket?.connected || !isOnline) {
    emitLocal('new-message', { ...message, status: 'pending' });
    return;
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve({ error: 'The server did not acknowledge the message' }), 5000);
    socket.emit('send-message', message, async (ack) => {
      clearTimeout(timeout);
      if (ack?.status === 'delivered') {
        await updateMessageStatus(message.id, 'delivered');
        emitLocal('message-status-update', { messageId: message.id, status: 'delivered' });
      }
      resolve(ack);
    });
  });
}

export function on(event, cb) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(cb);
  return () => listeners.get(event)?.delete(cb);
}

export function off(event, cb) {
  listeners.get(event)?.delete(cb);
}

function emitLocal(event, data) {
  listeners.get(event)?.forEach(cb => cb(data));
}

export function joinRoom(roomId, password = '') {
  // NOTE: identity is established once via set-username and tracked
  // server-side per socket. We no longer send `username` here — the
  // server derives it from the authenticated socket, so a client can't
  // join or act as someone else just by changing a payload field.
  socket?.emit('join-room', { roomId, password });
}

export function leaveRoom(roomId) {
  socket?.emit('leave-room', { roomId });
}

export function createRoom(roomId, name, password = '') {
  socket?.emit('create-room', { roomId, name, password });
}

export function getRooms() {
  socket?.emit('get-rooms');
}

export function sendTyping(roomId) {
  socket?.emit('typing', { roomId });
}

export function sendStopTyping(roomId) {
  socket?.emit('stop-typing', { roomId });
}

export function markRead(roomId, messageId) {
  socket?.emit('read-message', { roomId, messageId });
}

export function sendBlobMessage(roomId, message) {
  socket?.emit('send-blob', { roomId, message });
}

// ── New feature helpers ────────────────────────────────────────────────────

function emitWithAck(event, payload) {
  if (!socket?.connected) return Promise.resolve({ error: 'Not connected to the server' });
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve({ error: 'The server did not respond' }), 5000);
    socket.emit(event, payload, (ack) => {
      clearTimeout(timeout);
      resolve(ack || { error: 'The operation was rejected' });
    });
  });
}

export function deleteMessage(roomId, messageId) {
  return emitWithAck('delete-message', { roomId, messageId });
}

export function toggleReaction(roomId, messageId, emoji) {
  socket?.emit('toggle-reaction', { roomId, messageId, emoji });
}

export function editMessage(roomId, messageId, newContent) {
  return emitWithAck('edit-message', { roomId, messageId, newContent });
}

export function pinMessage(roomId, messageId) {
  socket?.emit('pin-message', { roomId, messageId });
}

export function openDM(toUser) {
  socket?.emit('open-dm', { toUser });
}

export function getOnlineUsers() {
  socket?.emit('get-online-users');
}

export function loadMoreMessages(roomId, before, limit = 50) {
  return emitWithAck('load-more-messages', { roomId, before, limit });
}

export function globalSearch(query) {
  return emitWithAck('global-search', { query });
}

export function forwardMessage(sourceRoomId, messageId, targetRoomId) {
  return emitWithAck('forward-message', { sourceRoomId, messageId, targetRoomId });
}

export function manageRoom(roomId, action, targetUser, value) {
  return emitWithAck('manage-room', { roomId, action, targetUser, value });
}

export function updateProfile(avatar) {
  return emitWithAck('update-profile', { avatar });
}
