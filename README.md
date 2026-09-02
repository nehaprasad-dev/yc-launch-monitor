# YC Launch Monitor

YC Launch Monitor is a persistent monitoring agent that detects new YC and Speedrun companies and identifies founder-announced YC acceptance signals before official YC confirmation. It monitors source adapters, maintains persistent state to prevent duplicate alerts, classifies social signals, and delivers structured alerts to Slack.

## What it does

- Polls YC Directory as the source of truth for officially listed YC companies.
- Polls YC Speedrun separately so Speedrun launches do not get merged into standard YC alerts.
- Polls social sources through source adapters and classifies founder posts into deterministic signal outcomes.
- Stores companies, founders, signals, source cursors, alerts, and monitor run history in Postgres.
- Sends clean Slack alerts with confidence and evidence.
- Exposes service endpoints for health, status, manual runs, and Pond-compatible agent execution.

## Core flow

```text
Scheduler
  -> Monitor Engine
     -> Source adapters
        -> YC Directory
        -> YC Speedrun
        -> X
        -> LinkedIn
        -> Demo fixture
     -> Normalization
     -> Deduplication
     -> Signal detection
     -> Slack alerts
     -> Postgres
```

The most important state transition is:

```text
Founder announces YC acceptance
  + not officially listed by YC
  -> EARLY_YC signal
  -> EARLY YC SIGNAL Slack alert

Founder announced earlier
  + YC later lists the company
  -> OFFICIAL_YC signal
  -> YC CONFIRMED Slack alert
```

This prevents the monitor from sending a second generic "new company" alert after an early founder announcement has already fired.

## Stack

- TypeScript + Node.js
- Express
- PostgreSQL
- Prisma ORM
- OpenAI-compatible classifier path with a deterministic heuristic fallback
- Slack Web API
- HTML adapters for YC sources

## Routes

- `GET /` live monitor dashboard
- `GET /signals` signal timeline
- `GET /settings` runtime settings summary
- `GET /health` machine-readable health
- `GET /status` machine-readable service status
- `GET /ready` production readiness checks and blockers
- `POST /run-now` manual monitor execution
- `POST /reset-demo` clear demo companies/signals and replay the demo pipeline
- `GET /manifest` Pond manifest
- `POST /runs` Pond execution endpoint
- `GET /tasks/:taskId` Pond task lookup

## Production readiness

Before calling this production-complete, verify:

1. Postgres is connected and schema is pushed.
2. Slack delivery works by one of these:
   - invite the bot into the target channel: `/invite @Alert Bot`
   - or set `SLACK_WEBHOOK_URL` to an Incoming Webhook for that channel
3. Groq is configured with `LLM_PROVIDER=groq` and `GROQ_API_KEY`.
4. YC Directory and Speedrun sources are healthy.
5. Demo replay works end to end:
   ```bash
   curl -X POST http://localhost:3000/reset-demo
   curl -X POST http://localhost:3000/run-now \
     -H "content-type: application/json" \
     -d '{"sources":["DEMO"],"dry_run":false}'
   ```
6. Live X search requires active X API credits. A `402 credits depleted` response means the adapter is healthy in code but your X account needs billing top-up at [console.x.com](https://console.x.com).
7. LinkedIn stays disabled unless you have approved access.

Check readiness:

```bash
curl http://localhost:3000/ready
```

## Project structure

```text
src/
  adapters/      source-specific collection logic
  config/        environment parsing
  monitor/       detection and orchestration
  pages/         simple HTML rendering
  repositories/  Prisma persistence layer
  server/        Express app
  services/      classifier, Slack, scheduler
tests/           focused decision logic tests
prisma/          schema
```

## Environment

Copy `.env.example` to `.env` and fill in the real credentials you want to enable:

- `DATABASE_URL`
- `X_BEARER_TOKEN`
- `LINKEDIN_ACCESS_TOKEN` and `LINKEDIN_POSTS_ENDPOINT`
- `SLACK_BOT_TOKEN`
- `SLACK_CHANNEL_ID`
- `OPENAI_API_KEY`
- `POND_BEARER_TOKEN`

Important notes:

- The LinkedIn adapter is intentionally explicit about access. It only runs when a permitted endpoint and token are configured.
- Prefer Groq with `LLM_PROVIDER=groq` and `GROQ_API_KEY`. If no LLM key is set and provider is `auto`/`heuristic`, the monitor falls back to deterministic heuristics.
- Demo mode is enabled by default to make the early-signal flow easy to show without waiting for a live founder post.
- Slack can use either bot posting (`SLACK_BOT_TOKEN` + `SLACK_CHANNEL_ID`) or `SLACK_WEBHOOK_URL`.
- Live X search requires active X API credits. A `402` response means top up billing at console.x.com.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Generate Prisma client:

   ```bash
   npm run prisma:generate
   ```

3. Push the schema to Postgres:

   ```bash
   npm run prisma:push
   ```

4. Start the monitor:

   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000)

