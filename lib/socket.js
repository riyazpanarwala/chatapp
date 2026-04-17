import { io } from 'socket.io-client';
import { saveMessage, getPendingMessages, updateMessageStatus, messageExists } from './indexedDB';

let socket = null;
let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
const listeners = new Map();

export function getSocket() { return socket; }
export function getOnlineStatus() { return isOnline; }

export function initSocket(username) {
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
    if (username) socket.emit('set-username', { username });
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
    socket.emit('send-message', message, async (ack) => {
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

export function joinRoom(roomId, username, password = '') {
  socket?.emit('join-room', { roomId, username, password });
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

export function sendTyping(roomId, username) {
  socket?.emit('typing', { roomId, username });
}

export function sendStopTyping(roomId, username) {
  socket?.emit('stop-typing', { roomId, username });
}

export function markRead(roomId, messageId, username) {
  socket?.emit('read-message', { roomId, messageId, username });
  updateMessageStatus(messageId, 'read').catch(() => {});
}

export function sendBlobMessage(roomId, message) {
  socket?.emit('send-blob', { roomId, message });
}

// ── New feature helpers ────────────────────────────────────────────────────

export function deleteMessage(roomId, messageId, username) {
  socket?.emit('delete-message', { roomId, messageId, username });
}

export function toggleReaction(roomId, messageId, emoji, username) {
  socket?.emit('toggle-reaction', { roomId, messageId, emoji, username });
}

export function editMessage(roomId, messageId, newContent, username) {
  socket?.emit('edit-message', { roomId, messageId, newContent, username });
}

export function pinMessage(roomId, messageId, username) {
  socket?.emit('pin-message', { roomId, messageId, username });
}

export function openDM(fromUser, toUser) {
  socket?.emit('open-dm', { fromUser, toUser });
}

export function getOnlineUsers() {
  socket?.emit('get-online-users');
}
