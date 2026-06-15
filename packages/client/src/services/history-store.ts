const DB_NAME = 'p2p-share-history';
const DB_VERSION = 2;
const STORE_NAME = 'history';

export interface HistoryEntry {
  id: string;
  roomId: string;
  role: 'sender' | 'receiver';
  fileName: string;
  fileSize: number;
  fileType: string;
  totalChunks: number;
  chunksTransferred: number;
  status: 'completed' | 'error' | 'cancelled' | 'interrupted';
  sha256Hash: string | null;
  speedAvgBps: number;
  startedAt: number;
  completedAt: number | null;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      store.createIndex('timestamp', 'startedAt', { unique: false });
      store.createIndex('status', 'status', { unique: false });
      store.createIndex('role', 'role', { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveHistoryEntry(entry: HistoryEntry): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(entry);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getAllHistoryEntries(): Promise<HistoryEntry[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('timestamp');
    const request = index.getAll();
    request.onsuccess = () => {
      db.close();
      const entries = (request.result || []) as HistoryEntry[];
      entries.sort((a, b) => b.startedAt - a.startedAt);
      resolve(entries);
    };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

export async function getHistoryEntry(id: string): Promise<HistoryEntry | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => {
      db.close();
      resolve((request.result as HistoryEntry) || null);
    };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

export async function deleteHistoryEntry(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function clearAllHistory(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
