# Supabase MCP integration

Cursor is configured to use the [Supabase MCP server](https://supabase.com/docs/guides/getting-started/mcp) so the AI can query your project, run SQL, list tables, apply migrations, and generate TypeScript types.

## Setup

- **Config:** `.cursor/mcp.json` — project-scoped to `atakrwvijdbihjzsvikd` (Supabase project ref from [dashboard](https://supabase.com/dashboard/project/atakrwvijdbihjzsvikd/settings/api-keys/legacy)).
- **Auth:** On first use, Cursor will open a browser so you can log in to Supabase and grant the MCP client access. No API keys go in the config.
- **Restart:** After adding or changing `.cursor/mcp.json`, restart Cursor and check **Settings → Tools & MCP** that the Supabase server is connected.

## Optional: Personal Access Token (PAT) for MCP

If you prefer not to use browser OAuth (e.g. headless or CI), you can use a [Supabase Personal Access Token](https://supabase.com/dashboard/account/tokens) (e.g. labelled “Personal use”). **Never commit the token.**

- Copy `.cursor/mcp.example.json` to `.cursor/mcp.json` (the latter is in `.gitignore`).
- In `.cursor/mcp.json`, set `env.SUPABASE_ACCESS_TOKEN` to your `sbp_...` token.
- Store the same token in `backend/.env` as `SUPABASE_ACCESS_TOKEN=sbp_...` for CLI/scripts if needed.
- Restart Cursor so MCP picks up the config; then check **Settings → Tools & MCP** that the Supabase server is connected.

## Service role key (backend only)

The **service role** key from the Supabase dashboard is for the **backend** (Python), not for MCP:

- Put it in `backend/.env` as `TRIBBLE_SUPABASE_SERVICE_KEY=your-jwt-here`.
- Keep `backend/.env` out of version control (it is in `.gitignore`).
- **Do not** put the service role key in `.cursor/mcp.json`. Supabase MCP uses OAuth (or, in CI, a [Personal Access Token](https://supabase.com/dashboard/account/tokens) from your account), not the project service role JWT.

## Optional: read-only or limited tools

To restrict what the AI can do:

- **Read-only SQL:**  
  In `.cursor/mcp.json`, change the URL to:  
  `https://mcp.supabase.com/mcp?project_ref=atakrwvijdbihjzsvikd&read_only=true`
- **Specific features only:**  
  Add `&features=database,docs` (or other [feature groups](https://supabase.com/docs/guides/getting-started/mcp#available-tools)).

## Verifying

In Cursor chat, try: *"What tables are in the database? Use MCP tools."* The agent should use the Supabase MCP server to list tables.
