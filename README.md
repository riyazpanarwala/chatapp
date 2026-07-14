# FluxChat

FluxChat is a real-time, offline-first chat application built with Next.js 16, React 19, Socket.IO, and IndexedDB. It supports public and password-protected rooms, direct messages, rich message interactions, media sharing, moderation tools, and browser-based offline delivery.

The application uses a custom Node.js server and does not require a database. Server state is held in memory, while each browser caches messages and pending sends in IndexedDB.

## Features

### Conversations

- Real-time rooms and one-to-one direct messages
- Optional room passwords
- Online presence, typing indicators, and per-conversation unread badges
- Per-user read receipts
- Paginated message history with older-message loading
- Search within the current conversation or across every joined room and DM
- Browser-side offline queue with automatic resend after reconnection
- Automatic restoration of the last room used by each locally saved username

### Messages and media

- Text messages with emoji and `@user` autocomplete
- `@everyone` and `@here` room notifications
- Quote replies and forwarding to joined rooms or DMs
- Message editing, deletion, reactions, and up to five pinned messages per conversation
- Basic URL preview cards
- Image and document attachments
- Voice messages recorded with the MediaRecorder API
- Screen captures created with `getDisplayMedia`
- Video-call invitations through the hosted WebRTC companion app; invitations expire after five minutes

### Rooms and profiles

- Profile-picture uploads and avatars throughout the interface
- Room descriptions and persistent membership for the lifetime of the server process
- Owner, administrator, moderator, and member roles
- Role changes, kick/ban controls, ownership transfer, and room deletion
- Responsive desktop and mobile layout

### Server safeguards

- Server-derived sender identity for message and room operations
- Membership checks for message history, search, forwarding, and direct messages
- Per-socket rate limits for frequently used Socket.IO events
- Restricted Socket.IO origins in production
- Upload extension/MIME validation, randomized filenames, and hardened response headers

## Requirements

- Node.js 24.11.1 (the version in `.node-version`) or a compatible current Node.js release
- npm
- A modern browser with IndexedDB and WebSocket support
- Microphone or screen-capture permission for voice messages and screenshots

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Choose a username, create or join a room, and open a second browser window to test real-time messaging.

## Production

Build the Next.js application first, then run the custom server:

```bash
npm run build
ALLOWED_ORIGIN=https://chat.example.com npm start
```

`ALLOWED_ORIGIN` accepts a comma-separated list when more than one public origin is required:

```bash
ALLOWED_ORIGIN=https://chat.example.com,https://www.chat.example.com npm start
```

In PowerShell, set the variables explicitly because the current `npm start` script uses POSIX environment-variable syntax:

```powershell
npm run build
$env:NODE_ENV = 'production'
$env:ALLOWED_ORIGIN = 'https://chat.example.com'
node server.js
```

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP and Socket.IO port |
| `NODE_ENV` | Development unless set to `production` | Selects the Next.js/server runtime mode |
| `ALLOWED_ORIGIN` | Localhost origins in development; none in production | Comma-separated Socket.IO CORS allowlist |

Use a persistent writable filesystem if attachments must survive deployments. Uploaded files are written to `public/uploads` on the application host.

## npm scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the custom Next.js and Socket.IO server in development mode |
| `npm run build` | Create a production Next.js build |
| `npm start` | Start the custom server with `NODE_ENV=production` on POSIX-compatible shells |
| `npm run lint` | Run the configured lint command |

## Architecture

```text
Browser
  |- React UI and useChat state
  |- Socket.IO client
  `- IndexedDB message cache and pending queue
          |
          | WebSocket / HTTP polling
          v
Custom Node.js server (server.js)
  |- Next.js request handler
  |- Socket.IO event handlers
  |- In-memory users, profiles, rooms, memberships, and messages
  `- Upload API -> public/uploads
```

### Message delivery

1. A new message is saved to IndexedDB with `pending` status.
2. When connected, the client sends it through Socket.IO and waits for an acknowledgement.
3. The server validates the current socket and room membership, stores the message in memory, and broadcasts it.
4. The acknowledgement changes the local status to `delivered`.
5. Other members emit read events, allowing the sender to see who has read the message.
6. If the browser is offline, pending messages remain in IndexedDB and are sent in order after reconnection.

Each room keeps at most 2,000 messages in server memory. Joining initially returns the newest 100, and older messages load in pages of 50. Empty rooms are eligible for cleanup after a ten-minute grace period when they no longer have active users or members.

### Uploads

The upload endpoint accepts up to five files per request and limits each file to 10 MB. Supported extensions are:

```text
jpg, jpeg, png, gif, webp,
pdf, txt, csv, zip,
doc, docx, xls, xlsx, ppt, pptx
```

The current interface uploads selected attachments one at a time. Profile pictures use a dedicated avatar endpoint and are restricted to images no larger than 5 MB by both the client and server.

## Project structure

```text
chatapp/
|- server.js                     # Custom HTTP, Next.js, and Socket.IO server
|- app/
|  |- layout.js                  # Root metadata and document layout
|  |- page.js                    # Main chat screen and modal orchestration
|  |- globals.css                # Application design system and responsive styles
|  |- api/avatar/route.js        # Image-only profile upload endpoint
|  `- api/upload/route.js        # Validated local-file upload endpoint
|- components/
|  |- GlobalSearch.js            # Cross-conversation search dialog
|  |- InputBar.js                # Text, mention, media, and call composer
|  |- MessageList.js             # Message rendering and interaction menus
|  |- RoomSettings.js            # Roles, moderation, description, and deletion
|  |- Sidebar.js                 # Rooms, members, DMs, avatars, and unread counts
|  |- UsernameScreen.js          # Local username setup
|  `- VideoCallNotification.js   # Video-call invitation card and expiry timer
`- lib/
   |- icons.js                   # Shared SVG icon components
   |- indexedDB.js               # Local message cache and pending-message storage
   |- socket.js                  # Socket.IO client, event bridge, and offline sync
   `- useChat.js                 # Central chat state and actions hook
```

## Current limitations

- Rooms, users, profiles, roles, bans, pinned messages, and message history are stored only in server memory and are lost whenever the server restarts.
- Uploaded files are stored on the local filesystem and may disappear on ephemeral or serverless hosting.
- Usernames are locally remembered but are not accounts. There is no password-based authentication, session authorization, or durable identity ownership.
- Room passwords are kept as plain values in server memory; they are access gates, not a replacement for authentication.
- Messages are not end-to-end encrypted. Use HTTPS/WSS in production to protect traffic in transit.
- The built-in rate limiter is per socket and in memory, so multi-instance deployments need shared persistence and a distributed rate limiter.
- The video-call button opens an external hosted WebRTC application rather than running calls inside this codebase.

For a durable multi-user deployment, add authenticated accounts, a persistent database, object storage, shared rate limiting, and a cleanup policy for uploaded files.
