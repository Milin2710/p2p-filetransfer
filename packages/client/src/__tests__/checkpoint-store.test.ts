import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import {
  saveCheckpoint,
  getCheckpoint,
  deleteCheckpoint,
  getAllCheckpoints,
  clearAllCheckpoints,
  saveChunk,
  loadAllChunks,
  deleteRoomChunks,
  cleanupStaleCheckpoints,
  isCheckpointStale,
} from '../services/checkpoint-store.js';

const TEST_ROOM = 'test-room-id';

describe('checkpoint-store (IndexedDB)', () => {
  beforeEach(async () => {
    await clearAllCheckpoints();
  });

  afterAll(async () => {
    await clearAllCheckpoints();
  });

  it('should save and retrieve a checkpoint', async () => {
    await saveCheckpoint(TEST_ROOM, {
      role: 'sender',
      fileName: 'test.txt',
      fileSize: 1000,
      totalChunks: 10,
      lastSentChunk: 5,
      lastReceivedChunk: 0,
      lastAcknowledgedChunk: 4,
      totalBytesSent: 500,
      timestamp: Date.now(),
    });

    const retrieved = await getCheckpoint(TEST_ROOM);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.roomId).toBe(TEST_ROOM);
    expect(retrieved!.lastSentChunk).toBe(5);
    expect(retrieved!.lastAcknowledgedChunk).toBe(4);
  });

  it('should return null for non-existent room', async () => {
    const result = await getCheckpoint('nonexistent');
    expect(result).toBeNull();
  });

  it('should update existing checkpoint', async () => {
    await saveCheckpoint(TEST_ROOM, {
      role: 'sender',
      fileName: 'test.txt',
      fileSize: 1000,
      totalChunks: 10,
      lastSentChunk: 3,
      lastReceivedChunk: 0,
      lastAcknowledgedChunk: 2,
      totalBytesSent: 300,
      timestamp: Date.now(),
    });

    await saveCheckpoint(TEST_ROOM, {
      role: 'sender',
      fileName: 'test.txt',
      fileSize: 1000,
      totalChunks: 10,
      lastSentChunk: 7,
      lastReceivedChunk: 0,
      lastAcknowledgedChunk: 6,
      totalBytesSent: 700,
      timestamp: Date.now(),
    });

    const retrieved = await getCheckpoint(TEST_ROOM);
    expect(retrieved!.lastSentChunk).toBe(7);
  });

  it('should delete a checkpoint', async () => {
    await saveCheckpoint(TEST_ROOM, {
      role: 'sender',
      fileName: 'test.txt',
      fileSize: 100,
      totalChunks: 2,
      lastSentChunk: 1,
      lastReceivedChunk: 0,
      lastAcknowledgedChunk: 1,
      totalBytesSent: 50,
      timestamp: Date.now(),
    });

    await deleteCheckpoint(TEST_ROOM);
    const retrieved = await getCheckpoint(TEST_ROOM);
    expect(retrieved).toBeNull();
  });

  it('should retrieve all checkpoints', async () => {
    await saveCheckpoint('room1', {
      role: 'sender', fileName: 'a.txt', fileSize: 100, totalChunks: 2,
      lastSentChunk: 1, lastReceivedChunk: 0, lastAcknowledgedChunk: 1, totalBytesSent: 50, timestamp: 0,
    });
    await saveCheckpoint('room2', {
      role: 'receiver', fileName: 'b.txt', fileSize: 200, totalChunks: 4,
      lastSentChunk: 0, lastReceivedChunk: 3, lastAcknowledgedChunk: 0, totalBytesSent: 0, timestamp: 0,
    });

    const all = await getAllCheckpoints();
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  describe('chunk persistence', () => {
    it('should save and load a single chunk', async () => {
      const data = new Uint8Array([0x01, 0x02, 0x03]);
      await saveChunk(TEST_ROOM, 0, data);

      const map = await loadAllChunks(TEST_ROOM);
      expect(map.size).toBe(1);
      const loaded = map.get(0);
      expect(Array.from(loaded!)).toEqual(Array.from(data));
    });

    it('should save and load multiple chunks', async () => {
      await saveChunk(TEST_ROOM, 0, new Uint8Array([0xAA]));
      await saveChunk(TEST_ROOM, 1, new Uint8Array([0xBB]));
      await saveChunk(TEST_ROOM, 5, new Uint8Array([0xCC]));

      const map = await loadAllChunks(TEST_ROOM);
      expect(map.size).toBe(3);
      expect(Array.from(map.get(0)!)).toEqual([0xAA]);
      expect(Array.from(map.get(1)!)).toEqual([0xBB]);
      expect(Array.from(map.get(5)!)).toEqual([0xCC]);
    });

    it('should delete all chunks for a room', async () => {
      await saveChunk(TEST_ROOM, 0, new Uint8Array([0x01]));
      await saveChunk(TEST_ROOM, 1, new Uint8Array([0x02]));
      await deleteRoomChunks(TEST_ROOM);

      const map = await loadAllChunks(TEST_ROOM);
      expect(map.size).toBe(0);
    });

    it('should not affect chunks from other rooms', async () => {
      const otherRoom = 'other-room';
      await saveChunk(TEST_ROOM, 0, new Uint8Array([0x01]));
      await saveChunk(otherRoom, 0, new Uint8Array([0xFF]));

      await deleteRoomChunks(TEST_ROOM);

      const otherMap = await loadAllChunks(otherRoom);
      expect(otherMap.size).toBe(1);
      expect(Array.from(otherMap.get(0)!)).toEqual([0xFF]);
    });
  });

  describe('checkpoint management', () => {
    it('should detect fresh checkpoint as not stale', async () => {
      await saveCheckpoint(TEST_ROOM, {
        role: 'sender', fileName: 'a.txt', fileSize: 100, totalChunks: 2,
        lastSentChunk: 1, lastReceivedChunk: 0, lastAcknowledgedChunk: 1,
        totalBytesSent: 50, timestamp: Date.now(),
      });
      const cp = await getCheckpoint(TEST_ROOM);
      expect(cp).not.toBeNull();
      expect(isCheckpointStale(cp!)).toBe(false);
    });

    it('should detect old checkpoint as stale', async () => {
      await saveCheckpoint(TEST_ROOM, {
        role: 'sender', fileName: 'a.txt', fileSize: 100, totalChunks: 2,
        lastSentChunk: 1, lastReceivedChunk: 0, lastAcknowledgedChunk: 1,
        totalBytesSent: 50, timestamp: Date.now() - 31 * 60 * 1000,
      });
      const cp = await getCheckpoint(TEST_ROOM);
      expect(cp).not.toBeNull();
      expect(isCheckpointStale(cp!)).toBe(true);
    });

    it('should clean up stale checkpoints', async () => {
      await saveCheckpoint('stale-room', {
        role: 'sender', fileName: 'old.txt', fileSize: 10, totalChunks: 1,
        lastSentChunk: 0, lastReceivedChunk: 0, lastAcknowledgedChunk: 0,
        totalBytesSent: 0, timestamp: Date.now() - 31 * 60 * 1000,
      });
      await saveCheckpoint('fresh-room', {
        role: 'receiver', fileName: 'new.txt', fileSize: 20, totalChunks: 2,
        lastSentChunk: 0, lastReceivedChunk: 1, lastAcknowledgedChunk: 0,
        totalBytesSent: 0, timestamp: Date.now(),
      });

      const cleaned = await cleanupStaleCheckpoints();
      expect(cleaned).toBeGreaterThanOrEqual(1);

      const stale = await getCheckpoint('stale-room');
      expect(stale).toBeNull();

      const fresh = await getCheckpoint('fresh-room');
      expect(fresh).not.toBeNull();
    });
  });
});
