const DB_NAME = 'p2p-share-transfer';
const DB_VERSION = 2;
const STORE_NAME = 'checkpoints';
const CHUNK_STORE = 'chunks';

interface CheckpointData {
  role: 'sender' | 'receiver';
  fileName: string;
  fileSize: number;
  totalChunks: number;
  lastSentChunk: number;
  lastReceivedChunk: number;
  lastAcknowledgedChunk: number;
  totalBytesSent: number;
  timestamp: number;
}

interface StoredCheckpoint extends CheckpointData {
  roomId: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;
let dbRefCount = 0;

function getDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'roomId' });
        }
        if (!db.objectStoreNames.contains(CHUNK_STORE)) {
          const chunkStore = db.createObjectStore(CHUNK_STORE, { keyPath: ['roomId', 'sequence'] });
          chunkStore.createIndex('roomId', 'roomId', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = null;
        reject(request.error);
      };
    });
  }
  return dbPromise;
}

function withDB<T>(fn: (db: IDBDatabase) => Promise<T>): Promise<T> {
  dbRefCount++;
  return getDB().then((db) => {
    return fn(db).finally(() => {
      dbRefCount--;
      if (dbRefCount === 0 && dbPromise) {
        db.close();
        dbPromise = null;
      }
    });
  });
}

function storeTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return withDB((db) => {
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const request = fn(tx.objectStore(storeName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}

function voidTransaction(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<any>,
): Promise<void> {
  return withDB((db) => {
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const request = fn(tx.objectStore(storeName));
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
}

interface ChunkRecord {
  roomId: string;
  sequence: number;
  data: Uint8Array;
}

export async function saveCheckpoint(roomId: string, data: CheckpointData): Promise<void> {
  await voidTransaction(STORE_NAME, 'readwrite', (store) =>
    store.put({ roomId, ...data } as StoredCheckpoint),
  );
}

export async function getCheckpoint(roomId: string): Promise<CheckpointData & { roomId: string } | null> {
  const result = await storeTransaction<StoredCheckpoint | undefined>(STORE_NAME, 'readonly', (store) =>
    store.get(roomId),
  );
  return result || null;
}

export async function deleteCheckpoint(roomId: string): Promise<void> {
  await voidTransaction(STORE_NAME, 'readwrite', (store) =>
    store.delete(roomId),
  );
}

export async function getAllCheckpoints(): Promise<(CheckpointData & { roomId: string })[]> {
  const result = await storeTransaction<StoredCheckpoint[]>(STORE_NAME, 'readonly', (store) =>
    store.getAll(),
  );
  return result || [];
}

const STALE_TTL_MS = 30 * 60 * 1000;

export function getCheckpointAge(checkpoint: { timestamp: number }): number {
  return Date.now() - checkpoint.timestamp;
}

export function isCheckpointStale(checkpoint: { timestamp: number }): boolean {
  return getCheckpointAge(checkpoint) > STALE_TTL_MS;
}

export async function cleanupStaleCheckpoints(): Promise<number> {
  const all = await getAllCheckpoints();
  let cleaned = 0;
  const staleIds: string[] = [];
  for (const cp of all) {
    if (isCheckpointStale(cp)) {
      staleIds.push(cp.roomId);
      cleaned++;
    }
  }
  if (staleIds.length > 0) {
    await withDB((db) => {
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        for (const id of staleIds) {
          store.delete(id);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    });
  }
  return cleaned;
}

export async function clearAllCheckpoints(): Promise<void> {
  await voidTransaction(STORE_NAME, 'readwrite', (store) =>
    store.clear(),
  );
}

export async function saveChunk(roomId: string, sequence: number, data: Uint8Array): Promise<void> {
  await voidTransaction(CHUNK_STORE, 'readwrite', (store) =>
    store.put({ roomId, sequence, data } as ChunkRecord),
  );
}

export async function loadAllChunks(roomId: string): Promise<Map<number, Uint8Array>> {
  return withDB((db) => {
    return new Promise<Map<number, Uint8Array>>((resolve, reject) => {
      const tx = db.transaction(CHUNK_STORE, 'readonly');
      const index = tx.objectStore(CHUNK_STORE).index('roomId');
      const request = index.getAll(IDBKeyRange.only(roomId));
      request.onsuccess = () => {
        const records = (request.result || []) as ChunkRecord[];
        const map = new Map<number, Uint8Array>();
        for (const r of records) {
          map.set(r.sequence, r.data);
        }
        resolve(map);
      };
      request.onerror = () => reject(request.error);
    });
  });
}

export async function deleteRoomChunks(roomId: string): Promise<void> {
  await withDB((db) => {
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CHUNK_STORE, 'readwrite');
      const index = tx.objectStore(CHUNK_STORE).index('roomId');
      const request = index.openCursor(IDBKeyRange.only(roomId));
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });
}
