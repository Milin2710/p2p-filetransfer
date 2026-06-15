import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export type TransferPhase = 'idle' | 'hashing' | 'meta' | 'transferring' | 'verifying' | 'complete' | 'error' | 'cancelled';

export interface BatchFileEntry {
  name: string;
  size: number;
  type: string;
  transferred: boolean;
}

export interface TransferState {
  fileName: string | null;
  fileSize: number | null;
  fileType: string | null;
  sha256Hash: string | null;
  receiverHash: string | null;
  totalChunks: number;
  chunkSizeBytes: number;
  previewUrl: string | null;

  batchFiles: BatchFileEntry[];
  currentFileIndex: number;

  chunksSent: number;
  chunksAcknowledged: number;
  chunksReceived: number;
  bytesTransferred: number;
  currentSpeedBps: number;
  averageSpeedBps: number;
  etaMs: number;
  progressPercent: number;

  transferPhase: TransferPhase;
  transferError: string | null;
  lastErrorCode: string | null;
  lastAcknowledgedChunk: number;

  setFileMetadata: (meta: { fileName: string; fileSize: number; fileType: string }) => void;
  setProgress: (progress: Partial<TransferState>) => void;
  setTransferPhase: (phase: TransferPhase) => void;
  setTransferError: (error: string | null) => void;
  setSha256Hash: (hash: string) => void;
  setReceiverHash: (hash: string) => void;
  setPreviewUrl: (url: string | null) => void;
  setBatchFiles: (files: BatchFileEntry[]) => void;
  setCurrentFileIndex: (index: number) => void;
  markBatchFileTransferred: (index: number) => void;
  resetFileProgress: () => void;
  incrementChunksSent: () => void;
  incrementChunksAcknowledged: () => void;
  incrementChunksReceived: () => void;
  updateSpeed: (bytes: number, elapsedMs: number) => void;
  reset: () => void;
}

const initialState = {
  fileName: null as string | null,
  fileSize: null as number | null,
  fileType: null as string | null,
  sha256Hash: null as string | null,
  receiverHash: null as string | null,
  totalChunks: 0,
  chunkSizeBytes: 16384,
  previewUrl: null as string | null,
  batchFiles: [] as BatchFileEntry[],
  currentFileIndex: 0,

  chunksSent: 0,
  chunksAcknowledged: 0,
  chunksReceived: 0,
  bytesTransferred: 0,
  currentSpeedBps: 0,
  averageSpeedBps: 0,
  etaMs: 0,
  progressPercent: 0,

  transferPhase: 'idle' as TransferPhase,
  transferError: null as string | null,
  lastErrorCode: null as string | null,
  lastAcknowledgedChunk: -1,
};

export const useTransferStore = create<TransferState>()(
  devtools(
    (set, get) => ({
      ...initialState,

      setFileMetadata: (meta) => set(meta),

      setProgress: (progress) => set(progress),

      setTransferPhase: (phase) => set({ transferPhase: phase }),

      setTransferError: (error) => set({ transferError: error }),

      setSha256Hash: (hash) => set({ sha256Hash: hash }),

      setReceiverHash: (hash) => set({ receiverHash: hash }),

      setPreviewUrl: (url) => {
        const prev = get().previewUrl;
        if (prev) URL.revokeObjectURL(prev);
        set({ previewUrl: url });
      },

      setBatchFiles: (files) => set({ batchFiles: files, currentFileIndex: 0 }),

      setCurrentFileIndex: (index) => set({ currentFileIndex: index }),

      markBatchFileTransferred: (index) =>
        set((state) => {
          const updated = [...state.batchFiles];
          if (updated[index]) {
            updated[index] = { ...updated[index], transferred: true };
          }
          return { batchFiles: updated };
        }),

      resetFileProgress: () => {
        const prev = get().previewUrl;
        if (prev) URL.revokeObjectURL(prev);
        set({
          fileName: null,
          fileSize: null,
          fileType: null,
          sha256Hash: null,
          receiverHash: null,
          previewUrl: null,
          totalChunks: 0,
          chunkSizeBytes: 16384,
          chunksSent: 0,
          chunksAcknowledged: 0,
          chunksReceived: 0,
          bytesTransferred: 0,
          currentSpeedBps: 0,
          averageSpeedBps: 0,
          etaMs: 0,
          progressPercent: 0,
          lastAcknowledgedChunk: -1,
        });
      },

      incrementChunksSent: () => set((state) => ({ chunksSent: state.chunksSent + 1 })),

      incrementChunksAcknowledged: () =>
        set((state) => {
          const newAcked = state.chunksAcknowledged + 1;
          const progress = state.totalChunks > 0 ? (newAcked / state.totalChunks) * 100 : 0;
          return { chunksAcknowledged: newAcked, progressPercent: progress };
        }),

      incrementChunksReceived: () =>
        set((state) => {
          const newReceived = state.chunksReceived + 1;
          const progress = state.totalChunks > 0 ? (newReceived / state.totalChunks) * 100 : 0;
          return { chunksReceived: newReceived, progressPercent: progress };
        }),

      updateSpeed: (bytes, elapsedMs) =>
        set((state) => {
          const currentSpeed = elapsedMs > 0 ? (bytes / elapsedMs) * 1000 : 0;
          const averageSpeed = state.averageSpeedBps
            ? 0.7 * state.averageSpeedBps + 0.3 * currentSpeed
            : currentSpeed;
          const newBytesTransferred = state.bytesTransferred + bytes;

          if (state.fileSize === null) {
            return {
              bytesTransferred: newBytesTransferred,
              currentSpeedBps: currentSpeed,
              averageSpeedBps: averageSpeed,
            };
          }

          const remainingBytes = state.fileSize - newBytesTransferred;
          const eta = averageSpeed > 0 ? (remainingBytes / averageSpeed) * 1000 : 0;

          return {
            bytesTransferred: newBytesTransferred,
            currentSpeedBps: currentSpeed,
            averageSpeedBps: averageSpeed,
            etaMs: eta,
          };
        }),

      reset: () => {
        const prev = get().previewUrl;
        if (prev) URL.revokeObjectURL(prev);
        set(initialState);
      },
    }),
    { name: 'p2p-transfer' },
  ),
);
