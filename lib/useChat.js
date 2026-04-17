'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import * as socketClient from '../lib/socket';
import { getMessages, saveMessage, messageExists } from '../lib/indexedDB';

export function useChat() {
  const [username, setUsernameState] = useState('');
  const [rooms, setRooms] = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [roomUsers, setRoomUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [isOnline, setIsOnline] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState('');

  // New feature state
  const [pinnedMessages, setPinnedMessages] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [notifications, setNotifications] = useState([]); // mention notifications
  const [dmList, setDmList] = useState([]); // list of DM rooms user has opened
  const [searchQuery, setSearchQuery] = useState('');

  const typingTimer = useRef(null);
  const currentRoomRef = useRef(null);

  useEffect(() => { currentRoomRef.current = currentRoom; }, [currentRoom]);

  const initUsername = useCallback((name) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('chat_username', name);
    setUsernameState(name);
    const sock = socketClient.initSocket(name);
    sock.emit('set-username', { username: name });
    socketClient.getRooms();
    socketClient.getOnlineUsers();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem('chat_username');
    if (saved) initUsername(saved);

    const unsubscribers = [
      socketClient.on('connection-change', ({ online }) => {
        setIsOnline(online);
        setIsConnected(online);
      }),
      socketClient.on('username-set', () => {
        setIsConnected(true);
        socketClient.getRooms();
        socketClient.getOnlineUsers();
      }),
      socketClient.on('rooms-list', setRooms),
      socketClient.on('rooms-updated', setRooms),
      socketClient.on('room-created', () => socketClient.getRooms()),
      socketClient.on('room-error', ({ message }) => setError(message)),

      socketClient.on('joined-room', async ({ roomId, name, messages: serverMsgs, users, pinnedMessages: pinned, isDM }) => {
        setCurrentRoom({ id: roomId, name, isDM: !!isDM });
        setRoomUsers(users?.users || []);
        setPinnedMessages(pinned || []);

        const localMsgs = await getMessages(roomId);
        const merged = mergeMessages(localMsgs, serverMsgs || []);
        setMessages(merged);

        for (const m of serverMsgs || []) {
          const exists = await messageExists(m.id);
          if (!exists) await saveMessage(m);
        }
      }),

      socketClient.on('new-message', async (msg) => {
        if (msg.roomId !== currentRoomRef.current?.id) return;
        const exists = await messageExists(msg.id);
        if (!exists) await saveMessage(msg);
        setMessages(prev => {
          if (prev.find(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }),

      socketClient.on('message-status-update', ({ messageId, status }) => {
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, status } : m));
      }),

      socketClient.on('room-users', (info) => {
        if (info?.users) setRoomUsers(info.users);
      }),

      socketClient.on('user-typing', ({ username: u }) => {
        setTypingUsers(prev => prev.includes(u) ? prev : [...prev, u]);
      }),
      socketClient.on('user-stop-typing', ({ username: u }) => {
        setTypingUsers(prev => prev.filter(x => x !== u));
      }),

      socketClient.on('message-read', ({ messageId }) => {
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, status: 'read' } : m));
      }),

      socketClient.on('user-left', ({ username: u }) => {
        setRoomUsers(prev => prev.map(x => x.username === u ? { ...x, online: false } : x));
        setOnlineUsers(prev => prev.filter(x => x !== u));
      }),

      socketClient.on('user-joined', ({ username: u }) => {
        setRoomUsers(prev => {
          if (prev.find(x => x.username === u)) return prev.map(x => x.username === u ? { ...x, online: true } : x);
          return [...prev, { username: u, online: true }];
        });
      }),

      // ── Edit ─────────────────────────────────────────────────────────────
      socketClient.on('message-edited', ({ messageId, newContent, editedAt }) => {
        setMessages(prev => prev.map(m =>
          m.id === messageId ? { ...m, content: newContent, edited: true, editedAt } : m
        ));
      }),

      // ── Delete ───────────────────────────────────────────────────────────
      socketClient.on('message-deleted', ({ messageId }) => {
        setMessages(prev => prev.map(m =>
          m.id === messageId ? { ...m, deleted: true, content: '', type: 'deleted' } : m
        ));
        setPinnedMessages(prev => prev.filter(p => p.id !== messageId));
      }),

      // ── Reactions ────────────────────────────────────────────────────────
      socketClient.on('reaction-updated', ({ messageId, reactions }) => {
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions } : m));
      }),

      // ── Pin ──────────────────────────────────────────────────────────────
      socketClient.on('pinned-messages-updated', ({ pinnedMessages: pinned }) => {
        setPinnedMessages(pinned || []);
      }),

      // ── DM ───────────────────────────────────────────────────────────────
      socketClient.on('dm-room-ready', ({ roomId, toUser }) => {
        setDmList(prev => {
          if (prev.find(d => d.roomId === roomId)) return prev;
          return [...prev, { roomId, with: toUser }];
        });
        // Auto-join the DM room
        socketClient.joinRoom(roomId, localStorage.getItem('chat_username') || '', '');
      }),

      socketClient.on('dm-invite', ({ fromUser, roomId }) => {
        setDmList(prev => {
          if (prev.find(d => d.roomId === roomId)) return prev;
          return [...prev, { roomId, with: fromUser }];
        });
        // Show notification
        setNotifications(prev => [...prev, {
          id: uuidv4(),
          type: 'dm',
          from: fromUser,
          roomId,
          text: `${fromUser} wants to chat directly`,
          at: Date.now(),
        }]);
      }),

      // ── Online users ─────────────────────────────────────────────────────
      socketClient.on('online-users', (users) => {
        setOnlineUsers(users || []);
      }),

      // ── Mention notifications ─────────────────────────────────────────────
      socketClient.on('mention-notification', ({ from, roomId, roomName, preview, messageId }) => {
        setNotifications(prev => [...prev, {
          id: uuidv4(),
          type: 'mention',
          from,
          roomId,
          roomName,
          preview,
          messageId,
          at: Date.now(),
        }]);
      }),
    ];

    return () => unsubscribers.forEach(u => u());
  }, [initUsername]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const joinRoom = useCallback((roomId, password = '') => {
    setError('');
    setSearchQuery('');
    const u = localStorage.getItem('chat_username') || username;
    socketClient.joinRoom(roomId, u, password);
  }, [username]);

  const createRoom = useCallback((name, password = '') => {
    const roomId = name.toLowerCase().replace(/\s+/g, '-') + '-' + uuidv4().slice(0, 6);
    socketClient.createRoom(roomId, name, password);
  }, []);

  const sendMessage = useCallback(async (content, type = 'text', extra = {}) => {
    if (!currentRoom || !username) return;
    const message = {
      id: uuidv4(),
      roomId: currentRoom.id,
      sender: username,
      type,
      content,
      timestamp: Date.now(),
      status: 'pending',
      ...extra,
    };
    setMessages(prev => [...prev, message]);
    await socketClient.sendMessage(message);
  }, [currentRoom, username]);

  const handleTyping = useCallback(() => {
    if (!currentRoom) return;
    socketClient.sendTyping(currentRoom.id, username);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socketClient.sendStopTyping(currentRoom.id, username);
    }, 2000);
  }, [currentRoom, username]);

  const leaveRoom = useCallback(() => {
    if (currentRoom) socketClient.leaveRoom(currentRoom.id);
    setCurrentRoom(null);
    setMessages([]);
    setRoomUsers([]);
    setTypingUsers([]);
    setPinnedMessages([]);
    setSearchQuery('');
  }, [currentRoom]);

  const editMessage = useCallback((messageId, newContent) => {
    if (!currentRoom) return;
    socketClient.editMessage(currentRoom.id, messageId, newContent, username);
    setMessages(prev => prev.map(m =>
      m.id === messageId ? { ...m, content: newContent, edited: true, editedAt: Date.now() } : m
    ));
  }, [currentRoom, username]);

  const deleteMessage = useCallback((messageId) => {
    if (!currentRoom) return;
    socketClient.deleteMessage(currentRoom.id, messageId, username);
    setMessages(prev => prev.map(m =>
      m.id === messageId ? { ...m, deleted: true, content: '', type: 'deleted' } : m
    ));
    setPinnedMessages(prev => prev.filter(p => p.id !== messageId));
  }, [currentRoom, username]);

  const toggleReaction = useCallback((messageId, emoji) => {
    if (!currentRoom) return;
    socketClient.toggleReaction(currentRoom.id, messageId, emoji, username);
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m;
      const reactions = { ...(m.reactions || {}) };
      if (!reactions[emoji]) reactions[emoji] = [];
      const idx = reactions[emoji].indexOf(username);
      if (idx === -1) reactions[emoji] = [...reactions[emoji], username];
      else {
        reactions[emoji] = reactions[emoji].filter(u => u !== username);
        if (reactions[emoji].length === 0) delete reactions[emoji];
      }
      return { ...m, reactions };
    }));
  }, [currentRoom, username]);

  const pinMessage = useCallback((messageId) => {
    if (!currentRoom) return;
    socketClient.pinMessage(currentRoom.id, messageId, username);
  }, [currentRoom, username]);

  const openDM = useCallback((toUser) => {
    if (!username || toUser === username) return;
    socketClient.openDM(username, toUser);
  }, [username]);

  const dismissNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const refreshOnlineUsers = useCallback(() => {
    socketClient.getOnlineUsers();
  }, []);

  // Filtered messages for search
  const filteredMessages = searchQuery.trim()
    ? messages.filter(m =>
        !m.deleted &&
        m.type === 'text' &&
        m.content?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : messages;

  return {
    username, initUsername,
    rooms, currentRoom,
    messages: filteredMessages,
    allMessages: messages,
    roomUsers, typingUsers,
    isOnline, isConnected, error, setError,
    pinnedMessages,
    onlineUsers,
    notifications, dismissNotification,
    dmList,
    searchQuery, setSearchQuery,
    joinRoom, createRoom, sendMessage, handleTyping, leaveRoom,
    editMessage, deleteMessage, toggleReaction, pinMessage,
    openDM, refreshOnlineUsers,
  };
}

function mergeMessages(local, server) {
  const map = new Map();
  [...local, ...server].forEach(m => map.set(m.id, m));
  return [...map.values()].sort((a, b) => a.timestamp - b.timestamp);
}
