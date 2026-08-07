import { NextResponse } from "next/server";
import { getDemoServerMenu } from "@/lib/demo-server-store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tableToken: string }> },
) {
  const { tableToken } = await params;
  const menu = getDemoServerMenu(tableToken);
  return menu
    ? NextResponse.json(menu, { headers: { "cache-control": "no-store" } })
    : NextResponse.json({ error: "Стол не найден" }, { status: 404 });
}
