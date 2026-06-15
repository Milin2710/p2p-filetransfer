import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocket } from '../services/socket.js';
import { useConnectionStore } from '../stores/connectionStore.js';
import { useRoomStore } from '../stores/roomStore.js';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
};

const DATA_CHANNEL_LABEL = 'p2p-transfer';
const DATA_CHANNEL_PROTOCOL = 'p2p-share-v1';

export interface UseWebRTCOptions {
  roomId: string | null;
  isSender: boolean;
  onDataChannel?: (channel: RTCDataChannel) => void;
}

export function useWebRTC({ roomId, isSender, onDataChannel }: UseWebRTCOptions) {
  const [error, setError] = useState<string | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const candidatesQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescSetRef = useRef(false);
  // Keep a stable ref to onDataChannel so closures always see the latest version
  const onDataChannelRef = useRef(onDataChannel);
  useEffect(() => {
    onDataChannelRef.current = onDataChannel;
  }, [onDataChannel]);

  const {
    setConnectionState,
    setIceConnectionState,
    setIceGatheringState,
    setDataChannelState,
    setSignalingState,
  } = useConnectionStore();

  const { setRoomPhase } = useRoomStore();

  const cleanup = useCallback(() => {
    if (dcRef.current) {
      dcRef.current.onopen = null;
      dcRef.current.onclose = null;
      dcRef.current.onmessage = null;
      dcRef.current.onerror = null;
      dcRef.current.close();
      dcRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.oniceconnectionstatechange = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.onsignalingstatechange = null;
      pcRef.current.ondatachannel = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    remoteDescSetRef.current = false;
    candidatesQueueRef.current = [];
    setError(null);
  }, []);

  const flushCandidates = useCallback(async () => {
    if (!pcRef.current || !remoteDescSetRef.current) return;
    while (candidatesQueueRef.current.length > 0) {
      const candidate = candidatesQueueRef.current.shift()!;
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('[webrtc] failed to add queued ICE candidate:', err);
      }
    }
  }, []);

  const setupDataChannel = useCallback((channel: RTCDataChannel) => {
    channel.onopen = () => {
      setDataChannelState('open');
      // FIX: notify only when the channel is actually open, not at creation time.
      // This prevents premature navigation away from Room before the connection is ready.
      if (onDataChannelRef.current) onDataChannelRef.current(channel);
    };
    channel.onclose = () => {
      setDataChannelState('closed');
    };
    channel.onerror = (err) => {
      console.error('[webrtc] DataChannel error:', err);
      setError('DataChannel error');
    };
  }, []); // no deps - uses ref for onDataChannel

  const createPeerConnection = useCallback(() => {
    if (pcRef.current) return pcRef.current;

    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate && roomId) {
        const socket = getSocket();
        if (socket) {
          socket.emit('ice-candidate', { roomId, candidate: event.candidate.toJSON() });
        }
      }
    };

    pc.oniceconnectionstatechange = () => {
      setIceConnectionState(pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        setRoomPhase('connecting');
      }
    };

    pc.onconnectionstatechange = () => {
      setConnectionState(pc.connectionState);
      if (pc.connectionState === 'connected') {
        setRoomPhase('connected');
      }
      if (pc.connectionState === 'failed') {
        setError('Peer connection failed');
      }
    };

    pc.onsignalingstatechange = () => {
      setSignalingState(pc.signalingState);
    };

    pc.onicegatheringstatechange = () => {
      setIceGatheringState(pc.iceGatheringState);
    };

    // Receiver side: ondatachannel fires when the sender's channel is accepted.
    // The channel is open at this point, so setupDataChannel -> onopen will fire immediately.
    pc.ondatachannel = (event) => {
      const channel = event.channel;
      dcRef.current = channel;
      setupDataChannel(channel);
      // Note: onDataChannel is NOT called here directly anymore.
      // It will be called inside channel.onopen (set by setupDataChannel above).
    };

    return pc;
  }, [roomId, setupDataChannel]);

  const createDataChannel = useCallback(() => {
    const pc = createPeerConnection();
    if (dcRef.current) return dcRef.current;

    const channel = pc.createDataChannel(DATA_CHANNEL_LABEL, {
      protocol: DATA_CHANNEL_PROTOCOL,
      ordered: true,
    });
    dcRef.current = channel;
    setupDataChannel(channel);
    // FIX: removed the immediate onDataChannel(channel) call that was here.
    // onDataChannel is now only called inside channel.onopen (in setupDataChannel).
    return channel;
  }, [createPeerConnection, setupDataChannel]);

  const startConnection = useCallback(async () => {
    if (!roomId) return;
    setError(null);
    setRoomPhase('connecting');

    const pc = createPeerConnection();
    const socket = getSocket();
    if (!socket) {
      setError('Socket not connected');
      return;
    }

    if (isSender) {
      createDataChannel();
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', { roomId, offer: pc.localDescription!.toJSON() });
      } catch (err) {
        setError('Failed to create offer');
        console.error('[webrtc] createOffer error:', err);
      }
    }

    const handleOffer = async (data: { offer: RTCSessionDescriptionInit }) => {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        remoteDescSetRef.current = true;
        await flushCandidates();

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', { roomId, answer: pc.localDescription!.toJSON() });
      } catch (err) {
        setError('Failed to handle offer');
        console.error('[webrtc] handleOffer error:', err);
      }
    };

    const handleAnswer = async (data: { answer: RTCSessionDescriptionInit }) => {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        remoteDescSetRef.current = true;
        await flushCandidates();
      } catch (err) {
        setError('Failed to handle answer');
        console.error('[webrtc] handleAnswer error:', err);
      }
    };

    const handleIceCandidate = async (data: { candidate: RTCIceCandidateInit }) => {
      try {
        if (remoteDescSetRef.current) {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } else {
          candidatesQueueRef.current.push(data.candidate);
        }
      } catch (err) {
        console.warn('[webrtc] failed to add ICE candidate:', err);
      }
    };

    socket.on('offer', handleOffer);
    socket.on('answer', handleAnswer);
    socket.on('ice-candidate', handleIceCandidate);

    return () => {
      socket.off('offer', handleOffer);
      socket.off('answer', handleAnswer);
      socket.off('ice-candidate', handleIceCandidate);
    };
  }, [roomId, isSender, createPeerConnection, createDataChannel, flushCandidates]);

  // FIX: Don't run cleanup on unmount — the RTCPeerConnection must survive the
  // navigation from Room -> Transfer. Transfer.tsx will close it when done.
  // We only clean up if the component unmounts WITHOUT having navigated away
  // (i.e. user cancelled), which is handled by Room's own useEffect cleanup.

  return {
    peerConnection: pcRef.current,
    dataChannel: dcRef.current,
    startConnection,
    error,
    cleanup,
  };
}
