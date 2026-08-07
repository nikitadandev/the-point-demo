import { NextResponse } from "next/server";
import { z } from "zod";
import { broadcastRealtime, requireStaff } from "@/lib/supabase/server";

const schema = z.object({ available: z.boolean() });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { admin } = await requireStaff(request);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Некорректное значение" }, { status: 400 });
    }
    const { id } = await params;
    const { data, error } = await admin
      .from("menu_items")
      .update({ available: parsed.data.available })
      .eq("id", id)
      .select("id, available")
      .single();
    if (error) throw error;
    await broadcastRealtime("menu", "availability", data);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось обновить стоп-лист" },
      { status: 422 },
    );
  }
}

