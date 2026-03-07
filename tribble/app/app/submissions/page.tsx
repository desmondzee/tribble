"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Inbox,
  MapPin,
  Clock,
  X,
  MapPinned,
  Check,
  Ban,
  FileSearch,
  ChevronDown,
  ChevronUp,
  Loader2,
  PanelBottomClose,
} from "lucide-react";
import { PLACEHOLDER_SUBMISSIONS } from "@/lib/placeholder-data";
import { SeverityBadge } from "@/components/shared/SeverityBadge";
import { spring } from "@/lib/animation-tokens";
import type { UserSubmission, SubmissionStatus } from "@/types";
import { useReportsStore, type MyReport } from "@/store/reportsSlice";
import { getReportValidation, type ReportValidationResponse } from "@/lib/api";
import { useUIStore } from "@/store/uiSlice";

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

const STATUS_LABELS: Record<SubmissionStatus, string> = {
  pending: "Pending",
  in_review: "In review",
  verified: "Verified",
  declined: "Declined",
  escalated: "Escalated",
};

const SEVERITY_BAR_CLASS: Record<string, string> = {
  critical: "bg-[hsl(var(--hip-critical))]",
  high: "bg-[hsl(var(--hip-high))]",
  medium: "bg-[hsl(var(--hip-medium))]",
  low: "bg-[hsl(var(--hip-low))]",
};

function StatusPill({ status }: { status: SubmissionStatus }) {
  const isPending = status === "pending" || status === "in_review";
  return (
    <span
      className={`font-mono text-[10px] tracking-wider px-2 py-0.5 rounded-sm ${
        isPending
          ? "bg-[hsl(var(--hip-warn))]/20 text-[hsl(var(--hip-warn))]"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
function ReportStatusPill({ status }: { status: string }) {
  const isQueued = status === "queued";
  const label =
    status === "in_review"
      ? "In review"
      : status === "verified"
        ? "Verified"
        : status === "declined"
          ? "Declined"
          : status;
  return (
    <span
      className={`font-mono text-[10px] tracking-wider px-2 py-0.5 rounded-sm ${
        isQueued
          ? "bg-[hsl(var(--hip-warn))]/20 text-[hsl(var(--hip-warn))]"
          : status === "verified"
            ? "bg-primary/10 text-primary"
            : status === "declined"
              ? "bg-destructive/10 text-destructive"
              : "bg-muted text-muted-foreground"
      }`}
    >
      {label}
    </span>
  );
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

function flyToSubmission(lat: number, lng: number) {
  window.dispatchEvent(
    new CustomEvent("hip:flyTo", { detail: { lng, lat, zoom: 10 } })
  );
}

// —— Detail panel content (used inside motion.aside for AnimatePresence exit) ——
function SubmissionDetailPanelContent({
  submission,
  onClose,
  onSetStatus,
}: {
  submission: UserSubmission;
  onClose: () => void;
  onSetStatus: (submissionId: string, status: SubmissionStatus) => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleViewOnMap = () => {
    flyToSubmission(submission.lat, submission.lng);
    onClose();
  };

  const handleSetStatus = (status: SubmissionStatus) => {
    onSetStatus(submission.id, status);
  };

  return (
    <>
      <div className="flex items-center justify-between flex-shrink-0 h-12 px-4 border-b border-border">
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground">
          {submission.id}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors rounded-sm"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={submission.status} />
          <SeverityBadge severity={submission.severity_suggested} />
          <span className="font-mono text-[10px] text-muted-foreground">
            {submission.ontology_class_suggested.replace(/_/g, " ")}
          </span>
        </div>
        <p className="font-body text-sm text-foreground leading-relaxed">
          {submission.description}
        </p>
        <dl className="space-y-2 font-mono text-[10px]">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="w-3 h-3 flex-shrink-0" />
            <span>{formatSubmittedAt(submission.submitted_at)}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="w-3 h-3 flex-shrink-0" />
            <span>
              {submission.lat.toFixed(4)}, {submission.lng.toFixed(4)}
            </span>
          </div>
          {submission.helios_confidence != null && (
            <div className="text-muted-foreground">
              Helios confidence: {Math.round(submission.helios_confidence * 100)}%
            </div>
          )}
          {submission.reviewed_by && (
            <div className="text-muted-foreground">
              Reviewed by {submission.reviewed_by}
            </div>
          )}
          {submission.linked_event_id && (
            <div className="text-muted-foreground">
              Linked event: {submission.linked_event_id}
            </div>
          )}
        </dl>
      </div>
      <div className="flex-shrink-0 p-4 border-t border-border space-y-2">
        <button
          type="button"
          onClick={handleViewOnMap}
          className="w-full flex items-center justify-center gap-2 py-2.5 font-mono text-[11px] tracking-wider bg-primary text-primary-foreground hover:opacity-90 transition-opacity rounded-sm"
        >
          <MapPinned className="w-3.5 h-3.5" />
          View on map
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleSetStatus("in_review")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 font-mono text-[10px] tracking-wider border border-border rounded-sm transition-colors ${
              submission.status === "in_review"
                ? "bg-primary/10 border-primary text-primary"
                : "text-muted-foreground hover:bg-muted/50"
            }`}
          >
            <FileSearch className="w-3 h-3" />
            In review
          </button>
          <button
            type="button"
            onClick={() => handleSetStatus("verified")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 font-mono text-[10px] tracking-wider border border-border rounded-sm transition-colors ${
              submission.status === "verified"
                ? "bg-primary/10 border-primary text-primary"
                : "text-muted-foreground hover:bg-muted/50"
            }`}
          >
            <Check className="w-3 h-3" />
            Verify
          </button>
          <button
            type="button"
            onClick={() => handleSetStatus("declined")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 font-mono text-[10px] tracking-wider border border-border rounded-sm transition-colors ${
              submission.status === "declined"
                ? "bg-destructive/10 border-destructive text-destructive"
                : "text-muted-foreground hover:bg-muted/50"
            }`}
          >
            <Ban className="w-3 h-3" />
            Decline
          </button>
        </div>
      </div>
    </>
  );
}

