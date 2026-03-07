"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export interface CollapsibleFormPanelProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

export function CollapsibleFormPanel({
  title,
  subtitle,
  icon,
  children,
  defaultExpanded = true,
}: CollapsibleFormPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="bg-card/95 backdrop-blur-md border border-border rounded-md shadow-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-2 p-4 text-left hover:bg-muted/30 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-inset rounded-t-md"
        aria-expanded={expanded}
      >
        {icon && (
          <span className="flex-shrink-0 text-primary">{icon}</span>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-sm tracking-widest text-foreground">
            {title}
          </h2>
          {subtitle && expanded && (
            <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
        <span className="flex-shrink-0 text-muted-foreground" aria-hidden>
          {expanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronUp className="w-4 h-4" />
          )}
        </span>
      </button>
      {expanded && (
        <div className="px-5 pb-5 pt-0 space-y-5 border-t border-border/50">
          {children}
        </div>
      )}
    </div>
  );
}
