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
  const channel = process.env.SLACK_CHANNEL_ID;

  if (!process.env.SLACK_BOT_TOKEN || !channel) {
    throw new Error("SLACK_BOT_TOKEN and SLACK_CHANNEL_ID are required");
  }

  const join = await slackCall("conversations.join", { channel });

  if (!join.ok && join.error !== "method_not_supported_for_channel_type" && join.error !== "already_in_channel") {
    console.log(JSON.stringify({ joined: false, joinError: join.error }, null, 2));
    return;
  }

  const message = await slackCall("chat.postMessage", {
    channel,
    text: "YC Launch Monitor Slack test: alerts are connected.",
  });

  console.log(
    JSON.stringify(
      {
        joined: join.ok || join.error === "already_in_channel",
        joinError: join.error,
        messageSent: message.ok,
        messageError: message.error,
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
