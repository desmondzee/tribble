"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { getClusters, type GeoJSONFeatureCollection } from "@/lib/api";
import { MOCK_CLUSTERS } from "@/data/mapData";

const DataContext = createContext<{
  clusters: GeoJSONFeatureCollection;
  lastUpdated: Date | null;
  isLive: boolean;
} | null>(null);

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [clusters, setClusters] = useState<GeoJSONFeatureCollection>({
    type: "FeatureCollection",
    features: MOCK_CLUSTERS,
  });
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isLive, setIsLive] = useState(false);

  const tryFetch = useCallback(async () => {
    try {
      const data = await getClusters();
      setClusters(data);
      setIsLive(true);
      setLastUpdated(new Date());
    } catch {
      // Keep existing state (mock data or last live data)
    }
  }, []);

  useEffect(() => {
    tryFetch();
    const timer = setInterval(tryFetch, 60_000);
    return () => clearInterval(timer);
  }, [tryFetch]);

  return (
    <DataContext.Provider value={{ clusters, lastUpdated, isLive }}>
      {children}
    </DataContext.Provider>
  );
}
