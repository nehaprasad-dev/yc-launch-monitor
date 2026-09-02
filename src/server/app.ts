import express from "express";
import type { SourceName } from "@prisma/client";

import { env } from "../config/env.js";
import { prisma } from "../db.js";
import { MonitorEngine } from "../monitor/run-monitor.js";
import { MonitorRepository } from "../repositories/monitor-repository.js";
import { renderDashboard, renderSettingsPage, renderSignalsPage } from "../pages/render.js";
import { MonitorScheduler } from "../services/monitor-scheduler.js";
import { appendInboxPost } from "../services/social-inbox-store.js";

const defaultSources: SourceName[] = ["YC_DIRECTORY", "YC_SPEEDRUN", "SOCIAL_INBOX"];
if (env.ENABLE_X_SOURCE && env.X_BEARER_TOKEN) {
  defaultSources.push("X");
}
if (env.LINKEDIN_ENABLED) {
  defaultSources.push("LINKEDIN");
}
if (env.ENABLE_DEMO_MODE) {
  defaultSources.push("DEMO");
}

function formatRelativeTime(value?: Date | null): string {
  if (!value) {
    return "Never";
  }

  const diffMs = Date.now() - value.getTime();
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));

  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
}

function requirePondAuth(request: express.Request, response: express.Response): boolean {
  if (!env.POND_BEARER_TOKEN) {
    return true;
  }

  const auth = request.header("authorization");

  if (auth !== `Bearer ${env.POND_BEARER_TOKEN}`) {
    response.status(401).json({ error: "Unauthorized" });
    return false;
  }

  return true;
}

