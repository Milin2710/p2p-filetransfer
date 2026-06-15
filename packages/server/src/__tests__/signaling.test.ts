import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from 'http';
import type { Server as HttpServer } from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import { Server } from 'socket.io';
import Client from 'socket.io-client';
type ClientSocket = ReturnType<typeof Client>;
import { RoomManager } from '../services/room-manager.js';

function createServerPair(): Promise<{ server: HttpServer; io: Server; port: number }> {
  return new Promise((resolve) => {
    const app = express();
    const server = createServer(app);
    const io = new Server(server, {
      cors: { origin: '*', methods: ['GET', 'POST'] },
    });

    const roomManager = new RoomManager();

    app.get('/health', (_req: any, res: any) => {
      res.json({ status: 'ok' });
    });

    io.on('connection', (socket) => {
      socket.on('create-room', () => {
        const room = roomManager.createRoom();
        roomManager.joinRoom(room.id, socket.id);
        socket.join(room.id);
        socket.emit('room-created', { roomId: room.id, expiresAt: room.expiresAt });
      });

      socket.on('join-room', (data: { roomId: string }) => {
        try {
          const { room, peerCount } = roomManager.joinRoom(data.roomId, socket.id);
          socket.join(room.id);
          socket.emit('room-joined', { roomId: room.id, peerCount });
          socket.to(room.id).emit('peer-joined', { peerId: socket.id });
        } catch (err: unknown) {
          const e = err as { code: string; message: string };
          socket.emit('room-error', { code: e.code, message: e.message });
        }
      });

      socket.on('leave-room', (data: { roomId: string }) => {
        const { removed } = roomManager.leaveRoom(data.roomId, socket.id);
        if (removed) {
          socket.leave(data.roomId);
          socket.to(data.roomId).emit('peer-disconnected', { peerId: socket.id });
        }
      });

      socket.on('offer', (data: { roomId: string; offer: unknown }) => {
        const otherPeerId = roomManager.getOtherPeerSocketId(data.roomId, socket.id);
        if (otherPeerId) {
          socket.to(otherPeerId).emit('offer', { offer: data.offer });
        }
      });

      socket.on('answer', (data: { roomId: string; answer: unknown }) => {
        const otherPeerId = roomManager.getOtherPeerSocketId(data.roomId, socket.id);
        if (otherPeerId) {
          socket.to(otherPeerId).emit('answer', { answer: data.answer });
        }
      });

      socket.on('ice-candidate', (data: { roomId: string; candidate: unknown }) => {
        const otherPeerId = roomManager.getOtherPeerSocketId(data.roomId, socket.id);
        if (otherPeerId) {
          socket.to(otherPeerId).emit('ice-candidate', { candidate: data.candidate });
        }
      });

      socket.on('file-metadata', (data: { roomId: string; fileName: string; fileSize: number; fileType: string }) => {
        roomManager.setFileMetadata(data.roomId, { fileName: data.fileName, fileSize: data.fileSize, fileType: data.fileType });
        const otherPeerId = roomManager.getOtherPeerSocketId(data.roomId, socket.id);
        if (otherPeerId) {
          socket.to(otherPeerId).emit('file-metadata', { fileName: data.fileName, fileSize: data.fileSize, fileType: data.fileType });
        }
      });

      socket.on('transfer-complete', (data: { roomId: string; sha256Hash: string }) => {
        const otherPeerId = roomManager.getOtherPeerSocketId(data.roomId, socket.id);
        if (otherPeerId) {
          socket.to(otherPeerId).emit('transfer-complete', { sha256Hash: data.sha256Hash });
        }
      });

      socket.on('transfer-error', (data: { roomId: string; error: string }) => {
        const otherPeerId = roomManager.getOtherPeerSocketId(data.roomId, socket.id);
        if (otherPeerId) {
          socket.to(otherPeerId).emit('transfer-error', { error: data.error });
        }
      });

      socket.on('disconnect', () => {
        const room = roomManager.findRoomBySocketId(socket.id);
        if (room) {
          roomManager.leaveRoom(room.id, socket.id);
          socket.to(room.id).emit('peer-disconnected', { peerId: socket.id });
        }
      });
    });

    server.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, io, port });
    });
  });
}

