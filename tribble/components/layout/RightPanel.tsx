"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { spring } from "@/lib/animation-tokens";
import { useUIStore } from "@/store/uiSlice";

export function RightPanel() {
  const { rightPanelOpen, setRightPanelOpen } = useUIStore();

  return (
    <AnimatePresence>
      {rightPanelOpen && (
        <motion.aside
          className="h-full flex flex-col flex-shrink-0 border-l border-primary/30 bg-popover/95 backdrop-blur-sm z-20 overflow-hidden"
          initial={{ width: 0 }}
          animate={{ width: 380 }}
          exit={{ width: 0 }}
          transition={spring}
        >
          <div className="flex items-center justify-between h-12 px-4 border-b border-border flex-shrink-0">
            <span className="font-mono text-[13px] text-primary tracking-wider">
              HELIOS
            </span>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setRightPanelOpen(false)}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <p className="font-body text-sm text-muted-foreground">
              HELIOS operational assistant placeholder. Natural language queries,
              situation reports, and asset dispatch coming soon.
            </p>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
