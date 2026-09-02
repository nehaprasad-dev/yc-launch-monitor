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

function buildText(alert: AlertDraft): string {
  return [
    `${titleForAlert(alert.alertType)}: ${alert.company.name}`,
    `Batch: ${alert.company.batch ?? "Unknown"}`,
    `Program: ${alert.company.program}`,
    `Source: ${alert.platform}`,
    `Founder: ${alert.founder?.name ?? "Unknown"}`,
    `Confidence: ${Math.round(alert.confidence * 100)}%`,
    "",
    alert.text,
    "",
    `Status: ${statusLines(alert).join(" | ")}`,
    `Evidence: ${alert.evidence.join("; ")}`,
    `Post: ${alert.url}`,
  ].join("\n");
}

async function slackApi(method: string, body: Record<string, unknown>) {
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });

  return (await response.json()) as { ok: boolean; ts?: string; error?: string };
}

export class SlackAlertService {
  async sendAlert(alert: AlertDraft): Promise<{ messageId?: string; delivered: boolean }> {
    if (env.SLACK_WEBHOOK_URL) {
      const response = await fetch(env.SLACK_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          text: buildText(alert),
        }),
      });

      if (!response.ok) {
        throw new Error(`Slack webhook alert failed with status ${response.status}`);
      }

      return {
        delivered: true,
        messageId: `webhook:${Date.now()}`,
      };
    }

    if (!env.SLACK_BOT_TOKEN || !env.SLACK_CHANNEL_ID) {
      return { delivered: false };
    }

    const join = await slackApi("conversations.join", { channel: env.SLACK_CHANNEL_ID });

    if (
      !join.ok &&
      join.error !== "already_in_channel" &&
      join.error !== "method_not_supported_for_channel_type" &&
      join.error !== "missing_scope"
    ) {
      throw new Error(`Slack channel join failed: ${join.error}`);
    }

    const body = await slackApi("chat.postMessage", {
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
    });

    if (!body.ok) {
      if (body.error === "not_in_channel") {
        throw new Error(
          "Slack alert failed: bot is not in the target channel. In Slack type `/invite @Alert Bot` in that channel, or set SLACK_WEBHOOK_URL.",
        );
      }

      if (body.error === "missing_scope") {
        throw new Error(
          "Slack alert failed: bot token is missing required scopes. Add chat:write and channels:join, reinstall the app, then retry.",
        );
      }

      throw new Error(`Slack alert failed: ${body.error ?? "unknown_error"}`);
    }

    return {
      delivered: true,
      messageId: body.ts,
    };
  }
}
