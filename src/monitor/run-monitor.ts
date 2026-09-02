import type { MonitorRunStatus, SourceName } from "@prisma/client";

import { env } from "../config/env.js";
import { DemoSource } from "../adapters/demo-source.js";
import { LinkedInSource } from "../adapters/linkedin-source.js";
import { SocialInboxSource } from "../adapters/social-inbox-source.js";
import { XSource } from "../adapters/x-source.js";
import { YcDirectorySource } from "../adapters/yc-directory-source.js";
import { YcSpeedrunSource } from "../adapters/yc-speedrun-source.js";
import { buildConfirmationAlert, buildOfficialCompanyAlert, detectSocialAlert } from "./detection.js";
import { MonitorRepository } from "../repositories/monitor-repository.js";
import { SlackAlertService } from "../services/slack-alert-service.js";
import { createSignalClassifier } from "../services/signal-classifier.js";
import type { AlertDraft, MonitorRunRequest, MonitorRunResult, MonitorSource } from "./types.js";

export class MonitorEngine {
  private readonly repository = new MonitorRepository();
  private readonly classifier = createSignalClassifier();
  private readonly slack = new SlackAlertService();
  private readonly sources = new Map<SourceName, MonitorSource>([
    ["YC_DIRECTORY", new YcDirectorySource()],
    ["YC_SPEEDRUN", new YcSpeedrunSource()],
    ["SOCIAL_INBOX", new SocialInboxSource()],
    ["X", new XSource()],
    ["LINKEDIN", new LinkedInSource()],
    ["DEMO", new DemoSource()],
  ]);

  async run(request: MonitorRunRequest): Promise<MonitorRunResult> {
    const startedAt = new Date();
    const alerts: AlertDraft[] = [];
    const errors: Array<{ source?: SourceName; message: string }> = [];

    for (const sourceName of request.sources) {
      const source = this.sources.get(sourceName);

      if (!source) {
        errors.push({ source: sourceName, message: "Source is not registered." });
        continue;
      }

      try {
        const snapshot = await this.repository.findSourceSnapshot(sourceName);
        const result = await source.fetch(snapshot?.cursor);

        await this.repository.upsertSourceSnapshot({
          source: sourceName,
          cursor: result.cursor,
          lastSeenAt: result.observedAt,
          healthy: result.health === "healthy",
          errorReason: result.errorReason,
          metadata: result.metadata,
        });

        if (result.health === "degraded" && result.errorReason) {
          errors.push({ source: sourceName, message: result.errorReason });
        }

        if (result.companies?.length) {
          for (const company of result.companies) {
            const existing = await this.repository.findCompanyByInput(company);
            const persisted = await this.repository.upsertCompany(company, true);

            if (!existing) {
              alerts.push(buildOfficialCompanyAlert({ ...company, ycUrl: company.ycUrl ?? persisted.ycUrl }, sourceName, result.observedAt));
              continue;
            }

            if (
              !existing.officialConfirmedAt &&
              company.program === "YC" &&
              !(await this.repository.hasAlertForCompany(company, "YC_CONFIRMED"))
            ) {
              alerts.push(
                buildConfirmationAlert(
                  {
                    ...company,
                    ycUrl: company.ycUrl ?? persisted.ycUrl,
                  },
                  sourceName,
                  result.observedAt,
                ),
              );
            }
          }
        }

        if (result.posts?.length) {
          for (const post of result.posts) {
            if (await this.repository.hasSignal(post.platform, post.externalId)) {
              continue;
            }

            const classification = await this.classifier.classify(post);
            const companyCandidate = classification.companyName
              ? {
                  name: classification.companyName,
                  domain: classification.companyDomain ?? null,
                  batch: classification.batch ?? null,
                  program: classification.program ?? "YC",
                }
              : null;
            const officialCompany = companyCandidate
              ? await this.repository.findMatchingOfficialCompany({
                  ...companyCandidate,
                  description: null,
                  officialConfirmedAt: undefined,
                })
              : null;
            const alert = detectSocialAlert(post, classification, {
              threshold: env.EARLY_SIGNAL_CONFIDENCE_THRESHOLD,
              alreadyConfirmedCompany: officialCompany,
            });

            if (!alert) {
              continue;
            }

            alerts.push(alert);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown source error";
        errors.push({ source: sourceName, message });

        await this.repository.upsertSourceSnapshot({
          source: sourceName,
          healthy: false,
          errorReason: message,
          lastSeenAt: new Date(),
        });
      }
    }

    let alertsSent = 0;
    let newSignals = 0;

    for (const alert of alerts) {
      if (await this.repository.hasSignal(alert.platform, alert.externalId)) {
        continue;
      }

      const company = await this.repository.upsertCompany(
        {
          ...alert.company,
          officialConfirmedAt: alert.signalType === "OFFICIAL_YC" || alert.signalType === "SPEEDRUN" ? new Date() : undefined,
        },
        alert.signalType === "OFFICIAL_YC" || alert.signalType === "SPEEDRUN",
      );
      const founder = alert.founder ? await this.repository.upsertFounder(alert.founder, company.id) : null;
      const signal = await this.repository.createSignalFromDraft(alert, company.id, founder?.id);
      newSignals += 1;

      if (!request.dryRun) {
        try {
          const delivery = await this.slack.sendAlert(alert);
          await this.repository.createAlert(signal.id, alert.alertType, delivery.messageId);
          if (delivery.delivered) {
            alertsSent += 1;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown Slack delivery error";
          errors.push({ message });
        }
      }
    }

    const completedAt = new Date();
    const status: MonitorRunStatus =
      errors.length === 0 ? "SUCCESS" : alerts.length > 0 || newSignals > 0 ? "PARTIAL_FAILURE" : "FAILURE";

    await this.repository.createMonitorRun({
      status,
      triggeredBy: request.triggeredBy,
      sources: request.sources,
      newSignals,
      alertsSent,
      errors,
      summary: {
        alerts: alerts.map((alert) => ({
          alertType: alert.alertType,
          companyName: alert.company.name,
          signalType: alert.signalType,
        })),
      },
      startedAt,
      completedAt,
    });

    return {
      startedAt,
      completedAt,
      newSignals,
      alertsSent,
      alertDrafts: alerts,
      errors,
    };
  }
}
