import { createClient as createKvClient } from "@vercel/kv";
import type { VercelKV } from "@vercel/kv";
import { createClient as createRedisClient } from "redis";
import type { RoomState } from "./types";

const mem = new Map<string, RoomState>();

const key = (id: string) => `aiarena:room:${id}`;

/**
 * REST (Upstash / starsze KV):
 * - KV_REST_API_URL + KV_REST_API_TOKEN
 * - UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 */
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
  if (!kvRestClient) {
    kvRestClient = createKvClient({ url: cfg.url, token: cfg.token });
  }
  return kvRestClient;
}

/** Łączenie po redis:// z panelu Vercel (REDIS_URL) — współdzielone w serverless */
function getGlobalRedis() {
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    return Promise.reject(new Error("REDIS_URL missing"));
  }
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

export function kvEnabled(): boolean {
  return Boolean(getRedisRestConfig() || process.env.REDIS_URL?.trim());
}

export async function getRoom(id: string): Promise<RoomState | null> {
  const rest = getKvRest();
  if (rest) {
    const v = await rest.get<RoomState>(key(id));
    return v ?? null;
  }

  if (process.env.REDIS_URL?.trim()) {
    try {
      const client = await getGlobalRedis();
      const raw = await client.get(key(id));
      if (!raw) return null;
      return JSON.parse(raw) as RoomState;
    } catch (e) {
      console.error("[store] redis get", e);
      return null;
    }
  }

  return mem.get(id) ?? null;
}

export async function saveRoom(state: RoomState): Promise<void> {
  const rest = getKvRest();
  if (rest) {
    await rest.set(key(state.id), state);
    return;
  }

  if (process.env.REDIS_URL?.trim()) {
    const client = await getGlobalRedis();
    await client.set(key(state.id), JSON.stringify(state));
    return;
  }

  mem.set(state.id, state);
}
