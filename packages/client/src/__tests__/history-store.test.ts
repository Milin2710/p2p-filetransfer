import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import {
  saveHistoryEntry,
  getAllHistoryEntries,
  getHistoryEntry,
  deleteHistoryEntry,
  clearAllHistory,
  type HistoryEntry,
} from '../services/history-store.js';

const TEST_ROOM = 'test-history-room';

describe('history-store (IndexedDB)', () => {
  beforeEach(async () => {
    await clearAllHistory();
  });

  afterAll(async () => {
    await clearAllHistory();
  });

  it('should save and retrieve a history entry', async () => {
    const entry: HistoryEntry = {
      roomId: TEST_ROOM,
      role: 'sender',
      fileName: 'test.txt',
      fileSize: 1000,
      fileType: 'text/plain',
      totalChunks: 10,
      chunksTransferred: 10,
      status: 'completed',
      sha256Hash: 'abc123',
      speedAvgBps: 500000,
      startedAt: Date.now() - 5000,
      completedAt: Date.now(),
    };

    await saveHistoryEntry(entry);

    const retrieved = await getHistoryEntry(TEST_ROOM);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.fileName).toBe('test.txt');
    expect(retrieved!.status).toBe('completed');
  });

  it('should return null for non-existent room', async () => {
    const result = await getHistoryEntry('nonexistent');
    expect(result).toBeNull();
  });

  it('should list entries sorted by newest first', async () => {
    const now = Date.now();
    await saveHistoryEntry({
      roomId: 'old', role: 'sender', fileName: 'old.txt', fileSize: 10,
      fileType: 'text/plain', totalChunks: 1, chunksTransferred: 1,
      status: 'completed', sha256Hash: null, speedAvgBps: 0,
      startedAt: now - 10000, completedAt: now - 5000,
    });
    await saveHistoryEntry({
      roomId: 'new', role: 'receiver', fileName: 'new.txt', fileSize: 20,
      fileType: 'text/plain', totalChunks: 2, chunksTransferred: 2,
      status: 'completed', sha256Hash: null, speedAvgBps: 0,
      startedAt: now, completedAt: now,
    });

    const entries = await getAllHistoryEntries();
    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(entries[0].roomId).toBe('new'); // newest first
  });

  it('should delete an entry', async () => {
    await saveHistoryEntry({
      roomId: TEST_ROOM, role: 'sender', fileName: 'del.txt', fileSize: 100,
      fileType: 'text/plain', totalChunks: 2, chunksTransferred: 2,
      status: 'completed', sha256Hash: null, speedAvgBps: 0,
      startedAt: Date.now(), completedAt: Date.now(),
    });

    await deleteHistoryEntry(TEST_ROOM);
    const retrieved = await getHistoryEntry(TEST_ROOM);
    expect(retrieved).toBeNull();
  });

  it('should upsert existing entry', async () => {
    await saveHistoryEntry({
      roomId: TEST_ROOM, role: 'sender', fileName: 'v1.txt', fileSize: 100,
      fileType: 'text/plain', totalChunks: 1, chunksTransferred: 1,
      status: 'cancelled', sha256Hash: null, speedAvgBps: 0,
      startedAt: Date.now(), completedAt: Date.now(),
    });

    await saveHistoryEntry({
      roomId: TEST_ROOM, role: 'receiver', fileName: 'v2.txt', fileSize: 200,
      fileType: 'text/plain', totalChunks: 2, chunksTransferred: 2,
      status: 'completed', sha256Hash: 'xyz', speedAvgBps: 1000,
      startedAt: Date.now(), completedAt: Date.now(),
    });

    const retrieved = await getHistoryEntry(TEST_ROOM);
    expect(retrieved!.fileName).toBe('v2.txt');
    expect(retrieved!.status).toBe('completed');
  });
});
