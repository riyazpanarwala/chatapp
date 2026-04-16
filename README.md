# ⚡ FluxChat — Production-Ready Offline-First Real-Time Chat

A modern, fully-featured chat application built with Next.js 16, React 19, Socket.IO 4.8, and IndexedDB. Zero database dependencies — runs entirely in memory on the server.

## 🚀 Quick Start

```bash
npm install
npm run dev          # Development → http://localhost:3000
npm run build && npm start   # Production
```

## 📁 Project Structure

```
chatapp/
├── server.js                  # Custom Node.js + Socket.IO server (entry point)
├── app/
│   ├── layout.js              # Root layout
│   ├── page.js                # Main chat page (orchestrator)
│   ├── globals.css            # Full design system (dark theme)
│   └── api/upload/route.js    # File upload REST endpoint
├── lib/
│   ├── socket.js              # Socket client + offline queue + auto-sync
│   ├── indexedDB.js           # IndexedDB CRUD utility module
│   └── useChat.js             # Central React hook (all chat state)
└── components/
    ├── Sidebar.js             # Rooms list, user list, create room
    ├── MessageList.js         # Scrollable message bubbles with status icons
    ├── InputBar.js            # Text / emoji / file / voice / screenshot input
    └── UsernameScreen.js      # First-run username setup screen
```

## 🏗️ Architecture

### Server (server.js)
Custom Node.js HTTP server wraps Next.js and mounts Socket.IO on the same port. All state lives in two in-memory Maps — no database required:

- `users` Map: socketId → { username, roomId }
- `rooms` Map: roomId → { name, password, users: Set, messages[] }

Messages are capped at 500/room to prevent memory growth.

### Offline-First Flow
1. User sends message → saved to IndexedDB as `pending` immediately
2. If online: emitted via Socket.IO with ACK callback → status updated to `delivered`
3. If offline: stays as `pending` with visual indicator (⏳, reduced opacity)
4. On reconnect: `syncPendingMessages()` reads all pending from IndexedDB, sends in order, updates statuses

### Message Lifecycle
pending → sent → delivered → read

### Socket Events
- C→S: set-username, get-rooms, create-room, join-room, leave-room, send-message, typing, stop-typing, read-message
- S→C: new-message, user-joined, user-left, room-users, user-typing, message-read, rooms-updated

## ⚙️ Features
- Real-time multi-user chat with Socket.IO rooms
- Password-protected private rooms
- Online/offline user presence indicators
- Typing indicators with debounce
- Read receipts (pending/sent/delivered/read)
- Full offline support with IndexedDB + auto-sync
- Image & file upload (POST /api/upload)
- Voice messages (MediaRecorder API)
- Screenshot sharing (getDisplayMedia)
- Emoji picker (emoji-picker-react)
- Mobile-responsive layout
