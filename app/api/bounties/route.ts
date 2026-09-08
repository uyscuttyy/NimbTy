import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser, requireUser } from "@/lib/auth/session";
import { AuthError } from "@/lib/auth/session";
import { apiError, apiOk, generatePublicId, serializeBounty } from "@/lib/api/route-helpers";

const SORTS = ["newest", "ending", "reward"] as const;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const scope = url.searchParams.get("scope") ?? "open";
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
    const sort = (url.searchParams.get("sort") ?? "newest") as (typeof SORTS)[number];
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 1), 50);
    const cursor = url.searchParams.get("cursor") ?? undefined; // bounty id

    // Creator dashboard: scope=mine returns ALL my bounties, newest first.
    if (scope === "mine") {
      const me = await getSessionUser();
      if (!me) return apiError("WALLET_NOT_CONNECTED", "Connect your wallet first.", 401);
      const rows = await prisma.bounty.findMany({
        where: { creatorId: me.id, ...(cursor ? { id: { lt: cursor } } : {}) },
        orderBy: { createdAt: "desc" }, take: limit + 1,
        include: { creator: { select: { walletAddress: true, displayName: true } } },
      });
      const hasMore = rows.length > limit;
      return apiOk({ bounties: rows.slice(0, limit).map(serializeBounty), hasMore, nextCursor: hasMore ? rows[limit - 1].id : null });
    }

    const orderBy =
      sort === "ending" ? { deadlineAt: "asc" as const } :
      sort === "reward" ? { rewardAmount: "desc" as const } :
      { createdAt: "desc" as const };

    const where = {
      status: "OPEN" as const,
      ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" as const } }, { description: { contains: q, mode: "insensitive" as const } }] } : {}),
      ...(cursor ? { id: { lt: cursor } } : {}),
    };

    const rows = await prisma.bounty.findMany({
      where, orderBy, take: limit + 1,
      include: { creator: { select: { walletAddress: true, displayName: true } } },
    });
    const hasMore = rows.length > limit;
    return apiOk({ bounties: rows.slice(0, limit).map(serializeBounty), hasMore, nextCursor: hasMore ? rows[limit - 1].id : null });
  } catch (e) {
    console.error("bounties/list failed", e);
    return apiError("LIST_FAILED", "Could not load bounties.", 500);
  }
}

const MIN_REWARD_NIM = 0.01;
const MAX_REWARD_NIM = 1_000_000;

export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return apiError((e as AuthError).code ?? "WALLET_NOT_CONNECTED", "Connect your wallet first.", 401);
  }
  const body = (await req.json().catch(() => null)) as {
    title?: string; description?: string; rewardAmount?: string | number;
    currency?: string; deadlineAt?: string; reviewHours?: number;
  } | null;
  if (!body) return apiError("INVALID_BODY", "Malformed request.", 400);

  const title = (body.title ?? "").trim();
  const description = (body.description ?? "").trim();
  const currency = (body.currency ?? "NIM").toUpperCase();
  const reward = Number(body.rewardAmount);
  const deadlineAt = body.deadlineAt ? new Date(body.deadlineAt) : null;
  const reviewHours = body.reviewHours ?? 12;

  if (title.length < 4 || title.length > 120) return apiError("INVALID_TITLE", "What needs doing? Give a clear title (4–120 chars).", 400);
  if (description.length < 10 || description.length > 2000) return apiError("INVALID_DESCRIPTION", "Describe the task so a stranger can do it (10–2000 chars).", 400);
  if (currency !== "NIM") return apiError("UNSUPPORTED_RAIL", "Only NIM funding is connected in this MVP. USDT stays disabled rather than faked.", 400);
  if (!Number.isFinite(reward) || reward < MIN_REWARD_NIM || reward > MAX_REWARD_NIM)
    return apiError("INVALID_REWARD", `Reward must be ${MIN_REWARD_NIM}–${MAX_REWARD_NIM} NIM.`, 400);
  if (!deadlineAt || Number.isNaN(+deadlineAt) || deadlineAt.getTime() < Date.now() + 60 * 60 * 1000 || deadlineAt.getTime() > Date.now() + 30 * 24 * 3600 * 1000)
    return apiError("INVALID_DEADLINE", "Deadline must be 1 hour to 30 days from now.", 400);
  if (!Number.isInteger(reviewHours) || reviewHours < 1 || reviewHours > 72)
    return apiError("INVALID_REVIEW", "Review period must be 1–72 hours.", 400);

  try {
    let publicId = generatePublicId();
    for (let i = 0; i < 3; i++) {
      const exists = await prisma.bounty.findUnique({ where: { publicId } });
      if (!exists) break;
      publicId = generatePublicId();
    }
    const bounty = await prisma.$transaction(async (tx) => {
      const b = await tx.bounty.create({
        data: {
          publicId, creatorId: user.id, title, description,
          rewardAmount: reward.toString(), currency: "NIM",
          deadlineAt, reviewHours, status: "DRAFT",
        },
        include: { creator: { select: { walletAddress: true, displayName: true } } },
      });
      await tx.reputation.update({
        where: { userId: user.id },
        data: { bountiesPosted: { increment: 1 } },
      });
      return b;
    });
    return NextResponse.json({ ok: true, bounty: serializeBounty(bounty) }, { status: 201 });
  } catch (e) {
    console.error("bounties/create failed", e);
    return apiError("CREATE_FAILED", "Could not create the bounty.", 500);
  }
}
