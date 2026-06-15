import { describe, it, expect, beforeEach } from 'vitest';
import { useRoomStore } from '../stores/roomStore.js';
import { useConnectionStore } from '../stores/connectionStore.js';
import { useTransferStore } from '../stores/transferStore.js';
import { useUIStore } from '../stores/uiStore.js';
import { useResumeStore } from '../stores/resumeStore.js';
import { useHistoryStore } from '../stores/historyStore.js';

describe('roomStore', () => {
  beforeEach(() => {
    useRoomStore.getState().reset();
  });

  it('should start with idle phase', () => {
    const state = useRoomStore.getState();
    expect(state.roomPhase).toBe('idle');
    expect(state.roomId).toBeNull();
    expect(state.peerConnected).toBe(false);
  });

  it('should set room ID and phase', () => {
    useRoomStore.getState().setRoomId('abc123');
    useRoomStore.getState().setRoomPhase('waiting');
    expect(useRoomStore.getState().roomId).toBe('abc123');
    expect(useRoomStore.getState().roomPhase).toBe('waiting');
  });

  it('should track peer connection state', () => {
    useRoomStore.getState().setPeerConnected(true);
    expect(useRoomStore.getState().peerConnected).toBe(true);
  });

  it('should handle room error', () => {
    useRoomStore.getState().setRoomError('Room not found');
    expect(useRoomStore.getState().roomError).toBe('Room not found');
  });

  it('should reset to initial state', () => {
    useRoomStore.getState().setRoomId('abc123');
    useRoomStore.getState().setRoomPhase('connected');
    useRoomStore.getState().reset();
    expect(useRoomStore.getState().roomId).toBeNull();
    expect(useRoomStore.getState().roomPhase).toBe('idle');
  });
});

describe('connectionStore', () => {
  beforeEach(() => {
    useConnectionStore.getState().reset();
  });

  it('should start with new connections', () => {
    const state = useConnectionStore.getState();
    expect(state.connectionState).toBe('new');
    expect(state.dataChannelState).toBe('connecting');
  });

  it('should track connection states', () => {
    useConnectionStore.getState().setConnectionState('connected');
    useConnectionStore.getState().setIceConnectionState('completed');
    useConnectionStore.getState().setDataChannelState('open');

    expect(useConnectionStore.getState().connectionState).toBe('connected');
    expect(useConnectionStore.getState().iceConnectionState).toBe('completed');
    expect(useConnectionStore.getState().dataChannelState).toBe('open');
  });

  it('should track latency', () => {
    useConnectionStore.getState().setLatency(42);
    expect(useConnectionStore.getState().latencyMs).toBe(42);
  });
});

describe('transferStore', () => {
  beforeEach(() => {
    useTransferStore.getState().reset();
  });

  it('should start in idle phase', () => {
    const state = useTransferStore.getState();
    expect(state.transferPhase).toBe('idle');
    expect(state.progressPercent).toBe(0);
  });

  it('should set file metadata', () => {
    useTransferStore.getState().setFileMetadata({
      fileName: 'test.pdf',
      fileSize: 1024,
      fileType: 'application/pdf',
    });
    const state = useTransferStore.getState();
    expect(state.fileName).toBe('test.pdf');
    expect(state.fileSize).toBe(1024);
    expect(state.fileType).toBe('application/pdf');
  });

  it('should track chunk progress', () => {
    useTransferStore.getState().setFileMetadata({
      fileName: 'test.bin',
      fileSize: 32000,
      fileType: 'application/octet-stream',
    });
    useTransferStore.setState({ totalChunks: 10 });

    for (let i = 0; i < 5; i++) {
      useTransferStore.getState().incrementChunksAcknowledged();
    }
    expect(useTransferStore.getState().chunksAcknowledged).toBe(5);
    expect(useTransferStore.getState().progressPercent).toBe(50);
  });

  it('should calculate instantaneous speed correctly', () => {
    useTransferStore.getState().updateSpeed(16000, 1000);
    expect(useTransferStore.getState().currentSpeedBps).toBe(16000);
  });

  it('should apply exponential moving average for speed', () => {
    useTransferStore.getState().updateSpeed(16000, 1000);
    const first = useTransferStore.getState().averageSpeedBps;
    expect(first).toBe(16000);

    useTransferStore.getState().updateSpeed(8000, 1000);
    const second = useTransferStore.getState().averageSpeedBps;
    expect(second).toBeCloseTo(0.7 * 16000 + 0.3 * 8000, 1);

    useTransferStore.getState().updateSpeed(0, 1000);
    const third = useTransferStore.getState().averageSpeedBps;
    expect(third).toBeCloseTo(0.7 * (0.7 * 16000 + 0.3 * 8000) + 0.3 * 0, 1);
  });

  it('should accumulate bytesTransferred', () => {
    useTransferStore.getState().updateSpeed(1000, 500);
    expect(useTransferStore.getState().bytesTransferred).toBe(1000);

    useTransferStore.getState().updateSpeed(2000, 500);
    expect(useTransferStore.getState().bytesTransferred).toBe(3000);
  });

  it('should calculate ETA based on remaining bytes and average speed', () => {
    useTransferStore.getState().setFileMetadata({
      fileName: 'test.bin', fileSize: 100000, fileType: 'application/octet-stream',
    });
    useTransferStore.getState().updateSpeed(10000, 1000);
    const transferred = useTransferStore.getState().bytesTransferred;
    const avgSpeed = useTransferStore.getState().averageSpeedBps;
    const remaining = 100000 - transferred;
    const expectedEta = (remaining / avgSpeed) * 1000;
    expect(useTransferStore.getState().etaMs).toBeCloseTo(expectedEta, 0);
  });

  it('should return zero ETA when no file size is set', () => {
    useTransferStore.getState().updateSpeed(16000, 1000);
    expect(useTransferStore.getState().etaMs).toBe(0);
  });

  it('should return zero speed when elapsed time is zero', () => {
    useTransferStore.getState().updateSpeed(16000, 0);
    expect(useTransferStore.getState().currentSpeedBps).toBe(0);
  });

  it('should handle error state', () => {
    useTransferStore.getState().setTransferError('Connection lost');
    useTransferStore.getState().setTransferPhase('error');
    expect(useTransferStore.getState().transferPhase).toBe('error');
    expect(useTransferStore.getState().transferError).toBe('Connection lost');
  });
});

