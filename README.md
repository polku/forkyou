# ForkYou Chess Bot

Lichess chess bot prototype focused on protocol correctness and reliable execution.

## What This Repository Contains
- Bot runtime loop and Lichess transport in `src/bot/`
- Baseline legal-move decision policy in `src/decision/`
- Contract and conformance artifacts for evaluator integration in `docs/contracts/v1/` and `tests/conformance/v1/`
- Operational runbooks in `docs/runbooks/`

## Prerequisites
- Node.js `>=22`
- npm `>=10`

## Quick Start
```bash
npm install
```

Set environment variables:

```bash
export LICHESS_BOT_TOKEN=lip_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# Optional:
# export LICHESS_BASE_URL=https://lichess.org
# export BOT_MOVE_BUDGET_MS=200
```

Run the bot:

```bash
npm start
```

## What Running The Bot Does
- Starts a long-lived event stream against the Lichess BOT API (`/api/stream/event`).
- Waits for `gameStart` events and then plays that game until it reaches a terminal outcome.
- After a game ends, returns to the event stream and keeps listening for the next game.
- Continues until you stop the process (`Ctrl+C`) or a fatal error occurs.

Current runtime behavior:
- Games are handled sequentially in a single process loop.
- Move selection uses the baseline random legal-move policy.
- The project prioritizes protocol correctness and reliability over playing strength.

## Test Commands
```bash
# All Node tests
npm test

# Contract conformance suite (TypeScript)
npm run test:conformance
```

## Key Environment Variables
- `LICHESS_BOT_TOKEN` (required): Lichess BOT API token.
- `LICHESS_BASE_URL` (optional): defaults to `https://lichess.org`.
- `BOT_MOVE_BUDGET_MS` (optional): move-decision latency budget in milliseconds. Default `200`.
- `ENGINE_URL` (optional): endpoint used by conformance tests when validating engine integration.

## Documentation Index
- Dev runbook: `docs/dev-runbook-bot-poc.md`
- Lichess legal-move POC runbook: `docs/runbooks/lichess-legal-move-bot-poc.md`
- Contract policy: `docs/contracts/v1/contract-core-v1.md`
- OpenAPI schema: `docs/contracts/v1/openapi.yaml`
- Conformance test guide: `tests/conformance/v1/README.md`

## Delivery Notes
- Current scope prioritizes transport reliability and legal-move correctness over playing strength.
- The baseline decision policy can be replaced without changing stream transport interfaces.
