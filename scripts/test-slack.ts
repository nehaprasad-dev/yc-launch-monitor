import "dotenv/config";

async function slackCall(method: string, body: Record<string, unknown>) {
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });

  return (await response.json()) as { ok: boolean; error?: string; ts?: string };
}

async function main() {
  if (process.env.SLACK_WEBHOOK_URL) {
    const response = await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ text: "YC Launch Monitor Slack webhook test: alerts are connected." }),
    });

    console.log(JSON.stringify({ mode: "webhook", messageSent: response.ok, status: response.status }, null, 2));
    return;
  }

  const channel = process.env.SLACK_CHANNEL_ID;

  if (!process.env.SLACK_BOT_TOKEN || !channel) {
    throw new Error("Set SLACK_WEBHOOK_URL, or SLACK_BOT_TOKEN + SLACK_CHANNEL_ID");
  }

  const join = await slackCall("conversations.join", { channel });
  const message = await slackCall("chat.postMessage", {
    channel,
    text: "YC Launch Monitor Slack test: alerts are connected.",
  });

  console.log(
    JSON.stringify(
      {
        mode: "bot",
        joined: join.ok || join.error === "already_in_channel",
        joinError: join.error,
        messageSent: message.ok,
        messageError: message.error,
        nextStep:
          message.error === "not_in_channel"
            ? "In Slack, open the channel and type: /invite @Alert Bot"
            : message.ok
              ? "Slack delivery is working"
              : "Check bot scopes and reinstall the Slack app",
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
