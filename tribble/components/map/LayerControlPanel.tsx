"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import { SOURCE_ICONS } from "@/lib/icon-registry";
import { useFilterStore } from "@/store/filterSlice";
import type { SourceType } from "@/types";

const ALL_SOURCES: SourceType[] = [
  "news_agent",
  "user_submission",
  "satellite",
  "weather_api",
  "drone",
  "analyst_input",
];

export function LayerControlPanel() {
  const [open, setOpen] = useState(false);
  const { sourcesVisible, setFilter } = useFilterStore();

  const toggleSource = (s: SourceType) => {
    const next = sourcesVisible.includes(s)
      ? sourcesVisible.filter((x) => x !== s)
      : [...sourcesVisible, s];
    setFilter("sourcesVisible", next);
  };

  return (
    <div className="map-hud-panel map-bar-panel w-full min-w-[130px]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="map-layer-controls-bar w-full flex items-center justify-between gap-2 py-2 px-2 rounded-sm hover:bg-white/5 transition-colors"
        aria-expanded={open}
        aria-label={open ? "Minimize layers" : "Expand layers"}
      >
        <span className="map-layer-header mb-0">LAYERS</span>
        {open ? (
          <ChevronUp className="w-3.5 h-3.5 text-[var(--text-dim)] flex-shrink-0" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-[var(--text-dim)] flex-shrink-0" />
        )}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="pt-2 pb-0 flex flex-col gap-0.5"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex items-center justify-between px-2 pb-1.5 border-b border-border mb-1">
              <span className="map-layer-header mb-0">SOURCE FILTERS</span>
              <button
                type="button"
                onClick={() => setFilter("sourcesVisible", ALL_SOURCES)}
                className="font-mono text-[9px] text-muted-foreground hover:text-primary flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                RESET
              </button>
            </div>
            <div className="space-y-0.5">
              {ALL_SOURCES.map((s) => {
                const meta = SOURCE_ICONS[s];
                const active = sourcesVisible.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSource(s)}
                    className={`map-layer-btn w-full justify-between ${
                      active ? "active" : ""
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-[10px]">{meta.icon}</span>
                      <span className="font-mono text-[10px]">{meta.label}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
