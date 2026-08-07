import { NextResponse } from "next/server";
import { z } from "zod";
import { updateDemoServerOrder } from "@/lib/demo-server-store";

const schema = z.union([
  z.object({ status: z.enum(["new", "accepted", "entered", "completed", "cancelled"]) }),
  z.object({ viewed: z.literal(true) }),
]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const parsed = schema.parse(await request.json());
    const { id } = await params;
    return NextResponse.json(updateDemoServerOrder(id, parsed));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось обновить заказ" },
      { status: 422 },
    );
  }
}
