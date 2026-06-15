import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useFileTransfer } from '../hooks/useFileTransfer';
import { useTransferStore } from '../stores/transferStore';
import { encodeMessage, decodeMessage } from '@p2p-share/shared';
import { MessageType } from '@p2p-share/shared';
import type { DataChannelMessage } from '@p2p-share/shared';
import { saveCheckpoint, clearAllCheckpoints } from '../services/checkpoint-store';

function createMockDataChannel(): RTCDataChannel & { __triggerMessage: (data: ArrayBuffer) => void } {
  const listeners = new Map<string, Set<EventListener>>();

  const triggerMessage = (data: ArrayBuffer) => {
    const event = new MessageEvent('message', { data });
    const messageListeners = listeners.get('message');
    if (messageListeners) {
      messageListeners.forEach((l) => l(event));
    }
  };

  return {
    readyState: 'open' as RTCDataChannelState,
    binaryType: 'arraybuffer' as string,
    bufferedAmount: 0,
    send: vi.fn(),
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    }),
    removeEventListener: vi.fn((type: string, listener: EventListener) => {
      listeners.get(type)?.delete(listener);
    }),
    close: vi.fn(),
    __triggerMessage: triggerMessage,
  } as unknown as RTCDataChannel & { __triggerMessage: (data: ArrayBuffer) => void };
}

describe('useFileTransfer', () => {
  let dataChannel: RTCDataChannel & { __triggerMessage: (data: ArrayBuffer) => void };

  beforeEach(() => {
    dataChannel = createMockDataChannel();
    useTransferStore.getState().reset();
  });

  it('should return initial state', () => {
    const { result } = renderHook(() => useFileTransfer({ dataChannel: null }));
    expect(result.current.isTransferring).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.receivedFileMeta).toBeNull();
    expect(typeof result.current.sendFiles).toBe('function');
    expect(typeof result.current.cancel).toBe('function');
  });

  it('should handle sender cancel when not transferring', () => {
    const { result } = renderHook(() => useFileTransfer({ dataChannel }));
    act(() => { result.current.cancel(); });
    expect(result.current.isTransferring).toBe(false);
    expect(useTransferStore.getState().transferPhase).toBe('cancelled');
  });

  it('should handle incoming FILE_META and send ack', async () => {
    const { result } = renderHook(() => useFileTransfer({ dataChannel }));

    const metaMsg: DataChannelMessage = {
      type: MessageType.FILE_META,
      fileName: 'test.txt',
      fileSize: BigInt(100),
      mimeType: 'text/plain',
      sha256Hash: new Uint8Array(32),
      totalChunks: 2,
      chunkSize: 64,
    };

    act(() => {
      dataChannel.__triggerMessage(encodeMessage(metaMsg));
    });

    await waitFor(() => {
      expect(result.current.receivedFileMeta).not.toBeNull();
    });
    expect(result.current.receivedFileMeta?.fileName).toBe('test.txt');
    expect(dataChannel.send).toHaveBeenCalled();
  });

  it('should handle RESUME message and send RESUME_ACK', async () => {
    await clearAllCheckpoints();
    const roomId = 'test-resume-room';
    await saveCheckpoint(roomId, {
      role: 'receiver',
      fileName: 'test.bin',
      fileSize: 200,
      totalChunks: 4,
      lastSentChunk: 0,
      lastReceivedChunk: 2,
      lastAcknowledgedChunk: 0,
      totalBytesSent: 0,
      timestamp: Date.now(),
    });

    const { result } = renderHook(() => useFileTransfer({ dataChannel, roomId }));

    const resumeMsg: DataChannelMessage = {
      type: MessageType.RESUME,
      lastAcknowledgedChunk: 3,
    };

    act(() => {
      dataChannel.__triggerMessage(encodeMessage(resumeMsg));
    });

    await waitFor(() => {
      const lastCall = (dataChannel.send as ReturnType<typeof vi.fn>).mock.lastCall;
      if (lastCall) {
        const sent = lastCall[0] as ArrayBuffer;
        const decoded = decodeMessage(sent);
        expect(decoded.type).toBe(MessageType.RESUME_ACK);
        if (decoded.type === MessageType.RESUME_ACK) {
          expect(decoded.lastReceivedChunk).toBe(2);
        }
      } else {
        throw new Error('No message was sent');
      }
    });
  });

  it('should handle RESUME message with no checkpoint', async () => {
    await clearAllCheckpoints();

    const { result } = renderHook(() => useFileTransfer({ dataChannel, roomId: 'fresh-room' }));

    const resumeMsg: DataChannelMessage = {
      type: MessageType.RESUME,
      lastAcknowledgedChunk: 5,
    };

    act(() => {
      dataChannel.__triggerMessage(encodeMessage(resumeMsg));
    });

    await waitFor(() => {
      const lastCall = (dataChannel.send as ReturnType<typeof vi.fn>).mock.lastCall;
      if (lastCall) {
        const sent = lastCall[0] as ArrayBuffer;
        const decoded = decodeMessage(sent);
        expect(decoded.type).toBe(MessageType.RESUME_ACK);
        if (decoded.type === MessageType.RESUME_ACK) {
          expect(decoded.lastReceivedChunk).toBe(0);
        }
      } else {
        throw new Error('No message was sent');
      }
    });
  });

  it('should handle incoming ERROR message', async () => {
    const { result } = renderHook(() => useFileTransfer({ dataChannel }));

    const errMsg: DataChannelMessage = {
      type: MessageType.ERROR,
      code: 0x0001 as any,
      message: 'Something went wrong',
    };

    act(() => {
      dataChannel.__triggerMessage(encodeMessage(errMsg));
    });

    await waitFor(() => {
      expect(result.current.error).toBe('Something went wrong');
    });
    expect(useTransferStore.getState().transferPhase).toBe('error');
  });
});
