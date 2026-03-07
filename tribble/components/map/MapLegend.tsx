"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

const SEVERITY_ITEMS = [
  { label: "Critical", color: "hsl(var(--hip-critical))" },
  { label: "High", color: "hsl(var(--hip-warn))" },
  { label: "Medium", color: "hsl(var(--hip-medium))" },
  { label: "Low", color: "hsl(var(--hip-low))" },
];

export function MapLegend() {
  const [open, setOpen] = useState(false);

  return (
    <div className="absolute bottom-14 left-4 z-20 w-[200px] pointer-events-auto">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full bg-popover/90 backdrop-blur-sm border border-border rounded-sm px-2.5 py-1.5 hover:border-primary/50 transition-colors"
      >
        <span className="font-heading text-[10px] tracking-wider text-foreground flex-1 text-left">
          LEGEND
        </span>
        <ChevronDown
          className={`w-3 h-3 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="mt-1 bg-popover/90 backdrop-blur-sm border border-border rounded-sm p-2.5 space-y-3">
          <div>
            <p className="font-mono text-[9px] text-muted-foreground mb-2 uppercase">
              Severity
            </p>
            <div className="space-y-1.5">
              {SEVERITY_ITEMS.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-2"
                >
                  <div
                    className="w-2 h-2 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="font-mono text-[10px] text-foreground">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
