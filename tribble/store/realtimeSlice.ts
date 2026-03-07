import { create } from "zustand";

interface RealtimeSlice {
  connected: boolean;
  recentEventIds: string[];
  setConnected: (v: boolean) => void;
  addRecentEvent: (id: string) => void;
}

export const useRealtimeStore = create<RealtimeSlice>((set) => ({
  connected: true,
  recentEventIds: [],
  setConnected: (v) => set({ connected: v }),
  addRecentEvent: (id) =>
    set((state) => ({
      recentEventIds: [id, ...state.recentEventIds].slice(0, 20),
    })),
}));
