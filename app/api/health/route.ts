import { NextResponse } from "next/server";
import { kvEnabled } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Diagnostyka: czy storage jest skonfigurowany (bez ujawniania sekretów). */
export async function GET() {
  const storage = kvEnabled();
  return NextResponse.json({
    storageOk: storage,
    message: storage
      ? "Redis/KV jest widoczny dla tego deployu."
      : "BRAK REDIS — dodaj REDIS_URL (lub KV_REST_*) w Vercelu i zaznacz Production + Preview, potem Redeploy.",
  });
}
