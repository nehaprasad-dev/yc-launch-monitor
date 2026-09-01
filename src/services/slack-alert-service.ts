import type { AlertType } from "@prisma/client";

import { env } from "../config/env.js";
import type { AlertDraft } from "../monitor/types.js";

function titleForAlert(type: AlertType): string {
  switch (type) {
    case "EARLY_YC_SIGNAL":
      return "EARLY YC SIGNAL";
    case "YC_CONFIRMED":
      return "YC CONFIRMED";
    case "NEW_SPEEDRUN_COMPANY":
      return "NEW SPEEDRUN COMPANY";
    case "NEW_YC_COMPANY":
    default:
      return "NEW YC COMPANY";
  }
}

function statusLines(alert: AlertDraft): string[] {
  if (alert.alertType === "EARLY_YC_SIGNAL") {
    return ["Founder announced", "Not yet officially listed by YC"];
  }

  if (alert.alertType === "YC_CONFIRMED") {
    return ["Founder announced earlier", "Now officially listed by YC"];
  }

  return ["Officially listed by source of truth"];
}

export class SlackAlertService {
  async sendAlert(alert: AlertDraft): Promise<{ messageId?: string; delivered: boolean }> {
    if (!env.SLACK_BOT_TOKEN || !env.SLACK_CHANNEL_ID) {
      return { delivered: false };
    }

    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        channel: env.SLACK_CHANNEL_ID,
        text: `${titleForAlert(alert.alertType)}: ${alert.company.name}`,
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: titleForAlert(alert.alertType),
            },
          },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*Company*\n${alert.company.name}` },
              { type: "mrkdwn", text: `*Batch*\n${alert.company.batch ?? "Unknown"}` },
              { type: "mrkdwn", text: `*Program*\n${alert.company.program}` },
              { type: "mrkdwn", text: `*Source*\n${alert.platform}` },
              { type: "mrkdwn", text: `*Founder*\n${alert.founder?.name ?? "Unknown"}` },
              { type: "mrkdwn", text: `*Confidence*\n${Math.round(alert.confidence * 100)}%` },
            ],
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Announcement*\n>${alert.text.replace(/\n/g, "\n>")}`,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Status*\n${statusLines(alert).map((line) => `• ${line}`).join("\n")}`,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Evidence*\n${alert.evidence.map((line) => `• ${line}`).join("\n")}`,
            },
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: { type: "plain_text", text: "View post" },
                url: alert.url,
              },
              ...(alert.company.ycUrl
                ? [
                    {
                      type: "button" as const,
                      text: { type: "plain_text" as const, text: "YC profile" },
                      url: alert.company.ycUrl,
                    },
                  ]
                : []),
              ...(alert.company.domain
                ? [
                    {
                      type: "button" as const,
                      text: { type: "plain_text" as const, text: "Company" },
                      url: `https://${alert.company.domain}`,
                    },
                  ]
                : []),
            ],
          },
        ],
      }),
    });

    const body = (await response.json()) as { ok: boolean; ts?: string; error?: string };

    if (!response.ok || !body.ok) {
      if (body.error === "not_in_channel") {
        throw new Error("Slack alert failed: bot is not in the target channel. Invite the Slack app to the channel and retry.");
      }

      throw new Error(`Slack alert failed: ${body.error ?? response.status}`);
    }

    return {
      delivered: true,
      messageId: body.ts,
    };
  }
}
