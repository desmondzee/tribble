# Set up Tribble database (Supabase MCP or manual)

## Option A: Use Supabase MCP (recommended once connected)

### 1. Connect Supabase MCP in Cursor

- Your project already has `.cursor/mcp.json` with the Supabase server and project ref `atakrwvijdbihjzsvikd`.
- **Restart Cursor** fully (quit and reopen).
- Open **Settings → Tools & MCP** (Cmd+Shift+J) and confirm **Supabase** appears and is enabled.
- The first time you (or the AI) use a Supabase tool, Cursor will open a browser so you can **log in to Supabase** and grant access. Do that once.

### 2. Run the schema via the AI

After Supabase MCP is connected, in Cursor chat you can say:

**"Run the Tribble schema on my Supabase project using MCP: execute the SQL in `docs/tribble-schema.sql`."**

The AI can then use the Supabase MCP **execute_sql** (or **apply_migration**) tool to run the contents of `docs/tribble-schema.sql` against your project. You may need to approve the tool call in Cursor.

### 3. If MCP asks for information

- **Project:** already in the URL (`project_ref=atakrwvijdbihjzsvikd`).
- **SQL:** the full contents of `docs/tribble-schema.sql` (tables, indexes, PostGIS, RLS, seed data). The AI can read that file and pass it to the tool.
- No extra secrets are required for MCP if you’ve completed the browser login.

---

## Option B: Run the SQL manually in Supabase

1. Open [Supabase Dashboard](https://supabase.com/dashboard/project/atakrwvijdbihjzsvikd) → **SQL Editor**.
2. Open `docs/tribble-schema.sql` in your repo and copy its full contents.
3. Paste into the SQL Editor and click **Run**.
4. Ensure **PostGIS** is enabled (the schema runs `CREATE EXTENSION IF NOT EXISTS postgis`; if you get an error, enable PostGIS in Database → Extensions first).

---

## After the schema is applied

- You should have 10 tables: `events`, `submissions`, `satellite_scenes`, `weather_data`, `civilian_reports`, `analysis_results`, `zones`, `ngos`, `boundaries`, `drones`.
- Seed data: 3 zones, 4 NGOs, 2 boundaries, 3 drones.
- RLS: anon can read all and insert into `submissions`; service role has full access.

Then enable **Email** under Authentication → Providers and create a user so you can sign in to the app.
