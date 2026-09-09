process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/nimbTy";
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const jobs = await prisma.settlementJob.findMany({ where: { kind: "PAYOUT", status: { in: ["QUEUED", "PROCESSING"] } } });
  for (const j of jobs) {
    const pay = await prisma.payment.findUnique({ where: { id: j.payload.paymentId } });
    const bounty = pay ? await prisma.bounty.findUnique({ where: { id: pay.bountyId } }) : null;
    const harness = !bounty || bounty.fundingTxHash === "harness-tx" || !bounty.fundingTxHash;
    console.log(j.id.slice(0, 8), "bounty:", bounty?.publicId, "funding:", (bounty?.fundingTxHash || "none").slice(0, 20), harness ? "-> VOID" : "-> KEEP");
    if (harness) await prisma.settlementJob.update({ where: { id: j.id }, data: { status: "FAILED_PERMANENT", lastError: "voided: pre-testnet dev data, funding never proven on-chain" } });
  }
  await prisma.$disconnect();
})();
