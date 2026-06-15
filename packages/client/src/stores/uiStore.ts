import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message?: string;
  timestamp: number;
  durationMs: number;
}

export interface UIState {
  theme: 'light' | 'dark' | 'system';
  resolvedTheme: 'light' | 'dark';
  notifications: Notification[];
  activeModal: string | null;
  modalData: unknown;

  setTheme: (theme: UIState['theme']) => void;
  setResolvedTheme: (theme: 'light' | 'dark') => void;
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp'>) => void;
  dismissNotification: (id: string) => void;
  openModal: (name: string, data?: unknown) => void;
  closeModal: () => void;
  reset: () => void;
}

const initialState = {
  theme: 'dark' as 'light' | 'dark' | 'system',
  resolvedTheme: 'dark' as 'light' | 'dark',
  notifications: [] as Notification[],
  activeModal: null as string | null,
  modalData: null as unknown,
};

export const useUIStore = create<UIState>()(
  devtools(
    (set) => ({
      ...initialState,

      setTheme: (theme) => set({ theme }),
      setResolvedTheme: (theme) => set({ resolvedTheme: theme }),

      addNotification: (notification) =>
        set((state) => ({
          notifications: [
            ...state.notifications,
            {
              ...notification,
              id: crypto.randomUUID(),
              timestamp: Date.now(),
            },
          ],
        })),

      dismissNotification: (id) =>
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        })),

      openModal: (name, data = null) => set({ activeModal: name, modalData: data }),
      closeModal: () => set({ activeModal: null, modalData: null }),
      reset: () => set(initialState),
    }),
    { name: 'p2p-ui' },
  ),
);
