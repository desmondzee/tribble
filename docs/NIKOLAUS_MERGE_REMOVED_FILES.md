# Files removed by Nikolaus frontend merge

These files existed on `jamesagain` but were removed or replaced when
cherry-picking the Nikolaus frontend (2026-03-07).

They can be recovered from commit `33418fc` (jamesagain) at any time:

```bash
git show 33418fc:tribble/components/AuthSync.tsx
git show 33418fc:tribble/lib/supabase/queries.ts
git show 33418fc:tribble/lib/supabase/types.ts
git show 33418fc:tribble/components/landing/GlobeCanvas.tsx
```

## Removed files

### `tribble/components/AuthSync.tsx`
- Initialised Supabase auth state and subscribed to session changes
- Used `useAuthStore` zustand store
- Rendered nothing; meant to live in root layout

### `tribble/lib/supabase/queries.ts`
- Supabase query functions: fetchEvents, fetchSubmissions, fetchZones, fetchBoundaries,
  fetchNGOs, fetchDrones, fetchSatelliteScenes, fetchCivilianReports, fetchAnalysisResults,
  submitReport
- DB row → frontend type mappers (mapDbEvent, mapDbSubmission, mapDbDrone, mapDbNGO)

### `tribble/lib/supabase/types.ts`
- TypeScript interfaces for all DB row types: DbEvent, DbSubmission, DbZone, DbBoundary,
  DbNGO, DbDrone, DbSatelliteScene, DbCivilianReport, DbAnalysisResult, DbWeatherData

### `tribble/components/landing/GlobeCanvas.tsx`
- Three.js voxel globe with procedural landmasses and conflict hotspot markers
- Replaced by Nikolaus's `EarthAnimation.tsx`

## Renamed files

### `tribble/components/map/TacticalMap.tsx` → `LiveMap.tsx`
- Same component, renamed

## Simplified files

### `tribble/context/DataContext.tsx`
- ~180 lines removed; Nikolaus simplified the data context

### `tribble/store/authSlice.ts`
- ~110 lines removed; Nikolaus simplified the auth store
