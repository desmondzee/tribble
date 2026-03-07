"use client";

import Link from "next/link";
import { FileText, MapPin, Clock } from "lucide-react";
import { useReportsStore, type MyReport } from "@/store/reportsSlice";

function formatSubmittedAt(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays === 0)
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

function ReportCard({ r }: { r: MyReport }) {
  return (
    <Link
      href={`/app/map?lat=${r.lat}&lng=${r.lng}&zoom=10`}
      className="block p-4 rounded-sm border border-border bg-card hover:border-primary/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-body text-sm text-foreground line-clamp-2">
            {r.narrative}
          </p>
          {r.crisis_categories.length > 0 && (
            <p className="font-mono text-[10px] text-muted-foreground mt-1">
              {r.crisis_categories.join(", ")}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2 text-muted-foreground">
            <span className="flex items-center gap-1 font-mono text-[10px]">
              <Clock className="w-3 h-3" />
              {formatSubmittedAt(r.submitted_at)}
            </span>
            <span className="flex items-center gap-1 font-mono text-[10px]">
              <MapPin className="w-3 h-3" />
              {r.lat.toFixed(4)}, {r.lng.toFixed(4)}
            </span>
          </div>
          <span
            className={`inline-block mt-2 font-mono text-[9px] px-2 py-0.5 rounded-sm ${
              r.status === "queued"
                ? "bg-[hsl(var(--hip-warn))]/20 text-[hsl(var(--hip-warn))]"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {r.status}
          </span>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground flex-shrink-0">
          {r.report_id}
        </span>
      </div>
    </Link>
  );
}

export default function ReportsPage() {
  const myReports = useReportsStore((s) => s.myReports);

  return (
    <div className="pointer-events-auto p-6 max-w-4xl">
      <div className="flex items-center gap-2 mb-6">
        <FileText className="w-5 h-5 text-primary" />
        <h2 className="font-heading text-lg tracking-wider text-foreground">
          MY REPORTS
        </h2>
      </div>
      <p className="font-body text-sm text-muted-foreground mb-6">
        Reports you have submitted. Click a card to view the location on the
        map.
      </p>
      {myReports.length === 0 ? (
        <div className="border border-dashed border-border rounded-sm p-8 text-center">
          <p className="font-body text-sm text-muted-foreground">
            You haven’t submitted any reports yet.
          </p>
          <Link
            href="/app/submit"
            className="inline-block mt-3 font-heading text-xs tracking-wider text-primary hover:underline"
          >
            Submit a report
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {myReports.map((r) => (
            <li key={r.report_id}>
              <ReportCard r={r} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
