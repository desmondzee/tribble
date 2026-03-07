import { create } from "zustand";

interface UISlice {
  sidebarExpanded: boolean;
  filterPanelOpen: boolean;
  rightPanelOpen: boolean;
  rightPanelTab: "agent" | "news_feed" | "drone_ops";
  timelineOpen: boolean;
  commandPaletteOpen: boolean;
  selectedEventId: string | null;
  activeConflictZoneId: string | null;
  setSidebarExpanded: (expanded: boolean) => void;
  setFilterPanelOpen: (open: boolean) => void;
  setRightPanelOpen: (open: boolean) => void;
  setRightPanelTab: (tab: "agent" | "news_feed" | "drone_ops") => void;
  setTimelineOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setSelectedEventId: (id: string | null) => void;
  setActiveConflictZoneId: (id: string | null) => void;
}

export const useUIStore = create<UISlice>((set) => ({
  sidebarExpanded: true,
  filterPanelOpen: false,
  rightPanelOpen: false,
  rightPanelTab: "agent",
  timelineOpen: false,
  commandPaletteOpen: false,
  selectedEventId: null,
  activeConflictZoneId: null,
  setSidebarExpanded: (expanded) => set({ sidebarExpanded: expanded }),
  setFilterPanelOpen: (open) => set({ filterPanelOpen: open }),
  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
  setTimelineOpen: (open) => set({ timelineOpen: open }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setSelectedEventId: (id) => set({ selectedEventId: id }),
  setActiveConflictZoneId: (id) => set({ activeConflictZoneId: id }),
}));
