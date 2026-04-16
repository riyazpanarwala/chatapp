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
      }),
      socketClient.on('rooms-list', setRooms),
      socketClient.on('rooms-updated', setRooms),
      socketClient.on('room-created', () => socketClient.getRooms()),
      socketClient.on('room-error', ({ message }) => setError(message)),
      socketClient.on('joined-room', async ({ roomId, name, messages: serverMsgs, users }) => {
        setCurrentRoom({ id: roomId, name });
        setRoomUsers(users?.users || []);

        // Merge server messages with local IndexedDB
        const localMsgs = await getMessages(roomId);
        const merged = mergeMessages(localMsgs, serverMsgs || []);
        setMessages(merged);

        // Save server messages locally
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
      }),
      socketClient.on('user-joined', ({ username: u }) => {
        setRoomUsers(prev => {
          if (prev.find(x => x.username === u)) return prev.map(x => x.username === u ? { ...x, online: true } : x);
          return [...prev, { username: u, online: true }];
        });
      }),
    ];

    return () => unsubscribers.forEach(u => u());
  }, [initUsername]);

  const joinRoom = useCallback((roomId, password = '') => {
    setError('');
    socketClient.joinRoom(roomId, username, password);
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
  }, [currentRoom]);

  return {
    username, initUsername, rooms, currentRoom,
    messages, roomUsers, typingUsers,
    isOnline, isConnected, error, setError,
    joinRoom, createRoom, sendMessage, handleTyping, leaveRoom,
  };
}

function mergeMessages(local, server) {
  const map = new Map();
  [...local, ...server].forEach(m => map.set(m.id, m));
  return [...map.values()].sort((a, b) => a.timestamp - b.timestamp);
}
