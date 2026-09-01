import type { SourceName } from "@prisma/client";

import { env } from "../config/env.js";
import { parseCompanyCards } from "./html-company-parser.js";
import type { MonitorSource, SourcePullResult } from "../monitor/types.js";

export class YcSpeedrunSource implements MonitorSource {
  readonly source: SourceName = "YC_SPEEDRUN";

  async fetch(): Promise<SourcePullResult> {
    const response = await fetch(env.YC_SPEEDRUN_URL, {
      headers: {
        "user-agent": "yc-launch-monitor/0.1",
      },
    });

    if (!response.ok) {
      throw new Error(`YC Speedrun request failed with status ${response.status}`);
    }

    const html = await response.text();
    const companies = parseCompanyCards(html, "SPEEDRUN", env.YC_SPEEDRUN_URL);

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
