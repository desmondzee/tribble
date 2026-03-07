import { useEffect, useState } from "react";

import { fetchClusters } from "@/lib/clusters-api";


export const OperationalMap = () => {
  const [clusterCount, setClusterCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      try {
        const collection = await fetchClusters();
        if (!mounted) return;
        setClusterCount(collection.features.length);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load clusters");
      }
    };

    void run();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="h-full w-full bg-slate-950/60 border border-border rounded-sm p-3">
      <div className="font-mono text-[10px] text-muted-foreground tracking-wider">OPERATIONAL MAP</div>
      <div className="font-mono text-xs text-foreground mt-2">Clusters: {clusterCount}</div>
      {error ? <div className="font-mono text-[10px] text-destructive mt-1">{error}</div> : null}
      <div className="mt-2 h-[calc(100%-48px)] border border-border/70 rounded-sm bg-background/40" />
    </div>
  );
};
