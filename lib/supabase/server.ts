import { createClient } from "@supabase/supabase-js";

export function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireStaff(request: Request) {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("Supabase не настроен");

  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : null;
  if (!token) throw new Error("Требуется авторизация");

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error("Сессия истекла");

  const { data: staff } = await admin
    .from("staff_profiles")
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!staff) throw new Error("Нет доступа сотрудника");

  return { admin, user: data.user };
}

export async function broadcastRealtime(
  topic: string,
  event: string,
  payload: Record<string, unknown>,
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return;

  await fetch(`${url}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      messages: [{ topic, event, payload, private: false }],
    }),
  });
}

