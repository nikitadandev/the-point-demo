import { NextResponse } from "next/server";
import {
  getDemoServerMenu,
  getDemoServerOpenSession,
} from "@/lib/demo-server-store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tableToken: string }> },
) {
  const { tableToken } = await params;
  if (!getDemoServerMenu(tableToken)) {
    return NextResponse.json({ error: "Стол не найден" }, { status: 404 });
  }
  const session = getDemoServerOpenSession(tableToken);
  return session
    ? NextResponse.json(session, { headers: { "cache-control": "no-store" } })
    : new NextResponse(null, { status: 204 });
}
