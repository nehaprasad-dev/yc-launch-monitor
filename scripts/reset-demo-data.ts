import { prisma } from "../src/db.js";

async function main() {
  const signals = await prisma.signal.deleteMany({
    where: {
      OR: [{ externalId: "demo-post-1" }, { company: { name: "We" } }],
    },
  });
  const companies = await prisma.company.deleteMany({
    where: { name: "We" },
  });

  await prisma.sourceSnapshot.deleteMany({
    where: { source: "DEMO" },
  });

  console.log(
    JSON.stringify(
      {
        deletedSignals: signals.count,
        deletedCompanies: companies.count,
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
