process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/nimbty";
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const jobs = await prisma.settlementJob.findMany({ orderBy: { updatedAt: "desc" }, take: 8 });
  for (const j of jobs) console.log(j.kind, j.status, "att:", j.attempts, (j.lastError || "").slice(0, 110));
  const pays = await prisma.payment.findMany({ orderBy: { createdAt: "desc" }, take: 6 });
  for (const p of pays) console.log(p.kind, p.status, p.amount.toString(), (p.transactionHash || "").slice(0, 20));
  await prisma.$disconnect();
})();
