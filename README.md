# YC Launch Monitor

YC Launch Monitor is a small monitoring app for one very specific job:

**catch founder-announced YC acceptance signals before the official YC directory catches up.**

It also tracks official YC Directory and YC Speedrun listings, stores everything in Postgres, and sends alerts to Slack.

This project is meant to show the transition between:

- a founder publicly saying "we got into YC"
- and YC later listing that company officially

That transition is the most important part of the product.

## What the product does

YC Launch Monitor watches a few sources, normalizes what it finds, and classifies each event into something useful.

In plain English:

- if a founder announces YC acceptance before YC lists the company, the app creates an **early signal**
- if YC later lists the same company, the app records that as an **official confirmation**
- it avoids spamming the user with duplicate generic alerts for the same company

It also keeps a simple web dashboard so you can quickly see:

- real YC companies pulled from free public sources
- founder signals
- source health
- recent runs

## Current sources

### Official listing sources

- **YC Directory**
- **YC Speedrun**

These are the public "source of truth" style inputs.

### Founder-signal sources

- **Social Inbox**: a free local inbox you can post to manually or via webhook
- **X**: optional, only if you have an API token and funded credits
- **Demo mode**: a fixture path for showing the product flow quickly

### Not enabled by default

- **LinkedIn** support is intentionally conservative and only makes sense with approved access

## Why this is interesting

Most startup directories tell you what is already official.

This project tries to answer a slightly earlier question:

**"Did a founder signal YC acceptance before the directory updated?"**

That is the differentiator.

## How it works

The app follows a simple pipeline:

```text
Sources -> normalization -> signal detection -> dedupe -> database -> Slack -> dashboard
```

The important state transition is:

```text
Founder announces YC acceptance
  + company not officially listed yet
  -> EARLY_YC signal
  -> Slack alert

Later, YC officially lists the company
  -> OFFICIAL_YC signal
  -> confirmation alert
```

## Stack

- TypeScript
- Node.js
- Express
- PostgreSQL
- Prisma
- Groq-compatible classification path with heuristic fallback
- Slack Web API

## Routes

### Dashboard routes

- `GET /` dashboard
- `GET /signals` official companies + founder signals
- `GET /settings` runtime config summary

### Health and status

- `GET /health`
- `GET /status`
- `GET /ready`

### Actions

- `POST /run-now`
- `POST /social-inbox`
- `POST /reset-demo`

### Pond-compatible endpoints

- `GET /manifest`
- `POST /runs`
- `GET /tasks/:taskId`

## Quick start

1. Install dependencies

```bash
npm install
```

2. Copy env file

```bash
cp .env.example .env
```

3. Push the Prisma schema

```bash
npm run prisma:push
```

4. Start the app

```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000)

## Environment variables

You do not need every integration enabled on day one.

The most important values are:

- `DATABASE_URL`
- `APP_BASE_URL`
- `SLACK_BOT_TOKEN` and `SLACK_CHANNEL_ID`
  or `SLACK_WEBHOOK_URL`
- `LLM_PROVIDER`
- `GROQ_API_KEY` if you use `groq`

Optional values:

- `ENABLE_X_SOURCE`
- `X_BEARER_TOKEN`
- `X_QUERIES`
- `LINKEDIN_ENABLED`
- `POND_BEARER_TOKEN`
- `ENABLE_DEMO_MODE`

## Running a manual monitor pass

Example:

```bash
curl -X POST http://localhost:3000/run-now \
  -H "content-type: application/json" \
  -d '{"sources":["YC_DIRECTORY","YC_SPEEDRUN","SOCIAL_INBOX"],"dry_run":false}'
```

## Free founder-signal path

If you do not want to pay for X API credits, use the free inbox.

You can either edit `data/social-inbox.json` or post directly to the app:

```bash
curl -X POST http://localhost:3000/social-inbox \
  -H "content-type: application/json" \
  -d '{"authorName":"Priya Shah","authorHandle":"@priyashah","text":"We got into YC S26! Orbit Ledger is joining Y Combinator."}'
```

Then run the monitor:

```bash
curl -X POST http://localhost:3000/run-now \
  -H "content-type: application/json" \
  -d '{"sources":["SOCIAL_INBOX"],"dry_run":false}'
```

## Demo flow

Demo mode exists so you can show the full product without waiting for a real founder post.

Replay the demo:

```bash
curl -X POST http://localhost:3000/reset-demo

curl -X POST http://localhost:3000/run-now \
  -H "content-type: application/json" \
  -d '{"sources":["DEMO"],"dry_run":false}'
```

That path should show the exact early-signal behavior in Slack and in the UI.

## Slack setup

You have two options:

1. use a Slack bot token + channel ID
2. use an Incoming Webhook

If you use the bot path, make sure the bot is actually in the target channel:

```text
/invite @Alert Bot
```

## Deploy notes

### Render

Render is a better fit for the **persistent monitor** version of this project because the scheduler can stay alive.

Use:

- Build Command: `npm install && npm run build`
- Start Command: `npm start`

### Vercel

Vercel works better for a **demo UI/API** version of the project, not for always-on background polling.

For Vercel:

- Framework Preset: `Other`
- Build Command: `npm run build`
- Output Directory: leave empty

## Useful commands

```bash
npm run dev
npm run build
npm run typecheck
npm run check
npm run prisma:push
npm run prisma:generate
```

## Project structure

```text
src/
  adapters/      source integrations
  config/        env parsing
  monitor/       orchestration and detection
  pages/         HTML rendering
  repositories/  database access
  server/        Express app
  services/      Slack, scheduler, classifier
api/             Vercel entrypoint
prisma/          schema
tests/           focused logic tests
```

## Known limitations

- X Premium alone is not enough for live X search; you need X API access and credits.
- X recent search is a paid dependency, so the free inbox is the safest no-cost fallback.
- LinkedIn is intentionally not a fake universal scraper.
- The UI is intentionally simple; the product value is in the signal transition logic.
- Vercel is not ideal for the always-on scheduler part.

## Status of the project

This project is best understood as:

- a real monitoring prototype
- with working Slack alerts, state, and source tracking
- and a strong early-signal product idea

It is not pretending to be a perfect production intelligence platform yet.

## If you are evaluating the idea

The key question is not:

**"Can this list YC companies?"**

The key question is:

**"Can this reliably surface meaningful founder-announced YC signals before official confirmation?"**

That is what this project is built to explore.
