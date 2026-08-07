import { NextResponse } from "next/server";
import { getDemoServerTables } from "@/lib/demo-server-store";

export async function GET() {
  return NextResponse.json(getDemoServerTables(), {
    headers: { "cache-control": "no-store" },
  });
}
