"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authSlice";
import { useUIStore } from "@/store/uiSlice";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { RightPanel } from "@/components/layout/RightPanel";
import { TimelineStrip } from "@/components/layout/TimelineStrip";
import { CommandPalette } from "@/components/layout/CommandPalette";
import TacticalMap from "@/components/map/TacticalMap";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status } = useAuthStore();
  const { setFilterPanelOpen, setTimelineOpen, setCommandPaletteOpen } =
    useUIStore();
  const router = useRouter();

  useEffect(() => {
    if (status !== "authenticated") {
      router.replace("/auth/signin");
    }
  }, [status, router]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        setFilterPanelOpen(true);
      }
      if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        setTimelineOpen(!useUIStore.getState().timelineOpen);
      }
      if (e.key === "Escape") {
        setFilterPanelOpen(false);
        setCommandPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setFilterPanelOpen, setTimelineOpen, setCommandPaletteOpen]);

  if (status !== "authenticated") return null;

  return (
    <div className="h-screen flex w-full overflow-hidden bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <div className="flex-1 flex min-h-0 relative">
          <div className="absolute inset-0 z-0">
            <TacticalMap />
          </div>
          <div className="relative z-10 flex-1 min-w-0 pointer-events-none">
            {children}
          </div>
          <RightPanel />
        </div>
        <TimelineStrip />
      </div>
      <CommandPalette />
    </div>
  );
}