describe('Signaling Server Integration', { timeout: 10_000 }, () => {
  let server: HttpServer | null = null;
  let ioServer: Server | null = null;
  let port: number = 0;
  let connectedSockets: ClientSocket[] = [];

  beforeEach(async () => {
    const pair = await createServerPair();
    server = pair.server;
    ioServer = pair.io;
    port = pair.port;
  });

  afterEach(() => {
    for (const sock of connectedSockets) {
      sock.close();
    }
    connectedSockets = [];
    ioServer?.close();
    server?.close();
  });

  function connectSocket(): Promise<ClientSocket> {
    return new Promise((resolve) => {
      const socket = Client(`http://localhost:${port}`);
      socket.on('connect', () => {
        connectedSockets.push(socket);
        resolve(socket);
      });
    });
  }

  async function createAndJoinRoom(sender: ClientSocket, receiver: ClientSocket): Promise<{ roomId: string }> {
    const roomPromise = new Promise<{ roomId: string }>((resolve) => {
      sender.once('room-created', (data: unknown) => resolve(data as { roomId: string }));
    });
    sender.emit('create-room');
    const room = await roomPromise;

    const joinedPromise = new Promise<void>((resolve) => {
      receiver.once('room-joined', () => resolve());
    });
    receiver.emit('join-room', { roomId: room.roomId });
    await joinedPromise;

    return room;
  }

  describe('Room Lifecycle', () => {
    it('should create a room and return roomId', async () => {
      const sender = await connectSocket();
      const response = new Promise<{ roomId: string; expiresAt: number }>((resolve) => {
        sender.once('room-created', (data: unknown) => resolve(data as { roomId: string; expiresAt: number }));
      });
      sender.emit('create-room');
      const result = await response;
      expect(result.roomId).toMatch(/^[a-z0-9]{6}$/);
      expect(result.expiresAt).toBeGreaterThan(Date.now());
      sender.close();
    });

    it('should allow two peers to join the same room', async () => {
      const sender = await connectSocket();
      const receiver = await connectSocket();

      const roomPromise = new Promise<{ roomId: string }>((resolve) => {
        sender.once('room-created', (data: unknown) => resolve(data as { roomId: string }));
      });
      sender.emit('create-room');
      const created = await roomPromise;

      const joinResult = new Promise<{ roomId: string; peerCount: number }>((resolve) => {
        receiver.once('room-joined', (data: unknown) => resolve(data as { roomId: string; peerCount: number }));
      });
      const peerJoined = new Promise<{ peerId: string }>((resolve) => {
        sender.once('peer-joined', (data: unknown) => resolve(data as { peerId: string }));
      });
      receiver.emit('join-room', { roomId: created.roomId });
      const [joinData, peerData] = await Promise.all([joinResult, peerJoined]);

      expect(joinData.roomId).toBe(created.roomId);
      expect(joinData.peerCount).toBe(2);
      expect(peerData.peerId).toBeTruthy();

      sender.close();
      receiver.close();
    });

    it('should reject joining a non-existent room', async () => {
      const socket = await connectSocket();
      const errorPromise = new Promise<{ code: string }>((resolve) => {
        socket.once('room-error', (data: unknown) => resolve(data as { code: string }));
      });
      socket.emit('join-room', { roomId: 'xxxxxx' });
      const error = await errorPromise;
      expect(error.code).toBe('INVALID_ROOM');
      socket.close();
    });

    it('should notify peers on disconnect', async () => {
      const sender = await connectSocket();
      const receiver = await connectSocket();

      const roomPromise = new Promise<{ roomId: string }>((resolve) => {
        sender.once('room-created', (data: unknown) => resolve(data as { roomId: string }));
      });
      sender.emit('create-room');
      const created = await roomPromise;

      const joined = new Promise<void>((resolve) => {
        receiver.once('room-joined', () => resolve());
      });
      receiver.emit('join-room', { roomId: created.roomId });
      await joined;

      const disconnectPromise = new Promise<{ peerId: string }>((resolve) => {
        sender.once('peer-disconnected', (data: unknown) => resolve(data as { peerId: string }));
      });
      receiver.close();
      const result = await disconnectPromise;
      expect(result.peerId).toBeTruthy();
      sender.close();
    });
  });

  describe('WebRTC Signaling', () => {
    it('should forward offer between peers', async () => {
      const sender = await connectSocket();
      const receiver = await connectSocket();

      const room = await createAndJoinRoom(sender, receiver);

      const offerPromise = new Promise<{ offer: unknown }>((resolve) => {
        receiver.once('offer', (data: unknown) => resolve(data as { offer: unknown }));
      });
      const testOffer = { type: 'offer', sdp: 'v=0\r\no=- 0 1 IN IP4 0.0.0.0\r\n' };
      sender.emit('offer', { roomId: room.roomId, offer: testOffer });

      const received = await offerPromise;
      expect(received.offer).toEqual(testOffer);

      sender.close();
      receiver.close();
    });

    it('should forward answer between peers', async () => {
      const sender = await connectSocket();
      const receiver = await connectSocket();

      const room = await createAndJoinRoom(sender, receiver);

      const answerPromise = new Promise<{ answer: unknown }>((resolve) => {
        sender.once('answer', (data: unknown) => resolve(data as { answer: unknown }));
      });
      const testAnswer = { type: 'answer', sdp: 'v=0\r\no=- 0 1 IN IP4 0.0.0.0\r\n' };
      receiver.emit('answer', { roomId: room.roomId, answer: testAnswer });

      const received = await answerPromise;
      expect(received.answer).toEqual(testAnswer);

      sender.close();
      receiver.close();
    });

    it('should forward ICE candidates between peers', async () => {
      const sender = await connectSocket();
      const receiver = await connectSocket();

      const room = await createAndJoinRoom(sender, receiver);

      const icePromise = new Promise<{ candidate: unknown }>((resolve) => {
        receiver.once('ice-candidate', (data: unknown) => resolve(data as { candidate: unknown }));
      });
      const testCandidate = { candidate: 'candidate:1 1 UDP 2122252543 192.168.1.1 54321 typ host', sdpMid: '0', sdpMLineIndex: 0 };
      sender.emit('ice-candidate', { roomId: room.roomId, candidate: testCandidate });

      const received = await icePromise;
      expect(received.candidate).toEqual(testCandidate);

      sender.close();
      receiver.close();
    });
  });

  describe('File Transfer Events', () => {
    it('should forward file metadata between peers', async () => {
      const sender = await connectSocket();
      const receiver = await connectSocket();

      const room = await createAndJoinRoom(sender, receiver);

      const metaPromise = new Promise<{ fileName: string; fileSize: number; fileType: string }>((resolve) => {
        receiver.once('file-metadata', (data: unknown) => resolve(data as { fileName: string; fileSize: number; fileType: string }));
      });
      sender.emit('file-metadata', {
        roomId: room.roomId,
        fileName: 'test.pdf',
        fileSize: 1024,
        fileType: 'application/pdf',
      });

      const received = await metaPromise;
      expect(received.fileName).toBe('test.pdf');
      expect(received.fileSize).toBe(1024);
      expect(received.fileType).toBe('application/pdf');

      sender.close();
      receiver.close();
    });

    it('should forward transfer-complete event', async () => {
      const sender = await connectSocket();
      const receiver = await connectSocket();

      const room = await createAndJoinRoom(sender, receiver);

      const completePromise = new Promise<{ sha256Hash: string }>((resolve) => {
        receiver.once('transfer-complete', (data: unknown) => resolve(data as { sha256Hash: string }));
      });
      sender.emit('transfer-complete', { roomId: room.roomId, sha256Hash: 'abc123' });

      const received = await completePromise;
      expect(received.sha256Hash).toBe('abc123');

      sender.close();
      receiver.close();
    });

    it('should forward transfer-error event', async () => {
      const sender = await connectSocket();
      const receiver = await connectSocket();

      const room = await createAndJoinRoom(sender, receiver);

      const errorPromise = new Promise<{ error: string }>((resolve) => {
        receiver.once('transfer-error', (data: unknown) => resolve(data as { error: string }));
      });
      sender.emit('transfer-error', { roomId: room.roomId, error: 'Connection lost' });

      const received = await errorPromise;
      expect(received.error).toBe('Connection lost');

      sender.close();
      receiver.close();
    });
  });
});
