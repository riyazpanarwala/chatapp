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
  'forward-message': { max: 20, windowMs: 10_000 },
  'global-search': { max: 20, windowMs: 10_000 },
  'load-more-messages': { max: 30, windowMs: 10_000 },
  'message-context': { max: 30, windowMs: 10_000 },
  'manage-room': { max: 30, windowMs: 60_000 },
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
    if (current && current.users.size === 0 && (!current.members || current.members.size === 0)) {
      rooms.delete(roomId);
      emptyRoomTimers.delete(roomId);
      if (!current.isDM) emitRoomLists(io);
    }
  }, EMPTY_ROOM_GRACE_MS);
  emptyRoomTimers.set(roomId, timer);
}
const app = next({ dev });
const handle = app.getRequestHandler();

// In-memory store
const users = new Map();   // socketId -> { username, roomId, avatar }
const rooms = new Map();   // roomId -> { name, password, users: Set, messages: [], pinnedMessages: [], isDM: bool }
const profiles = new Map(); // username -> { avatar }

function findUserSockets(username) {
  return [...users.entries()].filter(([, user]) => user.username === username).map(([id]) => id);
}

function roomListFor(username) {
  return [...rooms.entries()]
    .filter(([, room]) => !room.isDM)
    .map(([id, room]) => ({
      id, name: room.name, description: room.description || '', hasPassword: !!room.password,
      userCount: room.users.size, role: room.roles?.[username] || null,
    }));
}

function emitRoomLists(io) {
  const listsByUsername = new Map();
  for (const [socketId, user] of users) {
    if (!listsByUsername.has(user.username)) listsByUsername.set(user.username, roomListFor(user.username));
    io.to(socketId).emit('rooms-updated', listsByUsername.get(user.username));
  }
}

function canModerate(room, username) {
  return ['owner', 'admin', 'mod'].includes(room.roles?.[username]);
}

function canAdminister(room, username) {
  return ['owner', 'admin'].includes(room.roles?.[username]);
}

function emitMessageActivity(io, roomId, room, message) {
  const recipients = room.isDM ? room.dmUsers : [...(room.members || room.users)];
  for (const recipient of recipients || []) {
    if (recipient === message.sender) continue;
    for (const socketId of findUserSockets(recipient)) {
      io.to(socketId).emit('room-activity', {
        roomId, roomName: room.name, isDM: !!room.isDM,
        from: message.sender, preview: message.type === 'text' ? message.content.slice(0, 100) : `[${message.type}]`,
        messageId: message.id,
      });
    }
  }
}