## Running the monitor

Manual run:

```bash
curl -X POST http://localhost:3000/run-now \
  -H "content-type: application/json" \
  -d '{"sources":["YC_DIRECTORY","YC_SPEEDRUN","X","LINKEDIN","DEMO"],"dry_run":false}'
```

Pond run:

```bash
curl -X POST http://localhost:3000/runs \
  -H "authorization: Bearer <POND_BEARER_TOKEN>" \
  -H "content-type: application/json" \
  -d '{"run_id":"demo-run-1","sources":["YC_DIRECTORY","X","DEMO"],"dry_run":true}'
```

The `run_id` is treated idempotently. If Pond retries the same request, the stored result is returned instead of starting a duplicate run.

## Testing

The test suite focuses on the interesting business logic:

- early signal detection
- official confirmation transition
- non-founder chatter rejection
- low-confidence rejection
- company matching by stable identifiers

Run checks:

```bash
npm run check
```

## Known limitations

- The YC adapters use resilient HTML parsing because the public directory is the available source of truth in this project. If YC changes markup, selectors may need updates.
- The LinkedIn adapter is a legal-access wrapper, not a fake universal scraper.
- The current Pond execution path completes synchronously and persists a task record for status lookup. If you want true long-running async execution later, the monitor engine can be moved behind a background queue without changing the core domain logic.
- X recent search is paid. If your X account has no credits, leave `ENABLE_X_SOURCE=false` and use the free social inbox instead.

### Free early signals (no X credits)

Post founder announcements into the local inbox:

```bash
curl -X POST http://localhost:3000/social-inbox \
  -H "content-type: application/json" \
  -d '{"authorName":"Priya Shah","authorHandle":"@priyashah","text":"We got into YC S26! Orbit Ledger is joining Y Combinator."}'

curl -X POST http://localhost:3000/run-now \
  -H "content-type: application/json" \
  -d '{"sources":["SOCIAL_INBOX"],"dry_run":false}'
```

You can also edit `data/social-inbox.json`. Optional paid X: set `ENABLE_X_SOURCE=true` with a funded `X_BEARER_TOKEN`.

## Production checklist

1. Invite the Slack bot into the channel:
   ```text
   /invite @Alert Bot
   ```
   Or create an Incoming Webhook and set `SLACK_WEBHOOK_URL`.
2. Confirm readiness:
   ```bash
   curl http://localhost:3000/ready
   ```
3. Reset and replay the demo path:
   ```bash
   curl -X POST http://localhost:3000/reset-demo
   curl -X POST http://localhost:3000/run-now \
     -H "content-type: application/json" \
     -d '{"sources":["DEMO"],"dry_run":false}'
   ```
4. Confirm dashboard shows `Acme AI` and Slack receives the early-signal alert.
5. For live X, top up API credits, set `ENABLE_X_SOURCE=true`, then run with `"sources":["X"]`.

## Demo path

With demo mode enabled, a fixture founder post flows through the exact same production pipeline:

1. demo social post appears
2. classifier extracts company, batch, and confidence
3. deterministic logic checks YC confirmation state
4. early alert or confirmation alert is persisted
5. Slack payload is produced

This makes it easy to demonstrate the differentiator: early signal detection before official YC listing.
