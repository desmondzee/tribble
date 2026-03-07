"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useUIStore } from "@/store/uiSlice";
import { useFilterStore } from "@/store/filterSlice";
import { PLACEHOLDER_NGOS } from "@/lib/placeholder-data";

export function FilterPanel() {
  const { filterPanelOpen, setFilterPanelOpen } = useUIStore();
  const { severities, setFilter } = useFilterStore();

  const SEVERITIES = ["critical", "high", "medium", "low"] as const;

  const toggleSeverity = (s: (typeof SEVERITIES)[number]) => {
    const next = severities.includes(s)
      ? severities.filter((x) => x !== s)
      : [...severities, s];
    setFilter("severities", next);
  };

  return (
    <AnimatePresence>
      {filterPanelOpen && (
        <motion.div
          className="absolute top-[66px] left-4 z-20 w-[280px] pointer-events-auto bg-popover/95 backdrop-blur-sm border border-border rounded-sm overflow-hidden"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="font-heading text-[11px] tracking-wider text-foreground">
              FILTERS
            </span>
            <button
              type="button"
              onClick={() => setFilterPanelOpen(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-3 space-y-4">
            <div>
              <p className="font-mono text-[9px] text-muted-foreground mb-2 uppercase">
                Severity
              </p>
              <div className="flex flex-wrap gap-2">
                {SEVERITIES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSeverity(s)}
                    className={`font-mono text-[10px] px-2 py-1 rounded-sm border ${
                      severities.includes(s)
                        ? "border-primary text-primary"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {s.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="font-mono text-[9px] text-muted-foreground mb-2 uppercase">
                NGO Zone
              </p>
              <select className="w-full h-8 rounded-sm border border-border bg-card px-2 text-[11px] font-mono text-foreground">
                <option value="">ALL ZONES</option>
                {PLACEHOLDER_NGOS.map((ngo) => (
                  <option key={ngo.id} value={ngo.id}>
                    {ngo.abbreviation} — {ngo.zone_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
