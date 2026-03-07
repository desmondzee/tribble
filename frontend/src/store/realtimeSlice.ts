import { create } from 'zustand';
import { applyRealtimeEvent } from '@/lib/realtime';

interface RealtimeSlice {
  connected: boolean;
  lastEventAt: string | null;
  recentEventIds: string[];
  reconnectAttempts: number;
  setConnected: (v: boolean) => void;
  setLastEventAt: (t: string) => void;
  addRecentEvent: (id: string) => void;
  setReconnectAttempts: (v: number) => void;
}

export const useRealtimeStore = create<RealtimeSlice>((set) => ({
  connected: true,
  lastEventAt: new Date().toISOString(),
  recentEventIds: [],
  reconnectAttempts: 0,
  setConnected: (v) => set({ connected: v }),
  setLastEventAt: (t) => set({ lastEventAt: t }),
  addRecentEvent: (id) =>
    set((state) => applyRealtimeEvent(state, { id })),
  setReconnectAttempts: (v) => set({ reconnectAttempts: v }),
}));
