import { NextResponse } from "next/server";
import { z } from "zod";
import { setDemoServerAvailability } from "@/lib/demo-server-store";

const schema = z.object({ available: z.boolean() });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const body = schema.parse(await request.json());
    const { id } = await params;
    return NextResponse.json(setDemoServerAvailability(id, body.available));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось обновить блюдо" },
      { status: 422 },
    );
  }
}
