import { describe, it, expect } from 'vitest';
import {
  computeSHA256,
  computeSHA256FromChunks,
  bytesToHex,
  hexToBytes,
  areHashesEqual,
} from '../services/sha256.js';

describe('sha256', () => {
  describe('computeSHA256', () => {
    it('should hash an empty buffer', async () => {
      const hash = await computeSHA256(new Uint8Array(0));
      expect(hash.length).toBe(32);
      expect(bytesToHex(hash)).toBe(
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      );
    });

    it('should hash a simple string', async () => {
      const encoder = new TextEncoder();
      const hash = await computeSHA256(encoder.encode('hello world'));
      expect(bytesToHex(hash)).toBe(
        'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
      );
    });

    it('should produce consistent results', async () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const hash1 = await computeSHA256(data);
      const hash2 = await computeSHA256(data);
      expect(bytesToHex(hash1)).toBe(bytesToHex(hash2));
    });
  });

  describe('computeSHA256FromChunks', () => {
    it('should hash concatenated chunks', async () => {
      const chunks = [
        new Uint8Array([1, 2, 3]),
        new Uint8Array([4, 5, 6]),
      ];
      const hash = await computeSHA256FromChunks(chunks);
      const expected = await computeSHA256(new Uint8Array([1, 2, 3, 4, 5, 6]));
      expect(bytesToHex(hash)).toBe(bytesToHex(expected));
    });

    it('should handle single chunk', async () => {
      const chunks = [new Uint8Array([42])];
      const hash = await computeSHA256FromChunks(chunks);
      expect(hash.length).toBe(32);
    });

    it('should handle empty chunks', async () => {
      const hash = await computeSHA256FromChunks([]);
      expect(bytesToHex(hash)).toBe(
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      );
    });
  });

  describe('bytesToHex', () => {
    it('should convert bytes to hex string', () => {
      const bytes = new Uint8Array([0xAB, 0xCD, 0xEF]);
      expect(bytesToHex(bytes)).toBe('abcdef');
    });

    it('should pad single digit hex values', () => {
      const bytes = new Uint8Array([0x01, 0x0A]);
      expect(bytesToHex(bytes)).toBe('010a');
    });

    it('should handle empty array', () => {
      expect(bytesToHex(new Uint8Array())).toBe('');
    });
  });

  describe('hexToBytes', () => {
    it('should convert hex string to bytes', () => {
      const bytes = hexToBytes('abcdef');
      expect(Array.from(bytes)).toEqual([0xAB, 0xCD, 0xEF]);
    });

    it('should handle zero-padded values', () => {
      const bytes = hexToBytes('010a');
      expect(Array.from(bytes)).toEqual([1, 10]);
    });
  });

  describe('areHashesEqual', () => {
    it('should return true for equal hashes', () => {
      const a = new Uint8Array([1, 2, 3, 4]);
      const b = new Uint8Array([1, 2, 3, 4]);
      expect(areHashesEqual(a, b)).toBe(true);
    });

    it('should return false for different hashes', () => {
      const a = new Uint8Array([1, 2, 3, 4]);
      const b = new Uint8Array([1, 2, 3, 5]);
      expect(areHashesEqual(a, b)).toBe(false);
    });

    it('should return false for different lengths', () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2, 3, 4]);
      expect(areHashesEqual(a, b)).toBe(false);
    });
  });
});
