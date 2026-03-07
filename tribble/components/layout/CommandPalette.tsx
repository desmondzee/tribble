"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Map,
  AlertTriangle,
  Layers,
  Satellite,
  FileText,
  Settings,
  Inbox,
} from "lucide-react";
import { easeSharp } from "@/lib/animation-tokens";
import { useUIStore } from "@/store/uiSlice";

const NAV_RESULTS = [
  { icon: Map, label: "Intelligence Map", path: "/app/map" },
  { icon: AlertTriangle, label: "Events", path: "/app/events" },
  { icon: Layers, label: "Intelligence", path: "/app/intelligence" },
  { icon: Satellite, label: "Drone Fleet", path: "/app/drones" },
  { icon: FileText, label: "Reports", path: "/app/reports" },
  { icon: Inbox, label: "Submissions", path: "/app/submissions" },
  { icon: Settings, label: "Settings", path: "/app/settings" },
];

export function CommandPalette() {
  const { commandPaletteOpen, setCommandPaletteOpen } = useUIStore();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      }
      if (e.key === "Escape") setCommandPaletteOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [commandPaletteOpen]);

  const q = query.toLowerCase();
  const filteredNav = NAV_RESULTS.filter((r) =>
    r.label.toLowerCase().includes(q)
  );

  const handleSelect = (index: number) => {
    const item = filteredNav[index];
    if (item) {
      router.push(item.path);
      setCommandPaletteOpen(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filteredNav.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleSelect(selectedIndex);
    }
  };

  if (!commandPaletteOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-background/80 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={easeSharp}
        onClick={() => setCommandPaletteOpen(false)}
      >
        <motion.div
          className="w-full max-w-xl bg-popover border border-border rounded-sm shadow-xl overflow-hidden"
          initial={{ opacity: 0, scale: 0.96, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -10 }}
          transition={easeSharp}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 px-3 border-b border-border">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search commands, events, layers..."
              className="flex-1 bg-transparent font-mono text-sm text-foreground placeholder:text-muted-foreground outline-none py-3"
              autoFocus
            />
          </div>
          <div className="max-h-64 overflow-auto py-2">
            {filteredNav.length === 0 ? (
              <p className="px-4 py-6 font-mono text-[11px] text-muted-foreground">
                No results
              </p>
            ) : (
              filteredNav.map((item, i) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.path}
                    type="button"
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      i === selectedIndex ? "bg-primary/10" : "hover:bg-popover"
                    }`}
                    onClick={() => handleSelect(i)}
                  >
                    <Icon className="w-4 h-4 text-primary" />
                    <span className="font-heading text-xs tracking-wider">
                      {item.label}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
