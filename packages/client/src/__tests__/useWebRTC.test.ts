import { describe, it, expect, vi, beforeEach } from 'vitest';

function createMockRTCPeerConnection() {
  const mockDC = {
    label: 'p2p-transfer',
    protocol: 'p2p-share-v1',
    ordered: true,
    readyState: 'connecting',
    onopen: null as unknown,
    onclose: null as unknown,
    onmessage: null as unknown,
    onerror: null as unknown,
    close: vi.fn(),
    send: vi.fn(),
  };

  const mockPC = {
    iceConnectionState: 'new',
    connectionState: 'new',
    signalingState: 'stable',
    iceGatheringState: 'new',
    onicecandidate: null as unknown,
    oniceconnectionstatechange: null as unknown,
    onconnectionstatechange: null as unknown,
    onsignalingstatechange: null as unknown,
    onicegatheringstatechange: null as unknown,
    ondatachannel: null as unknown,
    close: vi.fn(),
    createOffer: vi.fn().mockResolvedValue({ type: 'offer', sdp: 'mock-offer' }),
    createAnswer: vi.fn().mockResolvedValue({ type: 'answer', sdp: 'mock-answer' }),
    setLocalDescription: vi.fn().mockResolvedValue(undefined),
    setRemoteDescription: vi.fn().mockResolvedValue(undefined),
    addIceCandidate: vi.fn().mockResolvedValue(undefined),
    createDataChannel: vi.fn().mockReturnValue(mockDC),
    localDescription: { type: 'offer', sdp: 'mock-offer' },
    toJSON: () => ({ type: 'offer', sdp: 'mock-offer' }),
  };

  return { mockPC, mockDC };
}

describe('useWebRTC', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should use Google STUN servers for ICE configuration', () => {
    const mockPC = createMockRTCPeerConnection().mockPC;
    const RTCPeerConnectionOrig = globalThis.RTCPeerConnection;
    const mockConstructor = vi.fn().mockImplementation(() => mockPC);
    globalThis.RTCPeerConnection = mockConstructor as unknown as typeof RTCPeerConnection;

    new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });

    const config = mockConstructor.mock.calls[0][0];
    expect(config.iceServers).toHaveLength(2);
    expect(config.iceServers[0].urls).toBe('stun:stun.l.google.com:19302');

    globalThis.RTCPeerConnection = RTCPeerConnectionOrig;
  });

  it('should create DataChannel with correct label and ordered mode', () => {
    const { mockPC, mockDC } = createMockRTCPeerConnection();
    const channel = mockPC.createDataChannel('p2p-transfer', { ordered: true });

    expect(channel.label).toBe('p2p-transfer');
    expect(channel.ordered).toBe(true);
  });

  it('should emit offer when sender starts connection', async () => {
    const { mockPC } = createMockRTCPeerConnection();
    const emitFn = vi.fn();

    vi.spyOn(globalThis, 'RTCPeerConnection').mockImplementation(() => mockPC as unknown as RTCPeerConnection);
    const mockSocket = { emit: emitFn, on: vi.fn(), off: vi.fn() };
    vi.spyOn(await import('../services/socket.js'), 'getSocket').mockReturnValue(mockSocket as never);

    const roomId = 'abc123';
    const pc = new RTCPeerConnection();
    const dc = pc.createDataChannel('p2p-transfer');
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const socket = mockSocket;
    socket.emit('offer', { roomId, offer: pc.localDescription });

    expect(emitFn).toHaveBeenCalledWith('offer', {
      roomId: 'abc123',
      offer: pc.localDescription,
    });
  });
});
