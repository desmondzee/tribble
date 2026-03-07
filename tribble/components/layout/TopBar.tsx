"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Search, SlidersHorizontal, Bell, Menu, ChevronDown, Inbox } from "lucide-react";
import { useUIStore } from "@/store/uiSlice";
import { useFilterStore } from "@/store/filterSlice";
import {
  useRoleStore,
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  type AppRole,
} from "@/store/roleSlice";
import { SOURCE_ICONS } from "@/lib/icon-registry";
import type { SourceType } from "@/types";
import { useState, useRef, useEffect } from "react";
import { PLACEHOLDER_SUBMISSIONS } from "@/lib/placeholder-data";

const ALL_SOURCES: SourceType[] = [
  "news_agent",
  "user_submission",
  "satellite",
  "weather_api",
  "drone",
  "analyst_input",
];

const ROUTE_TITLES: Record<string, string> = {
  "/app/map": "INTELLIGENCE MAP",
  "/app/events": "EVENT BROWSER",
  "/app/intelligence": "INTELLIGENCE DASHBOARD",
  "/app/reports": "REPORTS",
  "/app/submissions": "SUBMISSION QUEUE",
  "/app/settings": "SETTINGS",
  "/app/submit": "SUBMIT REPORT",
  "/app/routes": "SAFE ROUTES",
  "/app/alerts": "ALERTS",
  "/app/analytics": "ANALYTICS",
  "/app/users": "USER MANAGEMENT",
  "/app/config": "SYSTEM CONFIG",
  "/app/audit": "AUDIT LOG",
};

const ROLE_ICONS: Record<AppRole, string> = {
  civilian: "🧑",
  organization: "🏢",
  admin: "🔑",
};

