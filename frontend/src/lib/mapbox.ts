const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);


export function getMapboxToken(raw: string | undefined = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN): string {
  const token = (raw ?? "").trim();
  if (!token) {
    throw new Error("VITE_MAPBOX_ACCESS_TOKEN is required when Mapbox UI is enabled");
  }
  return token;
}


export function isMapboxEnabled(raw: string | undefined = import.meta.env.VITE_ENABLE_MAPBOX_UI): boolean {
  return TRUE_VALUES.has((raw ?? "").trim().toLowerCase());
}
