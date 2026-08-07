import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/supabase/server";
import { tableTokenSchema } from "@/lib/table-token";

const schema = z.object({ token: tableTokenSchema });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ number: string }> },
) {
  try {
    const { admin } = await requireStaff(request);
    const { number } = await params;
    const tableNumber = Number(number);
    if (!Number.isInteger(tableNumber) || tableNumber < 1) {
      return NextResponse.json({ error: "Некорректный номер стола" }, { status: 400 });
    }
    const { token } = schema.parse(await request.json());
    const { data, error } = await admin
      .from("tables")
      .update({ token })
      .eq("table_number", tableNumber)
      .eq("active", true)
      .select("table_number, token")
      .maybeSingle();
    if (error?.code === "23505") {
      return NextResponse.json(
        { error: "Этот токен уже используется другим столом" },
        { status: 409 },
      );
    }
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Стол не найден" }, { status: 404 });
    return NextResponse.json({ number: data.table_number, token: data.token });
  } catch (error) {
    const message = error instanceof z.ZodError
      ? error.issues[0]?.message
      : error instanceof Error
        ? error.message
        : "Не удалось сохранить токен";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
