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
- `POST /run-now` manual monitor execution
- `GET /manifest` Pond manifest
- `POST /runs` Pond execution endpoint
- `GET /tasks/:taskId` Pond task lookup

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
- If `OPENAI_API_KEY` is not configured, the monitor uses a heuristic classifier so the pipeline still works in development and demo mode.
- Demo mode is enabled by default to make the early-signal flow easy to show without waiting for a live founder post.

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

## Demo path

With demo mode enabled, a fixture founder post flows through the exact same production pipeline:

1. demo social post appears
2. classifier extracts company, batch, and confidence
3. deterministic logic checks YC confirmation state
4. early alert or confirmation alert is persisted
5. Slack payload is produced

This makes it easy to demonstrate the differentiator: early signal detection before official YC listing.
