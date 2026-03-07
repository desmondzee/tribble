/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_MAPBOX_ACCESS_TOKEN: string;
  readonly VITE_ENABLE_MAPBOX_UI?: string;
  readonly VITE_ENABLE_SUPABASE_REALTIME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
