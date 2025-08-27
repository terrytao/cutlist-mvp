import { Redis } from "@upstash/redis";
export function getRedis() {
  const url = process.env.UPSTASH_REDIS_URL;
  const token = process.env.UPSTASH_REDIS_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}