export function TopBar() {
  const pathname = usePathname();
  const {
    setCommandPaletteOpen,
    setFilterPanelOpen,
    setSidebarExpanded,
    sidebarExpanded,
  } = useUIStore();
  const { severities, sourcesVisible, setFilter } = useFilterStore();
  const { activeRole, setActiveRole } = useRoleStore();
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const title = ROUTE_TITLES[pathname] || "Tribble";

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setRoleDropdownOpen(false);
      }
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(e.target as Node)
      ) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const pendingSubmissionsCount =
    activeRole !== "civilian"
      ? PLACEHOLDER_SUBMISSIONS.filter(
          (s) => s.status === "pending" || s.status === "in_review"
        ).length
      : 0;
  const recentSubmissions = PLACEHOLDER_SUBMISSIONS.slice(0, 5);

  const activeFilters: string[] = [];
  if (severities.length < 4) activeFilters.push(`${severities.length} severity`);
  if (sourcesVisible.length < 6)
    activeFilters.push(`${sourcesVisible.length} sources`);

  const toggleSource = (s: SourceType) => {
    const next = sourcesVisible.includes(s)
      ? sourcesVisible.filter((x) => x !== s)
      : [...sourcesVisible, s];
    setFilter("sourcesVisible", next);
  };

  return (
    <div className="flex-shrink-0">
      <header className="h-12 flex items-center px-4 bg-popover border-b border-border z-20">
        <button
          className="mr-3 lg:hidden text-muted-foreground hover:text-foreground"
          onClick={() => setSidebarExpanded(!sidebarExpanded)}
        >
          <Menu className="w-4 h-4" />
        </button>

        <h1 className="font-heading font-bold text-sm tracking-wider text-foreground mr-4">
          {title}
        </h1>

        <div className="flex items-center gap-2 flex-1 overflow-x-auto">
          <AnimatePresence>
            {activeFilters.map((filter) => (
              <motion.span
                key={filter}
                className="font-mono text-[10px] text-primary bg-primary/10 border border-primary/20 rounded-sm px-2 py-0.5 whitespace-nowrap"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
              >
                {filter}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>

        {activeRole !== "civilian" && (
          <div className="hidden md:flex items-center gap-1 mr-3">
            {ALL_SOURCES.map((s) => {
              const meta = SOURCE_ICONS[s];
              const active = sourcesVisible.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSource(s)}
                  className={`px-1.5 py-0.5 rounded-sm text-[9px] transition-colors ${
                    active ? "bg-popover text-primary" : "text-muted-foreground/30"
                  }`}
                  title={meta.label}
                >
                  {meta.icon}
                </button>
              );
            })}
          </div>
        )}

        <div className="relative mr-3" ref={dropdownRef}>
          <button
            type="button"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm border border-border bg-card hover:border-primary/50 transition-colors"
            onClick={() => setRoleDropdownOpen(!roleDropdownOpen)}
          >
            <span className="text-xs">{ROLE_ICONS[activeRole]}</span>
            <span className="font-mono text-[10px] tracking-wider text-foreground uppercase">
              {ROLE_LABELS[activeRole]}
            </span>
            <ChevronDown
              className={`w-3 h-3 text-muted-foreground transition-transform ${roleDropdownOpen ? "rotate-180" : ""}`}
            />
          </button>

          <AnimatePresence>
            {roleDropdownOpen && (
              <motion.div
                className="absolute top-full right-0 mt-1 w-56 bg-card border border-border rounded-sm shadow-lg z-50 overflow-hidden"
                initial={{ opacity: 0, y: -4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.97 }}
                transition={{ duration: 0.15 }}
              >
                {(["civilian", "organization", "admin"] as AppRole[]).map(
                  (role) => (
                    <button
                      key={role}
                      type="button"
                      className={`w-full text-left px-3 py-2.5 flex items-center gap-2.5 transition-colors ${
                        activeRole === role
                          ? "bg-primary/10 border-l-2 border-l-primary"
                          : "hover:bg-popover border-l-2 border-l-transparent"
                      }`}
                      onClick={() => {
                        setActiveRole(role);
                        setRoleDropdownOpen(false);
                      }}
                    >
                      <span className="text-sm">{ROLE_ICONS[role]}</span>
                      <div>
                        <p className="font-mono text-[11px] tracking-wider text-foreground uppercase">
                          {ROLE_LABELS[role]}
                        </p>
                        <p className="font-body text-[10px] text-muted-foreground">
                          {ROLE_DESCRIPTIONS[role]}
                        </p>
                      </div>
                      {activeRole === role && (
                        <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
                      )}
                    </button>
                  )
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative" ref={notificationsRef}>
            <button
              type="button"
              className="relative text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setNotificationsOpen(!notificationsOpen)}
              title={
                activeRole !== "civilian"
                  ? "User submissions"
                  : "Notifications"
              }
            >
              <Bell className="w-4 h-4" />
              {activeRole !== "civilian" && pendingSubmissionsCount > 0 ? (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[hsl(var(--hip-warn))] flex items-center justify-center">
                  <span className="font-mono text-[8px] text-foreground">
                    {pendingSubmissionsCount > 9 ? "9+" : pendingSubmissionsCount}
                  </span>
                </span>
              ) : activeRole === "civilian" ? (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-destructive flex items-center justify-center">
                  <span className="font-mono text-[8px] text-foreground">3</span>
                </span>
              ) : null}
            </button>
            <AnimatePresence>
              {notificationsOpen && activeRole !== "civilian" && (
                <motion.div
                  className="absolute top-full right-0 mt-1 w-80 max-h-[70vh] overflow-hidden bg-card border border-border rounded-sm shadow-lg z-50 flex flex-col"
                  initial={{ opacity: 0, y: -4, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                >
                  <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                    <span className="font-heading text-[11px] tracking-wider text-foreground">
                      USER SUBMISSIONS
                    </span>
                    {pendingSubmissionsCount > 0 && (
                      <span className="font-mono text-[9px] text-[hsl(var(--hip-warn))]">
                        {pendingSubmissionsCount} pending
                      </span>
                    )}
                  </div>
                  <div className="overflow-y-auto flex-1">
                    {recentSubmissions.length === 0 ? (
                      <p className="font-body text-xs text-muted-foreground p-4">
                        No submissions in the queue.
                      </p>
                    ) : (
                      <ul className="p-2 space-y-1">
                        {recentSubmissions.map((s) => (
                          <li key={s.id}>
                            <Link
                              href={`/app/submissions`}
                              onClick={() => setNotificationsOpen(false)}
                              className="block p-2 rounded-sm hover:bg-popover transition-colors"
                            >
                              <p className="font-body text-xs text-foreground line-clamp-2">
                                {s.description}
                              </p>
                              <p className="font-mono text-[9px] text-muted-foreground mt-1">
                                {s.status === "pending" || s.status === "in_review"
                                  ? "Pending"
                                  : s.status}
                                {" · "}
                                {new Date(s.submitted_at).toLocaleDateString()}
                              </p>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="p-2 border-t border-border">
                    <Link
                      href="/app/submissions"
                      onClick={() => setNotificationsOpen(false)}
                      className="flex items-center justify-center gap-2 w-full py-2 rounded-sm bg-popover hover:bg-primary/10 text-foreground font-heading text-[11px] tracking-wider transition-colors"
                    >
                      <Inbox className="w-3.5 h-3.5" />
                      View all submissions
                    </Link>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setCommandPaletteOpen(true)}
            title="Cmd+K"
          >
            <Search className="w-4 h-4" />
          </button>
          {activeRole !== "civilian" && (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setFilterPanelOpen(true)}
              title="F"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>
    </div>
  );
}
