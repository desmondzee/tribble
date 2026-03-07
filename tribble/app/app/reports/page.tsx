"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { FileText, MapPin, Clock, ChevronDown, ChevronUp, Loader2, Check, X } from "lucide-react";
import { useReportsStore, type MyReport } from "@/store/reportsSlice";
import { getReportValidation, type ReportValidationResponse } from "@/lib/api";

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

function ValidationPanel({
  reportId,
  onClose,
}: {
  reportId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<ReportValidationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getReportValidation(reportId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load validation");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  if (loading) {
    return (
      <div className="mt-2 p-3 rounded-sm border border-border bg-muted/30 flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        <span className="font-mono text-[10px] text-muted-foreground">Loading validation…</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="mt-2 p-3 rounded-sm border border-border bg-muted/30">
        <p className="font-mono text-[10px] text-muted-foreground">{error}</p>
        <p className="font-mono text-[9px] text-muted-foreground mt-1">Report may still be processing.</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 font-mono text-[9px] text-primary hover:underline"
        >
          Close
        </button>
      </div>
    );
  }
  if (!data) return null;

  const vc = data.validation_context;
  const sources = [
    vc.weather && { key: "weather", label: "Weather", ...vc.weather },
    vc.satellite && { key: "satellite", label: "Satellite", ...vc.satellite },
    vc.acled && { key: "acled", label: "ACLED", ...vc.acled },
  ].filter(Boolean) as Array<{ key: string; label: string; confirmed: boolean; signal: string; confidence: number }>;

  return (
    <div className="mt-2 p-3 rounded-sm border border-border bg-muted/30 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] tracking-wider text-muted-foreground">VALIDATION</span>
        <button
          type="button"
          onClick={onClose}
          className="font-mono text-[9px] text-primary hover:underline"
        >
          Close
        </button>
      </div>
      {data.confidence_scores && (
        <p className="font-mono text-[10px] text-foreground">
          Publishability: {Math.round((data.confidence_scores.publishability ?? 0) * 100)}% · Urgency: {Math.round((data.confidence_scores.urgency ?? 0) * 100)}%
        </p>
      )}
      <ul className="space-y-1.5">
        {sources.map((s) => (
          <li key={s.key} className="flex items-start gap-2">
            {s.confirmed ? (
              <Check className="w-3.5 h-3.5 text-green-600 flex-shrink-0 mt-0.5" />
            ) : (
              <X className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
            )}
            <div>
              <span className="font-mono text-[10px] font-medium">{s.label}: </span>
              <span className="font-body text-[10px] text-foreground">{s.signal}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReportCard({
  r,
  isValidationExpanded,
  onToggleValidation,
}: {
  r: MyReport;
  isValidationExpanded: boolean;
  onToggleValidation: () => void;
}) {
  return (
    <div className="rounded-sm border border-border bg-card overflow-hidden">
      <Link
        href={`/app/map?lat=${r.lat}&lng=${r.lng}&zoom=10`}
        className="block p-4 hover:border-primary/40 transition-colors"
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
      <div className="px-4 pb-3">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onToggleValidation();
          }}
          className="font-mono text-[9px] tracking-wider text-primary hover:underline flex items-center gap-1"
        >
          {isValidationExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          View validation
        </button>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const myReports = useReportsStore((s) => s.myReports);
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);

  const handleToggleValidation = useCallback((reportId: string) => {
    setExpandedReportId((prev) => (prev === reportId ? null : reportId));
  }, []);

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
              <ReportCard
                r={r}
                isValidationExpanded={expandedReportId === r.report_id}
                onToggleValidation={() => handleToggleValidation(r.report_id)}
              />
              {expandedReportId === r.report_id && (
                <ValidationPanel
                  reportId={r.report_id}
                  onClose={() => setExpandedReportId(null)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
