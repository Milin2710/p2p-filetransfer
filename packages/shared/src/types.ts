export interface FileMeta {
  name: string;
  size: number;
  type: string;
  sha256Hash: string;
  totalChunks: number;
  chunkSize: number;
}

export interface BatchFileInfo {
  name: string;
  size: number;
  type: string;
}

export interface TransferProgress {
  chunksSent: number;
  chunksAcknowledged: number;
  chunksReceived: number;
  bytesTransferred: number;
  currentSpeedBps: number;
  averageSpeedBps: number;
  etaMs: number;
  progressPercent: number;
}

export interface PeerInfo {
  id: string;
  connected: boolean;
}

export interface RoomInfo {
  id: string;
  createdAt: number;
  expiresAt: number;
  peerCount: number;
}
