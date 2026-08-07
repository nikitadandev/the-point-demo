import { NextResponse } from "next/server";
import { getDemoServerSessions } from "@/lib/demo-server-store";

export async function GET() {
  return NextResponse.json(getDemoServerSessions(), {
    headers: { "cache-control": "no-store" },
  });
}
