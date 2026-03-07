/**
 * Geolocation pipeline API client.
 * Fetches GeoJSON of resolved place events from report narratives.
 */

export interface GeolocationFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: string; coordinates: number[] };
    properties: Record<string, unknown>;
  }>;
}

function getBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? "").trim();
}

export async function fetchGeolocationGeoJSON(
  limit: number = 50
): Promise<GeolocationFeatureCollection> {
  const base = getBaseUrl();
  const url = base
    ? `${base}/api/geolocation/geojson?limit=${limit}`
    : `http://localhost:8000/api/geolocation/geojson?limit=${limit}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch geolocation: ${response.status}`);
  }
  const payload = (await response.json()) as GeolocationFeatureCollection;
  return {
    type: "FeatureCollection",
    features: payload.features ?? [],
  };
}
