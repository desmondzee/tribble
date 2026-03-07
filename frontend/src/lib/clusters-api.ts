export interface ClusterFeatureCollection {
  type: "FeatureCollection";
  features: Array<{ type: "Feature"; geometry: { type: string; coordinates: number[] }; properties: Record<string, unknown> }>;
}


function getBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL ?? "").trim();
}


export async function fetchClusters(): Promise<ClusterFeatureCollection> {
  const base = getBaseUrl();
  const url = base ? `${base}/api/clusters` : "/api/clusters";
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch clusters: ${response.status}`);
  }
  const payload = await response.json() as ClusterFeatureCollection;
  return {
    type: "FeatureCollection",
    features: payload.features ?? [],
  };
}
