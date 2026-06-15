import { describe, it, expect, vi } from 'vitest';
import { FileChunker, calculateTotalChunks } from '../services/file-chunker.js';

function createMockFile(name: string, size: number, type = 'application/octet-stream'): File {
  const buffer = new ArrayBuffer(size);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < view.length; i++) {
    view[i] = i & 0xFF;
  }
  return new File([buffer], name, { type });
}

describe('FileChunker', () => {
  describe('calculateTotalChunks', () => {
    it('should calculate 1 chunk for small file', () => {
      expect(calculateTotalChunks(100, 16384)).toBe(1);
    });

    it('should calculate exact chunk count for aligned files', () => {
      expect(calculateTotalChunks(16384, 16384)).toBe(1);
      expect(calculateTotalChunks(32768, 16384)).toBe(2);
    });

    it('should round up for partial last chunk', () => {
      expect(calculateTotalChunks(16385, 16384)).toBe(2);
    });
  });

  describe('constructor', () => {
    it('should set file properties', () => {
      const file = createMockFile('test.bin', 1000);
      const chunker = new FileChunker(file);

      expect(chunker.getFileName()).toBe('test.bin');
      expect(chunker.getFileSize()).toBe(1000);
      expect(chunker.getTotalChunks()).toBe(1);
    });

    it('should cap chunk size at 256 KB', () => {
      const file = createMockFile('test.bin', 500000);
      const chunker = new FileChunker(file, 300 * 1024);
      expect(chunker.getChunkSize()).toBe(256 * 1024);
    });
  });

  describe('readNextChunk', () => {
    it('should read the first chunk', async () => {
      const file = createMockFile('test.bin', 100);
      const chunker = new FileChunker(file, 64);

      const result = await chunker.readNextChunk();
      expect(result).not.toBeNull();
      expect(result!.sequence).toBe(0);
      expect(result!.isLast).toBe(false);
      expect(result!.data.length).toBe(64);
    });

    it('should mark last chunk correctly', async () => {
      const file = createMockFile('test.bin', 100);
      const chunker = new FileChunker(file, 64);

      const chunk1 = await chunker.readNextChunk();
      const chunk2 = await chunker.readNextChunk();

      expect(chunk1!.isLast).toBe(false);
      expect(chunk2!.isLast).toBe(true);
      expect(chunk2!.data.length).toBe(36);
    });

    it('should return null when file is fully read', async () => {
      const file = createMockFile('test.bin', 10);
      const chunker = new FileChunker(file, 64);

      await chunker.readNextChunk();
      const result = await chunker.readNextChunk();

      expect(result).toBeNull();
    });

    it('should return null when aborted', async () => {
      const file = createMockFile('test.bin', 1000);
      const chunker = new FileChunker(file, 64);

      chunker.abort();
      const result = await chunker.readNextChunk();

      expect(result).toBeNull();
    });
  });

  describe('readAllChunks', () => {
    it('should read all chunks with correct data', async () => {
      const file = createMockFile('test.bin', 200);
      const chunker = new FileChunker(file, 64);

      const chunks = await chunker.readAllChunks();

      expect(chunks.length).toBe(4);
      expect(chunks[0].sequence).toBe(0);
      expect(chunks[1].sequence).toBe(1);
      expect(chunks[2].sequence).toBe(2);
      expect(chunks[3].sequence).toBe(3);
      expect(chunks[3].isLast).toBe(true);
    });

    it('should report progress during reading', async () => {
      const file = createMockFile('test.bin', 128);
      const chunker = new FileChunker(file, 64);
      const progresses: number[] = [];

      await chunker.readAllChunks((progress) => {
        progresses.push(progress.percent);
      });

      expect(progresses.length).toBe(2);
      expect(progresses[0]).toBeCloseTo(50, 0);
      expect(progresses[1]).toBeCloseTo(100, 0);
    });
  });

  describe('progress tracking', () => {
    it('should report correct progress', () => {
      const file = createMockFile('test.bin', 200);
      const chunker = new FileChunker(file, 100);

      const initial = chunker.getProgress();
      expect(initial.bytesRead).toBe(0);
      expect(initial.totalChunks).toBe(2);
      expect(initial.percent).toBe(0);
    });
  });

  describe('seek', () => {
    it('should skip chunks when seeking forward', async () => {
      const file = createMockFile('test.bin', 200);
      const chunker = new FileChunker(file, 64);
      expect(chunker.getCurrentSequence()).toBe(0);

      chunker.seek(2);
      expect(chunker.getCurrentSequence()).toBe(2);

      const chunk = await chunker.readNextChunk();
      expect(chunk).not.toBeNull();
      expect(chunk!.sequence).toBe(2);
    });

    it('should clamp negative seek to 0', () => {
      const file = createMockFile('test.bin', 100);
      const chunker = new FileChunker(file, 64);
      chunker.seek(-5);
      expect(chunker.getCurrentSequence()).toBe(0);
    });

    it('should clamp seek beyond total to end', async () => {
      const file = createMockFile('test.bin', 64);
      const chunker = new FileChunker(file, 64);
      chunker.seek(100);

      const chunk = await chunker.readNextChunk();
      expect(chunk).toBeNull();
    });
  });
});
