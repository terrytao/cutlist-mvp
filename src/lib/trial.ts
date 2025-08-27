import crypto from "node:crypto";
import { getRedis } from "./redis";

const CAP = Number(process.env.TRIAL_CENTS_CAP ?? 20);          // default $0.20
const PERIOD_DAYS = Number(process.env.TRIAL_PERIOD_DAYS ?? 7); // default 7 days

export function clientIdFrom(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  const ua = req.headers.get("user-agent") || "";
  return crypto.createHash("sha256").update(ip + "|" + ua).digest("hex").slice(0, 24);
}

export async function getTrialStatus(req: Request) {
  const redis = getRedis();
  const id = clientIdFrom(req);
  let used = 0, ttl: number | null = null;
  if (redis) {
    used = Number((await redis.get<number>(`trial:${id}`)) ?? 0);
    ttl = await redis.ttl(`trial:${id}`);
  }
  return { clientId: id, usedCents: used, capCents: CAP, remainingCents: Math.max(0, CAP - used), ttlSec: ttl };
}

export async function consumeTrial(req: Request, costCents: number) {
  const redis = getRedis();
  const id = clientIdFrom(req);
  if (!redis) return { allowed: true, usedCents: 0, remainingCents: CAP };
  const key = `trial:${id}`;
  const used = Number((await redis.get<number>(key)) ?? 0);
  if (used + costCents > CAP) {
    return { allowed: false, usedCents: used, remainingCents: Math.max(0, CAP - used) };
  }
  const newUsed = used + costCents;
  await redis.set(key, newUsed, { ex: PERIOD_DAYS * 24 * 60 * 60 });
  return { allowed: true, usedCents: newUsed, remainingCents: CAP - newUsed };
}

/* ---------- Entitlement helpers (payment unlock) ---------- */
export async function hasEntitlement(req: Request) {
  const redis = getRedis();
  if (!redis) return false;
  const id = clientIdFrom(req);
  const v = await redis.get(`entitled:${id}`);
  return Boolean(v);
}

export async function grantEntitlementByClientId(clientId: string, days = 30) {
  const redis = getRedis();
  if (!redis) return;
  await redis.set(`entitled:${clientId}`, 1, { ex: days * 24 * 60 * 60 });
}
