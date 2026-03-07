import { create } from "zustand";

export type RightPanelTab = "agent" | "news_feed" | "drone_ops" | "cluster_inspect";

interface UISlice {
  sidebarExpanded: boolean;
  filterPanelOpen: boolean;
  rightPanelOpen: boolean;
  rightPanelTab: RightPanelTab;
  timelineOpen: boolean;
  commandPaletteOpen: boolean;
  selectedEventId: string | null;
  selectedNewsEventId: string | null;
  activeConflictZoneId: string | null;
  selectedClusterId: string | null;
  locationPickMode: boolean;
  setSidebarExpanded: (expanded: boolean) => void;
  setFilterPanelOpen: (open: boolean) => void;
  setRightPanelOpen: (open: boolean) => void;
  setRightPanelTab: (tab: RightPanelTab) => void;
  setTimelineOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setSelectedEventId: (id: string | null) => void;
  setSelectedNewsEventId: (id: string | null) => void;
  setActiveConflictZoneId: (id: string | null) => void;
  setSelectedClusterId: (id: string | null) => void;
  setLocationPickMode: (on: boolean) => void;
}

export const useUIStore = create<UISlice>((set) => ({
  sidebarExpanded: true,
  filterPanelOpen: false,
  rightPanelOpen: false,
  rightPanelTab: "agent",
  timelineOpen: false,
  commandPaletteOpen: false,
  selectedEventId: null,
  selectedNewsEventId: null,
  activeConflictZoneId: null,
  selectedClusterId: null,
  locationPickMode: false,
  setSidebarExpanded: (expanded) => set({ sidebarExpanded: expanded }),
  setFilterPanelOpen: (open) => set({ filterPanelOpen: open }),
  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
  setTimelineOpen: (open) => set({ timelineOpen: open }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setSelectedEventId: (id) => set({ selectedEventId: id }),
  setSelectedNewsEventId: (id) => set({ selectedNewsEventId: id }),
  setActiveConflictZoneId: (id) => set({ activeConflictZoneId: id }),
  setSelectedClusterId: (id) => set({ selectedClusterId: id }),
  setLocationPickMode: (on) => set({ locationPickMode: on }),
}));
