import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RoomManager, RoomError } from '../services/room-manager.js';

describe('RoomManager', () => {
  let manager: RoomManager;

  beforeEach(() => {
    manager = new RoomManager();
  });

  afterEach(() => {
    manager.destroy();
  });

  describe('createRoom', () => {
    it('should create a room with a 6-character ID', () => {
      const room = manager.createRoom();
      expect(room.id).toMatch(/^[a-z0-9]{6}$/);
    });

    it('should set createdAt and expiresAt', () => {
      const room = manager.createRoom();
      expect(room.createdAt).toBeGreaterThan(0);
      expect(room.expiresAt).toBeGreaterThan(room.createdAt);
    });

    it('should have an empty peers map', () => {
      const room = manager.createRoom();
      expect(room.peers.size).toBe(0);
    });

    it('should generate unique room IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(manager.createRoom().id);
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('joinRoom', () => {
    it('should allow a peer to join a room', () => {
      const room = manager.createRoom();
      const { peerCount } = manager.joinRoom(room.id, 'socket-1');
      expect(peerCount).toBe(1);
    });

    it('should allow two peers to join', () => {
      const room = manager.createRoom();
      manager.joinRoom(room.id, 'socket-1');
      const { peerCount } = manager.joinRoom(room.id, 'socket-2');
      expect(peerCount).toBe(2);
    });

    it('should throw ROOM_FULL when third peer tries to join', () => {
      const room = manager.createRoom();
      manager.joinRoom(room.id, 'socket-1');
      manager.joinRoom(room.id, 'socket-2');
      expect(() => manager.joinRoom(room.id, 'socket-3')).toThrow(RoomError);
      expect(() => manager.joinRoom(room.id, 'socket-3')).toThrow(/full/);
    });

    it('should throw INVALID_ROOM for non-existent room', () => {
      expect(() => manager.joinRoom('nonexistent', 'socket-1')).toThrow(RoomError);
      expect(() => manager.joinRoom('nonexistent', 'socket-1')).toThrow(/does not exist/);
    });

    it('should throw ALREADY_IN_ROOM if socket already joined', () => {
      const room = manager.createRoom();
      manager.joinRoom(room.id, 'socket-1');
      expect(() => manager.joinRoom(room.id, 'socket-1')).toThrow(RoomError);
      expect(() => manager.joinRoom(room.id, 'socket-1')).toThrow(/already in room/);
    });
  });

  describe('leaveRoom', () => {
    it('should remove a peer from the room', () => {
      const room = manager.createRoom();
      manager.joinRoom(room.id, 'socket-1');
      manager.joinRoom(room.id, 'socket-2');
      const { removed, remainingPeers } = manager.leaveRoom(room.id, 'socket-1');
      expect(removed).toBe(true);
      expect(remainingPeers).toBe(1);
    });

    it('should return removed=false for non-member', () => {
      const room = manager.createRoom();
      const { removed } = manager.leaveRoom(room.id, 'socket-never-joined');
      expect(removed).toBe(false);
    });

    it('should delete room when last peer leaves', () => {
      const room = manager.createRoom();
      manager.joinRoom(room.id, 'socket-1');
      manager.leaveRoom(room.id, 'socket-1');
      expect(manager.getRoom(room.id)).toBeUndefined();
    });
  });

  describe('getRoom', () => {
    it('should return the room by ID', () => {
      const room = manager.createRoom();
      const found = manager.getRoom(room.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(room.id);
    });

    it('should return undefined for non-existent room', () => {
      expect(manager.getRoom('nonexistent')).toBeUndefined();
    });
  });

  describe('getPeerSocketIds', () => {
    it('should return all peer socket IDs in a room', () => {
      const room = manager.createRoom();
      manager.joinRoom(room.id, 'socket-1');
      manager.joinRoom(room.id, 'socket-2');
      const peerIds = manager.getPeerSocketIds(room.id);
      expect(peerIds).toContain('socket-1');
      expect(peerIds).toContain('socket-2');
      expect(peerIds.length).toBe(2);
    });

    it('should return empty array for non-existent room', () => {
      expect(manager.getPeerSocketIds('nonexistent')).toEqual([]);
    });
  });

  describe('findRoomBySocketId', () => {
    it('should find the room a socket belongs to', () => {
      const room = manager.createRoom();
      manager.joinRoom(room.id, 'socket-1');
      const found = manager.findRoomBySocketId('socket-1');
      expect(found).toBeDefined();
      expect(found!.id).toBe(room.id);
    });

    it('should return undefined if socket is not in any room', () => {
      expect(manager.findRoomBySocketId('socket-nowhere')).toBeUndefined();
    });
  });

  describe('getOtherPeerSocketId', () => {
    it('should return the other peer in a 2-peer room', () => {
      const room = manager.createRoom();
      manager.joinRoom(room.id, 'socket-1');
      manager.joinRoom(room.id, 'socket-2');
      expect(manager.getOtherPeerSocketId(room.id, 'socket-1')).toBe('socket-2');
      expect(manager.getOtherPeerSocketId(room.id, 'socket-2')).toBe('socket-1');
    });

    it('should return undefined if no other peer', () => {
      const room = manager.createRoom();
      manager.joinRoom(room.id, 'socket-1');
      expect(manager.getOtherPeerSocketId(room.id, 'socket-1')).toBeUndefined();
    });
  });

  describe('setFileMetadata', () => {
    it('should store file metadata on a room', () => {
      const room = manager.createRoom();
      manager.setFileMetadata(room.id, {
        fileName: 'test.pdf',
        fileSize: 1024,
        fileType: 'application/pdf',
      });
      const updated = manager.getRoom(room.id);
      expect(updated!.fileMetadata).toEqual({
        fileName: 'test.pdf',
        fileSize: 1024,
        fileType: 'application/pdf',
      });
    });
  });

  describe('getActiveRoomCount', () => {
    it('should return the number of active rooms', () => {
      manager.createRoom();
      manager.createRoom();
      expect(manager.getActiveRoomCount()).toBe(2);
    });
  });

  describe('cleanupExpiredRooms', () => {
    it('should remove expired rooms', () => {
      const room = manager.createRoom();
      const past = Date.now() - 100_000;
      room.expiresAt = past;
      manager.cleanupExpiredRooms();
      expect(manager.getRoom(room.id)).toBeUndefined();
    });
  });
});
