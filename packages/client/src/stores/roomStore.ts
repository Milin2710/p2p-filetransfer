import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export type RoomPhase = 'idle' | 'creating' | 'waiting' | 'connecting' | 'connected' | 'expired';

export interface RoomState {
  roomId: string | null;
  peerId: string | null;
  peerConnected: boolean;
  roomError: string | null;
  roomPhase: RoomPhase;

  setRoomId: (id: string | null) => void;
  setPeerId: (id: string | null) => void;
  setPeerConnected: (connected: boolean) => void;
  setRoomError: (error: string | null) => void;
  setRoomPhase: (phase: RoomPhase) => void;
  reset: () => void;
}

const initialState = {
  roomId: null as string | null,
  peerId: null as string | null,
  peerConnected: false,
  roomError: null as string | null,
  roomPhase: 'idle' as RoomPhase,
};

export const useRoomStore = create<RoomState>()(
  devtools(
    (set) => ({
      ...initialState,

      setRoomId: (id) => set({ roomId: id }),
      setPeerId: (id) => set({ peerId: id }),
      setPeerConnected: (connected) => set({ peerConnected: connected }),
      setRoomError: (error) => set({ roomError: error }),
      setRoomPhase: (phase) => set({ roomPhase: phase }),
      reset: () => set(initialState),
    }),
    { name: 'p2p-room' },
  ),
);
