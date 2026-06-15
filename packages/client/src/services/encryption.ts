const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;

export async function generateEncryptionKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ['encrypt', 'decrypt'],
  );
}

function deriveIV(sequence: number): Uint8Array {
  const buffer = new ArrayBuffer(IV_LENGTH);
  const view = new DataView(buffer);
  view.setUint32(0, sequence, false);
  return new Uint8Array(buffer);
}

export async function encryptChunk(
  data: Uint8Array,
  key: CryptoKey,
  sequence: number,
): Promise<Uint8Array> {
  const iv = deriveIV(sequence);
  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv } as any,
    key,
    data as any,
  );
  return new Uint8Array(encrypted);
}

export async function decryptChunk(
  data: Uint8Array,
  key: CryptoKey,
  sequence: number,
): Promise<Uint8Array> {
  const iv = deriveIV(sequence);
  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv } as any,
    key,
    data as any,
  );
  return new Uint8Array(decrypted);
}

export async function exportKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

export async function importKey(base64Key: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(base64Key), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'raw',
    raw,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt'],
  );
}
