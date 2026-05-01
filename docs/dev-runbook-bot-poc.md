# Dev Runbook: Lichess Legal-Move Bot POC

_Tracked in [FOR-63](/FOR/issues/FOR-63). Status: Draft — finalize against live implementation._

---

## 1. Prerequisites

### Software
- **Node.js >= 22.x** (required for native `fetch` NDJSON streaming and `--experimental-transform-types`)
- **npm >= 10.x**
- **git**

### Lichess BOT Account
- A Lichess account upgraded to BOT status (the account **must not** have played any human games)
- API token with scopes: `bot:play`, `challenge:read`, `challenge:write`
- Upgrade command (run once per account):
  ```bash
  curl -X POST https://lichess.org/api/bot/account/upgrade \
    -H "Authorization: Bearer $LICHESS_BOT_TOKEN"
  ```

---

## 2. Required Environment Variables

| Variable | Required | Description |
|---|---|---|
| `LICHESS_BOT_TOKEN` | **yes** | Lichess BOT API token |
| `LOG_LEVEL` | no | `debug` \| `info` \| `warn` \| `error` (default: `info`) |
| `ACCEPT_RATED` | no | Accept rated challenges: `true` \| `false` (default: `false`) |
| `MAX_CLOCK_SECONDS` | no | Reject challenges exceeding this clock; unset = accept all |

Create a `.env` file at project root (**never commit this file**):

```
LICHESS_BOT_TOKEN=lip_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
LOG_LEVEL=debug
ACCEPT_RATED=false
```

---

## 3. Installation

```bash
git clone <repo-url>
cd <repo-dir>
npm install
```

---

## 4. Run Bot in Dev Mode

```bash
# One-step run (stream loop)
LICHESS_BOT_TOKEN=lip_xxxx npm start

# Or export first
export LICHESS_BOT_TOKEN=lip_xxxx
node src/bot/main.js
```

**Expected startup output:**
```
[info] starting game loop for <gameId> as <color>
```

---

## 5. Smoke Validation Steps

Run these steps in order against a **live** Lichess BOT account. Each step must pass before proceeding.

### Step 1 — Connection Verification
| | |
|---|---|
| **Action** | Start bot: `npm run bot:dev` |
| **Expected** | Log line `Connected as BOT: <username>` within 3 s |
| **Failure signals** | `401 Unauthorized` → invalid/expired token; `403 Forbidden` → account not upgraded to BOT |

### Step 2 — Challenge Accept + Receive First Turn
| | |
|---|---|
| **Action** | From a second Lichess account, send an **unrated** challenge to the BOT account |
| **Expected** | Log lines: `Challenge accepted: <gameId>` then `Receiving game state: gameId=<id> side=<color>` |
| **Failure signals** | Challenge not accepted → check `ACCEPT_RATED` / clock filter; no game-state event → stream not subscribed |

### Step 3 — Legal Move Submitted
| | |
|---|---|
| **Action** | Wait for the bot's first turn (or play a move if bot is Black) |
| **Expected** | Log line: `Submitting move: <uci> for game <gameId>` — HTTP response 200 |
| **Failure signals** | HTTP 400 → illegal move (chess.js FEN parse error); HTTP 429 → rate-limit breach |

### Step 4 — Terminal Game Handling
| | |
|---|---|
| **Action** | Allow game to reach a terminal state: checkmate, resignation (`/api/bot/game/<id>/resign`), or timeout |
| **Expected** | Log line: `Game <gameId> ended — outcome: <win\|loss\|draw> reason: <mate\|resign\|timeout\|aborted>`. Bot returns to idle event-stream listen loop. No hanging processes. |
| **Failure signals** | Process hangs or exits non-zero → orphaned stream handler; missing `ended` log → terminal-state mapper not invoked |

---

## 6. Known Limitations and Safety Guardrails

### Single-Game Scope (hard limit)
The bot processes **one active game at a time**. Challenges arriving during an active game are declined automatically.
Concurrent multi-game handling is **out of scope** for this POC.

### Move Quality (intentionally absent)
The baseline policy selects a **random legal move** deterministically or via uniform sampling.
No evaluation, tactics, or strategy is implemented. Move quality improvement is a separate initiative.

### Challenge Filtering
- Only unrated challenges accepted by default (`ACCEPT_RATED=false`).
- No time control enforcement unless `MAX_CLOCK_SECONDS` is set.

### No Persistent State
The bot holds no game history across restarts.
On NDJSON stream drop, the bot retries with exponential backoff (5 s → 15 s → 45 s) and exits after three consecutive failures.

### Rate Limits
Lichess enforces ≤ 15 moves/second/game at the API level.
The random-move decision latency is well under this ceiling; no client-side throttle is needed.

---

## 7. Troubleshooting Reference

| Symptom | Likely Cause | Remediation |
|---|---|---|
| `401 Unauthorized` at start | Invalid/expired token | Re-generate at lichess.org/account/oauth/token |
| `403 Forbidden` on upgrade call | Account has played human games | Create a fresh dedicated BOT account |
| Bot never accepts challenges | `ACCEPT_RATED=false` + rated challenge sent | Send an unrated challenge or set `ACCEPT_RATED=true` |
| Move submission returns 400 | Illegal move from FEN parse error | Set `LOG_LEVEL=debug` and inspect FEN/legal-moves payload |
| Stream drops after ~30 s | Lichess server keepalive timeout (expected) | Built-in reconnect logic handles this; no action required |
| Process exits after challenge | Crash in game-state handler | Inspect stderr for stack trace; check chess.js version |
