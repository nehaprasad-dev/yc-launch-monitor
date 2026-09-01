import type { SourceName } from "@prisma/client";

import { env } from "../config/env.js";
import { parseCompanyCards } from "./html-company-parser.js";
import type { MonitorSource, SourcePullResult } from "../monitor/types.js";

export class YcDirectorySource implements MonitorSource {
  readonly source: SourceName = "YC_DIRECTORY";

  async fetch(): Promise<SourcePullResult> {
    const discovered = [];

    for (const batch of env.ycDirectoryBatches) {
      const url = new URL(env.YC_DIRECTORY_URL);
      url.searchParams.set("batch", batch);

      const response = await fetch(url, {
        headers: {
          "user-agent": "yc-launch-monitor/0.1",
        },
      });

      if (!response.ok) {
        throw new Error(`YC directory request failed with status ${response.status}`);
      }

      const html = await response.text();
      discovered.push(...parseCompanyCards(html, "YC", env.YC_DIRECTORY_URL, batch));
    }

    return {
      source: this.source,
      companies: discovered,
      observedAt: new Date(),
      health: "healthy",
      metadata: {
        batches: env.ycDirectoryBatches,
        discoveredCompanies: discovered.length,
      },
    };
  }
}
