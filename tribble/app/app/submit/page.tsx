"use client";

import { useState, useEffect, useCallback } from "react";
import { MapPin, Send, Crosshair, Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { submitReport } from "@/lib/api";
import { CRISIS_CATEGORIES, HELP_CATEGORIES } from "@/lib/report-categories";
import { useUIStore } from "@/store/uiSlice";
import { useReportsStore } from "@/store/reportsSlice";

export default function SubmitPage() {
  const { setLocationPickMode } = useUIStore();
  const addReport = useReportsStore((s) => s.addReport);
  const myReportsCount = useReportsStore((s) => s.myReports.length);

  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [narrative, setNarrative] = useState("");
  const [crisisCategories, setCrisisCategories] = useState<Set<string>>(
    new Set()
  );
  const [helpCategories, setHelpCategories] = useState<Set<string>>(new Set());
  const [anonymous, setAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const toggleCrisis = (key: string) => {
    setCrisisCategories((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleHelp = (key: string) => {
    setHelpCategories((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // Listen for location picked from map
  const handleLocationPicked = useCallback((e: Event) => {
    const { lat: pLat, lng: pLng } = (
      e as CustomEvent<{ lat: number; lng: number }>
    ).detail;
    setLat(pLat.toFixed(5));
    setLng(pLng.toFixed(5));
    toast.success("Location set from map");
  }, []);

  useEffect(() => {
    window.addEventListener("hip:locationPicked", handleLocationPicked);
    return () =>
      window.removeEventListener("hip:locationPicked", handleLocationPicked);
  }, [handleLocationPicked]);

  const canSubmit =
    lat &&
    lng &&
    narrative.length >= 10 &&
    narrative.length <= 5000 &&
    crisisCategories.size > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await submitReport({
        latitude: parseFloat(lat),
        longitude: parseFloat(lng),
        narrative,
        crisis_categories: [...crisisCategories],
        help_categories: [...helpCategories],
        anonymous,
        country: "South Sudan",
        country_iso: "SSD",
      });
      addReport({
        report_id: res.report_id,
        narrative,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        submitted_at: new Date().toISOString(),
        status: res.status,
        crisis_categories: [...crisisCategories],
        help_categories: [...helpCategories],
      });
      toast.success(`Report queued — ID: ${res.report_id}`);
      // Reset form
      setLat("");
      setLng("");
      setNarrative("");
      setCrisisCategories(new Set());
      setHelpCategories(new Set());
      setAnonymous(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to submit report"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pointer-events-auto p-4 max-w-lg">
      <div className="bg-card/95 backdrop-blur-md border border-border rounded-md p-5 shadow-xl space-y-5">
        {/* Header */}
        <div>
          <h2 className="font-heading text-sm tracking-widest text-foreground flex items-center gap-2">
            <Send className="w-4 h-4 text-primary" />
            SUBMIT REPORT
          </h2>
          <p className="font-mono text-[10px] text-muted-foreground mt-1">
            Report a crisis situation. Your submission helps direct aid.
          </p>
        </div>

        {/* Location */}
        <div>
          <label className="font-mono text-[9px] tracking-wider text-muted-foreground block mb-1.5">
            LOCATION *
          </label>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <input
                type="number"
                step="any"
                placeholder="Latitude"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                className="w-full h-8 rounded-sm border border-border bg-background px-2 text-[11px] font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>
            <div className="flex-1">
              <input
                type="number"
                step="any"
                placeholder="Longitude"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                className="w-full h-8 rounded-sm border border-border bg-background px-2 text-[11px] font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>
            <button
              type="button"
              onClick={() => setLocationPickMode(true)}
              className="h-8 px-3 rounded-sm border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex items-center gap-1.5 flex-shrink-0"
              title="Pick location from map"
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span className="font-mono text-[9px] tracking-wider">PICK</span>
            </button>
          </div>
          {lat && lng && (
            <div className="flex items-center gap-1 mt-1">
              <MapPin className="w-3 h-3 text-primary" />
              <span className="font-mono text-[9px] text-primary">
                {parseFloat(lat).toFixed(4)}, {parseFloat(lng).toFixed(4)}
              </span>
            </div>
          )}
        </div>

        {/* Narrative */}
        <div>
          <label className="font-mono text-[9px] tracking-wider text-muted-foreground block mb-1.5">
            NARRATIVE * ({narrative.length}/5000)
          </label>
          <textarea
            value={narrative}
            onChange={(e) => setNarrative(e.target.value)}
            placeholder="Describe the situation in detail..."
            rows={4}
            maxLength={5000}
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-[11px] font-body text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
          />
          {narrative.length > 0 && narrative.length < 10 && (
            <p className="font-mono text-[9px] text-destructive mt-0.5">
              Minimum 10 characters required
            </p>
          )}
        </div>

        {/* Crisis categories */}
        <div>
          <label className="font-mono text-[9px] tracking-wider text-muted-foreground block mb-1.5">
            CRISIS TYPE *
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {CRISIS_CATEGORIES.map((cat) => {
              const active = crisisCategories.has(cat.key);
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => toggleCrisis(cat.key)}
                  className={`h-7 px-2 rounded-sm border text-[10px] font-mono tracking-wider transition-colors text-left flex items-center gap-1.5 ${
                    active
                      ? "border-primary/50 bg-primary/15 text-primary"
                      : "border-border bg-background text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {active && <Check className="w-3 h-3 flex-shrink-0" />}
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Help categories */}
        <div>
          <label className="font-mono text-[9px] tracking-wider text-muted-foreground block mb-1.5">
            HELP NEEDED
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {HELP_CATEGORIES.map((cat) => {
              const active = helpCategories.has(cat.key);
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => toggleHelp(cat.key)}
                  className={`h-7 px-2 rounded-sm border text-[10px] font-mono tracking-wider transition-colors text-left flex items-center gap-1.5 ${
                    active
                      ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-400"
                      : "border-border bg-background text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {active && <Check className="w-3 h-3 flex-shrink-0" />}
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Anonymous toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] text-foreground">
              Submit anonymously
            </p>
            <p className="font-mono text-[9px] text-muted-foreground">
              Your identity will not be stored
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAnonymous(!anonymous)}
            className={`w-10 h-5 rounded-full transition-colors relative ${
              anonymous ? "bg-primary" : "bg-muted"
            }`}
          >
            <div
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-foreground transition-transform ${
                anonymous ? "left-[22px]" : "left-0.5"
              }`}
            />
          </button>
        </div>

        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className="w-full h-9 rounded-sm bg-primary text-primary-foreground font-mono text-[11px] tracking-wider hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              SUBMITTING...
            </>
          ) : (
            <>
              <Send className="w-3.5 h-3.5" />
              SUBMIT REPORT
            </>
          )}
        </button>
      </div>
      {myReportsCount > 0 && (
        <p className="font-body text-xs text-muted-foreground mt-4 text-center">
          <Link href="/app/reports" className="text-primary hover:underline">
            View my reports ({myReportsCount})
          </Link>
        </p>
      )}
    </div>
  );
}
