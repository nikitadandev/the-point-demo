import { NextResponse } from "next/server";
import { z } from "zod";
import { assertStatusTransition } from "@/lib/order-domain";
import type { OrderStatus } from "@/lib/types";
import { broadcastRealtime, requireStaff } from "@/lib/supabase/server";

const updateSchema = z.union([
  z.object({ status: z.enum(["new", "accepted", "entered", "completed", "cancelled"]) }),
  z.object({ viewed: z.literal(true) }),
]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { admin } = await requireStaff(request);
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Некорректное действие" }, { status: 400 });
    }
    const { id } = await params;
    const { data: current, error: readError } = await admin
      .from("orders")
      .select("id, status, visitor_token, table_session_id")
      .eq("id", id)
      .single();
    if (readError || !current) {
      return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
    }

    if ("viewed" in parsed.data) {
      const { error } = await admin
        .from("orders")
        .update({ viewed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    assertStatusTransition(
      current.status as OrderStatus,
      parsed.data.status as OrderStatus,
    );
    const updatedAt = new Date().toISOString();
    const { data: updated, error } = await admin
      .from("orders")
      .update({ status: parsed.data.status, updated_at: updatedAt })
      .eq("id", id)
      .eq("status", current.status)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!updated) {
      return NextResponse.json(
        { error: "Статус уже изменён. Обновите список заказов" },
        { status: 409 },
      );
    }

    const { error: sessionError } = await admin
      .from("table_sessions")
      .update({ updated_at: updatedAt })
      .eq("id", current.table_session_id);
    if (sessionError) throw sessionError;

    await broadcastRealtime(`order:${current.visitor_token}`, "status", {
      status: parsed.data.status,
      updatedAt,
    });
    await broadcastRealtime(`check:${current.table_session_id}`, "refresh", {
      orderId: current.id,
      status: parsed.data.status,
      updatedAt,
    });
    return NextResponse.json({ ok: true, status: parsed.data.status, updatedAt });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось обновить заказ" },
      { status: 422 },
    );
  }
}