describe('uiStore', () => {
  beforeEach(() => {
    useUIStore.getState().reset();
  });

  it('should default to dark theme', () => {
    expect(useUIStore.getState().theme).toBe('dark');
  });

  it('should change theme', () => {
    useUIStore.getState().setTheme('light');
    expect(useUIStore.getState().theme).toBe('light');
  });

  it('should add and dismiss notifications', () => {
    useUIStore.getState().addNotification({
      type: 'info',
      title: 'Test',
      durationMs: 3000,
    });
    expect(useUIStore.getState().notifications.length).toBe(1);
    expect(useUIStore.getState().notifications[0].title).toBe('Test');

    const id = useUIStore.getState().notifications[0].id;
    useUIStore.getState().dismissNotification(id);
    expect(useUIStore.getState().notifications.length).toBe(0);
  });

  it('should manage modal state', () => {
    useUIStore.getState().openModal('confirm', { message: 'Sure?' });
    expect(useUIStore.getState().activeModal).toBe('confirm');
    expect(useUIStore.getState().modalData).toEqual({ message: 'Sure?' });

    useUIStore.getState().closeModal();
    expect(useUIStore.getState().activeModal).toBeNull();
  });
});

describe('resumeStore', () => {
  beforeEach(() => {
    useResumeStore.getState().clearResumableTransfer();
  });

  it('should start with no resumable transfer', () => {
    const state = useResumeStore.getState();
    expect(state.hasResumableTransfer).toBe(false);
    expect(state.role).toBeNull();
    expect(state.resumeAction).toBeNull();
  });

  it('should store resumable transfer metadata', () => {
    useResumeStore.getState().setResumableTransfer({
      role: 'sender',
      fileName: 'test.bin',
      fileSize: 1000,
      totalChunks: 20,
      lastReceivedChunk: 10,
      lastActivity: Date.now(),
    });

    const state = useResumeStore.getState();
    expect(state.hasResumableTransfer).toBe(true);
    expect(state.role).toBe('sender');
    expect(state.fileName).toBe('test.bin');
    expect(state.fileSize).toBe(1000);
    expect(state.totalChunks).toBe(20);
    expect(state.lastReceivedChunk).toBe(10);
  });

  it('should set resume action', () => {
    useResumeStore.getState().setResumableTransfer({
      role: 'receiver', fileName: 'a.txt', fileSize: 100,
      totalChunks: 5, lastReceivedChunk: 2, lastActivity: Date.now(),
    });
    expect(useResumeStore.getState().resumeAction).toBe('prompt');

    useResumeStore.getState().setResumeAction('resuming');
    expect(useResumeStore.getState().resumeAction).toBe('resuming');

    useResumeStore.getState().clearResumableTransfer();
    expect(useResumeStore.getState().hasResumableTransfer).toBe(false);
    expect(useResumeStore.getState().resumeAction).toBeNull();
  });
});

describe('historyStore', () => {
  beforeEach(async () => {
    await useHistoryStore.getState().clearAll();
    useHistoryStore.getState().setFilterRole('all');
    useHistoryStore.getState().setFilterStatus('all');
  });

  it('should start with empty entries', () => {
    expect(useHistoryStore.getState().rawEntries).toEqual([]);
  });

  it('should add and list entries', async () => {
    await useHistoryStore.getState().addEntry({
      roomId: 'room1',
      role: 'sender',
      fileName: 'test.txt',
      fileSize: 1000,
      fileType: 'text/plain',
      totalChunks: 10,
      chunksTransferred: 10,
      status: 'completed',
      sha256Hash: 'abc123',
      speedAvgBps: 1000000,
      startedAt: Date.now() - 10000,
      completedAt: Date.now(),
    });

    const entries = useHistoryStore.getState().rawEntries;
    expect(entries.length).toBeGreaterThanOrEqual(1);
    const entry = entries.find((e) => e.roomId === 'room1');
    expect(entry).toBeDefined();
    expect(entry!.fileName).toBe('test.txt');
    expect(entry!.status).toBe('completed');
  });

  it('should filter by role', async () => {
    await useHistoryStore.getState().addEntry({
      roomId: 'r1', role: 'sender', fileName: 'a.txt', fileSize: 100, fileType: 'text/plain',
      totalChunks: 2, chunksTransferred: 2, status: 'completed', sha256Hash: null,
      speedAvgBps: 0, startedAt: Date.now(), completedAt: Date.now(),
    });
    await useHistoryStore.getState().addEntry({
      roomId: 'r2', role: 'receiver', fileName: 'b.txt', fileSize: 200, fileType: 'text/plain',
      totalChunks: 4, chunksTransferred: 4, status: 'completed', sha256Hash: null,
      speedAvgBps: 0, startedAt: Date.now(), completedAt: Date.now(),
    });

    useHistoryStore.getState().setFilterRole('sender');
    await useHistoryStore.getState().loadEntries();
    const raw = useHistoryStore.getState().rawEntries;
    const filtered = raw.filter((e) => e.role === 'sender');
    expect(filtered.length).toBe(1);
    expect(filtered[0].role).toBe('sender');
    expect(raw.length).toBe(2);
  });
});
