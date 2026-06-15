import { describe, it, expect } from 'vitest';
import {
  generateEncryptionKey,
  encryptChunk,
  decryptChunk,
  exportKey,
  importKey,
} from '../services/encryption.js';

describe('encryption (AES-GCM 256)', () => {
  it('should generate a CryptoKey', async () => {
    const key = await generateEncryptionKey();
    expect(key).toBeInstanceOf(CryptoKey);
    expect(key.type).toBe('secret');
    expect(key.usages).toContain('encrypt');
    expect(key.usages).toContain('decrypt');
  });

  it('should encrypt and decrypt a chunk', async () => {
    const key = await generateEncryptionKey();
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const encrypted = await encryptChunk(data, key, 0);
    const decrypted = await decryptChunk(encrypted, key, 0);
    expect(Array.from(decrypted)).toEqual([1, 2, 3, 4, 5]);
  });

  it('should produce different ciphertext for different sequence numbers', async () => {
    const key = await generateEncryptionKey();
    const data = new Uint8Array([42, 42, 42]);
    const enc1 = await encryptChunk(data, key, 0);
    const enc2 = await encryptChunk(data, key, 1);
    expect(Array.from(enc1)).not.toEqual(Array.from(enc2));
  });

  it('should fail decryption with wrong sequence number', async () => {
    const key = await generateEncryptionKey();
    const data = new Uint8Array([1, 2, 3]);
    const encrypted = await encryptChunk(data, key, 0);
    await expect(decryptChunk(encrypted, key, 1)).rejects.toThrow();
  });

  it('should export and import key as base64', async () => {
    const key = await generateEncryptionKey();
    const exported = await exportKey(key);
    expect(typeof exported).toBe('string');
    expect(exported.length).toBeGreaterThan(0);

    const imported = await importKey(exported);
    const testData = new Uint8Array([10, 20, 30]);
    const encrypted = await encryptChunk(testData, imported, 0);
    const decrypted = await decryptChunk(encrypted, imported, 0);
    expect(Array.from(decrypted)).toEqual([10, 20, 30]);
  });

  it('should encrypt large chunk data', async () => {
    const key = await generateEncryptionKey();
    const data = new Uint8Array(65536);
    for (let i = 0; i < data.length; i++) data[i] = i & 0xFF;

    const encrypted = await encryptChunk(data, key, 0);
    expect(encrypted.length).toBeGreaterThan(data.length);

    const decrypted = await decryptChunk(encrypted, key, 0);
    expect(decrypted.length).toBe(data.length);
    expect(decrypted[0]).toBe(0);
    expect(decrypted[65535]).toBe(255);
  });

  it('should handle empty data', async () => {
    const key = await generateEncryptionKey();
    const data = new Uint8Array(0);
    const encrypted = await encryptChunk(data, key, 0);
    const decrypted = await decryptChunk(encrypted, key, 0);
    expect(decrypted.length).toBe(0);
  });
});
