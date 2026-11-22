# Real Discord voice and Crossfade acceptance gate

This is a **manual, opt-in, potentially audible** integration check. It will connect a test bot to a real Discord voice channel, request music playback from an already running NodeLink server, and write a local event report. The script cannot determine by itself whether a listener actually heard the music, volume was correct, or two tracks audibly overlapped. It never runs in normal CI and does not grant NyxLink core any Discord voice transport dependency.

## Prerequisites

- A dedicated test guild and voice channel where you have permission to send audio.
- A bot token stored privately in local environment variables (never paste tokens into chat or commit them).
- A reachable NodeLink server running the pinned modern-compatible protocol, with HTTP audio source enabled and gateway access to Discord voice.
- Two **different, authorized** HTTP(S) audio WAV files, approximately 15–120 seconds each, reachable **from the NodeLink server**. Use original generated test tones or files you control; avoid streamed/copyrighted catalog material.
- Node.js 22+ and repository development dependencies installed; run `pnpm run build` before launching.

Provide the required environment variables using your local process environment or a secrets manager. No `.env` file is required:

| Variable | Purpose |
| --- | --- |
| `NYXLINK_DISCORD_BOT_TOKEN` | Test bot token (secret) |
| `NYXLINK_DISCORD_GUILD_ID` | Dedicated test server ID |
| `NYXLINK_DISCORD_VOICE_CHANNEL_ID` | Authorized voice channel ID |
| `NYXLINK_NODE_HOST` / `NYXLINK_NODE_PORT` | NodeLink server address |
| `NYXLINK_NODE_PASSWORD` | NodeLink authorization password (secret) |
| `NYXLINK_NODE_SECURE` | Optional `true` for HTTPS/WSS |
| `NYXLINK_LIVE_TRACK_A` / `NYXLINK_LIVE_TRACK_B` | Controlled, reachable fixture URLs |
| `NYXLINK_LIVE_CROSSFADE_MS` | Optional 1000–15000; default 5000 |

**Run only when intentionally joining the test channel:**

```bash
pnpm run build
node scripts/test-live-voice.cjs --armed
```

The script sends voice connection requests and plays the two tracks with `setCrossfade({enabled:true,mode:'smart'})` plus `setQueuePreload({enabled:true})`. It requires two ordered `trackStart` events and an empty queue at handoff. It separately records whether `trackEnd` was tagged `crossfading`, `gapless`, or another reason. Its output is `.runtime/live-voice/report.json` with private mode 0600; credentials and source URLs are omitted.

## Human / audio observer acceptance

A second Discord participant must listen to the channel and check: audible A; audible B; whether the overlap actually occurs for the expected duration; correct volume; no dropout; no duplicate B or unexpected replay. Mark audio as **unverified** until a listener confirms these criteria. A correct track-start event alone is not audible evidence; the script explicitly stores `audioMeasured: false`.

To test interruption/recovery, repeat separately with a manual `skip()`, `stop()`, queue reorder, bot reconnection and source failure. This harness covers a single authorized happy path, not all reliability gates. Never use an unrelated public guild or user-owned private voice channel without permission.

## Security and release restrictions

The test runs only with explicit `--armed` and all required credentials. The script is not called by regular CI and does not publish, distribute or persist secrets. It never upgrades the NodeLink server or modifies `v5.2`. Keep the production release gated on separately observed audible transitions and real voice reconnection behavior.
