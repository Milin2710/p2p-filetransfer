import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export type ResumeAction = 'prompt' | 'resuming' | 'discarded' | null;

export interface ResumeState {
  hasResumableTransfer: boolean;
  role: 'sender' | 'receiver' | null;
  fileName: string;
  fileSize: number;
  totalChunks: number;
  lastReceivedChunk: number;
  lastActivity: number;
  resumeAction: ResumeAction;

  setResumableTransfer: (data: {
    role: 'sender' | 'receiver';
    fileName: string;
    fileSize: number;
    totalChunks: number;
    lastReceivedChunk: number;
    lastActivity: number;
  }) => void;
  setResumeAction: (action: ResumeAction) => void;
  clearResumableTransfer: () => void;
}

const initialState = {
  hasResumableTransfer: false,
  role: null as 'sender' | 'receiver' | null,
  fileName: '',
  fileSize: 0,
  totalChunks: 0,
  lastReceivedChunk: 0,
  lastActivity: 0,
  resumeAction: null as ResumeAction,
};

export const useResumeStore = create<ResumeState>()(
  devtools(
    (set) => ({
      ...initialState,

      setResumableTransfer: (data) =>
        set({
          hasResumableTransfer: true,
          ...data,
          resumeAction: 'prompt',
        }),

      setResumeAction: (action) => set({ resumeAction: action }),

      clearResumableTransfer: () => set(initialState),
    }),
    { name: 'p2p-resume' },
  ),
);
