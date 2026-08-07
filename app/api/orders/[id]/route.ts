import { NextResponse } from "next/server";
import {
  mapOrder,
  orderSelect,
  type RawOrder,
} from "@/lib/supabase/repository";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const visitorToken = new URL(request.url).searchParams.get("visitorToken");
  if (!visitorToken || visitorToken.length > 160) {
    return NextResponse.json({ error: "Нет доступа к заказу" }, { status: 403 });
  }
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }
  const { id } = await params;
  const { data, error } = await admin
    .from("orders")
    .select(orderSelect)
    .eq("id", id)
    .eq("visitor_token", visitorToken)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "Не удалось проверить заказ" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  }
  return NextResponse.json(mapOrder(data as unknown as RawOrder));
}

