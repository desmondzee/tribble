#!/usr/bin/env python3
"""
Discord bot that forwards crisis reports to Tribble intake API.

Usage:
  pip install discord.py   # if not already installed
  export DISCORD_BOT_TOKEN="your-bot-token"
  export TRIBBLE_INTAKE_URL="http://localhost:8000"   # or your backend URL
  python scripts/discord_intake_bot.py

In Discord, in any channel the bot can read:
  !report Flooding in Juba, roads blocked. Need water and shelter. | 4.85, 31.6

The bot POSTs to TRIBBLE_INTAKE_URL/api/intake/discord and replies with the report ID or an error.
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

# Ensure we can import httpx (backend has it)
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import httpx

try:
    import discord
    from discord.ext import commands
except ImportError:
    print("Install discord.py: pip install discord.py", file=sys.stderr)
    sys.exit(1)


def _env(key: str, default: str | None = None) -> str:
    v = os.environ.get(key, default)
    if not v and key == "DISCORD_BOT_TOKEN":
        print("Set DISCORD_BOT_TOKEN (from Discord Developer Portal → Your App → Bot → Token).", file=sys.stderr)
        sys.exit(1)
    return v or ""


INTAKE_URL = _env("TRIBBLE_INTAKE_URL", "http://localhost:8000").rstrip("/") + "/api/intake/discord"


# Format: !report <message (min 10 chars)> | <lat>, <lng>
REPORT_PATTERN = re.compile(r"^\s*!report\s+(.+)\s+\|\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$", re.DOTALL)


async def submit_report(message: str, latitude: float, longitude: float) -> tuple[int, str]:
    """POST to Tribble intake; returns (status_code, body or message)."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(
                INTAKE_URL,
                json={
                    "message": message.strip(),
                    "latitude": latitude,
                    "longitude": longitude,
                },
            )
            return r.status_code, r.json().get("report_id", r.text) if r.status_code == 201 else r.text
    except httpx.ConnectError as e:
        return 0, f"Could not reach Tribble backend: {e}"
    except Exception as e:
        return 0, str(e)


intents = discord.Intents.default()
intents.message_content = True  # Required to read message content (also enable in Developer Portal)

bot = commands.Bot(command_prefix="!", intents=intents)


@bot.event
async def on_ready():
    print(f"Logged in as {bot.user} (ID: {bot.user.id})")
    print("Send in any channel: !report <message> | lat, lng")
    print("Example: !report Flooding in Juba, need water. | 4.85, 31.6")


@bot.event
async def on_message(msg):
    if msg.author.bot:
        return
    text = msg.content.strip()
    m = REPORT_PATTERN.match(text)
    if not m:
        if text.lower().startswith("!report"):
            await msg.reply(
                "Usage: `!report <message (min 10 characters)> | latitude, longitude`\n"
                "Example: `!report Flooding in Juba, roads blocked. Need water. | 4.85, 31.6`"
            )
        return
    narrative = m.group(1).strip()
    try:
        lat = float(m.group(2))
        lng = float(m.group(3))
    except ValueError:
        await msg.reply("Invalid coordinates. Use: `!report <message> | lat, lng` (numbers only).")
        return
    if len(narrative) < 10:
        await msg.reply("Message must be at least 10 characters.")
        return
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        await msg.reply("Latitude must be -90..90, longitude -180..180.")
        return
    await msg.channel.typing()
    status, body = await submit_report(narrative, lat, lng)
    if status == 201:
        await msg.reply(f"Report queued. ID: `{body}`")
    else:
        await msg.reply(f"Intake failed ({status}): {body[:200]}")


def main() -> int:
    token = _env("DISCORD_BOT_TOKEN")
    if not token:
        return 1
    # Required for reading message content
    bot.run(token)
    return 0


if __name__ == "__main__":
    sys.exit(main())
