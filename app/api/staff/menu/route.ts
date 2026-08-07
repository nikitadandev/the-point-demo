import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const { admin } = await requireStaff(request);
    const { data, error } = await admin
      .from("menu_items")
      .select("id, category_id, name, description, price, image_url, weight, popular, spicy, available, sort_order, categories(name)")
      .eq("active", true)
      .order("sort_order");
    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Нет доступа" },
      { status: 401 },
    );
  }
}

