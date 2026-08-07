import { NextResponse } from "next/server";
import { loadStaffSessions } from "@/lib/supabase/repository";
import { requireStaff } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const { admin } = await requireStaff(request);
    const sessions = await loadStaffSessions(admin);
    return NextResponse.json(sessions, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Нет доступа" },
      { status: 401 },
    );
  }
}
