import { ROOM_TTL_MS, MAX_PEERS_PER_ROOM } from '@p2p-share/shared';

export interface PeerInfo {
  socketId: string;
  joinedAt: number;
}

export interface RoomFileMetadata {
  fileName: string;
  fileSize: number;
  fileType: string;
}

export interface Room {
  id: string;
  createdAt: number;
  expiresAt: number;
  peers: Map<string, PeerInfo>;
  fileMetadata: RoomFileMetadata | null;
}

export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval>;
  private readonly CLEANUP_INTERVAL_MS = 60_000;
  private readonly ROOM_EXPIRY_MS = ROOM_TTL_MS;
  private readonly RECONNECTION_WINDOW_MS = 5 * 60 * 1000;

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanupExpiredRooms(), this.CLEANUP_INTERVAL_MS);
  }

  createRoom(): Room {
    const roomId = this.generateRoomId();
    const now = Date.now();
    const room: Room = {
      id: roomId,
      createdAt: now,
      expiresAt: now + this.ROOM_EXPIRY_MS,
      peers: new Map(),
      fileMetadata: null,
    };
    this.rooms.set(roomId, room);
    return room;
  }

  joinRoom(roomId: string, socketId: string): { room: Room; peerCount: number } {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new RoomError('INVALID_ROOM', `Room ${roomId} does not exist`);
    }
    if (Date.now() > room.expiresAt) {
      this.rooms.delete(roomId);
      throw new RoomError('ROOM_EXPIRED', `Room ${roomId} has expired`);
    }
    if (room.peers.size >= MAX_PEERS_PER_ROOM) {
      throw new RoomError('ROOM_FULL', `Room ${roomId} is full`);
    }
    if (room.peers.has(socketId)) {
      throw new RoomError('ALREADY_IN_ROOM', `Socket ${socketId} is already in room ${roomId}`);
    }

    room.peers.set(socketId, { socketId, joinedAt: Date.now() });
    return { room, peerCount: room.peers.size };
  }

  leaveRoom(roomId: string, socketId: string): { removed: boolean; remainingPeers: number } {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { removed: false, remainingPeers: 0 };
    }
    const removed = room.peers.delete(socketId);
    const remainingPeers = room.peers.size;

    if (remainingPeers === 0) {
      this.rooms.delete(roomId);
    } else {
      room.expiresAt = Math.max(room.expiresAt, Date.now() + this.RECONNECTION_WINDOW_MS);
    }

    return { removed, remainingPeers };
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  getPeerSocketIds(roomId: string): string[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return Array.from(room.peers.keys());
  }

  findRoomBySocketId(socketId: string): Room | undefined {
    for (const room of this.rooms.values()) {
      if (room.peers.has(socketId)) {
        return room;
      }
    }
    return undefined;
  }

  getOtherPeerSocketId(roomId: string, socketId: string): string | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    for (const id of room.peers.keys()) {
      if (id !== socketId) return id;
    }
    return undefined;
  }

  setFileMetadata(roomId: string, metadata: RoomFileMetadata): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.fileMetadata = metadata;
    }
  }

  deleteRoom(roomId: string): void {
    this.rooms.delete(roomId);
  }

  getActiveRoomCount(): number {
    return this.rooms.size;
  }

  cleanupExpiredRooms(): void {
    const now = Date.now();
    for (const [roomId, room] of this.rooms.entries()) {
      if (now > room.expiresAt) {
        this.rooms.delete(roomId);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.rooms.clear();
  }

  private generateRoomId(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}

export class RoomError extends Error {
  public code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'RoomError';
    this.code = code;
  }
}
