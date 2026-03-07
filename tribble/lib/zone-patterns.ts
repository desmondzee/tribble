/**
 * SVG pattern definitions for zone fills.
 * Rendered as <defs> in the map SVG.
 */

export const ZONE_PATTERN_DEFS = `
  <pattern id="hatch-nogo" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
    <line x1="0" y1="0" x2="0" y2="8" stroke="hsl(348, 100%, 59%)" stroke-width="1" opacity="0.25" />
  </pattern>
  <pattern id="stripe-contested" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
    <rect width="4" height="8" fill="rgba(255,45,85,0.08)" />
    <rect x="4" width="4" height="8" fill="rgba(123,97,255,0.08)" />
  </pattern>
`;

export const ZONE_FILL_STYLES: Record<string, {
  fill: string;
  fillBase?: string;
  stroke: string;
  strokeWidth: number;
  strokeDasharray: string;
  label: string | null;
  labelColour: string;
}> = {
  no_go_zone: {
    fill: 'url(#hatch-nogo)',
    fillBase: 'transparent',
    stroke: 'hsl(var(--hip-critical))',
    strokeWidth: 2,
    strokeDasharray: '6 3',
    label: 'NO-GO',
    labelColour: 'hsl(var(--hip-critical))',
  },
  conflict_zone: {
    fill: 'transparent',
    stroke: 'hsl(var(--hip-warn))',
    strokeWidth: 1.5,
    strokeDasharray: '4 3',
    label: null,
    labelColour: 'hsl(var(--hip-warn))',
  },
  contested_territory: {
    fill: 'url(#stripe-contested)',
    stroke: '#7B61FF',
    strokeWidth: 1,
    strokeDasharray: '2 4',
    label: null,
    labelColour: '#7B61FF',
  },
  safe_zone: {
    fill: 'rgba(0, 255, 136, 0.08)',
    stroke: 'hsl(var(--hip-green))',
    strokeWidth: 1,
    strokeDasharray: 'none',
    label: null,
    labelColour: 'hsl(var(--hip-green))',
  },
  humanitarian_operation_area: {
    fill: 'transparent',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeDasharray: '6 3',
    label: null,
    labelColour: 'currentColor',
  },
  controlled_territory: {
    fill: 'rgba(123, 97, 255, 0.06)',
    stroke: '#7B61FF',
    strokeWidth: 1,
    strokeDasharray: '3 3',
    label: null,
    labelColour: '#7B61FF',
  },
  displacement_corridor: {
    fill: 'none',
    stroke: 'hsl(var(--hip-accent2))',
    strokeWidth: 2,
    strokeDasharray: '6 3',
    label: null,
    labelColour: 'hsl(var(--hip-accent2))',
  },
} as const;

export const BORDER_STYLES = {
  international_border: {
    stroke: 'hsl(var(--hip-white))',
    strokeWidth: 0.6,
    strokeDasharray: 'none',
    opacity: 0.4,
  },
  disputed_border: {
    stroke: 'hsl(var(--hip-warn))',
    strokeWidth: 0.8,
    strokeDasharray: '4 4',
    opacity: 1,
  },
  ceasefire_line: {
    stroke: 'hsl(var(--hip-accent2))',
    strokeWidth: 1,
    strokeDasharray: '6 2 1 2',
    opacity: 1,
  },
  frontline_active: {
    stroke: 'hsl(var(--hip-critical))',
    strokeWidth: 2,
    strokeDasharray: '6 4',
    opacity: 1,
  },
  administrative_boundary: {
    stroke: 'hsl(var(--hip-light))',
    strokeWidth: 0.5,
    strokeDasharray: '2 4',
    opacity: 0.5,
  },
} as const;
