# Lichess Legal-Move Bot POC Runbook

## Scope
This POC connects to Lichess BOT API, listens for game starts, submits legal moves from event-provided legal move lists, and exits game loops on terminal outcomes.

Current constraints:
- Single-process, single active game loop behavior.
- Move quality is out of scope; baseline policy picks any legal move.
- If Lichess game-state events do not include `legalMoves`, the bot waits and logs warning.

## Prerequisites
- Node.js 20+ (native `fetch` required).
- A Lichess BOT account and API token with bot scope.

## Environment Variables
- `LICHESS_BOT_TOKEN` (required): BOT API token.
- `LICHESS_BASE_URL` (optional): defaults to `https://lichess.org`.
- `BOT_MOVE_BUDGET_MS` (optional): move-decision latency budget; default `200`.

## Run
```bash
node src/bot/main.js
```

## Fast Live Smoke (credential-ready check)
```bash
node scripts/bot/live_smoke.js
```

This confirms authentication and event-stream connectivity by waiting for a `gameStart` event. If no event appears, challenge the bot account and rerun.

## Smoke Validation
1. Start the process with a valid token.
2. Confirm log line showing `starting game loop for <gameId> as <color>`.
3. On bot turn, confirm `submitted move <uci>` is printed.
4. End game by mate/resign/timeout and confirm `game <id> finished: <result> (<status>)`.
5. Confirm process remains healthy and can handle next gameStart event.

## Operational Notes
- This POC favors latency and protocol correctness over playing strength.
- Decision logic is isolated in `src/decision/random_legal_move_policy.js` and can be replaced without changing stream transport code.
- Terminal normalization logic is isolated in `src/bot/terminal.js`.
