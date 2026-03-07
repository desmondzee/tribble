"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, Square } from "lucide-react";
import { spring } from "@/lib/animation-tokens";
import { useUIStore } from "@/store/uiSlice";

export function TimelineStrip() {
  const { timelineOpen } = useUIStore();

  return (
    <AnimatePresence>
      {timelineOpen && (
        <motion.div
          className="h-20 flex items-center px-6 gap-6 border-t border-border bg-card/95 backdrop-blur-sm flex-shrink-0"
          initial={{ y: 80 }}
          animate={{ y: 0 }}
          exit={{ y: 80 }}
          transition={spring}
        >
          <div className="flex flex-col items-center">
            <span className="font-mono text-[10px] text-muted-foreground">
              Oct 15
            </span>
          </div>
          <div className="flex-1 relative h-1 bg-border rounded-full">
            <div className="absolute left-[10%] right-[5%] h-full bg-primary/40 rounded-full" />
            <div className="absolute left-[10%] top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary border-2 border-background cursor-pointer" />
            <div className="absolute right-[5%] top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary border-2 border-background cursor-pointer" />
          </div>
          <div className="flex flex-col items-center">
            <span className="font-mono text-[10px] text-muted-foreground">
              Nov 15
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="w-7 h-7 rounded-sm bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
            >
              <Play className="w-3 h-3" />
            </button>
            <button
              type="button"
              className="w-7 h-7 rounded-sm bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
            >
              <Pause className="w-3 h-3" />
            </button>
            <button
              type="button"
              className="w-7 h-7 rounded-sm bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
            >
              <Square className="w-3 h-3" />
            </button>
          </div>
          <div className="flex items-center gap-1">
            {["1×", "5×", "10×"].map((s, i) => (
              <button
                key={s}
                type="button"
                className={`font-mono text-[10px] px-2 py-1 rounded-sm border transition-colors ${
                  i === 0
                    ? "border-primary text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <span className="font-mono text-[11px] text-primary">
            15 NOV 2024 · 06:45 UTC
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
