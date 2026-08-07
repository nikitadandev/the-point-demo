import { NextResponse } from "next/server";
import { z } from "zod";
import { updateDemoServerTableToken } from "@/lib/demo-server-store";
import { tableTokenSchema } from "@/lib/table-token";

const schema = z.object({ token: tableTokenSchema });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ number: string }> },
) {
  try {
    const { number } = await params;
    const tableNumber = Number(number);
    if (!Number.isInteger(tableNumber) || tableNumber < 1) {
      return NextResponse.json({ error: "Некорректный номер стола" }, { status: 400 });
    }
    const { token } = schema.parse(await request.json());
    return NextResponse.json(updateDemoServerTableToken(tableNumber, token));
  } catch (error) {
    const message = error instanceof z.ZodError
      ? error.issues[0]?.message
      : error instanceof Error
        ? error.message
        : "Не удалось сохранить токен";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
