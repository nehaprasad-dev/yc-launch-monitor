import { prisma } from "../src/db.js";

const SEEDED_COMPANY_NAMES = ["We", "Acme AI", "Orbit Ledger"];

async function main() {
  const seededSignals = await prisma.signal.findMany({
    where: {
      OR: [
        { externalId: { startsWith: "demo-post-" } },
        { externalId: { startsWith: "inbox-seed-" } },
        { platform: "DEMO" },
        { company: { name: { in: SEEDED_COMPANY_NAMES } } },
      ],
    },
    select: { id: true },
  });

  const signalIds = seededSignals.map((signal) => signal.id);

  const deletedAlerts =
    signalIds.length > 0
      ? await prisma.alert.deleteMany({
          where: { signalId: { in: signalIds } },
        })
      : { count: 0 };

  const deletedSignals = await prisma.signal.deleteMany({
    where: {
      OR: [
        { id: { in: signalIds } },
        { externalId: { startsWith: "demo-post-" } },
        { externalId: { startsWith: "inbox-seed-" } },
        { platform: "DEMO" },
      ],
    },
  });

  const deletedCompanies = await prisma.company.deleteMany({
    where: { name: { in: SEEDED_COMPANY_NAMES } },
  });

  await prisma.sourceSnapshot.deleteMany({
    where: { source: "DEMO" },
  });

  console.log(
    JSON.stringify(
      {
        deletedAlerts: deletedAlerts.count,
        deletedSignals: deletedSignals.count,
        deletedCompanies: deletedCompanies.count,
        purgedSeeded: true,
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
