import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  MenuPayload,
  Order,
  OrderStatus,
  TableSession,
  TableSessionStatus,
} from "@/lib/types";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

type RawModifier = {
  id: string;
  name: string;
  price: number;
  available: boolean;
  sort_order: number;
};

type RawModifierGroup = {
  id: string;
  name: string;
  required: boolean;
  min_selected: number;
  max_selected: number;
  sort_order: number;
  modifiers: RawModifier[];
};

type RawMenuItem = {
  id: string;
  category_id: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
  weight: string | null;
  popular: boolean;
  spicy: boolean;
  available: boolean;
  sort_order: number;
  modifier_groups: RawModifierGroup[];
};

type RawOrder = {
  id: string;
  public_number: number;
  visitor_token: string;
  status: OrderStatus;
  comment: string | null;
  total: number;
  created_at: string;
  updated_at: string;
  viewed_at: string | null;
  tables?: { table_number: number } | { table_number: number }[];
  table_sessions?:
    | {
        id: string;
        public_number: number;
        status: TableSessionStatus;
      }
    | Array<{
        id: string;
        public_number: number;
        status: TableSessionStatus;
      }>;
  order_items: Array<{
    id: string;
    menu_item_id: string;
    name_snapshot: string;
    base_price_snapshot: number;
    quantity: number;
    unit_price: number;
    line_total: number;
    order_item_modifiers: Array<{
      modifier_id: string;
      name_snapshot: string;
      price_snapshot: number;
    }>;
  }>;
};

type RawSession = {
  id: string;
  public_number: number;
  status: TableSessionStatus;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  tables: { table_number: number } | { table_number: number }[];
  orders: RawOrder[];
};

export async function loadMenuByTableToken(
  tableToken: string,
): Promise<MenuPayload | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("Supabase не настроен");

  const { data: table, error: tableError } = await admin
    .from("tables")
    .select("id, table_number, token")
    .eq("token", tableToken)
    .eq("active", true)
    .maybeSingle();
  if (tableError) throw tableError;
  if (!table) return null;

  const [{ data: categories, error: categoriesError }, { data: menuItems, error: itemsError }] =
    await Promise.all([
      admin
        .from("categories")
        .select("id, name, sort_order")
        .eq("active", true)
        .order("sort_order"),
      admin
        .from("menu_items")
        .select(
          "id, category_id, name, description, price, image_url, weight, popular, spicy, available, sort_order, modifier_groups(id, name, required, min_selected, max_selected, sort_order, modifiers(id, name, price, available, sort_order))",
        )
        .eq("active", true)
        .order("sort_order"),
    ]);

  if (categoriesError) throw categoriesError;
  if (itemsError) throw itemsError;

  const rawItems = (menuItems ?? []) as unknown as RawMenuItem[];
  return {
    table: { id: table.id, number: table.table_number, token: table.token },
    categories: (categories ?? []).map((category) => ({
      id: category.id,
      name: category.name,
      sortOrder: category.sort_order,
    })),
    items: rawItems.map((item) => ({
      id: item.id,
      categoryId: item.category_id,
      name: item.name,
      description: item.description,
      price: item.price,
      image: item.image_url,
      weight: item.weight ?? undefined,
      popular: item.popular,
      spicy: item.spicy,
      available: item.available,
      modifierGroups: (item.modifier_groups ?? [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((group) => ({
          id: group.id,
          name: group.name,
          required: group.required,
          minSelected: group.min_selected,
          maxSelected: group.max_selected,
          modifiers: (group.modifiers ?? [])
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((modifier) => ({
              id: modifier.id,
              name: modifier.name,
              price: modifier.price,
              available: modifier.available,
            })),
        })),
    })),
  };
}

export function mapOrder(
  row: RawOrder,
  sessionContext?: {
    id: string;
    publicNumber: string;
    status: TableSessionStatus;
    tableNumber: number;
  },
): Order {
  const table = Array.isArray(row.tables) ? row.tables[0] : row.tables;
  const rawSession = Array.isArray(row.table_sessions)
    ? row.table_sessions[0]
    : row.table_sessions;
  const session = sessionContext ?? {
    id: rawSession?.id ?? "",
    publicNumber: String(rawSession?.public_number ?? ""),
    status: rawSession?.status ?? "open",
    tableNumber: table?.table_number ?? 0,
  };
  return {
    id: row.id,
    publicNumber: String(row.public_number),
    sessionId: session.id,
    sessionPublicNumber: session.publicNumber,
    sessionStatus: session.status,
    tableNumber: session.tableNumber,
    visitorToken: row.visitor_token,
    status: row.status,
    comment: row.comment ?? "",
    total: row.total,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    viewed: Boolean(row.viewed_at),
    items: (row.order_items ?? []).map((line) => ({
      id: line.id,
      menuItemId: line.menu_item_id,
      name: line.name_snapshot,
      basePrice: line.base_price_snapshot,
      quantity: line.quantity,
      unitPrice: line.unit_price,
      lineTotal: line.line_total,
      modifiers: (line.order_item_modifiers ?? []).map((modifier) => ({
        id: modifier.modifier_id,
        name: modifier.name_snapshot,
        price: modifier.price_snapshot,
      })),
    })),
  };
}

export const orderSelect =
  "id, public_number, visitor_token, status, comment, total, created_at, updated_at, viewed_at, tables(table_number), table_sessions(id, public_number, status), order_items(id, menu_item_id, name_snapshot, base_price_snapshot, quantity, unit_price, line_total, order_item_modifiers(modifier_id, name_snapshot, price_snapshot))";

const nestedOrderSelect =
  "id, public_number, visitor_token, status, comment, total, created_at, updated_at, viewed_at, order_items(id, menu_item_id, name_snapshot, base_price_snapshot, quantity, unit_price, line_total, order_item_modifiers(modifier_id, name_snapshot, price_snapshot))";

export const sessionSelect =
  `id, public_number, status, created_at, updated_at, closed_at, tables(table_number), orders(${nestedOrderSelect})`;

export function mapSession(row: RawSession): TableSession {
  const table = Array.isArray(row.tables) ? row.tables[0] : row.tables;
  const context = {
    id: row.id,
    publicNumber: String(row.public_number),
    status: row.status,
    tableNumber: table.table_number,
  };
  const orders = (row.orders ?? [])
    .map((order) => mapOrder(order, context))
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  return {
    ...context,
    total: orders
      .filter((order) => order.status !== "cancelled")
      .reduce((sum, order) => sum + order.total, 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at ?? undefined,
    orders,
  };
}

export async function loadStaffSessions(admin: SupabaseClient) {
  const { data, error } = await admin
    .from("table_sessions")
    .select(sessionSelect)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return ((data ?? []) as unknown as RawSession[]).map(mapSession);
}

export async function loadOpenSessionByTableToken(tableToken: string) {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("Supabase не настроен");
  const { data: table, error: tableError } = await admin
    .from("tables")
    .select("id")
    .eq("token", tableToken)
    .eq("active", true)
    .maybeSingle();
  if (tableError) throw tableError;
  if (!table) return null;
  const { data, error } = await admin
    .from("table_sessions")
    .select(sessionSelect)
    .eq("table_id", table.id)
    .eq("status", "open")
    .maybeSingle();
  if (error) throw error;
  return data ? mapSession(data as unknown as RawSession) : null;
}

export type { RawOrder, RawSession };
