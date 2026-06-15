import { describe, it, expect } from 'vitest';
import { encodeMessage, decodeMessage } from '../protocol-io.js';
import { MessageType, ChunkAckStatus, ErrorCode, CancelReason } from '../protocol.js';

describe('Protocol I/O', () => {
  describe('FILE_META', () => {
    it('should round-trip a file meta message', () => {
      const original = {
        type: MessageType.FILE_META as const,
        fileName: 'test.pdf',
        fileSize: BigInt(1024),
        mimeType: 'application/pdf',
        sha256Hash: new Uint8Array(32).fill(0xAB),
        totalChunks: 10,
        chunkSize: 16384,
      };

      const encoded = encodeMessage(original);
      const decoded = decodeMessage(encoded);

      expect(decoded.type).toBe(MessageType.FILE_META);
      if (decoded.type === MessageType.FILE_META) {
        expect(decoded.fileName).toBe('test.pdf');
        expect(decoded.fileSize).toBe(BigInt(1024));
        expect(decoded.mimeType).toBe('application/pdf');
        expect(Array.from(decoded.sha256Hash)).toEqual(Array.from(original.sha256Hash));
        expect(decoded.totalChunks).toBe(10);
        expect(decoded.chunkSize).toBe(16384);
      }
    });

    it('should handle long file names', () => {
      const original = {
        type: MessageType.FILE_META as const,
        fileName: 'a'.repeat(255),
        fileSize: BigInt(0),
        mimeType: 'text/plain',
        sha256Hash: new Uint8Array(32),
        totalChunks: 0,
        chunkSize: 16384,
      };

      const encoded = encodeMessage(original);
      const decoded = decodeMessage(encoded);

      if (decoded.type === MessageType.FILE_META) {
        expect(decoded.fileName.length).toBe(255);
      }
    });
  });

  describe('CHUNK', () => {
    it('should round-trip a chunk message', () => {
      const original = {
        type: MessageType.CHUNK as const,
        sequence: 42,
        data: new Uint8Array([0x01, 0x02, 0x03, 0x04]),
      };

      const encoded = encodeMessage(original);
      const decoded = decodeMessage(encoded);

      expect(decoded.type).toBe(MessageType.CHUNK);
      if (decoded.type === MessageType.CHUNK) {
        expect(decoded.sequence).toBe(42);
        expect(Array.from(decoded.data)).toEqual([0x01, 0x02, 0x03, 0x04]);
      }
    });

    it('should handle large chunk data', () => {
      const data = new Uint8Array(16384);
      for (let i = 0; i < data.length; i++) data[i] = i & 0xFF;

      const original = {
        type: MessageType.CHUNK as const,
        sequence: 999,
        data,
      };

      const encoded = encodeMessage(original);
      const decoded = decodeMessage(encoded);

      expect(decoded.type).toBe(MessageType.CHUNK);
      if (decoded.type === MessageType.CHUNK) {
        expect(decoded.sequence).toBe(999);
        expect(decoded.data.length).toBe(16384);
        expect(decoded.data[0]).toBe(0);
        expect(decoded.data[16383]).toBe(0xFF);
      }
    });
  });

  describe('CHUNK_ACK', () => {
    it('should round-trip a chunk ack message', () => {
      const original = {
        type: MessageType.CHUNK_ACK as const,
        sequence: 7,
        status: ChunkAckStatus.OK,
      };

      const encoded = encodeMessage(original);
      const decoded = decodeMessage(encoded);

      expect(decoded.type).toBe(MessageType.CHUNK_ACK);
      if (decoded.type === MessageType.CHUNK_ACK) {
        expect(decoded.sequence).toBe(7);
        expect(decoded.status).toBe(ChunkAckStatus.OK);
      }
    });

    it('should round-trip a retry ack', () => {
      const original = {
        type: MessageType.CHUNK_ACK as const,
        sequence: 3,
        status: ChunkAckStatus.RETRY,
      };

      const encoded = encodeMessage(original);
      const decoded = decodeMessage(encoded);

      if (decoded.type === MessageType.CHUNK_ACK) {
        expect(decoded.status).toBe(ChunkAckStatus.RETRY);
      }
    });
  });

  describe('VERIFY_REQUEST', () => {
    it('should round-trip a verify request', () => {
      const original = {
        type: MessageType.VERIFY_REQUEST as const,
        senderHash: new Uint8Array(32).fill(0x42),
      };

      const encoded = encodeMessage(original);
      const decoded = decodeMessage(encoded);

      expect(decoded.type).toBe(MessageType.VERIFY_REQUEST);
      if (decoded.type === MessageType.VERIFY_REQUEST) {
        expect(Array.from(decoded.senderHash)).toEqual(Array.from(original.senderHash));
      }
    });
  });

  describe('VERIFY_RESPONSE', () => {
    it('should round-trip a matching response', () => {
      const original = {
        type: MessageType.VERIFY_RESPONSE as const,
        match: true,
      };

      const encoded = encodeMessage(original);
      const decoded = decodeMessage(encoded);

      expect(decoded.type).toBe(MessageType.VERIFY_RESPONSE);
      if (decoded.type === MessageType.VERIFY_RESPONSE) {
        expect(decoded.match).toBe(true);
        expect((decoded as any).receiverHash).toBeUndefined();
      }
    });

    it('should round-trip a non-matching response with hash', () => {
      const original = {
        type: MessageType.VERIFY_RESPONSE as const,
        match: false,
        receiverHash: new Uint8Array(32).fill(0xFF),
      };

      const encoded = encodeMessage(original);
      const decoded = decodeMessage(encoded);

      if (decoded.type === MessageType.VERIFY_RESPONSE) {
        expect(decoded.match).toBe(false);
        expect(Array.from(decoded.receiverHash!)).toEqual(Array.from(original.receiverHash!));
      }
    });
  });

  describe('ERROR', () => {
    it('should round-trip an error message', () => {
      const original = {
        type: MessageType.ERROR as const,
        code: ErrorCode.TIMEOUT,
        message: 'Chunk acknowledgement timeout',
      };

      const encoded = encodeMessage(original);
      const decoded = decodeMessage(encoded);

      expect(decoded.type).toBe(MessageType.ERROR);
      if (decoded.type === MessageType.ERROR) {
        expect(decoded.code).toBe(ErrorCode.TIMEOUT);
        expect(decoded.message).toBe('Chunk acknowledgement timeout');
      }
    });
  });

  describe('CANCEL', () => {
    it('should round-trip a cancel message', () => {
      const original = {
        type: MessageType.CANCEL as const,
        reason: CancelReason.USER_CANCELLED,
        message: 'User cancelled transfer',
      };

      const encoded = encodeMessage(original);
      const decoded = decodeMessage(encoded);

      expect(decoded.type).toBe(MessageType.CANCEL);
      if (decoded.type === MessageType.CANCEL) {
        expect(decoded.reason).toBe(CancelReason.USER_CANCELLED);
        expect(decoded.message).toBe('User cancelled transfer');
      }
    });
  });

  describe('RESUME', () => {
    it('should round-trip a resume message', () => {
      const original = {
        type: MessageType.RESUME as const,
        lastAcknowledgedChunk: 42,
      };

      const encoded = encodeMessage(original);
      const decoded = decodeMessage(encoded);

      expect(decoded.type).toBe(MessageType.RESUME);
      if (decoded.type === MessageType.RESUME) {
        expect(decoded.lastAcknowledgedChunk).toBe(42);
      }
    });

    it('should round-trip zero chunk resume', () => {
      const original = {
        type: MessageType.RESUME as const,
        lastAcknowledgedChunk: 0,
      };

      const encoded = encodeMessage(original);
      const decoded = decodeMessage(encoded);

      expect(decoded.type).toBe(MessageType.RESUME);
      if (decoded.type === MessageType.RESUME) {
        expect(decoded.lastAcknowledgedChunk).toBe(0);
      }
    });
  });

  describe('RESUME_ACK', () => {
    it('should round-trip a resume ack with last received chunk', () => {
      const original = {
        type: MessageType.RESUME_ACK as const,
        lastReceivedChunk: 37,
      };

      const encoded = encodeMessage(original);
      const decoded = decodeMessage(encoded);

      expect(decoded.type).toBe(MessageType.RESUME_ACK);
      if (decoded.type === MessageType.RESUME_ACK) {
        expect(decoded.lastReceivedChunk).toBe(37);
      }
    });
  });

  describe('BATCH_META', () => {
    it('should round-trip a batch meta message with single file', () => {
      const original = {
        type: MessageType.BATCH_META as const,
        files: [{ name: 'doc.pdf', size: 1024, type: 'application/pdf' }],
      };

      const encoded = encodeMessage(original);
      const decoded = decodeMessage(encoded);

      expect(decoded.type).toBe(MessageType.BATCH_META);
      if (decoded.type === MessageType.BATCH_META) {
        expect(decoded.files).toHaveLength(1);
        expect(decoded.files[0].name).toBe('doc.pdf');
        expect(decoded.files[0].size).toBe(1024);
        expect(decoded.files[0].type).toBe('application/pdf');
      }
    });

    it('should round-trip batch meta with multiple files', () => {
      const original = {
        type: MessageType.BATCH_META as const,
        files: [
          { name: 'a.txt', size: 100, type: 'text/plain' },
          { name: 'b.jpg', size: 200000, type: 'image/jpeg' },
          { name: 'c.mp4', size: 50000000, type: 'video/mp4' },
        ],
      };

      const encoded = encodeMessage(original);
      const decoded = decodeMessage(encoded);

      expect(decoded.type).toBe(MessageType.BATCH_META);
      if (decoded.type === MessageType.BATCH_META) {
        expect(decoded.files).toHaveLength(3);
        expect(decoded.files[1].name).toBe('b.jpg');
        expect(decoded.files[2].size).toBe(50000000);
      }
    });

    it('should handle long file names in batch meta', () => {
      const original = {
        type: MessageType.BATCH_META as const,
        files: [{ name: 'x'.repeat(255), size: 0, type: 'application/octet-stream' }],
      };

      const encoded = encodeMessage(original);
      const decoded = decodeMessage(encoded);

      expect(decoded.type).toBe(MessageType.BATCH_META);
      if (decoded.type === MessageType.BATCH_META) {
        expect(decoded.files[0].name.length).toBe(255);
      }
    });
  });

  describe('BATCH_END', () => {
    it('should round-trip a batch end message', () => {
      const original = { type: MessageType.BATCH_END as const };
      const encoded = encodeMessage(original);
      const decoded = decodeMessage(encoded);
      expect(decoded.type).toBe(MessageType.BATCH_END);
    });
  });

  describe('protocol errors', () => {
    it('should reject messages shorter than 5 bytes', () => {
      const buf = new ArrayBuffer(3);
      expect(() => decodeMessage(buf)).toThrow('Message too short');
    });

    it('should reject messages with payload exceeding buffer', () => {
      const buf = new ArrayBuffer(10);
      const view = new DataView(buf);
      view.setUint8(0, MessageType.CHUNK_ACK);
      view.setUint32(1, 1000, false);
      expect(() => decodeMessage(buf)).toThrow('exceeds buffer size');
    });

    it('should reject unknown message types', () => {
      const buf = new ArrayBuffer(10);
      const view = new DataView(buf);
      view.setUint8(0, 0xFF);
      view.setUint32(1, 0, false);
      expect(() => decodeMessage(buf)).toThrow('Unknown message type');
    });
  });
});
