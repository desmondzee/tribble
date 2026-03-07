# Apply migration 014 and run ACLED CSV import

## What’s going on

- **Supabase MCP token expired** — migrations can’t be applied via MCP.
- Your project currently has the **Tribble schema** (e.g. `events`, `civilian_reports`) but not the **plan schema** (`reports`, `locations`, `pipeline_jobs`). The ACLED CSV import needs the plan schema and the enhanced `create_report_with_job` RPC (migration 014).

## Step 1: Apply the plan migrations (if not already applied)

The ACLED import expects:

- **reports** — from `003_core_tables.sql`
- **locations** — from `003_core_tables.sql`
- **pipeline_jobs** — from `007_job_queue.sql`
- **create_report_with_job** RPC — from `010_api_helpers.sql`, then **014_enhance_report_rpc.sql** (adds location params)

If your project doesn’t have `reports` / `locations` / `pipeline_jobs` yet, apply these in order in the [Supabase SQL Editor](https://supabase.com/dashboard/project/atakrwvijdbihjzsvikd/sql/new):

1. **001_enable_postgis.sql**
2. **002_taxonomy.sql**
3. **003_core_tables.sql** (creates `locations`, `reports`, etc.)
4. **004_enrichment_infrastructure.sql**
5. **005_incident_clusters.sql**
6. **006_confidence_audit.sql**
7. **007_job_queue.sql** (creates `pipeline_jobs`)
8. **008_rls_policies.sql**
9. **009_seed_taxonomy.sql** (optional)
10. **010_api_helpers.sql** (creates `create_report_with_job`)
11. **013_location_coords_helper.sql** (if present)
12. **014_enhance_report_rpc.sql** (adds `p_country`, `p_country_iso`, `p_location_name`, `p_admin1`, `p_admin2`, `p_precision` to the RPC)

Each file is in **`supabase/migrations/`**. Run them in numerical order. If you get “already exists” errors, skip that step.

**Or** use the Supabase CLI from the repo root:

```bash
supabase db push
```

(Requires Supabase CLI installed and project linked.)

## Step 2: Run the ACLED CSV import

After the plan schema and 014 are applied:

```bash
cd ~/tribble/backend && python -m tribble.ingest.acled_csv ~/Downloads/"ACLED Data_2026-03-07-2.csv"
```

This will:

- Insert into **locations** (country, admin1/2, name, geom, precision)
- Insert into **reports** (narrative, crisis_categories, processing_metadata, etc.)
- Insert into **pipeline_jobs** (one job per report for the LangGraph worker)

Re-running is safe: it skips any row whose `acled_event_id` already exists in `reports`.

---

**Current error:** The import failed with `Could not find the table 'public.reports'` because the project doesn’t have the plan schema yet. Apply the migrations above (at least 001, 003, 007, 010, 014), then run the import again.
