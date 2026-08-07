import { NextResponse } from "next/server";
import { orderDraftSchema } from "@/lib/order-domain";
import { broadcastRealtime, getSupabaseAdminClient } from "@/lib/supabase/server";
import {
  loadMenuByTableToken,
  loadOpenSessionByTableToken,
} from "@/lib/supabase/repository";
import { priceOrderFromCatalog } from "@/lib/order-domain";

export async function POST(request: Request) {
  try {
    const parsed = orderDraftSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Проверьте состав заказа", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const menu = await loadMenuByTableToken(parsed.data.tableToken);
    if (!menu) {
      return NextResponse.json({ error: "Стол не найден" }, { status: 404 });
    }

    priceOrderFromCatalog(parsed.data, menu.items);
    const admin = getSupabaseAdminClient();
    if (!admin) throw new Error("Supabase не настроен");
    const visitorToken = crypto.randomUUID();
    const { data, error } = await admin.rpc("create_order", {
      p_table_token: parsed.data.tableToken,
      p_idempotency_key: parsed.data.idempotencyKey,
      p_visitor_token: visitorToken,
      p_comment: parsed.data.comment,
      p_items: parsed.data.items,
    });
    if (error) throw error;
    const session = await loadOpenSessionByTableToken(parsed.data.tableToken);
    if (!session) throw new Error("Открытый чек не найден после создания заказа");
    await broadcastRealtime(`check:${session.id}`, "refresh", {
      sessionId: session.id,
      orderId: data.id,
    });
    return NextResponse.json({ order: data, session }, { status: 201 });
  } catch (error) {
    console.error("order_create_failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не удалось создать заказ",
      },
      { status: 422 },
    );
  }
}