export function createApp(options?: { startScheduler?: boolean }) {
  const app = express();
  const repository = new MonitorRepository();
  const engine = new MonitorEngine();
  const scheduler = new MonitorScheduler(engine);
  const startScheduler = options?.startScheduler ?? true;

  app.use(express.json());

  app.get("/health", async (_request, response) => {
    const sourceHealth = await repository.listSourceHealth();
    const latestRun = await repository.latestMonitorRun();

    response.json({
      ok: true,
      monitoring: scheduler.isRunning(),
      lastRun: latestRun?.completedAt ?? null,
      nextRunInHours: env.POLL_INTERVAL_HOURS,
      sourceHealth,
    });
  });

  app.get("/status", async (_request, response) => {
    const [latestRun, counts, sourceHealth] = await Promise.all([
      repository.latestMonitorRun(),
      repository.getDashboardCounts(),
      repository.listSourceHealth(),
    ]);

    response.json({
      app: "YC Launch Monitor",
      monitoring: scheduler.isRunning(),
      pollIntervalHours: env.POLL_INTERVAL_HOURS,
      latestRun,
      counts,
      sourceHealth,
      enabledSources: defaultSources,
    });
  });

  app.get("/ready", async (_request, response) => {
    const sourceHealth = await repository.listSourceHealth();
    const slackConfigured = Boolean(env.SLACK_WEBHOOK_URL || (env.SLACK_BOT_TOKEN && env.SLACK_CHANNEL_ID));
    const groqConfigured = Boolean(env.GROQ_API_KEY) || env.LLM_PROVIDER === "heuristic" || env.LLM_PROVIDER === "auto";
    const xHealth = sourceHealth.find((item) => item.source === "X");
    const blockers: string[] = [];
    const warnings: string[] = [];

    if (!slackConfigured) {
      blockers.push("Slack is not configured. Set SLACK_BOT_TOKEN + SLACK_CHANNEL_ID, or SLACK_WEBHOOK_URL.");
    }

    if (!env.GROQ_API_KEY && env.LLM_PROVIDER === "groq") {
      blockers.push("GROQ_API_KEY is required because LLM_PROVIDER=groq.");
    }

    if (xHealth?.status === "degraded" && xHealth.lastErrorReason) {
      warnings.push(xHealth.lastErrorReason);
    }

    if (!env.LINKEDIN_ENABLED) {
      warnings.push("LinkedIn is intentionally disabled until approved API access is configured.");
    }

    if (!env.ENABLE_X_SOURCE) {
      warnings.push("X is off (ENABLE_X_SOURCE=false). Use SOCIAL_INBOX or DEMO for free early signals.");
    }

    const ready = blockers.length === 0;

    response.status(ready ? 200 : 503).json({
      ready,
      blockers,
      warnings,
      checks: {
        database: true,
        slackConfigured,
        groqConfigured,
        demoMode: env.ENABLE_DEMO_MODE,
        linkedInEnabled: env.LINKEDIN_ENABLED,
        xStatus: xHealth?.status ?? "unknown",
      },
      slackNextStep: env.SLACK_WEBHOOK_URL
        ? "Webhook configured"
        : "Invite the bot in Slack with `/invite @Alert Bot`, then retry demo run",
    });
  });

  app.post("/reset-demo", async (_request, response, next) => {
    try {
      const demoSignals = await prisma.signal.findMany({
        where: {
          OR: [{ externalId: { startsWith: "demo-post-" } }, { company: { name: { in: ["We", "Acme AI"] } } }],
        },
        select: { id: true },
      });
      const signalIds = demoSignals.map((signal) => signal.id);

      if (signalIds.length > 0) {
        await prisma.alert.deleteMany({
          where: { signalId: { in: signalIds } },
        });
      }

      const signals = await prisma.signal.deleteMany({
        where: {
          OR: [{ id: { in: signalIds } }, { externalId: { startsWith: "demo-post-" } }],
        },
      });
      const companies = await prisma.company.deleteMany({
        where: { name: { in: ["We", "Acme AI"] } },
      });
      await prisma.sourceSnapshot.deleteMany({ where: { source: "DEMO" } });

      response.json({
        reset: true,
        deletedSignals: signals.count,
        deletedCompanies: companies.count,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/run-now", async (request, response, next) => {
    try {
      const requestedSources = Array.isArray(request.body?.sources) ? (request.body.sources as SourceName[]) : defaultSources;
      const dryRun = Boolean(request.body?.dry_run);
      const result = await scheduler.runNow(requestedSources, "manual", dryRun);
      response.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post("/social-inbox", async (request, response, next) => {
    try {
      const authorName = String(request.body?.authorName ?? "").trim();
      const text = String(request.body?.text ?? "").trim();

      if (!authorName || !text) {
        response.status(400).json({ error: "authorName and text are required" });
        return;
      }

      const post = await appendInboxPost({
        externalId: request.body?.externalId ? String(request.body.externalId) : undefined,
        authorName,
        authorHandle: request.body?.authorHandle ? String(request.body.authorHandle) : undefined,
        authorProfileUrl: request.body?.authorProfileUrl ? String(request.body.authorProfileUrl) : undefined,
        text,
        url: request.body?.url ? String(request.body.url) : undefined,
        detectedAt: request.body?.detectedAt ? String(request.body.detectedAt) : undefined,
      });

      response.status(201).json({ ok: true, post });
    } catch (error) {
      next(error);
    }
  });

  app.get("/", async (_request, response) => {
    const [latestRun, counts, officialCounts, sourceHealth, signals, companies] = await Promise.all([
      repository.latestMonitorRun(),
      repository.getDashboardCounts(),
      repository.getOfficialCompanyCounts(),
      repository.listSourceHealth(),
      repository.listRecentSignals(6),
      repository.listRecentOfficialCompanies(8),
    ]);

    response.type("html").send(
      renderDashboard({
        latestRunLabel: formatRelativeTime(latestRun?.completedAt),
        nextRunLabel: `in ${env.POLL_INTERVAL_HOURS} hours`,
        counts,
        officialCounts,
        sourceHealth,
        signals,
        companies,
        schedulerRunning: scheduler.isRunning(),
      }),
    );
  });

  app.get("/signals", async (_request, response) => {
    const [signals, companies] = await Promise.all([
      repository.listRecentFounderSignals(50),
      repository.listRecentOfficialCompanies(50),
    ]);
    response.type("html").send(renderSignalsPage(signals, companies));
  });

  app.get("/settings", async (_request, response) => {
    const sourceHealth = await repository.listSourceHealth();
    const xHealth = sourceHealth.find((item) => item.source === "X");

    response.type("html").send(
      renderSettingsPage({
        APP_BASE_URL: env.APP_BASE_URL,
        POLL_INTERVAL_HOURS: String(env.POLL_INTERVAL_HOURS),
        EARLY_SIGNAL_CONFIDENCE_THRESHOLD: String(env.EARLY_SIGNAL_CONFIDENCE_THRESHOLD),
        ENABLED_SOURCES: defaultSources.join(", "),
        DEMO_MODE: String(env.ENABLE_DEMO_MODE),
        SOCIAL_INBOX: "POST /social-inbox or edit data/social-inbox.json — free early signals, no X credits",
        SLACK_MODE: env.SLACK_WEBHOOK_URL ? "webhook" : env.SLACK_BOT_TOKEN ? "bot" : "disabled",
        ENABLE_X_SOURCE: String(env.ENABLE_X_SOURCE),
        X_STATUS: xHealth?.status ?? "disabled",
        X_ERROR: xHealth?.lastErrorReason ?? "none",
        LINKEDIN_ENABLED: String(env.LINKEDIN_ENABLED),
        LLM_PROVIDER: env.LLM_PROVIDER,
        PRODUCTION_NOTE:
          "Early signals: use SOCIAL_INBOX (free) or DEMO. Optional paid X: set ENABLE_X_SOURCE=true + X_BEARER_TOKEN with credits. Slack: invite bot or set webhook.",
      }),
    );
  });

  app.get("/manifest", (_request, response) => {
    response.json({
      name: "yc-launch-monitor",
      description:
        "Persistent monitoring agent that detects new YC and Speedrun companies and identifies founder-announced early YC signals before official confirmation.",
      version: "0.1.0",
      actions: [
        {
          name: "run_monitor",
          description: "Run the monitoring pipeline across the requested sources.",
          input_schema: {
            type: "object",
            properties: {
              sources: {
                type: "array",
                items: { type: "string", enum: defaultSources },
              },
              dry_run: { type: "boolean" },
              run_id: { type: "string" },
            },
          },
        },
      ],
      endpoints: {
        runs: `${env.APP_BASE_URL}/runs`,
        tasks: `${env.APP_BASE_URL}/tasks/{task_id}`,
      },
    });
  });

  app.post("/runs", async (request, response, next) => {
    try {
      if (!requirePondAuth(request, response)) {
        return;
      }

      const runId = String(request.body?.run_id ?? request.header("idempotency-key") ?? crypto.randomUUID());
      const existing = await repository.findPondRun(runId);

      if (existing?.responseBody) {
        response.json(existing.responseBody);
        return;
      }

      const taskId = existing?.taskId ?? crypto.randomUUID();
      await repository.upsertPondRun(runId, taskId, request.body ?? {});

      const requestedSources = Array.isArray(request.body?.sources) ? (request.body.sources as SourceName[]) : defaultSources;
      const dryRun = Boolean(request.body?.dry_run);
      const result = await scheduler.runNow(requestedSources, "pond", dryRun);
      const responseBody = {
        run_id: runId,
        task_id: taskId,
        status: "completed",
        result,
      };

      await repository.completePondRun(runId, "completed", responseBody);
      response.json(responseBody);
    } catch (error) {
      next(error);
    }
  });

  app.get("/tasks/:taskId", async (request, response) => {
    if (!requirePondAuth(request, response)) {
      return;
    }

    const task = await repository.findPondRunByTaskId(request.params.taskId);

    if (!task) {
      response.status(404).json({ error: "Task not found" });
      return;
    }

    response.json(
      task.responseBody ?? {
        run_id: task.runId,
        task_id: task.taskId,
        status: task.status,
      },
    );
  });

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    response.status(500).json({ error: message });
  });

  if (startScheduler) {
    scheduler.start(defaultSources);

    const shutdown = async () => {
      scheduler.stop();
      await prisma.$disconnect();
    };

    process.on("SIGINT", () => void shutdown().finally(() => process.exit(0)));
    process.on("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
  }

  return app;
}
