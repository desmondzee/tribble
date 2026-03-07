/**
 * Fallback feed items when the live news API is unavailable or returns empty.
 * Combines fake user submissions and placeholder events so the feed always shows data.
 */

import type { NewsEvent } from "@/lib/api";
import { PLACEHOLDER_SUBMISSIONS, PLACEHOLDER_EVENTS } from "@/lib/placeholder-data";

function submissionsToNewsEvents(): NewsEvent[] {
  return PLACEHOLDER_SUBMISSIONS.map((s) => ({
    id: s.id,
    headline: s.description.length > 80 ? s.description.slice(0, 77) + "…" : s.description,
    source: "User submission",
    severity: s.severity_suggested,
    timestamp: s.submitted_at,
    lat: s.lat,
    lng: s.lng,
    country: null,
    event_type: s.ontology_class_suggested.replace(/_/g, " "),
  }));
}

function eventsToNewsEvents(): NewsEvent[] {
  return PLACEHOLDER_EVENTS.map((e) => ({
    id: e.id,
    headline: e.description.length > 80 ? e.description.slice(0, 77) + "…" : e.description,
    source: e.source_label,
    severity: e.severity,
    timestamp: e.timestamp,
    lat: e.lat,
    lng: e.lng,
    country: null,
    event_type: e.ontology_class.replace(/_/g, " "),
  }));
}

/** Fake user-inputted and institutional events for the feed when API has no data. */
export function getPlaceholderFeedNews(): NewsEvent[] {
  const fromSubmissions = submissionsToNewsEvents();
  const fromEvents = eventsToNewsEvents();
  const combined = [...fromSubmissions, ...fromEvents].sort((a, b) => {
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tb - ta;
  });
  return combined;
}
