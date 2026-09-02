import { prisma } from "../src/db.js";

async function main() {
  const demoSignals = await prisma.signal.findMany({
    where: {
      OR: [{ externalId: { startsWith: "demo-post-" } }, { company: { name: { in: ["We", "Acme AI"] } } }],
    },
    select: { id: true },
  });

  const signalIds = demoSignals.map((signal) => signal.id);

  const deletedAlerts =
    signalIds.length > 0
      ? await prisma.alert.deleteMany({
          where: { signalId: { in: signalIds } },
        })
      : { count: 0 };

  const deletedSignals = await prisma.signal.deleteMany({
    where: {
      OR: [{ id: { in: signalIds } }, { externalId: { startsWith: "demo-post-" } }],
    },
  });

  const deletedCompanies = await prisma.company.deleteMany({
    where: { name: { in: ["We", "Acme AI"] } },
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
        resetDemoCursor: true,
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
