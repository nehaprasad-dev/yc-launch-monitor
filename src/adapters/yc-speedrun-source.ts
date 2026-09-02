import type { SourceName } from "@prisma/client";

import { fetchPublicCompanies } from "./yc-public-index.js";
import type { MonitorSource, SourcePullResult } from "../monitor/types.js";

export class YcSpeedrunSource implements MonitorSource {
  readonly source: SourceName = "YC_SPEEDRUN";

  async fetch(): Promise<SourcePullResult> {
    const companies = await fetchPublicCompanies({
      program: "SPEEDRUN",
      tag: "YC Speedrun",
    });

    return {
      source: this.source,
      companies,
      observedAt: new Date(),
      health: "healthy",
      metadata: {
        discoveredCompanies: companies.length,
      },
    };
  }
}
