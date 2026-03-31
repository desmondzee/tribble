# Discord intake bot — step-by-step setup

You use **your normal Discord account** only to create the bot and add it to a server. The bot is a separate “user” that sits in the server and forwards `!report` messages to Tribble. You do not log in as yourself inside the script.

---

## Step 1: Create a Discord application (with your account)

1. Log in to [Discord](https://discord.com) in your browser.
2. Open the **[Discord Developer Portal](https://discord.com/developers/applications)**.
3. Click **“New Application”**. Give it a name (e.g. “Tribble intake”) and create it.
4. In the left sidebar, open **“Bot”**.
5. Click **“Add Bot”** and confirm. You now have a bot user.
6. Under **“Privileged Gateway Intents”**, turn **“Message Content Intent”** **ON**. (Required so the bot can read your messages.)
7. Click **“Reset Token”** (or “View Token”) and **copy the token**. Store it somewhere safe (you’ll use it as `DISCORD_BOT_TOKEN`).  
   - If you lose it, generate a new one; the old one stops working.

You do **not** use your own Discord password anywhere. The token is only for this bot.

---

## Step 2: Invite the bot to a server

You need a server where you have “Manage Server” (or create a new one).

1. In the Developer Portal, left sidebar: **“OAuth2” → “URL Generator”**.
2. Under **Scopes**, check **“bot”**.
3. Under **Bot Permissions**, check at least:
   - **Read Message History**
   - **Send Messages**
   - **Read Messages in Channels** (often implied)
4. Copy the **Generated URL** at the bottom.
5. Open that URL in your browser. Choose the server to add the bot to and authorize.

The bot will appear in your server’s member list (offline until you run the script).

---

## Step 3: Install Python and dependencies

From your machine (same one you use for the Tribble backend):

```bash
cd /path/to/tribble/backend

# Create a venv if you like (optional)
# python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate

# Install the Discord library (backend already has httpx)
pip install discord.py
```

---

## Step 4: Set environment variables

Set the bot token and the URL of your Tribble backend:

```bash
export DISCORD_BOT_TOKEN="your-bot-token-from-step-1"
export TRIBBLE_INTAKE_URL="http://localhost:8000"
```

- Use your **real** bot token from Step 1.
- If the backend runs on another host/port, set `TRIBBLE_INTAKE_URL` to that (e.g. `https://your-backend.example.com`). Do not add `/api/intake/discord` — the script adds that path.

---

## Step 5: Run the Tribble backend (if testing locally)

In a separate terminal:

```bash
cd /path/to/tribble/backend
# Load .env with Supabase keys, then:
uv run uvicorn tribble.main:app --reload --port 8000
```

Leave it running so the bot can POST to `http://localhost:8000`.

---

## Step 6: Run the Discord bot

In the first terminal:

```bash
cd /path/to/tribble/backend
python scripts/discord_intake_bot.py
```

You should see something like:

```
Logged in as YourBotName#1234 (ID: ...)
Send in any channel: !report <message> | lat, lng
Example: !report Flooding in Juba, need water. | 4.85, 31.6
```

The bot is now online in your server.

---

## Step 7: Submit a report from Discord

In any channel where the bot can read and send messages, type:

```text
!report Flooding in Juba, roads blocked. Families need water and shelter. | 4.85, 31.6
```

Format:

- **!report** (with a space after it).
- Your **message** (at least 10 characters).
- A **pipe** `|`.
- **Latitude, longitude** as two numbers separated by a comma (e.g. `4.85, 31.6`).

The bot will reply with either:

- `Report queued. ID: <uuid>` — success; the report was sent to Tribble and queued.
- Or an error (e.g. backend unreachable, validation error). Fix the message or backend and try again.

If you type only `!report` (with no message/coords), the bot replies with a short usage reminder.

---

## Summary

| Step | What you do |
|------|-------------|
| 1 | Developer Portal → New Application → Bot → enable “Message Content Intent” → copy token |
| 2 | OAuth2 URL Generator → scope “bot”, permissions Read/Send Messages → open URL, add bot to your server |
| 3 | `pip install discord.py` in backend directory |
| 4 | `export DISCORD_BOT_TOKEN="..."` and `export TRIBBLE_INTAKE_URL="http://localhost:8000"` |
| 5 | Run Tribble backend (e.g. `uv run uvicorn tribble.main:app --port 8000`) |
| 6 | Run `python scripts/discord_intake_bot.py` |
| 7 | In Discord: `!report Your message here (min 10 chars). | lat, lng` |

**Can I do it with my Discord account?**  
Yes: you use your account to create the app and invite the bot. The script only uses the **bot token**, not your personal login. The bot appears as a separate user in the server.

**Keeping the bot online 24/7**  
Run the script on a server or a cloud box (e.g. a small VPS or Railway) with `DISCORD_BOT_TOKEN` and `TRIBBLE_INTAKE_URL` set, so it stays connected and can reach your Tribble API.
