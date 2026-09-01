import { MonitorEngine } from "../src/monitor/run-monitor.ts";

async function main() {
  const engine = new MonitorEngine();
  const result = await engine.run({
    sources: ["DEMO"],
    dryRun: false,
    triggeredBy: "groq-test",
  });

  console.log(
    JSON.stringify(
      {
        newSignals: result.newSignals,
        alertsSent: result.alertsSent,
        errors: result.errors,
        alerts: result.alertDrafts.map((alert) => ({
          alertType: alert.alertType,
          companyName: alert.company.name,
          confidence: alert.confidence,
          evidence: alert.evidence,
        })),
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
