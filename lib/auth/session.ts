import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

const COOKIE = "nimbty_session";
const TTL_S = 30 * 24 * 3600; // 30 days

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET missing — set it in .env (see .env.example)");
  return s;
}

const b64u = (b: Buffer) => b.toString("base64url");

function mac(body: string): Buffer {
  return createHmac("sha256", secret()).update(body).digest();
}

export function createSessionToken(userId: string, walletAddress: string): string {
  const payload = { uid: userId, addr: walletAddress, iat: Date.now(), exp: Date.now() + TTL_S * 1000 };
  const body = b64u(Buffer.from(JSON.stringify(payload)));
  return `${body}.${b64u(mac(body))}`;
}

export function verifySessionToken(token: string): { uid: string; addr: string } | null {
  const [body, tag] = token.split(".");
  if (!body || !tag) return null;
  const expected = mac(body);
  const actual = Buffer.from(tag, "base64url");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as { uid: string; addr: string; exp: number };
    if (!p.exp || p.exp < Date.now()) return null;
    return { uid: p.uid, addr: p.addr };
  } catch {
    return null;
  }
}

export type SessionUser = { id: string; walletAddress: string; displayName: string | null };

/** Read session in a route handler / server component. DB-backed: user must still exist. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const s = verifySessionToken(token);
  if (!s) return null;
  const user = await prisma.user.findUnique({
    where: { id: s.uid },
    select: { id: true, walletAddress: true, displayName: true },
  });
  return user;
}

export class AuthError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

export async function requireUser(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) throw new AuthError("WALLET_NOT_CONNECTED", "Connect your wallet first.");
  return u;
}

export async function setSessionCookie(token: string) {
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_S,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(COOKIE);
}
