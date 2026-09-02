import type { SourceName } from "@prisma/client";

import { env } from "../config/env.js";
import { fetchPublicCompanies } from "./yc-public-index.js";
import type { MonitorSource, SourcePullResult } from "../monitor/types.js";

export class YcDirectorySource implements MonitorSource {
  readonly source: SourceName = "YC_DIRECTORY";

  async fetch(): Promise<SourcePullResult> {
    const discovered = [];

    for (const batch of env.ycDirectoryBatches) {
      discovered.push(
        ...(await fetchPublicCompanies({
          program: "YC",
          batch,
        })),
      );
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
