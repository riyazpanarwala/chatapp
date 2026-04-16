const DB_NAME = 'chatapp_db';
const DB_VERSION = 1;
const STORE_NAME = 'messages';

let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('roomId', 'roomId', { unique: false });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
    request.onsuccess = (e) => { db = e.target.result; resolve(db); };
    request.onerror = (e) => reject(e.target.error);
  });
}

export async function saveMessage(message) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(message);
    req.onsuccess = () => resolve(message);
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function getMessages(roomId) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('roomId');
    const req = index.getAll(roomId);
    req.onsuccess = (e) => resolve(e.target.result.sort((a, b) => a.timestamp - b.timestamp));
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function getPendingMessages() {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('status');
    const req = index.getAll('pending');
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function updateMessageStatus(messageId, status) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(messageId);
    getReq.onsuccess = (e) => {
      const msg = e.target.result;
      if (!msg) return resolve(null);
      const updated = { ...msg, status };
      const putReq = store.put(updated);
      putReq.onsuccess = () => resolve(updated);
      putReq.onerror = (e) => reject(e.target.error);
    };
    getReq.onerror = (e) => reject(e.target.error);
  });
}

export async function messageExists(messageId) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(messageId);
    req.onsuccess = (e) => resolve(!!e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function deleteMessage(messageId) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(messageId);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}
