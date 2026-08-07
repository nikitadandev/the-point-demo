import { NextResponse } from "next/server";
import { computeAnalytics, type AnalyticsPeriod } from "@/lib/analytics";
import { getDemoServerSessions } from "@/lib/demo-server-store";

export async function GET(request: Request) {
  const raw = Number(new URL(request.url).searchParams.get("period") ?? 7);
  const period: AnalyticsPeriod = raw === 1 || raw === 30 ? raw : 7;
  return NextResponse.json(computeAnalytics(getDemoServerSessions(), period), {
    headers: { "cache-control": "no-store" },
  });
}
