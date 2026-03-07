"use client";

import { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";
import { PLACEHOLDER_SUBMISSIONS } from "@/lib/placeholder-data";
import { SeverityBadge } from "@/components/shared/SeverityBadge";
import { spring } from "@/lib/animation-tokens";
import type { UserSubmission, SubmissionStatus } from "@/types";

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

function flyToSubmission(lat: number, lng: number) {
  window.dispatchEvent(
    new CustomEvent("hip:flyTo", { detail: { lng, lat, zoom: 10 } })
  );
}

// —— Detail panel content (used inside motion.aside for AnimatePresence exit) ——
function SubmissionDetailPanelContent({
  submission,
  onClose,
}: {
  submission: UserSubmission;
  onClose: () => void;
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
            className="flex-1 flex items-center justify-center gap-1.5 py-2 font-mono text-[10px] tracking-wider text-muted-foreground border border-border hover:bg-muted/50 transition-colors rounded-sm"
            disabled
            title="Not wired yet"
          >
            <FileSearch className="w-3 h-3" />
            In review
          </button>
          <button
            type="button"
            className="flex-1 flex items-center justify-center gap-1.5 py-2 font-mono text-[10px] tracking-wider text-muted-foreground border border-border hover:bg-muted/50 transition-colors rounded-sm"
            disabled
            title="Not wired yet"
          >
            <Check className="w-3 h-3" />
            Verify
          </button>
          <button
            type="button"
            className="flex-1 flex items-center justify-center gap-1.5 py-2 font-mono text-[10px] tracking-wider text-muted-foreground border border-border hover:bg-muted/50 transition-colors rounded-sm"
            disabled
            title="Not wired yet"
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

export default function SubmissionsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = PLACEHOLDER_SUBMISSIONS.find((s) => s.id === selectedId) ?? null;

  const pendingCount = PLACEHOLDER_SUBMISSIONS.filter(
    (s) => s.status === "pending" || s.status === "in_review"
  ).length;

  return (
    <div className="pointer-events-auto p-6 max-w-4xl relative">
      <div
        className="bg-card/95 backdrop-blur-sm border border-border rounded-sm overflow-hidden"
        style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.25)" }}
      >
        <header className="px-6 pt-6 pb-3 border-b border-border">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="font-impact text-lg tracking-tight text-foreground">
              SUBMISSION QUEUE
            </h2>
            {pendingCount > 0 && (
              <span className="font-mono text-[10px] bg-[hsl(var(--hip-warn))]/20 text-[hsl(var(--hip-warn))] px-2 py-0.5 rounded-sm">
                {pendingCount} pending
              </span>
            )}
          </div>
          <p className="font-body text-sm text-muted-foreground">
            User-submitted reports for review. Open a card to view details and location.
          </p>
        </header>

        {PLACEHOLDER_SUBMISSIONS.length === 0 ? (
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
          <motion.ul
            className="divide-y-0"
            variants={listVariants}
            initial="hidden"
            animate="visible"
          >
            {PLACEHOLDER_SUBMISSIONS.map((s) => (
              <SubmissionCard
                key={s.id}
                s={s}
                onClick={() => setSelectedId(s.id)}
              />
            ))}
          </motion.ul>
        )}
      </div>

      <AnimatePresence mode="wait">
        {selected ? (
          <motion.aside
            key={selected.id}
            className="absolute right-0 top-0 bottom-0 z-20 w-full max-w-[400px] flex flex-col border-l border-border bg-card shadow-[-4px_0_24px_rgba(0,0,0,0.4)]"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={spring}
          >
            <SubmissionDetailPanelContent
              submission={selected}
              onClose={() => setSelectedId(null)}
            />
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
