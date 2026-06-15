export const ROOM_ID_LENGTH = 6;
export const ROOM_TTL_MS = 30 * 60 * 1000;
export const MAX_CHUNK_SIZE = 64 * 1024;
export const DEFAULT_CHUNK_SIZE = 16 * 1024;
export const MAX_FILE_SIZE_MVP = 50 * 1024 * 1024;
export const MAX_PEERS_PER_ROOM = 2;

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const v = bytes / Math.pow(1024, i);
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
