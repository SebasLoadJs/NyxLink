# Real Discord voice and Crossfade acceptance gate

This is a **manual, opt-in, potentially audible** integration check. It will connect a test bot to a real Discord voice channel, request music playback from an already running NodeLink server, and write a local event report. The script cannot determine by itself whether a listener actually heard the music, volume was correct, or two tracks audibly overlapped. It never runs in normal CI and does not grant NyxLink core any Discord voice transport dependency.

## Prerequisites

- A dedicated test guild and voice channel where you have permission to send audio.
- A bot token stored privately in local environment variables (never paste tokens into chat or commit them).
- A reachable NodeLink server (for crossfade/commands/reconnect) or Lavalink v4 server (commands/reconnect), with HTTP audio-source access and permission to connect Discord voice.
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
| `NYXLINK_LIVE_BACKEND` | `nodelink` (default) or `lavalink`; Lavalink requires `--commands` or `--reconnect` |

**Run only when intentionally joining the test channel:**

```bash
pnpm run build
node scripts/test-live-voice.cjs --armed
```

The script sends voice connection requests and plays the two tracks with `setCrossfade({enabled:true,mode:'smart'})` plus `setQueuePreload({enabled:true})`. It requires two ordered `trackStart` events and an empty queue at handoff. It separately records whether `trackEnd` was tagged `crossfading`, `gapless`, or another reason. Its output is `.runtime/live-voice/report.json` with private mode 0600; credentials and source URLs are omitted.

## Separate playback-command acceptance mode

The default `--armed` run checks the NodeLink crossfade/queue-preload
sequence. To test **play, pause, resume, volume, seek and skip** against an
authorized **real NodeLink backend**, use this separate mode:

```bash
pnpm run build
node scripts/test-live-voice.cjs --armed --commands
```

The same dedicated test server, channel, credentials and two controlled
15–120 second tracks are required. The default backend is NodeLink. To test
**Lavalink v4**, explicitly select the backend and run **commands mode only**:

```bash
NYXLINK_LIVE_BACKEND=lavalink node scripts/test-live-voice.cjs --armed --commands
```

`NYXLINK_LIVE_BACKEND` only accepts `lavalink` or `nodelink`;
the live script checks that the connected backend matches the selected
value. The default `--armed` crossfade acceptance mode requires NodeLink;
Lavalink is not falsely advertised as having the NodeLink crossfade API.

Commands mode **does not** enable crossfade, so it does not interfere with
the default transition scenario. It requires eight checkpoints: the initial
play acknowledgement, **backend confirmation of track A**, paused state,
resumed state, backend volume 40, a 5-second seek, skip acknowledgement and
**backend confirmation of track B**. It separately observes ordered track-start
events. Every backend acknowledgement has a bounded polling window,
**including an HTTP request that never returns**. Failures are recorded only
as an error category and stage.

The local report includes `commandChecks` with eight accepted checkpoints
and whether the ordered start events were observed. It never records song
URLs, bearer tokens, encoded tracks or gateway voice tokens. Neither mode
certifies audible fidelity: a human observer must confirm actual voice
output, pause/resume audibility, seek precision and lack of dropouts.

**CI coverage:** `tests/live-voice-commands.test.cjs` verifies the command
sequence with a fake backend and failure cases; CI deliberately does
not initiate real Discord voice connections.

## Separate voice reconnect acceptance mode

To test a **controlled voice disconnect and rejoin**, select `--reconnect`
instead of `--commands`. It supports both NodeLink and Lavalink v4:

```bash
# NodeLink
node scripts/test-live-voice.cjs --armed --reconnect

# Lavalink v4 (choose a compatible server with valid fixture URLs)
NYXLINK_LIVE_BACKEND=lavalink node scripts/test-live-voice.cjs --armed --reconnect
```

The reconnect mode requires **both controlled tracks to last at least
45 seconds**, so a short fixture does not finish during the handshake.
It starts track A, verifies the backend has the correct track, deliberately
leaves the voice channel, reconnects via Discord, calls the player's
recovery operation without destroying it, and confirms the backend reports
a connected session with track A. Five checkpoints are recorded in
`reconnectChecks`, not raw session IDs, gateway voice credentials or
track encodings.

**It is not a network-partition or audible-recovery certification.** The
test does not forcibly kill the gateway, unplug a NodeLink/Lavalink node or
measure the absence of an audio dropout. Repeat a separate authorized
interruption test for those release requirements. The three live acceptance
modes are mutually exclusive; every mode requires `--armed`.

## Human / audio observer acceptance

A second Discord participant must listen to the channel and check: audible A; audible B; whether the overlap actually occurs for the expected duration; correct volume; no dropout; no duplicate B or unexpected replay. Mark audio as **unverified** until a listener confirms these criteria. A correct track-start event alone is not audible evidence; the script explicitly stores `audioMeasured: false`.

To test interruption/recovery, repeat separately with a manual `skip()`, `stop()`, queue reorder, bot reconnection and source failure. This harness covers a single authorized happy path, not all reliability gates. Never use an unrelated public guild or user-owned private voice channel without permission.

## Security and release restrictions

The test runs only with explicit `--armed` and all required credentials. The script is not called by regular CI and does not publish, distribute or persist secrets. It never upgrades the NodeLink server or modifies `v5.2`. Keep the production release gated on separately observed audible transitions and real voice reconnection behavior.
