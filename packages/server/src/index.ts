import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { RoomManager, RoomError } from './services/room-manager.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map(s => s.trim()),
    methods: ['GET', 'POST'],
  },
});

const roomManager = new RoomManager();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now(), activeRooms: roomManager.getActiveRoomCount() });
});

function emitRoomError(socket: Socket, code: string, message: string): void {
  socket.emit('room-error', { code, message });
}

function validateRoom(socket: Socket, roomId: string): string | null {
  const room = roomManager.getRoom(roomId);
  if (!room) {
    emitRoomError(socket, 'INVALID_ROOM', `Room ${roomId} does not exist`);
    return null;
  }
  if (Date.now() > room.expiresAt) {
    emitRoomError(socket, 'ROOM_EXPIRED', `Room ${roomId} has expired`);
    return null;
  }
  return roomId;
}

function forwardToPeer(
  socket: Socket,
  event: string,
  roomId: string,
  payload: Record<string, unknown>,
): void {
  const otherPeerId = roomManager.getOtherPeerSocketId(roomId, socket.id);
  if (!otherPeerId) {
    emitRoomError(socket, 'NO_PEER', 'No other peer in room');
    return;
  }
  socket.to(otherPeerId).emit(event, payload);
}

io.on('connection', (socket) => {
  console.log(`[connect] socket=${socket.id}`);

  socket.on('create-room', () => {
    console.log('[create-room]', socket.id, 'rooms=', [...socket.rooms]);
    try {
      const room = roomManager.createRoom();
      console.log('[CREATE] before join', socket.id, room.id);
      roomManager.joinRoom(room.id, socket.id);
      console.log('[CREATE] after join', socket.id, room.id);
      socket.join(room.id);
      socket.emit('room-created', {
        roomId: room.id,
        expiresAt: room.expiresAt,
      });
      console.log(`[create-room] socket=${socket.id} room=${room.id}`);
    } catch (err) {
      emitRoomError(
        socket,
        'CREATE_FAILED',
        err instanceof Error ? err.message : 'Failed to create room',
      );
    }
  });

  socket.on('join-room', (data: { roomId: string }) => {
    console.log('[join-room]', socket.id, data.roomId, 'rooms=', [...socket.rooms]);
    try {
      const existingRoom = roomManager.findRoomBySocketId(socket.id);
      console.log(
        '[JOIN REQUEST]',
        'socket=',
        socket.id,
        'target=',
        data.roomId,
        'existing=',
        existingRoom?.id ?? 'none',
      );
      const { room, peerCount } = roomManager.joinRoom(data.roomId, socket.id);
      socket.join(room.id);
      socket.emit('room-joined', {
        roomId: room.id,
        peerCount,
      });
      socket.to(room.id).emit('peer-joined', {
        peerId: socket.id,
      });
      console.log(`[join-room] socket=${socket.id} room=${room.id} peers=${peerCount}`);
    } catch (err) {
      if (err instanceof RoomError) {
        emitRoomError(socket, err.code, err.message);
      } else {
        emitRoomError(
          socket,
          'JOIN_FAILED',
          err instanceof Error ? err.message : 'Failed to join room',
        );
      }
    }
  });

  socket.on('leave-room', (data: { roomId: string }) => {
    const { removed, remainingPeers } = roomManager.leaveRoom(data.roomId, socket.id);
    if (removed) {
      socket.leave(data.roomId);
      socket.to(data.roomId).emit('peer-disconnected', {
        peerId: socket.id,
      });
      console.log(
        `[leave-room] socket=${socket.id} room=${data.roomId} remaining=${remainingPeers}`,
      );
    }
  });

  socket.on('offer', (data: { roomId: string; offer: RTCSessionDescriptionInit }) => {
    if (!validateRoom(socket, data.roomId)) return;
    forwardToPeer(socket, 'offer', data.roomId, { offer: data.offer });
    console.log(`[offer] socket=${socket.id} room=${data.roomId}`);
  });

  socket.on('answer', (data: { roomId: string; answer: RTCSessionDescriptionInit }) => {
    if (!validateRoom(socket, data.roomId)) return;
    forwardToPeer(socket, 'answer', data.roomId, { answer: data.answer });
    console.log(`[answer] socket=${socket.id} room=${data.roomId}`);
  });

  socket.on('ice-candidate', (data: { roomId: string; candidate: RTCIceCandidateInit }) => {
    if (!validateRoom(socket, data.roomId)) return;
    forwardToPeer(socket, 'ice-candidate', data.roomId, { candidate: data.candidate });
  });

  socket.on(
    'file-metadata',
    (data: { roomId: string; fileName: string; fileSize: number; fileType: string }) => {
      if (!validateRoom(socket, data.roomId)) return;
      roomManager.setFileMetadata(data.roomId, {
        fileName: data.fileName,
        fileSize: data.fileSize,
        fileType: data.fileType,
      });
      forwardToPeer(socket, 'file-metadata', data.roomId, {
        fileName: data.fileName,
        fileSize: data.fileSize,
        fileType: data.fileType,
      });
      console.log(`[file-metadata] socket=${socket.id} room=${data.roomId} file=${data.fileName}`);
    },
  );

  socket.on('transfer-complete', (data: { roomId: string; sha256Hash: string }) => {
    if (!validateRoom(socket, data.roomId)) return;
    forwardToPeer(socket, 'transfer-complete', data.roomId, { sha256Hash: data.sha256Hash });
    console.log(`[transfer-complete] socket=${socket.id} room=${data.roomId}`);
  });

  socket.on('transfer-error', (data: { roomId: string; error: string }) => {
    if (!validateRoom(socket, data.roomId)) return;
    forwardToPeer(socket, 'transfer-error', data.roomId, { error: data.error });
    console.log(`[transfer-error] socket=${socket.id} room=${data.roomId} error=${data.error}`);
  });

  socket.on('disconnect', () => {
    console.log(`[disconnect] socket=${socket.id}`);
    const room = roomManager.findRoomBySocketId(socket.id);
    if (room) {
      const { removed } = roomManager.leaveRoom(room.id, socket.id);
      if (removed) {
        socket.to(room.id).emit('peer-disconnected', {
          peerId: socket.id,
        });
      }
    }
  });
});

const PORT = parseInt(process.env.PORT || '3001', 10);
httpServer.listen(PORT, () => {
  console.log(`signaling-server listening on port ${PORT}`);
});
