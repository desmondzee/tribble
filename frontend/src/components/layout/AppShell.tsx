import { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authSlice';
import { useUIStore } from '@/store/uiSlice';
import { AppSidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { RightPanel } from '@/components/layout/RightPanel';
import { TimelineStrip } from '@/components/layout/TimelineStrip';
import { CommandPalette } from '@/components/layout/CommandPalette';
import { SimulatedMap } from '@/components/map/SimulatedMap';
import { OperationalMap } from '@/components/map/OperationalMap';
import { isMapboxEnabled } from '@/lib/mapbox';

export const AppShell = () => {
  const { status } = useAuthStore();
  const { setFilterPanelOpen, setTimelineOpen, setCommandPaletteOpen, setRightPanelOpen } = useUIStore();
  const navigate = useNavigate();
  const useOperationalMap = isMapboxEnabled();

  // Redirect if not authenticated
  useEffect(() => {
    if (status !== 'authenticated') {
      navigate('/auth/signin');
    }
  }, [status, navigate]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;

      if (e.key === 'f' || e.key === 'F') { e.preventDefault(); setFilterPanelOpen(true); }
      if (e.key === 't' || e.key === 'T') { e.preventDefault(); setTimelineOpen(!useUIStore.getState().timelineOpen); }
      if (e.key === 'Escape') {
        setFilterPanelOpen(false);
        setCommandPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setFilterPanelOpen, setTimelineOpen, setCommandPaletteOpen]);

  if (status !== 'authenticated') return null;

  return (
    <div className="h-screen flex w-full overflow-hidden bg-background">
      {/* Sidebar */}
      <AppSidebar />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <TopBar />

        {/* Content area with map background */}
        <div className="flex-1 flex min-h-0 relative">
          {/* Map canvas (always rendered behind everything) */}
          <div className="absolute inset-0 z-0">
            {useOperationalMap ? <OperationalMap /> : <SimulatedMap />}
          </div>

          {/* Page overlay content */}
          <div className="relative z-10 flex-1 min-w-0 pointer-events-none">
            <Outlet />
          </div>

          {/* Right panel */}
          <RightPanel />
        </div>

        {/* Timeline strip */}
        <TimelineStrip />
      </div>

      {/* Command palette overlay */}
      <CommandPalette />
    </div>
  );
};
