"use client";

import Link from "next/link";
import { Inbox, MapPin, Clock } from "lucide-react";
import { PLACEHOLDER_SUBMISSIONS } from "@/lib/placeholder-data";
import { SeverityBadge } from "@/components/shared/SeverityBadge";
import type { UserSubmission, SubmissionStatus } from "@/types";

function formatSubmittedAt(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
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

function StatusPill({ status }: { status: SubmissionStatus }) {
  const isPending = status === "pending" || status === "in_review";
  return (
    <span
      className={`font-mono text-[10px] tracking-wider px-2 py-0.5 rounded-sm ${
        isPending ? "bg-[hsl(var(--hip-warn))]/20 text-[hsl(var(--hip-warn))]" : "bg-muted text-muted-foreground"
      }`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function SubmissionCard({ s }: { s: UserSubmission }) {
  return (
    <Link
      href={`/app/map?lat=${s.lat}&lng=${s.lng}&zoom=10`}
      className="block p-4 rounded-sm border border-border bg-card hover:border-primary/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-body text-sm text-foreground line-clamp-2">{s.description}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <SeverityBadge severity={s.severity_suggested} />
            <StatusPill status={s.status} />
            <span className="font-mono text-[10px] text-muted-foreground">
              {s.ontology_class_suggested.replace(/_/g, " ")}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-2 text-muted-foreground">
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
        <span className="font-mono text-[10px] text-muted-foreground flex-shrink-0">{s.id}</span>
      </div>
    </Link>
  );
}

export default function SubmissionsPage() {
  const pendingCount = PLACEHOLDER_SUBMISSIONS.filter(
    (s) => s.status === "pending" || s.status === "in_review"
  ).length;

  return (
    <div className="pointer-events-auto p-6 max-w-4xl">
      <div className="flex items-center gap-2 mb-6">
        <Inbox className="w-5 h-5 text-primary" />
        <h2 className="font-heading text-lg tracking-wider text-foreground">
          SUBMISSION QUEUE
        </h2>
        {pendingCount > 0 && (
          <span className="font-mono text-[10px] bg-[hsl(var(--hip-warn))]/20 text-[hsl(var(--hip-warn))] px-2 py-0.5 rounded-sm">
            {pendingCount} pending
          </span>
        )}
      </div>
      <p className="font-body text-sm text-muted-foreground mb-6">
        User-submitted reports for review. Click a card to view location on the map.
      </p>
      <ul className="space-y-3">
        {PLACEHOLDER_SUBMISSIONS.map((s) => (
          <li key={s.id}>
            <SubmissionCard s={s} />
          </li>
        ))}
      </ul>
      {PLACEHOLDER_SUBMISSIONS.length === 0 && (
        <p className="font-body text-sm text-muted-foreground py-8 text-center border border-dashed border-border rounded-sm">
          No submissions in the queue.
        </p>
      )}
    </div>
  );
}
