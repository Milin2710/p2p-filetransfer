import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export interface ConnectionState {
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
  iceGatheringState: RTCIceGatheringState;
  dataChannelState: RTCDataChannelState;
  signalingState: RTCSignalingState;
  latencyMs: number | null;

  setConnectionState: (state: RTCPeerConnectionState) => void;
  setIceConnectionState: (state: RTCIceConnectionState) => void;
  setIceGatheringState: (state: RTCIceGatheringState) => void;
  setDataChannelState: (state: RTCDataChannelState) => void;
  setSignalingState: (state: RTCSignalingState) => void;
  setLatency: (ms: number) => void;
  reset: () => void;
}

const initialState = {
  connectionState: 'new' as RTCPeerConnectionState,
  iceConnectionState: 'new' as RTCIceConnectionState,
  iceGatheringState: 'new' as RTCIceGatheringState,
  dataChannelState: 'connecting' as RTCDataChannelState,
  signalingState: 'stable' as RTCSignalingState,
  latencyMs: null as number | null,
};

export const useConnectionStore = create<ConnectionState>()(
  devtools(
    (set) => ({
      ...initialState,

      setConnectionState: (state) => set({ connectionState: state }),
      setIceConnectionState: (state) => set({ iceConnectionState: state }),
      setIceGatheringState: (state) => set({ iceGatheringState: state }),
      setDataChannelState: (state) => set({ dataChannelState: state }),
      setSignalingState: (state) => set({ signalingState: state }),
      setLatency: (ms) => set({ latencyMs: ms }),
      reset: () => set(initialState),
    }),
    { name: 'p2p-connection' },
  ),
);
