# Live Rollout Runbook — Chess Bot (FOR-209)

## Scope
This runbook covers the operational lifecycle of the chess bot's live play stack: starting with the UCI engine provider, rolling back to baseline, responding to engine failures, and running incident response.

---

## Environment Variables Reference

| Variable | Default | Description |
|---|---|---|
| `LICHESS_BOT_TOKEN` | *(required)* | Lichess BOT API token |
| `DECISION_PROVIDER` | `uci` | Move decision provider. `uci` = Stockfish via UCI, `random`/`baseline` = random legal move |
| `FALLBACK_MODE` | `first_legal` | Fallback policy when UCI unavailable. `first_legal` = deterministic first legal move, `random` = random legal move |
| `ENGINE_FAILURE_THRESHOLD` | `3` | Consecutive UCI fallbacks before circuit opens (skips engine entirely) |
| `ENGINE_RECOVERY_DELAY_MS` | `0` | Milliseconds before circuit attempts recovery after opening (0 = immediate) |
| `UCI_ENGINE_PATH` | `stockfish` | Path to UCI engine binary |
| `UCI_MOVE_TIME_MS` | `100` | Move time budget passed to engine `go movetime` (ms) |
| `BOT_MOVE_BUDGET_MS` | `200` | Per-move decision latency warning threshold (ms) |
| `LICHESS_BASE_URL` | `https://lichess.org` | Base URL for Lichess API |
| `ACCEPT_RATED` | `false` | Whether to accept rated games |
| `MAX_CLOCK_SECONDS` | *(none)* | Decline challenges with clock limit above this |
| `ACTIVE_CHALLENGE_TARGET_GAMES` | `5` | Outbound challenge quota before switching to passive mode |
| `ACTIVE_CHALLENGE_CLOCK_SECONDS` | `60` | Clock limit for outbound challenges |
| `ACTIVE_CHALLENGE_CLOCK_INCREMENT` | `0` | Increment for outbound challenges |
| `ACTIVE_CHALLENGE_TICK_MS` | `5000` | Interval between outbound challenge attempts |
| `ACTIVE_CHALLENGE_PENDING_TTL_MS` | `45000` | TTL of a pending outbound challenge before retrying another opponent |
| `ACTIVE_CHALLENGE_NO_GAME_COOLDOWN_MS` | `180000` | Cooldown on an opponent after a no-game outcome |

---

## Start Procedure

### Standard start (UCI provider, live play)

```bash
LICHESS_BOT_TOKEN=<token> \
DECISION_PROVIDER=uci \
UCI_ENGINE_PATH=/usr/games/stockfish \
UCI_MOVE_TIME_MS=100 \
BOT_MOVE_BUDGET_MS=200 \
ENGINE_FAILURE_THRESHOLD=3 \
ENGINE_RECOVERY_DELAY_MS=0 \
node src/bot/main.js
```

**Expected startup log lines:**
```
[info] provider=uci fallback=first_legal failure-threshold=3 recovery-delay=0ms
[info] bot runtime starting; active challenge target=5 clock=60+0
[info] Connected as BOT: <username>
```

### Baseline start (no engine, random moves — for auth/connectivity check)

```bash
LICHESS_BOT_TOKEN=<token> DECISION_PROVIDER=random node src/bot/main.js
```

### Quick connectivity smoke test

```bash
LICHESS_BOT_TOKEN=<token> node scripts/bot/live_smoke.js
```

Confirms authentication and event-stream connectivity. Exits after first `gameStart` event.

---

## Rollback Procedure

### Rollback to baseline (immediate, no restart required for next game)

Set `DECISION_PROVIDER=random` or `DECISION_PROVIDER=baseline` in the process environment and restart:

```bash
LICHESS_BOT_TOKEN=<token> DECISION_PROVIDER=random node src/bot/main.js
```

**When to rollback:**
- Engine binary is missing or crashes on startup.
- Circuit breaker stays OPEN across multiple restarts.
- Move latency consistently exceeds `BOT_MOVE_BUDGET_MS` warnings.
- Lichess flagging abnormal behavior from engine-specific patterns.

### Adjust circuit breaker without restart

These variables take effect on the next bot start (process-level config, not hot-reloadable):

```bash
# More aggressive circuit open (2 failures instead of 3)
ENGINE_FAILURE_THRESHOLD=2

# Add 60 s recovery delay before retrying engine
ENGINE_RECOVERY_DELAY_MS=60000

# Use random fallback instead of deterministic
FALLBACK_MODE=random
```

---

## Circuit Breaker Behavior

The engine circuit breaker (`src/decision/engine_circuit_breaker.js`) wraps `UciEnginePolicy` and tracks consecutive fallbacks:

| State | Meaning | Action |
|---|---|---|
| `closed` | Engine responding normally | All moves via UCI engine |
| `open` | Engine failed N consecutive times | Primary bypassed; all moves via fallback policy |
| `half_open` | Recovery window reached | One attempt via engine; success → closed, failure → open |

