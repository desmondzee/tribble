import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, SlidersHorizontal, Bell, Menu, ChevronDown } from 'lucide-react';
import { useUIStore } from '@/store/uiSlice';
import { useFilterStore } from '@/store/filterSlice';
import { useRoleStore, ROLE_LABELS, ROLE_DESCRIPTIONS, type AppRole } from '@/store/roleSlice';
import { useRealtimeStore } from '@/store/realtimeSlice';
import { SOURCE_ICONS } from '@/lib/icon-registry';
import type { SourceType } from '@/types';
import { useState, useRef, useEffect } from 'react';

const ALL_SOURCES: SourceType[] = ['news_agent', 'user_submission', 'satellite', 'weather_api', 'drone', 'analyst_input'];

const ROUTE_TITLES: Record<string, string> = {
  '/app/map': 'INTELLIGENCE MAP',
  '/app/events': 'EVENT BROWSER',
  '/app/intelligence': 'INTELLIGENCE DASHBOARD',
  '/app/drones': 'DRONE FLEET',
  '/app/reports': 'REPORTS',
  '/app/submissions': 'SUBMISSION QUEUE',
  '/app/settings': 'SETTINGS',
  '/app/submit': 'SUBMIT REPORT',
  '/app/routes': 'SAFE ROUTES',
  '/app/alerts': 'ALERTS',
  '/app/analytics': 'ANALYTICS',
  '/app/users': 'USER MANAGEMENT',
  '/app/config': 'SYSTEM CONFIG',
  '/app/audit': 'AUDIT LOG',
};

const ROLE_ICONS: Record<AppRole, string> = {
  civilian: '🧑',
  organization: '🏢',
  admin: '🔑',
};

