import { useEffect, useCallback } from 'react';
import { connectSocket, disconnectSocket } from '../services/socket.js';
import { useConnectionStore } from '../stores/connectionStore.js';
import { useTransferStore } from '../stores/transferStore.js';
import { useRoomStore } from '../stores/roomStore.js';

// This hook handles only socket events that are NOT managed by Room.tsx.
// Room.tsx owns: room-joined, peer-joined, room-error, room-expired, room-created
// Adding those here too causes duplicate handlers and double-fires on every signaling event.
export function useSocket() {
  const { setConnectionState } = useConnectionStore();
  const { setFileMetadata, setTransferPhase, setTransferError } = useTransferStore();
  const { setRoomId, setRoomPhase } = useRoomStore();

  const cleanup = useCallback(() => {
    disconnectSocket();
  }, []);

  useEffect(() => {
    const socket = connectSocket();

    socket.on('room-created', (data: { roomId: string; expiresAt: number }) => {
      setRoomId(data.roomId);
      setRoomPhase('waiting');
    });

    socket.on('peer-disconnected', () => {
      setConnectionState('disconnected');
    });

    socket.on('file-metadata', (data: { fileName: string; fileSize: number; fileType: string }) => {
      setFileMetadata(data);
    });

    socket.on('transfer-complete', () => {
      setTransferPhase('complete');
    });

    socket.on('transfer-error', (data: { error: string }) => {
      setTransferError(data.error);
      setTransferPhase('error');
    });

    return cleanup;
  }, []);

  return { cleanup };
}
