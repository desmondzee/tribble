"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Layers, RotateCcw } from "lucide-react";
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
    <div className="absolute bottom-4 left-4 z-20 pointer-events-auto w-[280px]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 bg-popover/90 backdrop-blur-sm border border-border rounded-sm px-3 py-2 hover:border-primary/50 transition-colors mb-1"
      >
        <Layers className="w-3.5 h-3.5 text-primary" />
        <span className="font-heading text-[11px] tracking-wider text-foreground">
          LAYERS
        </span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="bg-popover/95 backdrop-blur-sm border border-primary/30 rounded-sm overflow-hidden"
            style={{ borderTopWidth: 2, borderTopColor: "hsl(var(--hip-accent))" }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <span className="font-heading text-[11px] tracking-wider text-foreground">
                SOURCE FILTERS
              </span>
              <button
                type="button"
                onClick={() => setFilter("sourcesVisible", ALL_SOURCES)}
                className="font-mono text-[9px] text-muted-foreground hover:text-primary flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                RESET
              </button>
            </div>
            <div className="p-3 space-y-2">
              {ALL_SOURCES.map((s) => {
                const meta = SOURCE_ICONS[s];
                const active = sourcesVisible.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSource(s)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-left text-sm ${
                      active ? "bg-primary/10 text-primary" : "text-muted-foreground"
                    }`}
                  >
                    <span>{meta.icon}</span>
                    <span className="font-mono text-[10px]">{meta.label}</span>
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
