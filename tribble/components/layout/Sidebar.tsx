"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Map,
  AlertTriangle,
  Layers,
  Satellite,
  FileText,
  Settings,
  LogOut,
  ChevronLeft,
  Inbox,
  Send,
  Route,
  Bell,
  Shield,
  Users,
  Activity,
  BarChart3,
  ImageIcon,
} from "lucide-react";
import { spring } from "@/lib/animation-tokens";
import { useAuthStore } from "@/store/authSlice";
import { useUIStore } from "@/store/uiSlice";
import { useRoleStore, ROLE_LABELS, type AppRole } from "@/store/roleSlice";
import { PLACEHOLDER_NGOS, PLACEHOLDER_SUBMISSIONS, PLACEHOLDER_EVENTS } from "@/lib/placeholder-data";

const ICON_MAP = {
  Map,
  AlertTriangle,
  Layers,
  Satellite,
  FileText,
  Settings,
  Inbox,
  Send,
  Route,
  Bell,
  Shield,
  Users,
  Activity,
  BarChart3,
  ImageIcon,
} as const;

interface NavDef {
  icon: keyof typeof ICON_MAP;
  label: string;
  path: string;
  badgeKey?: "events" | "submissions";
}

const CIVILIAN_NAV: NavDef[] = [
  { icon: "Map", label: "Map", path: "/app/map" },
  { icon: "Send", label: "Submit Report", path: "/app/submit" },
  { icon: "FileText", label: "My Reports", path: "/app/reports" },
  { icon: "Route", label: "Safe Routes", path: "/app/routes" },
  { icon: "Bell", label: "Alerts", path: "/app/alerts" },
  { icon: "Settings", label: "Settings", path: "/app/settings" },
];

const ORG_NAV: NavDef[] = [
  { icon: "Map", label: "Intelligence Map", path: "/app/map" },
  { icon: "AlertTriangle", label: "Events", path: "/app/events", badgeKey: "events" },
  { icon: "Layers", label: "Intelligence", path: "/app/intelligence" },
  { icon: "ImageIcon", label: "Satellite Scenes", path: "/app/satellite-scenes" },
  { icon: "Satellite", label: "Drone Fleet", path: "/app/drones" },
  { icon: "FileText", label: "Reports", path: "/app/reports" },
  { icon: "Inbox", label: "Submissions", path: "/app/submissions", badgeKey: "submissions" },
  { icon: "BarChart3", label: "Analytics", path: "/app/analytics" },
  { icon: "Settings", label: "Settings", path: "/app/settings" },
];

const ADMIN_NAV: NavDef[] = [
  ...ORG_NAV.filter((i) => i.icon !== "Settings"),
  { icon: "Users", label: "User Management", path: "/app/users" },
  { icon: "Shield", label: "System Config", path: "/app/config" },
  { icon: "Activity", label: "Audit Log", path: "/app/audit" },
  { icon: "Settings", label: "Settings", path: "/app/settings" },
];