// —— Report (your submission) detail panel ——
function ReportDetailPanelContent({
  report,
  onClose,
}: {
  report: MyReport;
  onClose: () => void;
}) {
  const [validationExpanded, setValidationExpanded] = useState(false);
  const updateReportStatus = useReportsStore((s) => s.updateReportStatus);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleViewOnMap = () => {
    flyToSubmission(report.lat, report.lng);
    onClose();
  };

  const setStatus = (status: string) => {
    updateReportStatus(report.report_id, status);
  };

  return (
    <>
      <div className="flex items-center justify-between flex-shrink-0 h-12 px-4 border-b border-border">
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground">
          {report.report_id}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors rounded-sm"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <ReportStatusPill status={report.status} />
          {report.crisis_categories.length > 0 && (
            <span className="font-mono text-[10px] text-muted-foreground">
              {report.crisis_categories.join(", ")}
            </span>
          )}
        </div>
        <p className="font-body text-sm text-foreground leading-relaxed">
          {report.narrative}
        </p>
        <dl className="space-y-2 font-mono text-[10px]">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="w-3 h-3 flex-shrink-0" />
            <span>{formatSubmittedAt(report.submitted_at)}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="w-3 h-3 flex-shrink-0" />
            <span>
              {report.lat.toFixed(4)}, {report.lng.toFixed(4)}
            </span>
          </div>
        </dl>
        <div>
          <button
            type="button"
            onClick={() => setValidationExpanded((v) => !v)}
            className="font-mono text-[9px] tracking-wider text-primary hover:underline flex items-center gap-1"
          >
            {validationExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            View validation
          </button>
          {validationExpanded && (
            <ValidationPanel
              reportId={report.report_id}
              onClose={() => setValidationExpanded(false)}
            />
          )}
        </div>
      </div>
      <div className="flex-shrink-0 p-4 border-t border-border space-y-2">
        <button
          type="button"
          onClick={handleViewOnMap}
          className="w-full flex items-center justify-center gap-2 py-2.5 font-mono text-[11px] tracking-wider bg-primary text-primary-foreground hover:opacity-90 transition-opacity rounded-sm"
        >
          <MapPinned className="w-3.5 h-3.5" />
          View on map
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setStatus("in_review")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 font-mono text-[10px] tracking-wider border border-border rounded-sm transition-colors ${
              report.status === "in_review"
                ? "bg-primary/10 border-primary text-primary"
                : "text-muted-foreground hover:bg-muted/50"
            }`}
          >
            <FileSearch className="w-3 h-3" />
            In review
          </button>
          <button
            type="button"
            onClick={() => setStatus("verified")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 font-mono text-[10px] tracking-wider border border-border rounded-sm transition-colors ${
              report.status === "verified"
                ? "bg-primary/10 border-primary text-primary"
                : "text-muted-foreground hover:bg-muted/50"
            }`}
          >
            <Check className="w-3 h-3" />
            Verify
          </button>
          <button
            type="button"
            onClick={() => setStatus("declined")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 font-mono text-[10px] tracking-wider border border-border rounded-sm transition-colors ${
              report.status === "declined"
                ? "bg-destructive/10 border-destructive text-destructive"
                : "text-muted-foreground hover:bg-muted/50"
            }`}
          >
            <Ban className="w-3 h-3" />
            Decline
          </button>
        </div>
      </div>
    </>
  );
}

// —— Card with severity bar, click opens panel ——
const listVariants = {
  visible: {
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.02,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0 },
};

function SubmissionCard({
  s,
  onClick,
}: {
  s: UserSubmission;
  onClick: () => void;
}) {
  const barClass = SEVERITY_BAR_CLASS[s.severity_suggested] ?? "bg-muted";

  return (
    <motion.li
      variants={itemVariants}
      className="flex border-b border-border last:border-b-0"
    >
      <button
        type="button"
        onClick={onClick}
        className="w-full flex text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card"
      >
        <span
          className={`flex-shrink-0 w-[3px] min-h-[4rem] ${barClass}`}
          aria-hidden
        />
        <div className="flex-1 min-w-0 py-3 px-4 hover:bg-muted/20 transition-colors border-l border-border">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-body text-sm text-foreground line-clamp-2 group-hover:text-foreground">
                {s.description}
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <SeverityBadge severity={s.severity_suggested} />
                <StatusPill status={s.status} />
                <span className="font-mono text-[10px] text-muted-foreground">
                  {s.ontology_class_suggested.replace(/_/g, " ")}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1.5 text-muted-foreground">
                <span className="flex items-center gap-1 font-mono text-[10px]">
                  <Clock className="w-3 h-3" />
                  {formatSubmittedAt(s.submitted_at)}
                </span>
                <span className="flex items-center gap-1 font-mono text-[10px]">
                  <MapPin className="w-3 h-3" />
                  {s.lat.toFixed(4)}, {s.lng.toFixed(4)}
                </span>
              </div>
            </div>
            <span className="font-mono text-[10px] text-muted-foreground flex-shrink-0">
              {s.id}
            </span>
          </div>
        </div>
      </button>
    </motion.li>
  );
}

function MyReportCard({
  r,
  onClick,
}: {
  r: MyReport;
  onClick: () => void;
}) {
  const barClass = r.status === "queued" ? "bg-[hsl(var(--hip-warn))]/80" : "bg-muted";

  return (
    <motion.li
      variants={itemVariants}
      className="flex border-b border-border last:border-b-0"
    >
      <button
        type="button"
        onClick={onClick}
        className="w-full flex text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card"
      >
        <span
          className={`flex-shrink-0 w-[3px] min-h-[4rem] ${barClass}`}
          aria-hidden
        />
        <div className="flex-1 min-w-0 py-3 px-4 hover:bg-muted/20 transition-colors border-l border-border">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-body text-sm text-foreground line-clamp-2 group-hover:text-foreground">
                {r.narrative}
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <ReportStatusPill status={r.status} />
                {r.crisis_categories.length > 0 && (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {r.crisis_categories.join(", ")}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1.5 text-muted-foreground">
                <span className="flex items-center gap-1 font-mono text-[10px]">
                  <Clock className="w-3 h-3" />
                  {formatSubmittedAt(r.submitted_at)}
                </span>
                <span className="flex items-center gap-1 font-mono text-[10px]">
                  <MapPin className="w-3 h-3" />
                  {r.lat.toFixed(4)}, {r.lng.toFixed(4)}
                </span>
              </div>
            </div>
            <span className="font-mono text-[10px] text-muted-foreground flex-shrink-0">
              {r.report_id.slice(0, 8)}…
            </span>
          </div>
        </div>
      </button>
    </motion.li>
  );
}

export default function SubmissionsPage() {
  const myReports = useReportsStore((s) => s.myReports);
  const updateReportStatus = useReportsStore((s) => s.updateReportStatus);
  const { submissionQueueMinimised, setSubmissionQueueMinimised } = useUIStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [reviewStatusOverrides, setReviewStatusOverrides] = useState<Record<string, SubmissionStatus>>({});

  const submissionsWithStatus = PLACEHOLDER_SUBMISSIONS.map((s) => ({
    ...s,
    status: reviewStatusOverrides[s.id] ?? s.status,
  }));
  const selected = submissionsWithStatus.find((s) => s.id === selectedId) ?? null;
  const selectedReport = myReports.find((r) => r.report_id === selectedReportId) ?? null;

  const handleSetSubmissionStatus = (submissionId: string, status: SubmissionStatus) => {
    setReviewStatusOverrides((prev) => ({ ...prev, [submissionId]: status }));
  };

  const pendingCount = submissionsWithStatus.filter(
    (s) => s.status === "pending" || s.status === "in_review"
  ).length;

  if (submissionQueueMinimised) {
    return (
      <div className="pointer-events-auto absolute left-6 bottom-6 z-10">
        <button
          type="button"
          onClick={() => setSubmissionQueueMinimised(false)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-sm bg-card/95 backdrop-blur-sm border border-border shadow-lg hover:bg-card transition-colors font-heading text-xs tracking-wider text-foreground"
        >
          <Inbox className="w-4 h-4" />
          <span>SUBMISSION QUEUE</span>
          {pendingCount > 0 && (
            <span className="font-mono text-[10px] bg-[hsl(var(--hip-warn))]/20 text-[hsl(var(--hip-warn))] px-1.5 py-0.5 rounded-sm">
              {pendingCount} pending
            </span>
          )}
          <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto p-6 max-w-4xl relative">
      <div
        className="bg-card/95 backdrop-blur-sm border border-border rounded-sm overflow-hidden"
        style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.25)" }}
      >
        <header className="px-6 pt-6 pb-3 border-b border-border">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-2">
              <h2 className="font-impact text-lg tracking-tight text-foreground">
                SUBMISSION QUEUE
              </h2>
              {pendingCount > 0 && (
                <span className="font-mono text-[10px] bg-[hsl(var(--hip-warn))]/20 text-[hsl(var(--hip-warn))] px-2 py-0.5 rounded-sm">
                  {pendingCount} pending
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSubmissionQueueMinimised(true)}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-sm transition-colors"
              title="Minimise queue"
              aria-label="Minimise submission queue"
            >
              <PanelBottomClose className="w-4 h-4" />
            </button>
          </div>
          <p className="font-body text-sm text-muted-foreground">
            Your submitted reports and the queue for review. Open a card to view details and location.
          </p>
        </header>

        {myReports.length > 0 && (
          <div className="border-b border-border">
            <h3 className="px-6 py-2 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              Reports you&apos;ve submitted
            </h3>
            <motion.ul
              className="divide-y-0"
              variants={listVariants}
              initial="hidden"
              animate="visible"
            >
              {myReports.map((r) => (
                <MyReportCard
                  key={r.report_id}
                  r={r}
                  onClick={() => {
                    setSelectedId(null);
                    setSelectedReportId(r.report_id);
                  }}
                />
              ))}
            </motion.ul>
          </div>
        )}

        {PLACEHOLDER_SUBMISSIONS.length === 0 && myReports.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Inbox className="w-8 h-8 text-muted-foreground/60 mx-auto mb-3" />
            <p className="font-impact text-sm tracking-tight text-foreground mb-1">
              No submissions in the queue
            </p>
            <p className="font-body text-xs text-muted-foreground">
              User-submitted reports will appear here for review.
            </p>
          </div>
        ) : (
          <>
            {PLACEHOLDER_SUBMISSIONS.length > 0 && (
              <>
                {myReports.length > 0 && (
                  <h3 className="px-6 py-2 font-mono text-[10px] tracking-wider text-muted-foreground uppercase border-b border-border">
                    Queue for review
                  </h3>
                )}
                <motion.ul
                  className="divide-y-0"
                  variants={listVariants}
                  initial="hidden"
                  animate="visible"
                >
                  {submissionsWithStatus.map((s) => (
                    <SubmissionCard
                      key={s.id}
                      s={s}
                      onClick={() => {
                        setSelectedReportId(null);
                        setSelectedId(s.id);
                      }}
                    />
                  ))}
                </motion.ul>
              </>
            )}
            {PLACEHOLDER_SUBMISSIONS.length === 0 && myReports.length > 0 && (
              <div className="px-6 py-6 text-center border-t border-border">
                <p className="font-body text-xs text-muted-foreground">
                  No other submissions in the queue for review.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      <AnimatePresence mode="wait">
        {selected ? (
          <motion.aside
            key={`submission-${selected.id}`}
            className="absolute right-0 top-0 bottom-0 z-20 w-full max-w-[400px] flex flex-col border-l border-border bg-card shadow-[-4px_0_24px_rgba(0,0,0,0.4)]"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={spring}
          >
            <SubmissionDetailPanelContent
              submission={selected}
              onClose={() => setSelectedId(null)}
              onSetStatus={handleSetSubmissionStatus}
            />
          </motion.aside>
        ) : selectedReport ? (
          <motion.aside
            key={`report-${selectedReport.report_id}`}
            className="absolute right-0 top-0 bottom-0 z-20 w-full max-w-[400px] flex flex-col border-l border-border bg-card shadow-[-4px_0_24px_rgba(0,0,0,0.4)]"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={spring}
          >
            <ReportDetailPanelContent
              report={selectedReport}
              onClose={() => setSelectedReportId(null)}
            />
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
