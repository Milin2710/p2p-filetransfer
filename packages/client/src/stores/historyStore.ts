import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { HistoryEntry } from '../services/history-store.js';
import {
  getAllHistoryEntries,
  saveHistoryEntry,
  deleteHistoryEntry,
  clearAllHistory,
} from '../services/history-store.js';
import { deleteCheckpoint, deleteRoomChunks } from '../services/checkpoint-store.js';

export type RoleFilter = 'all' | 'sender' | 'receiver';
export type StatusFilter = 'all' | 'completed' | 'error' | 'cancelled' | 'interrupted';

export interface HistoryState {
  rawEntries: HistoryEntry[];
  isLoading: boolean;
  filterRole: RoleFilter;
  filterStatus: StatusFilter;

  loadEntries: () => Promise<void>;
  addEntry: (entry: HistoryEntry) => Promise<void>;
  removeEntry: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
  setFilterRole: (role: RoleFilter) => void;
  setFilterStatus: (status: StatusFilter) => void;
}

const initialState = {
  rawEntries: [] as HistoryEntry[],
  isLoading: false,
  filterRole: 'all' as RoleFilter,
  filterStatus: 'all' as StatusFilter,
};

export const useHistoryStore = create<HistoryState>()(
  devtools(
    (set, get) => ({
      ...initialState,

      loadEntries: async () => {
        set({ isLoading: true });
        const entries = await getAllHistoryEntries();
        set({ rawEntries: entries, isLoading: false });
      },

      addEntry: async (entry) => {
        await saveHistoryEntry(entry);
        await get().loadEntries();
      },

      removeEntry: async (id) => {
        const entry = get().rawEntries.find((e) => e.id === id);
        if (entry) {
          await deleteCheckpoint(entry.roomId);
          await deleteRoomChunks(entry.roomId);
        }
        await deleteHistoryEntry(id);
        set((state) => ({
          rawEntries: state.rawEntries.filter((e) => e.id !== id),
        }));
      },

      clearAll: async () => {
        await clearAllHistory();
        set({ rawEntries: [] });
      },

      setFilterRole: (role) => set({ filterRole: role }),

      setFilterStatus: (status) => set({ filterStatus: status }),
    }),
    { name: 'p2p-history' },
  ),
);
