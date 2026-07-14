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
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);
  const [error, setError] = useState('');

  // New feature state
  const [pinnedMessages, setPinnedMessages] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [notifications, setNotifications] = useState([]); // mention notifications
  const [dmList, setDmList] = useState([]); // list of DM rooms user has opened
  const [searchQuery, setSearchQuery] = useState('');
  const [unreadCounts, setUnreadCounts] = useState({});
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [globalSearchResults, setGlobalSearchResults] = useState([]);
  const [isGlobalSearching, setIsGlobalSearching] = useState(false);
  const [avatar, setAvatar] = useState('');

  const typingTimer = useRef(null);
  const typingRoomRef = useRef(null);
  const currentRoomRef = useRef(null);
  const restoredRoomForUserRef = useRef(null);

  useEffect(() => { currentRoomRef.current = currentRoom; }, [currentRoom]);

  const initUsername = useCallback((name) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('chat_username', name);
    setUsernameState(name);
    const savedAvatar = localStorage.getItem(`chat_avatar:${name}`) || '';
    setAvatar(savedAvatar);
    const sock = socketClient.initSocket(name, savedAvatar);
    sock.emit('set-username', { username: name, avatar: savedAvatar });
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
        const activeUsername = localStorage.getItem('chat_username');
        if (activeUsername && restoredRoomForUserRef.current !== activeUsername) {
          restoredRoomForUserRef.current = activeUsername;
          const savedRoomId = localStorage.getItem(`chat_last_room:${activeUsername}`);
          if (savedRoomId) {
            setIsJoiningRoom(true);
            socketClient.joinRoom(savedRoomId, '');
          }
        }
      }),
      socketClient.on('rooms-list', setRooms),
      socketClient.on('rooms-updated', setRooms),
      socketClient.on('room-created', () => socketClient.getRooms()),
      socketClient.on('room-error', ({ message }) => {
        setIsJoiningRoom(false);
        setError(message);
      }),

      socketClient.on('joined-room', async ({ roomId, name, description, role, messages: serverMsgs, users, pinnedMessages: pinned, isDM, hasMore }) => {
        const nextRoom = { id: roomId, name, description: description || '', role: role || users?.myRole || 'member', isDM: !!isDM };
        setCurrentRoom(nextRoom);
        currentRoomRef.current = nextRoom;
        const activeUsername = localStorage.getItem('chat_username');
        if (activeUsername) localStorage.setItem(`chat_last_room:${activeUsername}`, roomId);
        setRoomUsers(users?.users || []);
        setPinnedMessages(pinned || []);
        setHasMoreMessages(!!hasMore);
        setUnreadCounts(prev => ({ ...prev, [roomId]: 0 }));

        const localMsgs = await getMessages(roomId);
        const merged = mergeMessages(localMsgs, serverMsgs || []);
        setMessages(merged);
        setIsJoiningRoom(false);

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

      socketClient.on('message-read', ({ messageId, readBy }) => {
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, status: 'read', readBy: readBy || m.readBy || [] } : m));
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
        socketClient.joinRoom(roomId, '');
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
      socketClient.on('room-activity', ({ roomId, isDM, from }) => {
        if (roomId !== currentRoomRef.current?.id) {
          setUnreadCounts(prev => ({ ...prev, [roomId]: (prev[roomId] || 0) + 1 }));
        }
        if (isDM) {
          setDmList(prev => prev.some(item => item.roomId === roomId) ? prev : [...prev, { roomId, with: from }]);
        }
      }),
      socketClient.on('room-settings-updated', (info) => {
        if (!info?.id || info.id !== currentRoomRef.current?.id) return;
        const me = info.users?.find(user => user.username === localStorage.getItem('chat_username'));
        setCurrentRoom(prev => prev ? { ...prev, name: info.name, description: info.description || '', role: me?.role || prev.role } : prev);
      }),
      socketClient.on('room-removed', ({ roomId, reason }) => {
        if (currentRoomRef.current?.id === roomId) {
          currentRoomRef.current = null;
          setCurrentRoom(null); setMessages([]); setRoomUsers([]); setPinnedMessages([]);
        }
        setRooms(prev => prev.filter(room => room.id !== roomId));
        setDmList(prev => prev.filter(room => room.roomId !== roomId));
        setError(reason || 'Room is no longer available');
      }),
    ];

    return () => unsubscribers.forEach(u => u());
  }, [initUsername]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const joinRoom = useCallback((roomId, password = '') => {
    setError('');
    setSearchQuery('');
    setIsJoiningRoom(true);
    // Identity is established server-side via set-username; we only need
    // to tell the server which room to join, not who "we" are.
    socketClient.joinRoom(roomId, password);
  }, []);

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
    if (typingRoomRef.current) {
      socketClient.sendStopTyping(typingRoomRef.current);
      typingRoomRef.current = null;
      clearTimeout(typingTimer.current);
    }
    setMessages(prev => [...prev, message]);
    const result = await socketClient.sendMessage(message);
    if (result?.error) setError(result.error);
  }, [currentRoom, username]);

  const handleTyping = useCallback(() => {
    if (!currentRoom) return;
    if (typingRoomRef.current !== currentRoom.id) {
      if (typingRoomRef.current) socketClient.sendStopTyping(typingRoomRef.current);
      typingRoomRef.current = currentRoom.id;
      socketClient.sendTyping(currentRoom.id);
    }
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      if (typingRoomRef.current) socketClient.sendStopTyping(typingRoomRef.current);
      typingRoomRef.current = null;
    }, 2000);
  }, [currentRoom]);

  const leaveRoom = useCallback(() => {
    if (typingRoomRef.current) {
      socketClient.sendStopTyping(typingRoomRef.current);
      typingRoomRef.current = null;
      clearTimeout(typingTimer.current);
    }
    if (currentRoom) socketClient.leaveRoom(currentRoom.id);
    setCurrentRoom(null);
    setMessages([]);
    setRoomUsers([]);
    setTypingUsers([]);
    setPinnedMessages([]);
    setSearchQuery('');
    setIsJoiningRoom(false);
    if (username && typeof window !== 'undefined') {
      localStorage.removeItem(`chat_last_room:${username}`);
    }
  }, [currentRoom, username]);

  const editMessage = useCallback(async (messageId, newContent) => {
    if (!currentRoom) return;
    const result = await socketClient.editMessage(currentRoom.id, messageId, newContent);
    if (result?.error) setError(result.error);
  }, [currentRoom]);

  const deleteMessage = useCallback(async (messageId) => {
    if (!currentRoom) return;
    const result = await socketClient.deleteMessage(currentRoom.id, messageId);
    if (result?.error) setError(result.error);
  }, [currentRoom]);

  const markMessageRead = useCallback((messageId) => {
    if (!currentRoom) return;
    socketClient.markRead(currentRoom.id, messageId);
  }, [currentRoom]);

  const loadMoreMessages = useCallback(async () => {
    if (!currentRoom || !hasMoreMessages || isLoadingOlder || messages.length === 0) return;
    setIsLoadingOlder(true);
    const result = await socketClient.loadMoreMessages(currentRoom.id, messages[0].timestamp, 50);
    if (result?.error) setError(result.error);
    else {
      setMessages(prev => mergeMessages(result.messages || [], prev));
      setHasMoreMessages(!!result.hasMore);
      for (const message of result.messages || []) await saveMessage(message);
    }
    setIsLoadingOlder(false);
  }, [currentRoom, hasMoreMessages, isLoadingOlder, messages]);

  const toggleReaction = useCallback((messageId, emoji) => {
    if (!currentRoom) return;
    socketClient.toggleReaction(currentRoom.id, messageId, emoji);
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
    socketClient.pinMessage(currentRoom.id, messageId);
  }, [currentRoom]);

  const openDM = useCallback((toUser) => {
    if (!username || toUser === username) return;
    socketClient.openDM(toUser);
  }, [username]);

  const searchAllMessages = useCallback(async (query) => {
    const term = query.trim();
    if (term.length < 2) { setGlobalSearchResults([]); return; }
    setIsGlobalSearching(true);
    const result = await socketClient.globalSearch(term);
    setIsGlobalSearching(false);
    if (result?.error) setError(result.error);
    else setGlobalSearchResults(result.results || []);
  }, []);

  const forwardMessage = useCallback(async (messageId, targetRoomId) => {
    if (!currentRoom) return { error: 'No room selected' };
    const result = await socketClient.forwardMessage(currentRoom.id, messageId, targetRoomId);
    if (result?.error) setError(result.error);
    return result;
  }, [currentRoom]);

  const manageRoom = useCallback(async (action, targetUser, value) => {
    if (!currentRoom) return { error: 'No room selected' };
    const result = await socketClient.manageRoom(currentRoom.id, action, targetUser, value);
    if (result?.error) setError(result.error);
    return result;
  }, [currentRoom]);

  const updateAvatar = useCallback(async (url) => {
    const result = await socketClient.updateProfile(url);
    if (result?.error) setError(result.error);
    else {
      setAvatar(url);
      localStorage.setItem(`chat_avatar:${username}`, url);
    }
    return result;
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
    isOnline, isConnected, isJoiningRoom, error, setError,
    pinnedMessages,
    onlineUsers,
    notifications, dismissNotification,
    dmList,
    unreadCounts,
    searchQuery, setSearchQuery,
    globalSearchResults, isGlobalSearching, searchAllMessages,
    hasMoreMessages, isLoadingOlder, loadMoreMessages,
    avatar, updateAvatar,
    joinRoom, createRoom, sendMessage, handleTyping, leaveRoom,
    editMessage, deleteMessage, markMessageRead, toggleReaction, pinMessage,
    openDM, refreshOnlineUsers, forwardMessage, manageRoom,
  };
}

function mergeMessages(local, server) {
  const map = new Map();
  [...local, ...server].forEach(m => map.set(m.id, m));
  return [...map.values()].sort((a, b) => a.timestamp - b.timestamp);
}
