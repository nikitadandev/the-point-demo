import { NextResponse } from "next/server";
import { createDemoServerOrder } from "@/lib/demo-server-store";

export async function POST(request: Request) {
  try {
    return NextResponse.json(createDemoServerOrder(await request.json()), {
      status: 201,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось создать заказ" },
      { status: 422 },
    );
  }
}
