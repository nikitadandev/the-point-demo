import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const { admin } = await requireStaff(request);
    const { data, error } = await admin
      .from("tables")
      .select("table_number, token")
      .eq("active", true)
      .order("table_number");
    if (error) throw error;
    return NextResponse.json(
      (data ?? []).map((table) => ({
        number: table.table_number,
        token: table.token,
      })),
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Нет доступа" },
      { status: 401 },
    );
  }
}
