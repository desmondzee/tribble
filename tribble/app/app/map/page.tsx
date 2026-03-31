"use client";

import { useUIStore } from "@/store/uiSlice";
import { LayerControlPanel } from "@/components/map/LayerControlPanel";
import { FilterPanel } from "@/components/map/FilterPanel";
import "@/styles/map.css";

export default function MapPage() {
  const {
    filterPanelOpen,
    setFilterPanelOpen,
  } = useUIStore();

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Left stack: FILTERS and LAYERS in same bar style as LEGEND */}
      <div className="map-left-stack">
        <div className="map-hud-panel map-bar-panel">
          <button
            type="button"
            className="map-layer-controls-bar w-full flex items-center justify-between gap-2 py-2 px-2 rounded-sm hover:bg-white/5 transition-colors"
            onClick={() => setFilterPanelOpen(true)}
            aria-expanded={filterPanelOpen}
            aria-label="Open filters"
          >
            <span className="map-layer-header mb-0">FILTERS</span>
            <span className="font-mono text-[9px] text-muted-foreground">F</span>
          </button>
        </div>
        <LayerControlPanel />
      </div>

      <FilterPanel />
    </div>
  );
}
