import express from "express";
import type { SourceName } from "@prisma/client";

import { env } from "../config/env.js";
import { prisma } from "../db.js";
import { MonitorEngine } from "../monitor/run-monitor.js";
import { MonitorRepository } from "../repositories/monitor-repository.js";
import { renderDashboard, renderSettingsPage, renderSignalsPage } from "../pages/render.js";
import { MonitorScheduler } from "../services/monitor-scheduler.js";

const defaultSources: SourceName[] = ["YC_DIRECTORY", "YC_SPEEDRUN", "X", "LINKEDIN"];
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

export function createApp() {
  const app = express();
  const repository = new MonitorRepository();
  const engine = new MonitorEngine();
  const scheduler = new MonitorScheduler(engine);

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

  app.get("/", async (_request, response) => {
    const [latestRun, counts, sourceHealth, signals] = await Promise.all([
      repository.latestMonitorRun(),
      repository.getDashboardCounts(),
      repository.listSourceHealth(),
      repository.listRecentSignals(6),
    ]);

    response.type("html").send(
      renderDashboard({
        latestRunLabel: formatRelativeTime(latestRun?.completedAt),
        nextRunLabel: `in ${env.POLL_INTERVAL_HOURS} hours`,
        counts,
        sourceHealth,
        signals,
        schedulerRunning: scheduler.isRunning(),
      }),
    );
  });

  app.get("/signals", async (_request, response) => {
    const signals = await repository.listRecentSignals(50);
    response.type("html").send(renderSignalsPage(signals));
  });

  app.get("/settings", (_request, response) => {
    response.type("html").send(
      renderSettingsPage({
        APP_BASE_URL: env.APP_BASE_URL,
        POLL_INTERVAL_HOURS: String(env.POLL_INTERVAL_HOURS),
        EARLY_SIGNAL_CONFIDENCE_THRESHOLD: String(env.EARLY_SIGNAL_CONFIDENCE_THRESHOLD),
        ENABLED_SOURCES: defaultSources.join(", "),
        DEMO_MODE: String(env.ENABLE_DEMO_MODE),
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

  scheduler.start(defaultSources);

  const shutdown = async () => {
    scheduler.stop();
    await prisma.$disconnect();
  };

  process.on("SIGINT", () => void shutdown().finally(() => process.exit(0)));
  process.on("SIGTERM", () => void shutdown().finally(() => process.exit(0)));

  return app;
}
