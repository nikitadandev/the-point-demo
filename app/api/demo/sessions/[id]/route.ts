import { NextResponse } from "next/server";
import { closeDemoServerSession } from "@/lib/demo-server-store";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const body = (await request.json()) as { action?: string };
    if (body.action !== "close") {
      return NextResponse.json({ error: "Некорректное действие" }, { status: 400 });
    }
    const { id } = await params;
    return NextResponse.json(closeDemoServerSession(id));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось закрыть чек" },
      { status: 422 },
    );
  }
}
