# Discord and WhatsApp intake

The backend exposes **POST /api/intake/discord** and **POST /api/intake/whatsapp** so you can submit crisis reports from Discord, WhatsApp, or any HTTP client. This doc covers running the API and wiring a Discord bot; WhatsApp uses the same payload shape.

## 1. Apply the migration

The `reports` table must allow `source_type = 'discord_anonymous'`. From the repo root:

```bash
# If using Supabase CLI and linked project
supabase db push

# Or run the migration SQL manually in Supabase Dashboard → SQL Editor
# File: supabase/migrations/021_intake_discord_source_type.sql
```

## 2. Run the backend

From `backend/`:

```bash
# Load .env (TRIBBLE_SUPABASE_URL, TRIBBLE_SUPABASE_SERVICE_KEY, etc.)
cd backend
uv run uvicorn tribble.main:app --reload --host 0.0.0.0 --port 8000
# or: python -m uvicorn tribble.main:app --reload --port 8000
```

Ensure `.env` has valid Supabase credentials so `create_report_with_job` runs.

## 3. Call the API

**Minimal payload:** `message` (≥10 chars), `latitude`, `longitude`.

```bash
curl -X POST http://localhost:8000/api/intake/discord \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Flooding in Juba, main road blocked. Families need water and shelter.",
    "latitude": 4.85,
    "longitude": 31.6
  }'
```

Optional: `"language": "en"`, `"country_iso": "SSD"`.

Success: `201` and `{"report_id": "...", "status": "queued"}`. The report is created and a pipeline job is enqueued (same as web submit).

### WhatsApp (same payload shape)

Use **POST /api/intake/whatsapp** with the same JSON body. Reports are stored with `source_type=whatsapp_anonymous` (confidence prior 0.40).

```bash
curl -X POST http://localhost:8000/api/intake/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Flooding in Juba, main road blocked. Families need water and shelter.",
    "latitude": 4.85,
    "longitude": 31.6,
    "country_iso": "SSD"
  }'
```

To wire real WhatsApp: use **Twilio** or **Meta Business API** to receive incoming messages, then POST to this URL (e.g. from a serverless function or Zapier) with the message body and coordinates (e.g. parsed from text or shared location). No Twilio/Meta setup is required for testing—call the endpoint directly as above.

## 4. Wire a real Discord bot (optional)

To turn Discord messages into intake submissions:

### Option A: Bot forwards messages to your API

**Full step-by-step (create bot with your Discord account, invite it, run the script):** see **[docs/discord-bot-setup.md](discord-bot-setup.md)**.

Short version:

1. **Create a Discord application** → Bot → enable “Message Content Intent” → copy Bot Token.
2. **Invite the bot** to your server (OAuth2 URL Generator → scope “bot”, permissions Read Message History + Send Messages).
3. **Run the script:** `pip install discord.py`, set `DISCORD_BOT_TOKEN` and `TRIBBLE_INTAKE_URL`, then `python backend/scripts/discord_intake_bot.py`.
4. In Discord: `!report <message (min 10 chars)> | lat, lng`.

Legacy example (Python, using `discord.py` and `httpx`):

   ```python
   # Example: when someone sends "!report Flooding here | 4.85, 31.6"
   import httpx

   INTAKE_URL = "https://your-backend.example.com/api/intake/discord"

   async def on_message(message):
       if not message.content.startswith("!report "):
           return
       text = message.content.removeprefix("!report ").strip()
       part, _, coords = text.rpartition("|")
       narrative = (part or text).strip()
       if not narrative or len(narrative) < 10:
           await message.channel.send("Usage: !report <message (min 10 chars)> | lat, lng")
           return
       try:
           lat_str, lng_str = coords.strip().split(",")
           lat, lng = float(lat_str), float(lng_str)
       except Exception:
           await message.channel.send("Usage: !report <message> | lat, lng")
           return
       async with httpx.AsyncClient() as client:
           r = await client.post(INTAKE_URL, json={
               "message": narrative,
               "latitude": lat,
               "longitude": lng,
           })
       if r.status_code == 201:
           await message.channel.send(f"Report queued: {r.json()['report_id']}")
       else:
           await message.channel.send(f"Failed: {r.status_code} {r.text}")
   ```

3. **Host the bot** (e.g. a small VPS or Railway) so it stays online and can reach your backend. Keep the bot token in env vars, not in code.

### Option B: Discord webhook → your API

If you prefer not to run a bot:

- Use **Zapier**, **n8n**, or **Make**: trigger on “New Message in Discord” (where supported) and send an HTTP request to `POST /api/intake/discord` with the message body and coordinates (e.g. from message content or a form).
- Or use a **Discord webhook** that posts *into* Discord from your app; for *intake*, something still has to send HTTP to your backend (e.g. a form that POSTs to your API and optionally posts a confirmation to Discord).

## 5. Validation and errors

- **422**: Invalid payload (e.g. message &lt; 10 chars, missing lat/lng, or out-of-range coordinates). Fix the request body.
- **503**: Database unavailable. Check Supabase and env.
- **500**: RPC failed (e.g. migration not applied). Check backend logs and that `discord_anonymous` / `whatsapp_anonymous` are allowed in the `reports.source_type` check constraint.

## Summary

| Step | Action |
|------|--------|
| 1 | Apply `021_intake_discord_source_type.sql` (e.g. `supabase db push`) for Discord; WhatsApp source types already exist |
| 2 | Run backend with Supabase env vars set |
| 3 | POST to `/api/intake/discord` or `/api/intake/whatsapp` with `message`, `latitude`, `longitude` |
| 4 | Optionally run a Discord bot or Twilio/Meta webhook that forwards messages to the corresponding URL |
