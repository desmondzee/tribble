"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Send, Crosshair, Loader2, Truck } from "lucide-react";
import { toast } from "sonner";
import { submitReliefRun } from "@/lib/api";
import { useUIStore } from "@/store/uiSlice";
import { useData } from "@/context/DataContext";
import { CollapsibleFormPanel } from "@/components/CollapsibleFormPanel";

const RELIEF_PROVIDING_OPTIONS = [
  { key: "water", label: "Water" },
  { key: "food", label: "Food" },
  { key: "medical", label: "Medical" },
  { key: "shelter", label: "Shelter" },
  { key: "hygiene", label: "Hygiene" },
  { key: "other", label: "Other" },
];

type PickingTarget = "origin" | "destination" | null;

export default function ReliefPage() {
  const searchParams = useSearchParams();
  const { setLocationPickMode } = useUIStore();
  const { clusters } = useData();

  const [originLat, setOriginLat] = useState("");
  const [originLng, setOriginLng] = useState("");
  const [originName, setOriginName] = useState("");
  const [destLat, setDestLat] = useState("");
  const [destLng, setDestLng] = useState("");
  const [destName, setDestName] = useState("");
  const [whatDoing, setWhatDoing] = useState("");
  const [whatProviding, setWhatProviding] = useState<Set<string>>(new Set());
  const [clusterId, setClusterId] = useState(() => searchParams.get("cluster") ?? "");
  const [organisationName, setOrganisationName] = useState("");
  const [picking, setPicking] = useState<PickingTarget>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleLocationPicked = useCallback(
    (e: Event) => {
      const { lat, lng } = (e as CustomEvent<{ lat: number; lng: number }>).detail;
      if (picking === "origin") {
        setOriginLat(lat.toFixed(5));
        setOriginLng(lng.toFixed(5));
        toast.success("Origin set from map");
      } else if (picking === "destination") {
        setDestLat(lat.toFixed(5));
        setDestLng(lng.toFixed(5));
        toast.success("Destination set from map");
      }
      setPicking(null);
      setLocationPickMode(false);
    },
    [picking, setLocationPickMode]
  );

  useEffect(() => {
    window.addEventListener("hip:locationPicked", handleLocationPicked);
    return () =>
      window.removeEventListener("hip:locationPicked", handleLocationPicked);
  }, [handleLocationPicked]);

  const startPicking = (target: "origin" | "destination") => {
    setPicking(target);
    setLocationPickMode(true);
  };

  const toggleProviding = (key: string) => {
    setWhatProviding((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const clusterOptions = clusters.features
    .map((f) => ({
      id: f.properties?.id as string,
      label: `Cluster ${f.properties?.id ?? "?"} (${f.properties?.report_count ?? 0} reports)`,
    }))
    .filter((c) => c.id);

  const canSubmit =
    originLat &&
    originLng &&
    destLat &&
    destLng &&
    whatDoing.trim().length >= 1 &&
    whatProviding.size >= 1;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await submitReliefRun({
        origin: {
          lat: parseFloat(originLat),
          lng: parseFloat(originLng),
          name: originName.trim() || undefined,
        },
        destination: {
          lat: parseFloat(destLat),
          lng: parseFloat(destLng),
          name: destName.trim() || undefined,
        },
        what_doing: whatDoing.trim(),
        what_providing: [...whatProviding],
        organisation_name: organisationName.trim() || "Unknown",
        country_iso: "SSD",
        ...(clusterId ? { cluster_id: clusterId } : {}),
      });
      toast.success(`Relief run submitted — ID: ${res.id}`);
      setOriginLat("");
      setOriginLng("");
      setOriginName("");
      setDestLat("");
      setDestLng("");
      setDestName("");
      setWhatDoing("");
      setWhatProviding(new Set());
      setClusterId("");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to submit relief run"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pointer-events-auto p-4 max-w-lg">
      <CollapsibleFormPanel
        title="SUBMIT RELIEF RUN"
        subtitle="Report where you are coming from, where you are going, and what you are providing. Civilians will see that help is on the way."
        icon={<Truck className="w-4 h-4" />}
      >
        <div>
          <label className="font-mono text-[9px] tracking-wider text-muted-foreground block mb-1.5">
            WHERE YOU ARE COMING FROM *
          </label>
          <div className="flex gap-2 items-end">
            <input
              type="number"
              step="any"
              placeholder="Lat"
              value={originLat}
              onChange={(e) => setOriginLat(e.target.value)}
              className="flex-1 h-8 rounded-sm border border-border bg-background px-2 text-[11px] font-mono text-foreground"
            />
            <input
              type="number"
              step="any"
              placeholder="Lng"
              value={originLng}
              onChange={(e) => setOriginLng(e.target.value)}
              className="flex-1 h-8 rounded-sm border border-border bg-background px-2 text-[11px] font-mono text-foreground"
            />
            <button
              type="button"
              onClick={() => startPicking("origin")}
              className="h-8 px-3 rounded-sm border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 flex items-center gap-1.5 flex-shrink-0"
              title="Pick origin from map"
            >
              <Crosshair className="w-3.5 h-3.5" />
              MAP
            </button>
          </div>
          <input
            type="text"
            placeholder="Location name (optional)"
            value={originName}
            onChange={(e) => setOriginName(e.target.value)}
            className="mt-1.5 w-full h-8 rounded-sm border border-border bg-background px-2 text-[11px] font-mono text-foreground placeholder:text-muted-foreground/50"
          />
        </div>

        <div>
          <label className="font-mono text-[9px] tracking-wider text-muted-foreground block mb-1.5">
            WHERE YOU ARE GOING *
          </label>
          <div className="flex gap-2 items-end">
            <input
              type="number"
              step="any"
              placeholder="Lat"
              value={destLat}
              onChange={(e) => setDestLat(e.target.value)}
              className="flex-1 h-8 rounded-sm border border-border bg-background px-2 text-[11px] font-mono text-foreground"
            />
            <input
              type="number"
              step="any"
              placeholder="Lng"
              value={destLng}
              onChange={(e) => setDestLng(e.target.value)}
              className="flex-1 h-8 rounded-sm border border-border bg-background px-2 text-[11px] font-mono text-foreground"
            />
            <button
              type="button"
              onClick={() => startPicking("destination")}
              className="h-8 px-3 rounded-sm border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 flex items-center gap-1.5 flex-shrink-0"
              title="Pick destination from map"
            >
              <Crosshair className="w-3.5 h-3.5" />
              MAP
            </button>
          </div>
          <input
            type="text"
            placeholder="Destination name (optional)"
            value={destName}
            onChange={(e) => setDestName(e.target.value)}
            className="mt-1.5 w-full h-8 rounded-sm border border-border bg-background px-2 text-[11px] font-mono text-foreground placeholder:text-muted-foreground/50"
          />
        </div>

        <div>
          <label className="font-mono text-[9px] tracking-wider text-muted-foreground block mb-1.5">
            WHAT YOU ARE DOING *
          </label>
          <textarea
            value={whatDoing}
            onChange={(e) => setWhatDoing(e.target.value)}
            placeholder="Brief description of the relief run..."
            rows={3}
            maxLength={5000}
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-[11px] font-body text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
          />
        </div>

        <div>
          <label className="font-mono text-[9px] tracking-wider text-muted-foreground block mb-1.5">
            WHAT YOU ARE PROVIDING *
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {RELIEF_PROVIDING_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => toggleProviding(opt.key)}
                className={`h-7 px-2 rounded-sm border text-[10px] font-mono tracking-wider text-left ${
                  whatProviding.has(opt.key)
                    ? "border-primary/50 bg-primary/15 text-primary"
                    : "border-border bg-background text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="font-mono text-[9px] tracking-wider text-muted-foreground block mb-1.5">
            RESPONDING TO CLUSTER (OPTIONAL)
          </label>
          <select
            value={clusterId}
            onChange={(e) => setClusterId(e.target.value)}
            className="w-full h-8 rounded-sm border border-border bg-background px-2 text-[11px] font-mono text-foreground"
          >
            <option value="">— None —</option>
            {clusterOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="font-mono text-[9px] tracking-wider text-muted-foreground block mb-1.5">
            ORGANISATION NAME
          </label>
          <input
            type="text"
            placeholder="Your organisation"
            value={organisationName}
            onChange={(e) => setOrganisationName(e.target.value)}
            className="w-full h-8 rounded-sm border border-border bg-background px-2 text-[11px] font-mono text-foreground placeholder:text-muted-foreground/50"
          />
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className="w-full h-9 rounded-sm bg-primary text-primary-foreground font-mono text-[11px] tracking-wider hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              SUBMITTING...
            </>
          ) : (
            <>
              <Send className="w-3.5 h-3.5" />
              SUBMIT RELIEF RUN
            </>
          )}
        </button>
      </CollapsibleFormPanel>
    </div>
  );
}