export const TopBar = () => {
  const location = useLocation();
  const { setCommandPaletteOpen, setFilterPanelOpen, setSidebarExpanded, sidebarExpanded } = useUIStore();
  const { severities, sourcesVisible, setFilter } = useFilterStore();
  const { activeRole, setActiveRole } = useRoleStore();
  const { connected, recentEventIds } = useRealtimeStore();
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const title = ROUTE_TITLES[location.pathname] || 'HIP';

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setRoleDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const activeFilters: string[] = [];
  if (severities.length < 4) activeFilters.push(`${severities.length} severity`);
  if (sourcesVisible.length < 6) activeFilters.push(`${sourcesVisible.length} sources`);

  const toggleSource = (s: SourceType) => {
    const next = sourcesVisible.includes(s) ? sourcesVisible.filter(x => x !== s) : [...sourcesVisible, s];
    setFilter('sourcesVisible', next);
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

        <h1 className="font-heading font-bold text-sm tracking-wider text-foreground mr-4">{title}</h1>

        {/* Active filter chips */}
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

          {/* Centre chip */}
          <motion.span
            className={`font-mono text-[10px] rounded-sm px-2 py-0.5 whitespace-nowrap ml-auto mr-auto border ${
              connected
                ? 'text-[hsl(var(--hip-green))] bg-[hsl(var(--hip-green))/0.1] border-[hsl(var(--hip-green))/0.2]'
                : 'text-destructive bg-destructive/10 border-destructive/20'
            }`}
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 3, repeat: Infinity }}
          >
            {connected ? `${recentEventIds.length} LIVE EVENTS` : 'REALTIME DISCONNECTED'}
          </motion.span>
        </div>

        {/* Source filter pills (org/admin only) */}
        {activeRole !== 'civilian' && (
          <div className="hidden md:flex items-center gap-1 mr-3">
            {ALL_SOURCES.map(s => {
              const meta = SOURCE_ICONS[s];
              const active = sourcesVisible.includes(s);
              return (
                <button
                  key={s}
                  onClick={() => toggleSource(s)}
                  className={`px-1.5 py-0.5 rounded-sm text-[9px] transition-colors ${
                    active ? 'bg-popover text-primary' : 'text-muted-foreground/30'
                  }`}
                  title={meta.label}
                >
                  {meta.icon}
                </button>
              );
            })}
          </div>
        )}

        {/* Role Switcher */}
        <div className="relative mr-3" ref={dropdownRef}>
          <button
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm border border-border bg-card hover:border-primary/50 transition-colors"
            onClick={() => setRoleDropdownOpen(!roleDropdownOpen)}
          >
            <span className="text-xs">{ROLE_ICONS[activeRole]}</span>
            <span className="font-mono text-[10px] tracking-wider text-foreground uppercase">
              {ROLE_LABELS[activeRole]}
            </span>
            <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${roleDropdownOpen ? 'rotate-180' : ''}`} />
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
                {(['civilian', 'organization', 'admin'] as AppRole[]).map((role) => (
                  <button
                    key={role}
                    className={`w-full text-left px-3 py-2.5 flex items-center gap-2.5 transition-colors ${
                      activeRole === role
                        ? 'bg-primary/10 border-l-2 border-l-primary'
                        : 'hover:bg-popover border-l-2 border-l-transparent'
                    }`}
                    onClick={() => {
                      setActiveRole(role);
                      setRoleDropdownOpen(false);
                    }}
                  >
                    <span className="text-sm">{ROLE_ICONS[role]}</span>
                    <div>
                      <p className="font-mono text-[11px] tracking-wider text-foreground uppercase">{ROLE_LABELS[role]}</p>
                      <p className="font-body text-[10px] text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p>
                    </div>
                    {activeRole === role && (
                      <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
                    )}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-3">
          <button className="relative text-muted-foreground hover:text-foreground transition-colors">
            <Bell className="w-4 h-4" />
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-destructive flex items-center justify-center">
              <span className="font-mono text-[8px] text-foreground">3</span>
            </span>
          </button>
          <button
            className="text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setCommandPaletteOpen(true)}
            title="Cmd+K"
          >
            <Search className="w-4 h-4" />
          </button>
          {activeRole !== 'civilian' && (
            <button
              className="text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setFilterPanelOpen(true)}
              title="F"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* Live ticker strip — 24px */}
      <div
        className="h-6 flex items-center overflow-hidden relative"
        style={{ background: 'rgba(255,45,85,0.08)', borderBottom: '1px solid rgba(255,45,85,0.3)' }}
      >
        <div className="flex items-center gap-1.5 px-2 flex-shrink-0">
          <motion.span
            className="font-mono text-[9px] text-destructive font-bold tracking-wider"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          >
            LIVE
          </motion.span>
        </div>
        <div className="flex-1 overflow-hidden">
          <div className="animate-marquee flex gap-8 whitespace-nowrap">
            {[
              { sev: 'CRITICAL', id: 'EVT-0042', type: 'Armed Conflict', region: 'Northern Corridor', time: '2m ago' },
              { sev: 'HIGH', id: 'EVT-0038', type: 'Displacement', region: 'Eastern Zone', time: '8m ago' },
              { sev: 'HIGH', id: 'EVT-0051', type: 'Infrastructure', region: 'Bol District', time: '14m ago' },
              { sev: 'MEDIUM', id: 'EVT-0055', type: 'Aid Obstruction', region: "N'Djamena", time: '22m ago' },
              { sev: 'CRITICAL', id: 'EVT-0042', type: 'Armed Conflict', region: 'Northern Corridor', time: '2m ago' },
              { sev: 'HIGH', id: 'EVT-0038', type: 'Displacement', region: 'Eastern Zone', time: '8m ago' },
            ].map((entry, i) => (
              <span key={i} className="flex items-center gap-1.5 cursor-pointer hover:text-foreground transition-colors">
                <span className={`w-1.5 h-1.5 rounded-full ${entry.sev === 'CRITICAL' ? 'bg-destructive' : entry.sev === 'HIGH' ? 'bg-orange-500' : 'bg-yellow-500'}`} />
                <span className="font-mono text-[9px] text-muted-foreground">
                  <span className={entry.sev === 'CRITICAL' ? 'text-destructive' : 'text-muted-foreground'}>{entry.sev}</span>
                  {' '}{entry.id} · {entry.type} · {entry.region} · {entry.time}
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