**Log signatures to watch:**

| Log pattern | Meaning |
|---|---|
| `[circuit-breaker] engine: OPEN after N consecutive fallbacks` | Circuit opened — engine is down |
| `[circuit-breaker] engine: OPEN — bypassing primary, using fallback` | Per-move degrade log (engine bypassed) |
| `[circuit-breaker] engine: entering half-open` | Recovery attempt starting |
| `[circuit-breaker] engine: CLOSED — primary recovered` | Engine back online, circuit closed |
| `[circuit-breaker] engine: recovery attempt failed` | Engine still down, circuit re-opened |

**Note:** If the circuit opens and stays open across several games, consider restarting with `DECISION_PROVIDER=random` as a stable fallback and investigating the engine binary.

---

## Incident Response

### Incident: engine process crashes or is unavailable at startup

**Symptoms:** `[warn]` logs from UciEnginePolicy; `source=uci_fallback` for every move.

**Steps:**
1. Verify engine binary: `which stockfish && stockfish --version`
2. Check `UCI_ENGINE_PATH` is correct.
3. Test manually: `echo -e "uci\nquit" | stockfish` — should print `uciok`.
4. If binary missing, install: `sudo apt install stockfish` (Debian/Ubuntu).
5. Restart bot with corrected `UCI_ENGINE_PATH`.
6. If engine unavailable in environment, restart with `DECISION_PROVIDER=random` to maintain game loop.

### Incident: circuit breaker opens mid-session

**Symptoms:** `[circuit-breaker] engine: OPEN after N consecutive fallbacks` in log.

**Steps:**
1. Check if engine process is still alive (process list, system resources).
2. Inspect recent log lines for `UciEngineError` patterns (timeout, unavailable, illegal_move).
3. If transient (resource spike), set `ENGINE_RECOVERY_DELAY_MS=30000` and restart — circuit will self-heal.
4. If persistent, restart with `DECISION_PROVIDER=random` until engine issue is resolved.
5. After engine fix, revert `DECISION_PROVIDER=uci` and restart.

### Incident: move latency budget warnings

**Symptoms:** `[warn] game <id>: move decision exceeded budget Nms (Mms)` repeatedly.

**Steps:**
1. Reduce `UCI_MOVE_TIME_MS` (e.g., from `100` to `50`).
2. Check system CPU load — Stockfish is CPU-bound.
3. If on a shared/low-core system, consider `UCI_MOVE_TIME_MS=30` as minimum.
4. Ensure `BOT_MOVE_BUDGET_MS > UCI_MOVE_TIME_MS` (add ~50ms margin for IPC overhead).

### Incident: game loop stalls (no moves submitted)

**Symptoms:** No `submitted move` log lines during an active game.

**Steps:**
1. Check if bot is receiving game state events — look for `gameFull` or `gameState` log handling.
2. Verify it is the bot's turn (color mismatch would silently skip).
3. Check `computeLegalMovesFromHistory` — an invalid FEN in move history returns empty list (logs warning).
4. If engine is stuck in a command lock, the circuit breaker will not rescue mid-game (it only acts on fallback source, not hangs). Investigate engine process.

### Incident: bot accepts too many or too few challenges

**Symptoms:** Unexpectedly high game volume or all challenges declined.

**Steps:**
1. Review `ACCEPT_RATED`, `MAX_CLOCK_SECONDS`, `ACTIVE_CHALLENGE_TARGET_GAMES`.
2. For passive-only mode (no outbound), set `ACTIVE_CHALLENGE_TARGET_GAMES=0`.
3. For rated games, set `ACCEPT_RATED=true`.
4. For specific time controls, set `MAX_CLOCK_SECONDS=180` (3 min max).

---

## Game Loop Continuity Verification (Smoke)

After any configuration change or rollback, run the following to confirm loop continuity:

1. Start bot with target config.
2. Confirm startup log: `provider=uci` (or `provider=baseline`).
3. Challenge the bot account from another account on Lichess.
4. Confirm `starting game loop for <gameId>` appears.
5. On bot's turn, confirm `submitted move <uci>` appears.
6. Confirm `source` in logs reflects intended provider (`uci`, `uci_fallback`, or `baseline`).
7. Let game complete; confirm `game <id> finished` log.

---

## Related Files

| File | Purpose |
|---|---|
| `src/bot/main.js` | Runtime bootstrap, env var parsing, policy wiring |
| `src/decision/uci_engine_policy.js` | UCI engine adapter (Stockfish) |
| `src/decision/engine_circuit_breaker.js` | Circuit breaker wrapping engine policy |
| `src/decision/random_legal_move_policy.js` | Baseline random fallback |
| `src/decision/baseline_policy.js` | Deterministic first-legal-move fallback |
| `src/bot/game_loop.js` | Per-game move submission loop |
| `scripts/bot/live_smoke.js` | Quick connectivity smoke test |
