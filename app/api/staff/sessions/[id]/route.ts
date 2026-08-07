import { NextResponse } from "next/server";
import { broadcastRealtime, requireStaff } from "@/lib/supabase/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { admin } = await requireStaff(request);
    const { id } = await params;
    const body = (await request.json()) as { action?: string };
    if (body.action !== "close") {
      return NextResponse.json({ error: "Некорректное действие" }, { status: 400 });
    }
    const { data, error } = await admin.rpc("close_table_session", {
      p_session_id: id,
    });
    if (error) throw error;
    const now = String(data);
    await broadcastRealtime(`check:${id}`, "closed", { sessionId: id, closedAt: now });
    return NextResponse.json({ ok: true, closedAt: now });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось закрыть чек" },
      { status: 422 },
    );
  }
}