function getRoomPublicInfo(roomId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  const usersByUsername = new Map([...users.values()].map(user => [user.username, user]));
  return {
    id: roomId,
    name: room.name,
    hasPassword: !!room.password,
    userCount: room.users.size,
    isDM: !!room.isDM,
    pinnedMessages: room.pinnedMessages || [],
    description: room.description || '',
    owner: room.owner || null,
    myRole: null,
    users: [...(room.members || room.users)].map(uid => {
      const u = usersByUsername.get(uid);
      return { username: uid, online: room.users.has(uid) && !!u, avatar: profiles.get(uid)?.avatar || u?.avatar || null, role: room.roles?.[uid] || 'member' };
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

const MESSAGE_TYPES = new Set(['text', 'image', 'file', 'audio', 'screenshot', 'video-call']);

function buildMessage(message, user, room, roomId = message?.roomId) {
  if (!message || typeof roomId !== 'string' || typeof message.id !== 'string' || message.id.length > 128) return null;
  const type = MESSAGE_TYPES.has(message.type) ? message.type : null;
  if (!type || typeof message.content !== 'string') return null;
  const maxContentLength = type === 'audio' ? 15_000_000 : 50_000;
  if (!message.content || message.content.length > maxContentLength) return null;
  const replySource = message.replyTo?.id
    ? room.messages.find(item => item.id === message.replyTo.id && !item.deleted)
    : null;
  const fullMessage = {
    id: message.id, roomId, sender: user.username, type, content: message.content,
    timestamp: Date.now(), status: 'delivered', readBy: [user.username],
    replyTo: replySource ? {
      id: replySource.id,
      sender: replySource.sender,
      content: replySource.type === 'text' ? replySource.content.slice(0, 240) : `[${replySource.type}]`,
    } : null,
  };
  if (typeof message.fileName === 'string') fullMessage.fileName = message.fileName.slice(0, 255);
  if (Number.isFinite(message.fileSize) && message.fileSize >= 0) fullMessage.fileSize = message.fileSize;
  if (type === 'video-call') {
    if (typeof message.callRoomId === 'string') fullMessage.callRoomId = message.callRoomId.slice(0, 256);
    fullMessage.callerName = user.username;
    if (typeof message.callUrl === 'string') fullMessage.callUrl = message.callUrl.slice(0, 2048);
  }
  return fullMessage;
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

    socket.on('set-username', ({ username, avatar }) => {
      const trimmed = (username || '').trim().slice(0, 24);
      if (!trimmed) return;
      if (typeof avatar === 'string' && avatar.trim() && avatar.length <= 2048) profiles.set(trimmed, { avatar });
      users.set(socket.id, { username: trimmed, roomId: null, avatar: profiles.get(trimmed)?.avatar || null });
      socket.emit('username-set', { username: trimmed, avatar: profiles.get(trimmed)?.avatar || null });
    });

    socket.on('update-profile', ({ avatar }, ack) => {
      const user = getAuthedUser(socket);
      if (!user) { if (ack) ack({ error: 'Set a username first' }); return; }
      const cleanAvatar = typeof avatar === 'string' && avatar.length <= 2048 ? avatar : null;
      profiles.set(user.username, { avatar: cleanAvatar });
      for (const socketId of findUserSockets(user.username)) {
        const entry = users.get(socketId);
        if (entry) users.set(socketId, { ...entry, avatar: cleanAvatar });
      }
      for (const [roomId, room] of rooms) {
        if (room.users.has(user.username)) io.to(roomId).emit('room-users', getRoomPublicInfo(roomId));
      }
      if (ack) ack({ status: 'ok', avatar: cleanAvatar });
    });

    socket.on('get-rooms', () => {
      const user = getAuthedUser(socket);
      socket.emit('rooms-list', roomListFor(user?.username));
    });

    socket.on('create-room', ({ roomId, name, password }) => {
      const user = getAuthedUser(socket);
      if (!user) { socket.emit('room-error', { message: 'Set a username first' }); return; }
      if (typeof roomId !== 'string' || !roomId.trim() || roomId.length > 128 || typeof name !== 'string') {
        socket.emit('room-error', { message: 'Invalid room details' }); return;
      }
      if (isRateLimited(socket, 'create-room')) {
        socket.emit('room-error', { message: 'Too many rooms created — slow down' });
        return;
      }
      if (rooms.has(roomId)) {
        socket.emit('room-error', { message: 'Room ID already exists' });
        return;
      }
      const cleanName = (name || '').trim().slice(0, 80);
      if (!cleanName) { socket.emit('room-error', { message: 'Room name is required' }); return; }
      rooms.set(roomId, {
        name: cleanName, description: '', password: password || null, users: new Set(), members: new Set([user.username]),
        messages: [], pinnedMessages: [], owner: user.username, roles: { [user.username]: 'owner' }, bans: new Set(),
      });
      scheduleRoomReapIfEmpty(roomId, rooms, io);
      socket.emit('room-created', { roomId, name });
      emitRoomLists(io);
    });

    socket.on('join-room', ({ roomId, password }) => {
      const user = getAuthedUser(socket);
      if (!user) { socket.emit('room-error', { message: 'Set a username first' }); return; }
      if (typeof roomId !== 'string' || !roomId.trim() || roomId.length > 128) {
        socket.emit('room-error', { message: 'Invalid room id' }); return;
      }
      if (isRateLimited(socket, 'join-room')) {
        socket.emit('room-error', { message: 'Too many room joins — slow down' });
        return;
      }
      const username = user.username; // authoritative, never trust client payload for this

      const room = rooms.get(roomId);
      if (!room) { socket.emit('room-error', { message: 'Room not found' }); return; }
      if (room.isDM && !room.dmUsers?.includes(username)) { socket.emit('room-error', { message: 'You cannot join this DM' }); return; }
      if (room.bans?.has(username)) { socket.emit('room-error', { message: 'You are banned from this room' }); return; }
      if (room.password && room.password !== password && !room.members?.has(username)) {
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
      room.members = room.members || new Set();
      room.members.add(username);
      room.roles = room.roles || {};
      if (!room.roles[username]) room.roles[username] = 'member';
      users.set(socket.id, { ...user, roomId });

      const publicInfo = getRoomPublicInfo(roomId);
      publicInfo.myRole = room.roles[username] || 'member';
      socket.emit('joined-room', {
        roomId,
        name: room.name,
        isDM: !!room.isDM,
        messages: room.messages.slice(-100),
        users: publicInfo,
        pinnedMessages: room.pinnedMessages || [],
        description: room.description || '',
        role: room.roles[username] || 'member',
        hasMore: room.messages.length > 100,
      });

      socket.to(roomId).emit('user-joined', { username, roomId });
      io.to(roomId).emit('room-users', getRoomPublicInfo(roomId));
      if (!room.isDM) emitRoomLists(io);
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
        if (!room.isDM) emitRoomLists(io);
      }
      users.set(socket.id, { ...user, roomId: null });
    });

    socket.on('send-message', (message, ack) => {
      const user = getAuthedUser(socket);
      if (!user) { if (ack) ack({ error: 'Set a username first' }); return; }
      if (isRateLimited(socket, 'send-message')) { if (ack) ack({ error: 'Too many messages — slow down' }); return; }
      if (!message || typeof message.roomId !== 'string' || typeof message.id !== 'string') { if (ack) ack({ error: 'Invalid message' }); return; }
      const room = rooms.get(message.roomId);
      if (!room) { if (ack) ack({ error: 'Room not found' }); return; }
      if (user.roomId !== message.roomId || !room.users.has(user.username)) {
        if (ack) ack({ error: 'Join the room before sending messages' });
        return;
      }
      // Force sender to the socket's authenticated identity — never trust
      // whatever `sender` the client put in the message payload.
      const fullMessage = buildMessage(message, user, room);
      if (!fullMessage) { if (ack) ack({ error: 'Invalid message' }); return; }
      room.messages.push(fullMessage);
      if (room.messages.length > 2000) room.messages.shift();

      // Handle @mentions — notify mentioned users
      if (fullMessage.type === 'text' && fullMessage.content) {
        const mentions = [...fullMessage.content.matchAll(/@([\w-]+)/g)].map(m => m[1]);
        if (mentions.includes('everyone')) mentions.push(...(room.members || room.users));
        if (mentions.includes('here')) mentions.push(...room.users);
        [...new Set(mentions)].filter(name => name !== user.username).forEach(mentionedUser => {
          findUserSockets(mentionedUser).forEach(socketId => {
            io.to(socketId).emit('mention-notification', {
              from: fullMessage.sender,
              roomId: fullMessage.roomId,
              roomName: room.name,
              preview: fullMessage.content.slice(0, 80),
              messageId: fullMessage.id,
            });
          });
        });
      }

      socket.to(message.roomId).emit('new-message', fullMessage);
      emitMessageActivity(io, message.roomId, room, fullMessage);
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
        msg.readBy = [...new Set([...(msg.readBy || [msg.sender]), user.username])];
        msg.status = 'read';
      } else {
        return;
      }
      io.to(roomId).emit('message-read', { messageId, username: user.username, readBy: room.messages.find(m => m.id === messageId)?.readBy || [] });
    });

    socket.on('send-blob', ({ roomId, message }, ack) => {
      const user = getAuthedUser(socket);
      if (!user) { if (ack) ack({ error: 'Set a username first' }); return; }
      if (isRateLimited(socket, 'send-message')) { if (ack) ack({ error: 'Too many messages — slow down' }); return; }
      const room = rooms.get(roomId);
      if (!room || user.roomId !== roomId || !room.users.has(user.username) || room.bans?.has(user.username)) {
        if (ack) ack({ error: 'Join the room before sending messages' }); return;
      }
      const fullMessage = buildMessage({ ...message, roomId }, user, room, roomId);
      if (!fullMessage) { if (ack) ack({ error: 'Invalid message' }); return; }
      room.messages.push(fullMessage);
      if (room.messages.length > 2000) room.messages.shift();
      socket.to(roomId).emit('new-message', fullMessage);
      emitMessageActivity(io, roomId, room, fullMessage);
      if (ack) ack({ status: 'delivered', messageId: fullMessage.id, message: fullMessage });
    });

    socket.on('load-more-messages', ({ roomId, before, limit = 50 }, ack) => {
      const user = getAuthedUser(socket);
      const room = rooms.get(roomId);
      if (isRateLimited(socket, 'load-more-messages')) { if (ack) ack({ error: 'Too many requests — slow down' }); return; }
      if (!user || !room || (!room.members?.has(user.username) && !room.users.has(user.username))) {
        if (ack) ack({ error: 'Room not found or unavailable' }); return;
      }
      const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 100));
      const cutoff = Number(before) || Date.now();
      const older = room.messages.filter(message => message.timestamp < cutoff);
      const page = older.slice(-safeLimit);
      if (ack) ack({ messages: page, hasMore: older.length > page.length });
    });

    socket.on('message-context', ({ roomId, messageId, limit = 100 }, ack) => {
      const user = getAuthedUser(socket);
      const room = rooms.get(roomId);
      if (isRateLimited(socket, 'message-context')) { if (ack) ack({ error: 'Too many requests — slow down' }); return; }
      const allowed = room && (room.isDM ? room.dmUsers?.includes(user?.username) : room.members?.has(user?.username));
      if (!user || !allowed || typeof messageId !== 'string') { if (ack) ack({ error: 'Message is unavailable' }); return; }
      const index = room.messages.findIndex(message => message.id === messageId && !message.deleted);
      if (index < 0) { if (ack) ack({ error: 'Message is unavailable' }); return; }
      const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 100));
      const start = Math.max(0, index - Math.floor(safeLimit / 2));
      if (ack) ack({ messages: room.messages.slice(start, start + safeLimit), found: true });
    });

    socket.on('global-search', ({ query }, ack) => {
      const user = getAuthedUser(socket);
      if (!user) { if (ack) ack({ error: 'Set a username first' }); return; }
      if (isRateLimited(socket, 'global-search')) { if (ack) ack({ error: 'Too many searches — slow down' }); return; }
      const term = typeof query === 'string' ? query.trim().toLowerCase().slice(0, 200) : '';
      if (term.length < 2) { if (ack) ack({ results: [] }); return; }
      const results = [];
      for (const [roomId, room] of rooms) {
        const allowed = room.isDM ? room.dmUsers?.includes(user.username) : room.members?.has(user.username);
        if (!allowed) continue;
        for (const message of room.messages) {
          if (message.deleted || typeof message.content !== 'string' || !message.content.toLowerCase().includes(term)) continue;
          results.push({ ...message, roomId, roomName: room.name, isDM: !!room.isDM });
        }
      }
      results.sort((a, b) => b.timestamp - a.timestamp);
      if (ack) ack({ results: results.slice(0, 100) });
    });

    socket.on('forward-message', ({ sourceRoomId, messageId, targetRoomId }, ack) => {
      const user = getAuthedUser(socket);
      if (!user) { if (ack) ack({ error: 'Set a username first' }); return; }
      if (isRateLimited(socket, 'forward-message')) { if (ack) ack({ error: 'Too many forwards — slow down' }); return; }
      const source = rooms.get(sourceRoomId);
      const target = rooms.get(targetRoomId);
      const original = source?.messages.find(message => message.id === messageId && !message.deleted);
      const targetAllowed = target && (target.isDM ? target.dmUsers?.includes(user.username) : target.members?.has(user.username));
      const sourceAllowed = source && (source.isDM ? source.dmUsers?.includes(user.username) : source.members?.has(user.username));
      if (!original || !sourceAllowed || !targetAllowed) { if (ack) ack({ error: 'Message or destination is unavailable' }); return; }
      const forwarded = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        roomId: targetRoomId, sender: user.username, type: original.type,
        content: original.content, fileName: original.fileName, fileSize: original.fileSize,
        timestamp: Date.now(), status: 'delivered', readBy: [user.username],
        forwardedFrom: { sender: original.sender, roomName: source.name, messageId: original.id },
      };
      target.messages.push(forwarded);
      io.to(targetRoomId).emit('new-message', forwarded);
      emitMessageActivity(io, targetRoomId, target, forwarded);
      if (ack) ack({ status: 'ok', message: forwarded });
    });

    socket.on('manage-room', ({ roomId, action, targetUser, value }, ack) => {
      const user = getAuthedUser(socket);
      const room = rooms.get(roomId);
      const reject = message => { if (ack) ack({ error: message }); };
      if (!user || !room || room.isDM) { reject('Room not found'); return; }
      if (isRateLimited(socket, 'manage-room')) { reject('Too many room changes — slow down'); return; }
      const role = room.roles?.[user.username];
      if (action === 'update-description') {
        if (!canModerate(room, user.username)) { reject('Moderator permission required'); return; }
        room.description = typeof value === 'string' ? value.trim().slice(0, 280) : '';
      } else if (action === 'set-role') {
        if (!canAdminister(room, user.username) || role !== 'owner' && value === 'admin') { reject('Administrator permission required'); return; }
        if (!room.members?.has(targetUser) || targetUser === room.owner || !['member', 'mod', 'admin'].includes(value)) { reject('Invalid role change'); return; }
        room.roles[targetUser] = value;
      } else if (action === 'kick' || action === 'ban') {
        const rank = { member: 0, mod: 1, admin: 2, owner: 3 };
        const targetRole = room.roles?.[targetUser] || 'member';
        if (!canModerate(room, user.username) || targetUser === room.owner || rank[role] <= rank[targetRole]) { reject('You cannot moderate this member'); return; }
        if (action === 'ban') room.bans.add(targetUser);
        room.users.delete(targetUser);
        room.members.delete(targetUser);
        delete room.roles[targetUser];
        for (const socketId of findUserSockets(targetUser)) {
          const target = users.get(socketId);
          if (target?.roomId === roomId) {
            io.to(socketId).emit('room-removed', { roomId, reason: action === 'ban' ? 'You were banned from the room' : 'You were removed from the room' });
            io.sockets.sockets.get(socketId)?.leave(roomId);
            users.set(socketId, { ...target, roomId: null });
          }
        }
      } else if (action === 'transfer-owner') {
        if (role !== 'owner' || !room.members?.has(targetUser) || targetUser === user.username) { reject('Only the owner can transfer ownership'); return; }
        room.roles[user.username] = 'admin'; room.roles[targetUser] = 'owner'; room.owner = targetUser;
      } else if (action === 'delete-room') {
        if (role !== 'owner') { reject('Only the owner can delete the room'); return; }
        io.to(roomId).emit('room-removed', { roomId, reason: 'This room was deleted' });
        for (const [socketId, entry] of users) if (entry.roomId === roomId) users.set(socketId, { ...entry, roomId: null });
        rooms.delete(roomId); cancelRoomReap(roomId); emitRoomLists(io);
        if (ack) ack({ status: 'ok' }); return;
      } else { reject('Unknown room action'); return; }
      io.to(roomId).emit('room-settings-updated', getRoomPublicInfo(roomId));
      io.to(roomId).emit('room-users', getRoomPublicInfo(roomId));
      emitRoomLists(io);
      if (ack) ack({ status: 'ok', room: getRoomPublicInfo(roomId) });
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
      if (!msg || msg.deleted || msg.sender !== user.username) { if (ack) ack({ error: 'You can only edit your own messages' }); return; }
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
          members: new Set([fromUser, toUser]),
          messages: [],
          pinnedMessages: [],
          isDM: true,
          dmUsers: [fromUser, toUser],
          roles: { [fromUser]: 'member', [toUser]: 'member' },
          bans: new Set(),
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
          if (!room.isDM) emitRoomLists(io);
        }
      }
      users.delete(socket.id);
      console.log('Client disconnected:', socket.id);
    });
  });

  const PORT = process.env.PORT || 3000;
  httpServer.listen(PORT, () => console.log(`> Ready on http://localhost:${PORT}`));
});
