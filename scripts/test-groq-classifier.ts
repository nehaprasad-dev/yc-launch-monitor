import { createSignalClassifier } from "../src/services/signal-classifier.ts";

async function main() {
  const classifier = createSignalClassifier();
  const result = await classifier.classify({
    platform: "X",
    externalId: "test-1",
    authorName: "Jane Doe",
    authorHandle: "@janedoe",
    text: "We got into YC S26. Acme AI is joining YC to build autonomous accounting.",
    url: "https://x.com/janedoe/status/test-1",
    detectedAt: new Date(),
  });

  console.log(
    JSON.stringify(
      {
        provider: process.env.LLM_PROVIDER,
        model: process.env.GROQ_MODEL,
        isFounderAnnouncement: result.isFounderAnnouncement,
        companyName: result.companyName,
        batch: result.batch,
        program: result.program,
        confidence: result.confidence,
        evidence: result.evidence,
        reasoning: result.reasoning,
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
