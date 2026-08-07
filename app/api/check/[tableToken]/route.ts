import { NextResponse } from "next/server";
import { loadOpenSessionByTableToken } from "@/lib/supabase/repository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tableToken: string }> },
) {
  try {
    const { tableToken } = await params;
    if (tableToken.length < 8 || tableToken.length > 160) {
      return NextResponse.json({ error: "Некорректный QR-код" }, { status: 400 });
    }
    const session = await loadOpenSessionByTableToken(tableToken);
    return session
      ? NextResponse.json(session, {
          headers: { "cache-control": "private, no-store" },
        })
      : new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("check_load_failed", error);
    return NextResponse.json(
      { error: "Не удалось загрузить общий чек" },
      { status: 500 },
    );
  }
}

