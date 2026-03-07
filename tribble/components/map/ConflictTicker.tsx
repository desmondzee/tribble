"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Radio, ChevronDown, ChevronUp, X } from "lucide-react";
import {
  CONFLICT_ZONES,
  CONFLICT_NEWS_FEED,
  type ConflictZone,
  type ConflictNewsItem,
} from "@/lib/conflict-zones";

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-[hsl(var(--hip-critical))]",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-[hsl(var(--hip-low))]",
};

interface Props {
  activeZoneId: string | null;
  onSelectZone: (zone: ConflictZone) => void;
  onClearZone: () => void;
}

function timeSince(ts: string): string {
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
}

export function ConflictTicker({
  activeZoneId,
  onSelectZone,
  onClearZone,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const filteredNews = activeZoneId
    ? CONFLICT_NEWS_FEED.filter((n) => n.zoneId === activeZoneId)
    : CONFLICT_NEWS_FEED;

  const activeZone = CONFLICT_ZONES.find((z) => z.id === activeZoneId);

  return (
    <div className="absolute top-0 left-0 right-0 z-30 pointer-events-auto">
      <div className="bg-card/95 backdrop-blur-md border-b border-border">
        <div className="flex items-center h-7 overflow-hidden">
          <div className="flex-shrink-0 flex items-center gap-1.5 px-3 border-r border-border h-full bg-[hsl(var(--hip-critical))]/10">
            <Radio className="w-3 h-3 text-[hsl(var(--hip-critical))] animate-pulse" />
            <span className="font-mono text-[9px] font-bold tracking-widest text-[hsl(var(--hip-critical))]">
              LIVE
            </span>
          </div>
          <div className="flex-1 overflow-hidden relative">
            <div className="flex items-center gap-6 whitespace-nowrap animate-marquee">
              {[...CONFLICT_NEWS_FEED, ...CONFLICT_NEWS_FEED].map((item, i) => (
                <button
                  key={`${item.id}-${i}`}
                  type="button"
                  className="flex items-center gap-2 flex-shrink-0 hover:opacity-80 transition-opacity"
                  onClick={() => {
                    const zone = CONFLICT_ZONES.find((z) => z.id === item.zoneId);
                    if (zone) onSelectZone(zone);
                  }}
                >
                  {item.breaking && (
                    <span className="font-mono text-[8px] font-bold tracking-widest text-[hsl(var(--hip-critical))] bg-[hsl(var(--hip-critical))]/10 px-1 rounded-sm">
                      BREAKING
                    </span>
                  )}
                  <span
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${SEVERITY_DOT[item.severity]}`}
                  />
                  <span className="font-mono text-[9px] text-muted-foreground">
                    {item.source}
                  </span>
                  <span className="text-[10px] text-foreground/80">
                    {item.headline}
                  </span>
                  <span className="font-mono text-[8px] text-muted-foreground">
                    {timeSince(item.timestamp)}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            className="flex-shrink-0 px-2 h-full text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>
        </div>
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-t border-border overflow-hidden"
            >
              <div className="p-3 space-y-2">
                {activeZoneId ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-heading text-xs text-foreground">
                        {activeZone?.name}
                      </p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {activeZone?.description}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={onClearZone}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <p className="font-mono text-[10px] text-muted-foreground">
                    Select a ticker item to focus on a zone
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
