import { NextResponse } from "next/server";
import { loadMenuByTableToken } from "@/lib/supabase/repository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tableToken: string }> },
) {
  try {
    const { tableToken } = await params;
    if (tableToken.length < 8 || tableToken.length > 160) {
      return NextResponse.json({ error: "Некорректный QR-код" }, { status: 400 });
    }
    const menu = await loadMenuByTableToken(tableToken);
    if (!menu) {
      return NextResponse.json({ error: "Стол не найден" }, { status: 404 });
    }
    return NextResponse.json(menu, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    console.error("menu_load_failed", error);
    return NextResponse.json(
      { error: "Не удалось загрузить меню" },
      { status: 500 },
    );
  }
}

