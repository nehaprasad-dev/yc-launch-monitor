import { prisma } from "../src/db.js";

async function main() {
  const [signals, companies, snapshots, alerts] = await Promise.all([
    prisma.signal.findMany({
      where: {
        OR: [{ externalId: "demo-post-1" }, { text: { contains: "Acme AI" } }, { company: { name: { in: ["We", "Acme AI"] } } }],
      },
      include: { company: true, founder: true },
      orderBy: { detectedAt: "desc" },
    }),
    prisma.company.findMany({
      where: { name: { in: ["We", "Acme AI"] } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.sourceSnapshot.findMany({
      where: { source: { in: ["DEMO", "X"] } },
    }),
    prisma.alert.findMany({
      where: {
        signal: {
          OR: [{ externalId: "demo-post-1" }, { text: { contains: "Acme AI" } }, { company: { name: { in: ["We", "Acme AI"] } } }],
        },
      },
      include: { signal: { include: { company: true } } },
    }),
  ]);

  console.log(
    JSON.stringify(
      {
        signals: signals.map((signal) => ({
          id: signal.id,
          platform: signal.platform,
          externalId: signal.externalId,
          company: signal.company?.name,
          signalType: signal.signalType,
          confidence: signal.confidence,
        })),
        companies: companies.map((company) => ({
          id: company.id,
          name: company.name,
          officialConfirmedAt: company.officialConfirmedAt,
        })),
        snapshots,
        alerts: alerts.map((alert) => ({
          alertType: alert.alertType,
          company: alert.signal.company?.name,
          slackMessageId: alert.slackMessageId,
        })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
