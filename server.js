const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';

// Restrict Socket.IO CORS. Set ALLOWED_ORIGIN to one or more comma-separated
// public origins when deploying. Local development permits localhost only.
const allowedOrigins = (process.env.ALLOWED_ORIGIN || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const ALLOWED_ORIGIN = dev && allowedOrigins.length === 0
  ? ['http://localhost:3000', 'http://127.0.0.1:3000']
  : allowedOrigins;

// ── Simple per-socket rate limiting ─────────────────────────────────────────
// Sliding-window counters keyed by event name, stored on the socket instance.
// Not a substitute for a real rate limiter (e.g. Redis-backed) under heavy
// load / multiple server instances, but stops trivial single-client spam.
const RATE_LIMITS = {
  'send-message': { max: 20, windowMs: 10_000 },
  'create-room': { max: 5, windowMs: 60_000 },
  'join-room': { max: 20, windowMs: 60_000 },
  'open-dm': { max: 20, windowMs: 60_000 },
  'typing': { max: 10, windowMs: 5_000 },
  'read-message': { max: 100, windowMs: 10_000 },
  'edit-message': { max: 30, windowMs: 60_000 },
  'delete-message': { max: 30, windowMs: 60_000 },
  'toggle-reaction': { max: 60, windowMs: 60_000 },
  'pin-message': { max: 30, windowMs: 60_000 },
};

function isRateLimited(socket, key) {
  const limit = RATE_LIMITS[key];
  if (!limit) return false;
  socket._rateBuckets = socket._rateBuckets || {};
  const now = Date.now();
  const recent = (socket._rateBuckets[key] || []).filter(t => now - t < limit.windowMs);
  recent.push(now);
  socket._rateBuckets[key] = recent;
  return recent.length > limit.max;
}

// ── Empty-room reaping ───────────────────────────────────────────────────────
// Rooms live in memory forever otherwise. When any room becomes empty, give it
// a grace period (in case everyone is just switching rooms briefly), then
// delete it if it is still empty.
const EMPTY_ROOM_GRACE_MS = 10 * 60 * 1000; // 10 minutes
const emptyRoomTimers = new Map(); // roomId -> Timeout

function cancelRoomReap(roomId) {
  const t = emptyRoomTimers.get(roomId);
  if (t) { clearTimeout(t); emptyRoomTimers.delete(roomId); }
}

function scheduleRoomReapIfEmpty(roomId, rooms, io) {
  const room = rooms.get(roomId);
  if (!room || room.users.size > 0) return;
  cancelRoomReap(roomId);
  const timer = setTimeout(() => {
    const current = rooms.get(roomId);
    if (current && current.users.size === 0) {
      rooms.delete(roomId);
      emptyRoomTimers.delete(roomId);
      if (!current.isDM) {
        io.emit('rooms-updated', [...rooms.entries()]
          .filter(([, r]) => !r.isDM)
          .map(([id, r]) => ({ id, name: r.name, hasPassword: !!r.password, userCount: r.users.size })));
      }
    }
  }, EMPTY_ROOM_GRACE_MS);
  emptyRoomTimers.set(roomId, timer);
}
const app = next({ dev });
const handle = app.getRequestHandler();

// In-memory store
const users = new Map();   // socketId -> { username, roomId, avatar }
const rooms = new Map();   // roomId -> { name, password, users: Set, messages: [], pinnedMessages: [], isDM: bool }

function getRoomPublicInfo(roomId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  return {
    id: roomId,
    name: room.name,
    hasPassword: !!room.password,
    userCount: room.users.size,
    isDM: !!room.isDM,
    pinnedMessages: room.pinnedMessages || [],
    users: [...room.users].map(uid => {
      const u = [...users.values()].find(u => u.username === uid);
      return { username: uid, online: !!u };
    }),
  };
}

function getDMRoomId(userA, userB) {
  return 'dm-' + [userA, userB].sort().join('-');
}

// Helper: the ONLY source of truth for "who is this socket" is the
// server-side `users` map, populated by `set-username`. Never trust a
// username passed in a client payload for anything security-relevant
// (editing/deleting a message, sending as a given sender, DM identity, etc).
function getAuthedUser(socket) {
  return users.get(socket.id) || null;
}

app.prepare().then(() => {
  if (!dev && ALLOWED_ORIGIN.length === 0) {
    console.warn('ALLOWED_ORIGIN is not set; cross-origin Socket.IO connections will be rejected.');
  }
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    cors: { origin: ALLOWED_ORIGIN, methods: ['GET', 'POST'] },
    maxHttpBufferSize: 50e6,
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('set-username', ({ username }) => {
      const trimmed = (username || '').trim().slice(0, 24);
      if (!trimmed) return;
      users.set(socket.id, { username: trimmed, roomId: null });
      socket.emit('username-set', { username: trimmed });
    });

    socket.on('get-rooms', () => {
      const roomList = [...rooms.entries()]
        .filter(([, r]) => !r.isDM)
        .map(([id, r]) => ({
          id, name: r.name, hasPassword: !!r.password, userCount: r.users.size
        }));
      socket.emit('rooms-list', roomList);
    });

    socket.on('create-room', ({ roomId, name, password }) => {
      const user = getAuthedUser(socket);
      if (!user) { socket.emit('room-error', { message: 'Set a username first' }); return; }
      if (isRateLimited(socket, 'create-room')) {
        socket.emit('room-error', { message: 'Too many rooms created — slow down' });
        return;
      }
      if (rooms.has(roomId)) {
        socket.emit('room-error', { message: 'Room ID already exists' });
        return;
      }
      rooms.set(roomId, { name, password: password || null, users: new Set(), messages: [], pinnedMessages: [] });
      scheduleRoomReapIfEmpty(roomId, rooms, io);
      socket.emit('room-created', { roomId, name });
      io.emit('rooms-updated', [...rooms.entries()]
        .filter(([, r]) => !r.isDM)
        .map(([id, r]) => ({ id, name: r.name, hasPassword: !!r.password, userCount: r.users.size })));
    });

    socket.on('join-room', ({ roomId, password }) => {
      const user = getAuthedUser(socket);
      if (!user) { socket.emit('room-error', { message: 'Set a username first' }); return; }
      if (isRateLimited(socket, 'join-room')) {
        socket.emit('room-error', { message: 'Too many room joins — slow down' });
        return;
      }
      const username = user.username; // authoritative, never trust client payload for this

      const room = rooms.get(roomId);
      if (!room) { socket.emit('room-error', { message: 'Room not found' }); return; }
      if (room.password && room.password !== password) {
        socket.emit('room-error', { message: 'Incorrect password' }); return;
      }

      if (user.roomId) {
        const oldRoom = rooms.get(user.roomId);
        if (oldRoom) {
          oldRoom.users.delete(username);
          socket.leave(user.roomId);
          io.to(user.roomId).emit('user-left', { username, roomId: user.roomId });
          io.to(user.roomId).emit('room-users', getRoomPublicInfo(user.roomId));
          scheduleRoomReapIfEmpty(user.roomId, rooms, io);
        }
      }

      cancelRoomReap(roomId);
      socket.join(roomId);
      room.users.add(username);
      users.set(socket.id, { ...user, roomId });

      socket.emit('joined-room', {
        roomId,
        name: room.name,
        isDM: !!room.isDM,
        messages: room.messages.slice(-100),
        users: getRoomPublicInfo(roomId),
        pinnedMessages: room.pinnedMessages || [],
      });

      socket.to(roomId).emit('user-joined', { username, roomId });
      io.to(roomId).emit('room-users', getRoomPublicInfo(roomId));
    });

    socket.on('leave-room', ({ roomId }) => {
      const user = getAuthedUser(socket);
      if (!user) return;
      const room = rooms.get(roomId);
      if (room) {
        room.users.delete(user.username);
        socket.leave(roomId);
        io.to(roomId).emit('user-left', { username: user.username, roomId });
        io.to(roomId).emit('room-users', getRoomPublicInfo(roomId));
        scheduleRoomReapIfEmpty(roomId, rooms, io);
      }
      users.set(socket.id, { ...user, roomId: null });
    });

    socket.on('send-message', (message, ack) => {
      const user = getAuthedUser(socket);
      if (!user) { if (ack) ack({ error: 'Set a username first' }); return; }
      if (isRateLimited(socket, 'send-message')) { if (ack) ack({ error: 'Too many messages — slow down' }); return; }
      const room = rooms.get(message.roomId);
      if (!room) { if (ack) ack({ error: 'Room not found' }); return; }
      if (user.roomId !== message.roomId || !room.users.has(user.username)) {
        if (ack) ack({ error: 'Join the room before sending messages' });
        return;
      }
      // Force sender to the socket's authenticated identity — never trust
      // whatever `sender` the client put in the message payload.
      const fullMessage = { ...message, sender: user.username, status: 'delivered' };
      room.messages.push(fullMessage);
      if (room.messages.length > 500) room.messages.shift();

      // Handle @mentions — notify mentioned users
      if (fullMessage.type === 'text' && fullMessage.content) {
        const mentions = [...fullMessage.content.matchAll(/@(\w+)/g)].map(m => m[1]);
        mentions.forEach(mentionedUser => {
          const mentionedSocket = [...users.entries()].find(([, u]) => u.username === mentionedUser);
          if (mentionedSocket) {
            io.to(mentionedSocket[0]).emit('mention-notification', {
              from: fullMessage.sender,
              roomId: fullMessage.roomId,
              roomName: room.name,
              preview: fullMessage.content.slice(0, 80),
              messageId: fullMessage.id,
            });
          }
        });
      }

      socket.to(message.roomId).emit('new-message', fullMessage);
      if (ack) ack({ status: 'delivered', messageId: message.id, message: fullMessage });
    });

    socket.on('typing', ({ roomId }) => {
      const user = getAuthedUser(socket);
      if (!user || user.roomId !== roomId || isRateLimited(socket, 'typing')) return;
      socket.to(roomId).emit('user-typing', { username: user.username });
    });
    socket.on('stop-typing', ({ roomId }) => {
      const user = getAuthedUser(socket);
      if (!user || user.roomId !== roomId) return;
      socket.to(roomId).emit('user-stop-typing', { username: user.username });
    });

    socket.on('read-message', ({ roomId, messageId }) => {
      const user = getAuthedUser(socket);
      if (!user || user.roomId !== roomId || isRateLimited(socket, 'read-message')) return;
      const room = rooms.get(roomId);
      if (room) {
        const msg = room.messages.find(m => m.id === messageId);
        if (!msg || msg.sender === user.username) return;
        msg.status = 'read';
      } else {
        return;
      }
      socket.to(roomId).emit('message-read', { messageId, username: user.username });
    });

    socket.on('send-blob', ({ roomId, message }) => {
      const user = getAuthedUser(socket);
      if (!user) return;
      const room = rooms.get(roomId);
      if (!room) return;
      const fullMessage = { ...message, sender: user.username };
      room.messages.push(fullMessage);
      io.to(roomId).emit('new-message', fullMessage);
    });

    // ── EDIT MESSAGE ────────────────────────────────────────────────────────
    socket.on('edit-message', ({ roomId, messageId, newContent }, ack) => {
      const user = getAuthedUser(socket);
      if (!user) { if (ack) ack({ error: 'Set a username first' }); return; }
      if (isRateLimited(socket, 'edit-message')) { if (ack) ack({ error: 'Too many edits — slow down' }); return; }
      const room = rooms.get(roomId);
      if (!room || user.roomId !== roomId) { if (ack) ack({ error: 'Room not found or not joined' }); return; }
      const msg = room.messages.find(m => m.id === messageId);
      // Authorization check now uses the server-verified identity, not a
      // client-supplied username — this is what prevents forged edits.
      if (!msg || msg.sender !== user.username) { if (ack) ack({ error: 'You can only edit your own messages' }); return; }
      const content = typeof newContent === 'string' ? newContent.trim() : '';
      if (!content || content.length > 10_000) { if (ack) ack({ error: 'Message must be between 1 and 10,000 characters' }); return; }
      if (!msg.editHistory) msg.editHistory = [];
      msg.editHistory.push({ content: msg.content, editedAt: Date.now() });
      msg.content = content;
      msg.edited = true;
      msg.editedAt = Date.now();
      io.to(roomId).emit('message-edited', { messageId, newContent: content, editedAt: msg.editedAt });
      if (ack) ack({ status: 'ok' });
    });

    // ── DELETE MESSAGE ───────────────────────────────────────────────────────
    socket.on('delete-message', ({ roomId, messageId }, ack) => {
      const user = getAuthedUser(socket);
      if (!user) { if (ack) ack({ error: 'Set a username first' }); return; }
      if (isRateLimited(socket, 'delete-message')) { if (ack) ack({ error: 'Too many deletes — slow down' }); return; }
      const room = rooms.get(roomId);
      if (!room || user.roomId !== roomId) { if (ack) ack({ error: 'Room not found or not joined' }); return; }
      const msg = room.messages.find(m => m.id === messageId);
      if (!msg || msg.sender !== user.username) { if (ack) ack({ error: 'You can only delete your own messages' }); return; }
      msg.deleted = true;
      msg.content = '';
      msg.type = 'deleted';
      // Remove from pinned if pinned
      if (room.pinnedMessages) {
        room.pinnedMessages = room.pinnedMessages.filter(p => p.id !== messageId);
      }
      io.to(roomId).emit('message-deleted', { messageId, roomId });
      io.to(roomId).emit('pinned-messages-updated', { pinnedMessages: room.pinnedMessages || [] });
      if (ack) ack({ status: 'ok' });
    });

    // ── REACTIONS ────────────────────────────────────────────────────────────
    socket.on('toggle-reaction', ({ roomId, messageId, emoji }) => {
      const user = getAuthedUser(socket);
      if (!user || user.roomId !== roomId || isRateLimited(socket, 'toggle-reaction')) return;
      const room = rooms.get(roomId);
      if (!room) return;
      const msg = room.messages.find(m => m.id === messageId);
      if (!msg) return;
      if (!msg.reactions) msg.reactions = {};
      if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
      const idx = msg.reactions[emoji].indexOf(user.username);
      if (idx === -1) msg.reactions[emoji].push(user.username);
      else {
        msg.reactions[emoji].splice(idx, 1);
        if (msg.reactions[emoji].length === 0) delete msg.reactions[emoji];
      }
      io.to(roomId).emit('reaction-updated', { messageId, reactions: msg.reactions });
    });

    // ── PIN MESSAGE ──────────────────────────────────────────────────────────
    socket.on('pin-message', ({ roomId, messageId }) => {
      const user = getAuthedUser(socket);
      if (!user || user.roomId !== roomId || isRateLimited(socket, 'pin-message')) return;
      const room = rooms.get(roomId);
      if (!room) return;
      const msg = room.messages.find(m => m.id === messageId);
      if (!msg || msg.deleted) return;
      if (!room.pinnedMessages) room.pinnedMessages = [];

      const alreadyPinned = room.pinnedMessages.find(p => p.id === messageId);
      if (alreadyPinned) {
        room.pinnedMessages = room.pinnedMessages.filter(p => p.id !== messageId);
      } else {
        if (room.pinnedMessages.length >= 5) room.pinnedMessages.shift(); // max 5 pinned
        room.pinnedMessages.push({
          id: msg.id,
          sender: msg.sender,
          content: msg.type === 'text' ? msg.content : `[${msg.type}]`,
          pinnedBy: user.username,
          pinnedAt: Date.now(),
        });
      }
      io.to(roomId).emit('pinned-messages-updated', { pinnedMessages: room.pinnedMessages });
    });

    // ── DIRECT MESSAGE ───────────────────────────────────────────────────────
    socket.on('open-dm', ({ toUser }) => {
      const user = getAuthedUser(socket);
      if (!user) return;
      if (isRateLimited(socket, 'open-dm')) {
        socket.emit('room-error', { message: 'Too many direct-message requests — slow down' });
        return;
      }
      const fromUser = user.username; // authoritative — client can no longer impersonate the "from" side of a DM
      if (!toUser || toUser === fromUser) return;

      const roomId = getDMRoomId(fromUser, toUser);
      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          name: `DM: ${fromUser} & ${toUser}`,
          password: null,
          users: new Set(),
          messages: [],
          pinnedMessages: [],
          isDM: true,
          dmUsers: [fromUser, toUser],
        });
        scheduleRoomReapIfEmpty(roomId, rooms, io);
      }

      // Also notify the other user if they're online
      const otherSocket = [...users.entries()].find(([, u]) => u.username === toUser);
      if (otherSocket) {
        io.to(otherSocket[0]).emit('dm-invite', { fromUser, roomId, toUser });
      }

      socket.emit('dm-room-ready', { roomId, toUser });
    });

    // ── GET ONLINE USERS (for DM picker) ────────────────────────────────────
    socket.on('get-online-users', () => {
      const onlineUsers = [...users.values()]
        .map(u => u.username)
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i); // unique
      socket.emit('online-users', onlineUsers);
    });

    socket.on('disconnect', () => {
      const user = users.get(socket.id);
      if (user && user.roomId) {
        const room = rooms.get(user.roomId);
        if (room) {
          room.users.delete(user.username);
          io.to(user.roomId).emit('user-left', { username: user.username });
          io.to(user.roomId).emit('room-users', getRoomPublicInfo(user.roomId));
          scheduleRoomReapIfEmpty(user.roomId, rooms, io);
        }
      }
      users.delete(socket.id);
      console.log('Client disconnected:', socket.id);
    });
  });

  const PORT = process.env.PORT || 3000;
  httpServer.listen(PORT, () => console.log(`> Ready on http://localhost:${PORT}`));
});
