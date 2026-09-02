import type { SourceName } from "@prisma/client";

import { env } from "../config/env.js";
import { MonitorEngine } from "../monitor/run-monitor.js";

export class MonitorScheduler {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly engine: MonitorEngine) {}

  start(defaultSources: SourceName[]) {
    const intervalMs = env.POLL_INTERVAL_HOURS * 60 * 60 * 1000;

    this.timer = setInterval(() => {
      void this.safeRun(defaultSources, "scheduler").catch((error) => {
        console.error("Scheduled monitor run failed:", error instanceof Error ? error.message : error);
      });
    }, intervalMs);

    if (env.RUN_ON_BOOT) {
      void this.safeRun(defaultSources, "boot").catch((error) => {
        console.error("Boot monitor run failed:", error instanceof Error ? error.message : error);
      });
    }
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async runNow(sources: SourceName[], triggeredBy: string, dryRun = false) {
    return this.safeRun(sources, triggeredBy, dryRun);
  }

  isRunning() {
    return this.running;
  }

  private async safeRun(sources: SourceName[], triggeredBy: string, dryRun = false) {
    if (this.running) {
      throw new Error("Monitor run already in progress.");
    }

    this.running = true;

    try {
      return await this.engine.run({
        sources,
        dryRun,
        triggeredBy,
      });
    } finally {
      this.running = false;
    }
  }
}