const ROLE_NAV: Record<AppRole, NavDef[]> = {
  civilian: CIVILIAN_NAV,
  organization: ORG_NAV,
  admin: ADMIN_NAV,
};

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { sidebarExpanded, setSidebarExpanded } = useUIStore();
  const { user, logout } = useAuthStore();
  const { activeRole } = useRoleStore();
  const [showUserPopover, setShowUserPopover] = useState(false);

  const criticalCount = PLACEHOLDER_EVENTS.filter(
    (e) => e.severity === "critical" && e.verification_status !== "verified"
  ).length;
  const pendingCount = PLACEHOLDER_SUBMISSIONS.filter(
    (s) => s.status === "pending" || s.status === "in_review"
  ).length;

  const badges: Record<string, number> = {
    events: criticalCount,
    submissions: pendingCount,
  };

  const navItems = ROLE_NAV[activeRole];

  return (
    <motion.aside
      className="relative flex flex-col h-screen bg-popover border-r border-border z-30 flex-shrink-0"
      animate={{ width: sidebarExpanded ? 240 : 64 }}
      transition={spring}
    >
      <div
        className="flex items-center h-12 px-4 border-b border-border cursor-pointer"
        onClick={() => setSidebarExpanded(!sidebarExpanded)}
      >
        {sidebarExpanded ? (
          <div className="flex items-center justify-between w-full">
            <div>
              <p className="font-mono text-[11px] text-primary tracking-widest leading-none">
                Tribble
              </p>
              <p className="font-heading text-[9px] tracking-wider text-muted-foreground leading-tight mt-0.5">
                HUMANITARIAN INTELLIGENCE
              </p>
            </div>
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          </div>
        ) : (
          <div className="flex items-center justify-center w-full">
            <span className="font-mono text-sm text-primary tracking-widest">
              H
            </span>
          </div>
        )}
      </div>

      <AnimatePresence>
        {sidebarExpanded && (
          <motion.div
            className="px-3 pt-3 pb-1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="flex items-center gap-1.5">
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  activeRole === "admin"
                    ? "bg-destructive"
                    : activeRole === "organization"
                      ? "bg-primary"
                      : "bg-[hsl(var(--hip-green))]"
                }`}
              />
              <span className="font-mono text-[9px] tracking-wider text-muted-foreground uppercase">
                {ROLE_LABELS[activeRole]}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <nav className="flex-1 py-2 space-y-0.5 px-2 overflow-hidden">
        {navItems.map((item) => {
          const isActive = pathname === item.path;
          const badge = item.badgeKey ? badges[item.badgeKey] : 0;
          const IconComponent = ICON_MAP[item.icon];
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`group flex items-center gap-3 h-9 px-2 rounded-sm transition-all relative ${
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute left-0 top-0 bottom-0 w-[2px] bg-primary"
                  transition={spring}
                />
              )}
              <span className="relative flex-shrink-0">
                <IconComponent className="w-4 h-4" />
                {badge > 0 && (
                  <motion.span
                    className={`absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-mono text-foreground ${
                      item.badgeKey === "events" ? "bg-destructive" : "bg-[hsl(var(--hip-warn))]"
                    }`}
                    animate={
                      item.badgeKey === "events"
                        ? { scale: [1, 1.15, 1] }
                        : undefined
                    }
                    transition={
                      item.badgeKey === "events"
                        ? { duration: 2, repeat: Infinity }
                        : undefined
                    }
                  >
                    {badge}
                  </motion.span>
                )}
              </span>
              <AnimatePresence>
                {sidebarExpanded && (
                  <motion.span
                    className="font-heading text-xs tracking-wider whitespace-nowrap overflow-hidden"
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>
          );
        })}
      </nav>

      <AnimatePresence>
        {sidebarExpanded && activeRole !== "civilian" && (
          <motion.div
            className="px-3 pb-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <p className="font-heading text-[9px] tracking-wider text-muted-foreground mb-2 uppercase">
              NGO Zone
            </p>
            <select
              className="w-full h-7 rounded-sm border border-border bg-card px-2 text-[11px] font-mono text-foreground"
              onChange={(e) => {
                const ngo = PLACEHOLDER_NGOS.find((n) => n.id === e.target.value);
                if (ngo) {
                  useUIStore.getState().setRightPanelOpen(true);
                  useUIStore.getState().setRightPanelTab("news_feed");
                  // Fly to the NGO zone center if it has geometry
                  if (ngo.zone_geojson?.geometry) {
                    const coords = (ngo.zone_geojson.geometry as { coordinates: number[][][] }).coordinates;
                    if (coords?.[0]?.[0]) {
                      const lngs = coords[0].map((c: number[]) => c[0]);
                      const lats = coords[0].map((c: number[]) => c[1]);
                      const cLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
                      const cLat = (Math.min(...lats) + Math.max(...lats)) / 2;
                      window.dispatchEvent(
                        new CustomEvent("hip:flyTo", { detail: { lng: cLng, lat: cLat, zoom: 7 } })
                      );
                    }
                  }
                }
              }}
            >
              <option value="">ALL ZONES</option>
              {PLACEHOLDER_NGOS.map((ngo) => (
                <option key={ngo.id} value={ngo.id}>
                  {ngo.abbreviation} — {ngo.zone_name}
                </option>
              ))}
            </select>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative border-t border-border p-2">
        {sidebarExpanded ? (
          <>
            <button
              className="flex items-center gap-2 w-full px-2 py-2 rounded-sm hover:bg-card transition-colors"
              onClick={() => setShowUserPopover(!showUserPopover)}
            >
              <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center flex-shrink-0">
                <span className="font-mono text-[10px] text-primary">
                  {user?.avatar_initials || "SC"}
                </span>
              </div>
              <div className="text-left overflow-hidden">
                <p className="font-body text-xs text-foreground leading-none whitespace-nowrap">
                  {user?.name || "Sarah Chen"}
                </p>
                <p className="font-mono text-[9px] text-muted-foreground mt-0.5 whitespace-nowrap uppercase">
                  {ROLE_LABELS[activeRole]}
                </p>
              </div>
            </button>

            <AnimatePresence>
              {showUserPopover && (
                <motion.div
                  className="absolute bottom-full left-2 right-2 mb-2 bg-card border border-border rounded-sm p-3 z-50"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                >
                  <p className="font-body text-sm text-foreground">
                    {user?.name || "Sarah Chen"}
                  </p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {user?.email || "sarah.chen@relief.io"}
                  </p>
                  <span className="inline-block mt-2 font-mono text-[9px] text-primary border border-primary/30 rounded-sm px-2 py-0.5 uppercase">
                    {ROLE_LABELS[activeRole]}
                  </span>
                  <button
                    className="flex items-center gap-2 w-full mt-3 pt-3 border-t border-border text-muted-foreground hover:text-destructive transition-colors"
                    onClick={() => {
                      logout();
                      router.push("/");
                    }}
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span className="font-heading text-xs tracking-wider">
                      SIGN OUT
                    </span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        ) : (
          <button
            className="flex items-center justify-center w-full px-2 py-2 rounded-sm hover:bg-card transition-colors group"
            onClick={() => {
              logout();
              router.push("/");
            }}
            title="Sign out"
          >
            <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center group-hover:border-destructive/50 group-hover:bg-destructive/10 transition-colors">
              <LogOut className="w-3.5 h-3.5 text-primary group-hover:text-destructive transition-colors" />
            </div>
          </button>
        )}
      </div>
    </motion.aside>
  );
}
