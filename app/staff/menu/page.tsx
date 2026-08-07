"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, UtensilsCrossed } from "lucide-react";
import { StaffShell } from "@/components/staff/staff-shell";
import { formatMoney, restaurantConfig } from "@/config/restaurant";
import { demoCategories } from "@/lib/demo-data";
import { isDemoMode } from "@/lib/runtime";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { MenuItem } from "@/lib/types";

export default function StaffMenuPage() {
  const router = useRouter();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const loadRemote = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const session = (await supabase?.auth.getSession()).data.session;
    if (!session) {
      router.replace("/staff/login");
      return;
    }
    const response = await fetch("/api/staff/menu", { headers: { authorization: `Bearer ${session.access_token}` } });
    const data = (await response.json()) as Array<{ id: string; category_id: string; name: string; description: string; price: number; image_url: string; weight: string | null; popular: boolean; spicy: boolean; available: boolean; categories: { name: string } | { name: string }[] | null }> & { error?: string };
    if (!response.ok) throw new Error(data.error || "Не удалось загрузить меню");
    setItems(data.map((item) => ({ id: item.id, categoryId: item.category_id, categoryName: Array.isArray(item.categories) ? item.categories[0]?.name : item.categories?.name, name: item.name, description: item.description, price: item.price, image: item.image_url, weight: item.weight ?? undefined, popular: item.popular, spicy: item.spicy, available: item.available, modifierGroups: [] })));
    setLoading(false);
  }, [router]);

  const loadDemo = useCallback(async () => {
    const tablesResponse = await fetch("/api/demo/tables", { cache: "no-store" });
    const tables = (await tablesResponse.json()) as Array<{ number: number; token: string }>;
    const tableToken = tables.find((table) => table.number === restaurantConfig.demoTable.number)?.token;
    if (!tablesResponse.ok || !tableToken) throw new Error("Не удалось определить тестовый стол");
    const response = await fetch(`/api/demo/menu/${encodeURIComponent(tableToken)}`, { cache: "no-store" });
    const data = (await response.json()) as { items?: MenuItem[]; error?: string };
    if (!response.ok || !data.items) throw new Error(data.error || "Не удалось загрузить меню");
    setItems(data.items);
    setError("");
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isDemoMode) {
      void Promise.resolve().then(() => loadDemo().catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Не удалось загрузить меню");
        setLoading(false);
      }));
      const timer = window.setInterval(
        () => void loadDemo().catch(() => setError("Нет связи с сервером")),
        2_000,
      );
      return () => window.clearInterval(timer);
    }
    void Promise.resolve().then(() => {
      void loadRemote().catch((reason: unknown) => { setError(reason instanceof Error ? reason.message : "Не удалось загрузить меню"); setLoading(false); });
    });
    const supabase = getSupabaseBrowserClient();
    const channel = supabase?.channel("staff-menu").on("postgres_changes", { event: "UPDATE", schema: "public", table: "menu_items" }, () => void loadRemote()).subscribe();
    return () => { if (channel && supabase) void supabase.removeChannel(channel); };
  }, [loadDemo, loadRemote]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru-RU");
    return normalized ? items.filter((item) => item.name.toLocaleLowerCase("ru-RU").includes(normalized)) : items;
  }, [items, query]);

  const categories = useMemo(() => {
    if (isDemoMode) return demoCategories;
    return Array.from(
      new Map(
        items.map((item) => [
          item.categoryId,
          { id: item.categoryId, name: item.categoryName ?? "Без категории", sortOrder: 0 },
        ]),
      ).values(),
    );
  }, [items]);

  async function toggle(item: MenuItem) {
    if (pendingId) return;
    setPendingId(item.id);
    setError("");
    const next = !item.available;
    setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, available: next } : candidate));
    try {
      if (isDemoMode) {
        const response = await fetch(`/api/demo/menu-items/${item.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ available: next }) });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(body.error || "Не удалось обновить стоп-лист");
        await loadDemo();
      } else {
        const session = (await getSupabaseBrowserClient()?.auth.getSession()).data.session;
        if (!session) throw new Error("Сессия истекла");
        const response = await fetch(`/api/staff/menu/${item.id}`, { method: "PATCH", headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ available: next }) });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(body.error || "Не удалось обновить стоп-лист");
      }
    } catch (reason) {
      setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, available: item.available } : candidate));
      setError(reason instanceof Error ? reason.message : "Не удалось обновить стоп-лист");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <StaffShell>
      <main className="px-4 py-6 sm:px-7 lg:px-9 lg:py-8">
        <header className="flex flex-wrap items-end justify-between gap-5">
          <div><h1 className="font-display text-4xl sm:text-5xl">Стоп-лист</h1><p className="mt-2 text-sm text-[#777168]">Изменения сразу видны гостям в QR-меню.</p></div>
          <div className="rounded-full border border-black/8 bg-white/65 px-4 py-2 text-xs font-semibold text-[#777168]">{items.filter((item) => !item.available).length} блюд на стопе</div>
        </header>

        <label className="mt-7 flex h-12 max-w-xl items-center gap-3 rounded-2xl border border-black/8 bg-white px-4 shadow-sm focus-within:border-[#b9573d]/40">
          <Search className="size-4 text-[#8a8379]" /><span className="sr-only">Найти блюдо</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти блюдо" className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none" />
        </label>

        {error && <p role="alert" className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        <div className="mt-7 space-y-8">
          {loading ? [1, 2, 3].map((item) => <div key={item} className="h-40 animate-pulse rounded-[26px] bg-white/60" />) : categories.map((category) => {
            const categoryItems = filtered.filter((item) => item.categoryId === category.id);
            if (!categoryItems.length) return null;
            return (
              <section key={category.id}>
                <div className="mb-3 flex items-center gap-3"><h2 className="font-display text-2xl">{category.name}</h2><span className="rounded-full bg-black/5 px-2.5 py-1 text-[10px] font-bold text-[#777168]">{categoryItems.length}</span></div>
                <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                  {categoryItems.map((item) => (
                    <article key={item.id} className={`flex items-center gap-4 rounded-[22px] border bg-[#fffdf8] p-3 transition ${item.available ? "border-black/7" : "border-[#b9573d]/22 opacity-75"}`}>
                      <div className="relative size-16 shrink-0 overflow-hidden rounded-2xl bg-[#e8e0d4]"><Image src={item.image} alt="" fill sizes="64px" className={`object-cover ${item.available ? "" : "grayscale"}`} /></div>
                      <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold">{item.name}</h3><p className="mt-1 text-xs text-[#8a8379]">{formatMoney(item.price)}</p></div>
                      <button type="button" role="switch" aria-checked={item.available} aria-label={`${item.name}: ${item.available ? "в наличии" : "нет в наличии"}`} disabled={pendingId === item.id} onClick={() => void toggle(item)} className={`relative h-8 w-14 shrink-0 rounded-full transition disabled:opacity-50 ${item.available ? "bg-[#68705a]" : "bg-[#c8bcb1]"}`}><span className={`absolute top-1 size-6 rounded-full bg-white shadow-sm transition ${item.available ? "left-7" : "left-1"}`} /></button>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        {!loading && !filtered.length && <div className="mt-8 rounded-[26px] border border-dashed border-black/15 px-6 py-16 text-center"><UtensilsCrossed className="mx-auto size-8 text-[#aaa399]" /><h2 className="mt-4 font-display text-2xl">Блюда не найдены</h2></div>}
      </main>
    </StaffShell>
  );
}
