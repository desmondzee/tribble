import type { Severity } from "@/types";

const SEVERITY_CONFIG: Record<
  Severity,
  { bg: string; text: string; label: string }
> = {
  critical: { bg: "bg-hip-critical/20", text: "text-hip-critical", label: "CRITICAL" },
  high: { bg: "bg-hip-high/20", text: "text-hip-high", label: "HIGH" },
  medium: { bg: "bg-hip-medium/20", text: "text-hip-medium", label: "MEDIUM" },
  low: { bg: "bg-hip-low/20", text: "text-hip-low", label: "LOW" },
};

export const SeverityBadge = ({ severity }: { severity: Severity }) => {
  const config = SEVERITY_CONFIG[severity];
  return (
    <span
      className={`inline-flex items-center gap-1 font-mono text-[10px] tracking-wider px-2 py-0.5 rounded-sm ${config.bg} ${config.text}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {config.label}
    </span>
  );
};
