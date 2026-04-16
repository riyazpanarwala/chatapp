const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

// In-memory store
const users = new Map();   // socketId -> { username, roomId, avatar }
const rooms = new Map();   // roomId -> { name, password, users: Set, messages: [] }

function getRoomPublicInfo(roomId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  return {
    id: roomId,
    name: room.name,
    hasPassword: !!room.password,
    userCount: room.users.size,
    users: [...room.users].map(uid => {
      const u = [...users.values()].find(u => u.username === uid);
      return { username: uid, online: !!u };
    }),
  };
}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    // Handle file uploads
    if (req.method === 'POST' && req.url.startsWith('/api/upload')) {
      const uploadDir = path.join(process.cwd(), 'public', 'uploads');
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

      let body = [];
      req.on('data', chunk => body.push(chunk));
      req.on('end', () => {
        try {
          const boundary = req.headers['content-type'].split('boundary=')[1];
          const buf = Buffer.concat(body);
          const parts = parseMulipart(buf, boundary);
          const results = [];
          parts.forEach(part => {
            if (part.filename) {
              const ext = path.extname(part.filename);
              const fname = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
              fs.writeFileSync(path.join(uploadDir, fname), part.data);
              results.push({ url: `/uploads/${fname}`, name: part.filename, size: part.data.length });
            }
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ files: results }));
        } catch (e) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    maxHttpBufferSize: 50e6, // 50MB
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Set username
    socket.on('set-username', ({ username }) => {
      users.set(socket.id, { username, roomId: null });
      socket.emit('username-set', { username });
    });

    // List rooms
    socket.on('get-rooms', () => {
      const roomList = [...rooms.entries()].map(([id, r]) => ({
        id, name: r.name, hasPassword: !!r.password, userCount: r.users.size
      }));
      socket.emit('rooms-list', roomList);
    });

    // Create room
    socket.on('create-room', ({ roomId, name, password }) => {
      if (rooms.has(roomId)) {
        socket.emit('room-error', { message: 'Room ID already exists' });
        return;
      }
      rooms.set(roomId, { name, password: password || null, users: new Set(), messages: [] });
      socket.emit('room-created', { roomId, name });
      io.emit('rooms-updated', [...rooms.entries()].map(([id, r]) => ({
        id, name: r.name, hasPassword: !!r.password, userCount: r.users.size
      })));
    });

    // Join room
    socket.on('join-room', ({ roomId, username, password }) => {
      const room = rooms.get(roomId);
      if (!room) { socket.emit('room-error', { message: 'Room not found' }); return; }
      if (room.password && room.password !== password) {
        socket.emit('room-error', { message: 'Incorrect password' }); return;
      }

      // Leave old room
      const user = users.get(socket.id);
      if (user && user.roomId) {
        const oldRoom = rooms.get(user.roomId);
        if (oldRoom) {
          oldRoom.users.delete(username);
          socket.leave(user.roomId);
          io.to(user.roomId).emit('user-left', { username, roomId: user.roomId });
          io.to(user.roomId).emit('room-users', getRoomPublicInfo(user.roomId));
        }
      }

      // Join new room
      socket.join(roomId);
      room.users.add(username);
      users.set(socket.id, { username, roomId });

      socket.emit('joined-room', {
        roomId,
        name: room.name,
        messages: room.messages.slice(-100),
        users: getRoomPublicInfo(roomId),
      });

      socket.to(roomId).emit('user-joined', { username, roomId });
      io.to(roomId).emit('room-users', getRoomPublicInfo(roomId));
    });

    // Leave room
    socket.on('leave-room', ({ roomId }) => {
      const user = users.get(socket.id);
      if (!user) return;
      const room = rooms.get(roomId);
      if (room) {
        room.users.delete(user.username);
        socket.leave(roomId);
        io.to(roomId).emit('user-left', { username: user.username, roomId });
        io.to(roomId).emit('room-users', getRoomPublicInfo(roomId));
      }
      users.set(socket.id, { ...user, roomId: null });
    });

    // Send message
    socket.on('send-message', (message, ack) => {
      const room = rooms.get(message.roomId);
      if (!room) { if (ack) ack({ error: 'Room not found' }); return; }

      const fullMessage = { ...message, status: 'delivered' };
      room.messages.push(fullMessage);
      if (room.messages.length > 500) room.messages.shift();

      socket.to(message.roomId).emit('new-message', fullMessage);
      if (ack) ack({ status: 'delivered', messageId: message.id });
    });

    // Typing
    socket.on('typing', ({ roomId, username }) => {
      socket.to(roomId).emit('user-typing', { username });
    });
    socket.on('stop-typing', ({ roomId, username }) => {
      socket.to(roomId).emit('user-stop-typing', { username });
    });

    // Read receipt
    socket.on('read-message', ({ roomId, messageId, username }) => {
      const room = rooms.get(roomId);
      if (room) {
        const msg = room.messages.find(m => m.id === messageId);
        if (msg) msg.status = 'read';
      }
      socket.to(roomId).emit('message-read', { messageId, username });
    });

    // File/blob message (binary)
    socket.on('send-blob', ({ roomId, message }) => {
      const room = rooms.get(roomId);
      if (!room) return;
      room.messages.push(message);
      io.to(roomId).emit('new-message', message);
    });

    // Disconnect
    socket.on('disconnect', () => {
      const user = users.get(socket.id);
      if (user && user.roomId) {
        const room = rooms.get(user.roomId);
        if (room) {
          room.users.delete(user.username);
          io.to(user.roomId).emit('user-left', { username: user.username });
          io.to(user.roomId).emit('room-users', getRoomPublicInfo(user.roomId));
        }
      }
      users.delete(socket.id);
      console.log('Client disconnected:', socket.id);
    });
  });

  const PORT = process.env.PORT || 3000;
  httpServer.listen(PORT, () => console.log(`> Ready on http://localhost:${PORT}`));
});

function parseMulipart(buffer, boundary) {
  const parts = [];
  const boundaryBuf = Buffer.from(`--${boundary}`);
  let start = 0;
  while (start < buffer.length) {
    const boundaryIdx = buffer.indexOf(boundaryBuf, start);
    if (boundaryIdx === -1) break;
    const headerStart = boundaryIdx + boundaryBuf.length + 2;
    const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), headerStart);
    if (headerEnd === -1) break;
    const headerStr = buffer.slice(headerStart, headerEnd).toString();
    const dataStart = headerEnd + 4;
    const nextBoundary = buffer.indexOf(boundaryBuf, dataStart);
    const dataEnd = nextBoundary === -1 ? buffer.length : nextBoundary - 2;
    const data = buffer.slice(dataStart, dataEnd);
    const nameMatch = headerStr.match(/name="([^"]+)"/);
    const filenameMatch = headerStr.match(/filename="([^"]+)"/);
    parts.push({ name: nameMatch?.[1], filename: filenameMatch?.[1], data });
    start = nextBoundary === -1 ? buffer.length : nextBoundary;
  }
  return parts;
}
