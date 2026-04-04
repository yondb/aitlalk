import { createClient as createKvClient } from "@vercel/kv";
import type { VercelKV } from "@vercel/kv";
import { createClient as createRedisClient } from "redis";
import type { Side } from "./types";

export type PrefetchPayload = {
  turnIndex: number;
  speaker: Side;
  text: string;
  /** Pełny MP3 z ElevenLabs (base64) — nie wysyłamy do UI dopóki tura nie wystartuje. */
  audioBase64: string;
};

const prefKey = (id: string) => `aiarena:prefetch:${id}`;
const mem = new Map<string, PrefetchPayload>();

function getRedisRestConfig(): { url: string; token: string } | null {
  const url =
    process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

let kvRestClient: VercelKV | null = null;
function getKvRest(): VercelKV | null {
  const cfg = getRedisRestConfig();
  if (!cfg) return null;
  if (!kvRestClient) kvRestClient = createKvClient({ url: cfg.url, token: cfg.token });
  return kvRestClient;
}

function getGlobalRedis() {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return Promise.reject(new Error("REDIS_URL missing"));
  const g = globalThis as typeof globalThis & {
    __aiarenaRedis?: Promise<ReturnType<typeof createRedisClient>>;
  };
  if (!g.__aiarenaRedis) {
    const client = createRedisClient({ url });
    client.on("error", (err) => console.error("[redis]", err));
    g.__aiarenaRedis = client.connect().then(() => client);
  }
  return g.__aiarenaRedis;
}

export async function getPrefetch(roomId: string): Promise<PrefetchPayload | null> {
  const rest = getKvRest();
  if (rest) {
    const v = await rest.get<PrefetchPayload>(prefKey(roomId));
    return v ?? null;
  }
  if (process.env.REDIS_URL?.trim()) {
    try {
      const client = await getGlobalRedis();
      const raw = await client.get(prefKey(roomId));
      if (!raw) return null;
      return JSON.parse(raw) as PrefetchPayload;
    } catch (e) {
      console.error("[prefetch-store] redis get", e);
      return null;
    }
  }
  return mem.get(roomId) ?? null;
}

export async function setPrefetch(
  roomId: string,
  payload: PrefetchPayload
): Promise<void> {
  const rest = getKvRest();
  if (rest) {
    await rest.set(prefKey(roomId), payload);
    return;
  }
  if (process.env.REDIS_URL?.trim()) {
    const client = await getGlobalRedis();
    await client.set(prefKey(roomId), JSON.stringify(payload));
    return;
  }
  mem.set(roomId, payload);
}

export async function clearPrefetch(roomId: string): Promise<void> {
  const rest = getKvRest();
  if (rest) {
    await rest.del(prefKey(roomId));
    return;
  }
  if (process.env.REDIS_URL?.trim()) {
    try {
      const client = await getGlobalRedis();
      await client.del(prefKey(roomId));
    } catch (e) {
      console.error("[prefetch-store] redis del", e);
    }
    return;
  }
  mem.delete(roomId);
}
