import { NextResponse } from "next/server";
import { computeAnalytics, type AnalyticsPeriod } from "@/lib/analytics";
import { loadStaffSessions } from "@/lib/supabase/repository";
import { requireStaff } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const { admin } = await requireStaff(request);
    const rawPeriod = Number(new URL(request.url).searchParams.get("period") ?? 7);
    const period: AnalyticsPeriod = rawPeriod === 1 || rawPeriod === 30 ? rawPeriod : 7;
    const sessions = await loadStaffSessions(admin);
    return NextResponse.json(computeAnalytics(sessions, period), {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Нет доступа" },
      { status: 401 },
    );
  }
}

