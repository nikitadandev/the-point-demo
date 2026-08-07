"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clock3,
  Flame,
  Minus,
  Plus,
  ReceiptText,
  Search,
  ShoppingBag,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { formatMoney, restaurantConfig } from "@/config/restaurant";
import { createClientId } from "@/lib/client-id";
import {
  calculateCartTotal,
  reconcileStoredCart,
  validateRequiredModifiers,
} from "@/lib/order-domain";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  CartLine,
  CreateOrderResult,
  MenuItem,
  MenuPayload,
  Order,
  OrderStatus,
  TableSession,
} from "@/lib/types";

const statusCopy: Record<
  OrderStatus,
  { title: string; description: string; step: number }
> = {
  new: {
    title: "Заказ отправлен",
    description: "Кассир уже видит заказ и скоро примет его.",
    step: 1,
  },
  accepted: {
    title: "Заказ принят",
    description: "Проверяем позиции и передаём заказ на кухню.",
    step: 2,
  },
  entered: {
    title: "Готовим ваш заказ",
    description: "Заказ внесён в систему ресторана и уже на кухне.",
    step: 3,
  },
  completed: {
    title: "Всё готово",
    description: "Заказ выполнен. Приятного аппетита!",
    step: 4,
  },
  cancelled: {
    title: "Заказ отменён",
    description: "Пожалуйста, обратитесь к сотруднику ресторана.",
    step: 0,
  },
};

export function RestaurantMenu({
  tableToken,
  initialMenu,
  demoMode,
}: {
  tableToken: string;
  initialMenu: MenuPayload | null;
  demoMode: boolean;
}) {
  const [menu, setMenu] = useState<MenuPayload | null>(initialMenu);
  const [loading, setLoading] = useState(!initialMenu);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState(
    initialMenu?.categories[0]?.id ?? "",
  );
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [selectedModifierIds, setSelectedModifierIds] = useState<string[]>([]);
  const [detailQuantity, setDetailQuantity] = useState(1);
  const [detailError, setDetailError] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartReady, setCartReady] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [activeSession, setActiveSession] = useState<TableSession | null>(null);
  const [checkOpen, setCheckOpen] = useState(false);
  const idempotencyKey = useRef<string | null>(null);
  const cartStorageKey = `point-cart:${tableToken}`;

  useEffect(() => {
    const modalOpen = Boolean(selectedItem || cartOpen || checkOpen);
    if (!modalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (checkOpen) setCheckOpen(false);
      else if (cartOpen) setCartOpen(false);
      else setSelectedItem(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [cartOpen, checkOpen, selectedItem]);

  useEffect(() => {
    if (!menu || cartReady) return;
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved = window.localStorage.getItem(cartStorageKey);
        if (saved) setCart(reconcileStoredCart(JSON.parse(saved), menu.items));
      } catch {
        window.localStorage.removeItem(cartStorageKey);
      } finally {
        setCartReady(true);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [cartReady, cartStorageKey, menu]);

  useEffect(() => {
    if (order || !cartReady) return;
    window.localStorage.setItem(cartStorageKey, JSON.stringify(cart));
  }, [cart, cartReady, cartStorageKey, order]);

  useEffect(() => {
    if (initialMenu) return;
    let active = true;
    fetch(`/api/menu/${encodeURIComponent(tableToken)}`)
      .then(async (response) => {
        const body = (await response.json()) as MenuPayload & { error?: string };
        if (!response.ok) throw new Error(body.error || "Не удалось загрузить меню");
        if (active) {
          setMenu(body);
          setActiveCategory(body.categories[0]?.id ?? "");
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(
            error instanceof Error ? error.message : "Не удалось загрузить меню",
          );
        }
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [initialMenu, tableToken]);

  const refreshCheck = useCallback(async () => {
    const endpoint = demoMode ? "/api/demo/check" : "/api/check";
    const response = await fetch(`${endpoint}/${encodeURIComponent(tableToken)}`, {
      cache: "no-store",
    });
    if (response.status === 204) {
      setActiveSession(null);
      return;
    }
    if (response.ok) {
      const session = (await response.json()) as TableSession;
      setActiveSession(session);
      setOrder((current) =>
        current
          ? session.orders.find((item) => item.id === current.id) ?? current
          : current,
      );
    }
  }, [demoMode, tableToken]);

  useEffect(() => {
    if (!demoMode) return;
    let active = true;
    const update = async () => {
      try {
        const response = await fetch(
          `/api/demo/menu/${encodeURIComponent(tableToken)}`,
          { cache: "no-store" },
        );
        if (active && response.ok) setMenu((await response.json()) as MenuPayload);
        if (active) await refreshCheck();
      } catch {
        // Кратковременная потеря сети не должна ломать уже открытое меню.
      }
    };
    void Promise.resolve().then(update);
    const interval = window.setInterval(() => void update(), 2_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [demoMode, refreshCheck, tableToken]);

  useEffect(() => {
    if (demoMode) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const channel = supabase
      .channel("menu")
      .on(
        "broadcast",
        { event: "availability" },
        ({ payload }: { payload: Record<string, unknown> }) => {
          const itemId = String(payload.id ?? "");
          if (!itemId) return;
          setMenu((current) =>
            current
              ? {
                  ...current,
                  items: current.items.map((item) =>
                    item.id === itemId
                      ? { ...item, available: Boolean(payload.available) }
                      : item,
                  ),
                }
              : current,
          );
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [demoMode]);

  useEffect(() => {
    if (demoMode) return;
    void Promise.resolve().then(refreshCheck);
  }, [demoMode, refreshCheck]);

  const activeSessionId = activeSession?.id;

  useEffect(() => {
    if (demoMode || !activeSessionId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const channel = supabase
      .channel(`check:${activeSessionId}`)
      .on("broadcast", { event: "refresh" }, () => void refreshCheck())
      .on("broadcast", { event: "closed" }, () => {
        setActiveSession(null);
        setCheckOpen(false);
      })
      .subscribe();
    const interval = window.setInterval(() => void refreshCheck(), 15_000);
    return () => {
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [activeSessionId, demoMode, refreshCheck]);

  const activeOrderId = order?.id;
  const activeVisitorToken = order?.visitorToken;

  useEffect(() => {
    if (!activeOrderId || !activeVisitorToken) return;

    if (demoMode) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const channel = supabase
      .channel(`order:${activeVisitorToken}`)
      .on("broadcast", { event: "status" }, ({ payload }: { payload: Record<string, unknown> }) => {
        setOrder((current) =>
          current
            ? {
                ...current,
                status: payload.status as OrderStatus,
                updatedAt: String(payload.updatedAt ?? new Date().toISOString()),
              }
            : current,
        );
      })
      .subscribe();

    const interval = window.setInterval(async () => {
      const response = await fetch(
        `/api/orders/${activeOrderId}?visitorToken=${activeVisitorToken}`,
      );
      if (response.ok) setOrder((await response.json()) as Order);
    }, 15_000);

    return () => {
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [activeOrderId, activeVisitorToken, demoMode]);

  const filteredItems = useMemo(() => {
    if (!menu) return [];
    const normalizedQuery = query.trim().toLocaleLowerCase("ru-RU");
    return menu.items.filter((item) => {
      const matchesCategory = query ? true : item.categoryId === activeCategory;
      const matchesQuery = normalizedQuery
        ? item.name.toLocaleLowerCase("ru-RU").includes(normalizedQuery)
        : true;
      return matchesCategory && matchesQuery;
    });
  }, [activeCategory, menu, query]);

  const cartTotal = calculateCartTotal(cart);
  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);

  function openItem(item: MenuItem) {
    if (!item.available) return;
    setSelectedItem(item);
    setSelectedModifierIds([]);
    setDetailQuantity(1);
    setDetailError("");
  }

  function toggleModifier(groupId: string, modifierId: string) {
    if (!selectedItem) return;
    const group = selectedItem.modifierGroups.find((item) => item.id === groupId);
    if (!group) return;
    const modifier = group.modifiers.find((item) => item.id === modifierId);
    if (!modifier || modifier.available === false) return;
    setSelectedModifierIds((current) => {
      const groupIds = new Set(group.modifiers.map((modifier) => modifier.id));
      const withoutGroup = current.filter((id) => !groupIds.has(id));
      if (group.maxSelected === 1) {
        return current.includes(modifierId) && group.minSelected === 0
          ? withoutGroup
          : [...withoutGroup, modifierId];
      }
      if (current.includes(modifierId)) {
        return current.filter((id) => id !== modifierId);
      }
      const selectedInGroup = current.filter((id) => groupIds.has(id));
      if (selectedInGroup.length >= group.maxSelected) return current;
      return [...current, modifierId];
    });
    setDetailError("");
  }

  function addSelectedItem() {
    if (!selectedItem) return;
    try {
      validateRequiredModifiers(selectedItem, selectedModifierIds);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "Проверьте выбор");
      return;
    }

    const modifiers = selectedItem.modifierGroups.flatMap((group) =>
      group.modifiers
        .filter((modifier) => selectedModifierIds.includes(modifier.id))
        .map((modifier) => ({
          id: modifier.id,
          name: modifier.name,
          price: modifier.price,
        })),
    );
    const key = `${selectedItem.id}:${selectedModifierIds.slice().sort().join(",")}`;
    setCart((current) => {
      const existing = current.find((line) => line.key === key);
      if (existing) {
        return current.map((line) =>
          line.key === key
            ? { ...line, quantity: line.quantity + detailQuantity }
            : line,
        );
      }
      return [
        ...current,
        {
          key,
          itemId: selectedItem.id,
          name: selectedItem.name,
          image: selectedItem.image,
          basePrice: selectedItem.price,
          quantity: detailQuantity,
          modifiers,
        },
      ];
    });
    setSelectedItem(null);
  }

  function changeCartQuantity(key: string, delta: number) {
    setCart((current) =>
      current
        .map((line) =>
          line.key === key
            ? { ...line, quantity: Math.max(0, line.quantity + delta) }
            : line,
        )
        .filter((line) => line.quantity > 0),
    );
  }

  async function submitOrder() {
    if (!menu || !cart.length || !confirmed || sending) return;
    setSending(true);
    setSubmitError("");
    const submissionKey = idempotencyKey.current ?? createClientId();
    idempotencyKey.current = submissionKey;
    const draft = {
      tableToken,
      idempotencyKey: submissionKey,
      comment,
      items: cart.map((line) => ({
        itemId: line.itemId,
        quantity: line.quantity,
        selectedModifierIds: line.modifiers.map((modifier) => modifier.id),
      })),
    };

    try {
      const created: CreateOrderResult = await fetch(
        demoMode ? "/api/demo/orders" : "/api/orders",
        {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(draft),
        },
      ).then(async (response) => {
        const body = (await response.json()) as CreateOrderResult & { error?: string };
        if (!response.ok) throw new Error(body.error || "Не удалось отправить заказ");
        return body;
      });
      setOrder(created.order);
      setActiveSession(created.session);
      setCart([]);
      setCartOpen(false);
      setComment("");
      setConfirmed(false);
      idempotencyKey.current = null;
      window.localStorage.removeItem(cartStorageKey);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Не удалось отправить заказ",
      );
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return <div className="grid min-h-screen place-items-center">Загружаем меню…</div>;
  }

  if (!menu || loadError) {
    return (
      <main className="grid min-h-screen place-items-center px-6 text-center">
        <div className="max-w-md">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-[#f0d8ce] text-[#b9573d]">
            <X className="size-7" />
          </span>
          <h1 className="mt-5 font-display text-4xl">Стол не найден</h1>
          <p className="mt-3 text-[#777168]">
            {loadError || "Проверьте QR-код или обратитесь к сотруднику ресторана."}
          </p>
        </div>
      </main>
    );
  }

  if (order) {
    const currentStatus = statusCopy[order.status];
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col bg-[#fbf8f1] px-5 py-8 sm:px-10">
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center py-12">
          <div className="animate-rise rounded-[34px] border border-black/8 bg-white p-6 shadow-[0_24px_80px_rgba(73,52,39,.12)] sm:p-10">
            <div className="flex items-center justify-between">
              <span className="grid size-14 place-items-center rounded-full bg-[#e8eee2] text-[#68705a]">
                <Check className="size-7" strokeWidth={2.5} />
              </span>
              <span className="rounded-full bg-[#f5efe4] px-4 py-2 text-xs font-bold uppercase tracking-[.14em] text-[#777168]">
                Стол №{order.tableNumber}
              </span>
            </div>
            <p className="mt-9 text-xs font-bold uppercase tracking-[.2em] text-[#b9573d]">
              Заказ №{order.publicNumber}
            </p>
            <h1 className="mt-2 font-display text-5xl leading-[.95] sm:text-6xl">
              {currentStatus.title}
            </h1>
            <p className="mt-5 max-w-md text-base leading-7 text-[#777168]">
              {currentStatus.description}
            </p>

            {order.status !== "cancelled" && (
              <div className="mt-10">
                <div className="relative flex justify-between">
                  <div className="absolute left-4 right-4 top-4 h-px bg-black/10" />
                  <div
                    className="absolute left-4 top-4 h-px bg-[#b9573d] transition-all duration-700"
                    style={{ width: `${Math.max(0, currentStatus.step - 1) * 31}%` }}
                  />
                  {[1, 2, 3, 4].map((step) => (
                    <span
                      key={step}
                      className={`relative grid size-8 place-items-center rounded-full border text-xs font-bold transition ${
                        step <= currentStatus.step
                          ? "border-[#b9573d] bg-[#b9573d] text-white"
                          : "border-black/10 bg-white text-[#a49d93]"
                      }`}
                    >
                      {step < currentStatus.step ? <Check className="size-4" /> : step}
                    </span>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-4 text-center text-[10px] font-medium text-[#777168] sm:text-xs">
                  <span>Отправлен</span>
                  <span>Принят</span>
                  <span>На кухне</span>
                  <span>Готов</span>
                </div>
              </div>
            )}

            <div className="mt-10 flex items-center justify-between border-t border-black/10 pt-6">
              <span className="flex items-center gap-2 text-sm text-[#777168]">
                <Clock3 className="size-4" /> Обновляется автоматически
              </span>
              <strong>{formatMoney(order.total)}</strong>
            </div>
          </div>
          <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
            {activeSession && (
              <button
                type="button"
                onClick={() => setCheckOpen(true)}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#26302a] px-6 text-sm font-semibold text-white"
              >
                <ReceiptText className="size-4" /> Общий чек · {formatMoney(activeSession.total)}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setOrder(null);
                setConfirmed(false);
                idempotencyKey.current = null;
              }}
              className="min-h-12 rounded-full px-6 text-sm font-semibold text-[#777168] transition hover:bg-black/5"
            >
              Добавить ещё
            </button>
          </div>
        </div>
        {checkOpen && activeSession && (
          <CheckDrawer session={activeSession} onClose={() => setCheckOpen(false)} />
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl overflow-hidden bg-[#fbf8f1] pb-32 shadow-[0_0_80px_rgba(64,48,36,.10)]">
      <header className="relative h-[310px] overflow-hidden sm:h-[380px]">
        <Image
          src={restaurantConfig.coverImage}
          alt="Интерьер и подача ресторана"
          fill
          priority
          sizes="(max-width: 768px) 100vw, 768px"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/15" />
        <div className="absolute inset-x-0 bottom-0 p-5 pb-7 text-white sm:p-8">
          <div className="mb-5 flex items-center justify-between">
            <span className="grid size-11 place-items-center rounded-full border border-white/25 bg-white/10 font-display text-xl backdrop-blur">
              {restaurantConfig.shortName}
            </span>
            <span className="rounded-full border border-white/20 bg-black/20 px-4 py-2 text-xs font-bold uppercase tracking-[.15em] backdrop-blur">
              Стол №{menu.table.number}
            </span>
          </div>
          <h1 className="font-display text-5xl leading-none sm:text-6xl">
            {restaurantConfig.name}
          </h1>
          <p className="mt-2 text-sm text-white/80 sm:text-base">
            {restaurantConfig.description}
          </p>
        </div>
      </header>

      <section className="sticky top-0 z-20 border-b border-black/8 bg-[#fbf8f1]/95 pt-4 backdrop-blur-xl">
        <div className="px-4 sm:px-6">
          <label className="flex h-12 items-center gap-3 rounded-2xl border border-black/8 bg-white px-4 shadow-sm focus-within:border-[#b9573d]/40">
            <Search className="size-4 text-[#8a8379]" />
            <span className="sr-only">Поиск блюда</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Найти блюдо"
              className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#a49d93]"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Очистить поиск"
                className="rounded-full p-1 text-[#777168] hover:bg-black/5"
              >
                <X className="size-4" />
              </button>
            )}
          </label>
        </div>
        <nav
          aria-label="Категории меню"
          className="hide-scrollbar mt-3 flex gap-2 overflow-x-auto px-4 pb-3 sm:px-6"
        >
          {menu.categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => {
                setQuery("");
                setActiveCategory(category.id);
              }}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
                activeCategory === category.id && !query
                  ? "bg-[#282724] text-white"
                  : "border border-black/8 bg-white text-[#625d55] hover:border-black/20"
              }`}
            >
              {category.name}
            </button>
          ))}
        </nav>
      </section>

      <section className="px-4 py-7 sm:px-6">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-[#b9573d]">
              {query ? "Результаты поиска" : "Сезонное меню"}
            </p>
            <h2 className="mt-1 font-display text-3xl">
              {query
                ? `По запросу «${query}»`
                : menu.categories.find((category) => category.id === activeCategory)
                    ?.name}
            </h2>
          </div>
          <span className="pb-1 text-xs text-[#8a8379]">
            {filteredItems.length} поз.
          </span>
        </div>

        {filteredItems.length ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {filteredItems.map((item, index) => (
              <button
                key={item.id}
                type="button"
                disabled={!item.available}
                onClick={() => openItem(item)}
                className="group overflow-hidden rounded-[26px] border border-black/7 bg-white text-left shadow-[0_10px_30px_rgba(64,48,36,.06)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(64,48,36,.11)] disabled:cursor-not-allowed disabled:opacity-65"
                style={{ animationDelay: `${Math.min(index, 5) * 55}ms` }}
              >
                <div className="relative aspect-[1.45] overflow-hidden bg-[#e8e0d4]">
                  <Image
                    src={item.image}
                    alt={item.name}
                    fill
                    sizes="(max-width: 640px) 100vw, 360px"
                    className={`object-cover transition duration-500 group-hover:scale-[1.03] ${!item.available ? "grayscale" : ""}`}
                  />
                  <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                    {item.popular && (
                      <span className="flex items-center gap-1 rounded-full bg-[#fffdf8]/92 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-[#963f2c] backdrop-blur">
                        <Sparkles className="size-3" /> Популярное
                      </span>
                    )}
                    {item.spicy && (
                      <span className="flex items-center gap-1 rounded-full bg-[#b9573d] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        <Flame className="size-3" /> Острое
                      </span>
                    )}
                    {!item.available && (
                      <span className="rounded-full bg-[#282724] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        Нет в наличии
                      </span>
                    )}
                  </div>
                </div>
                <div className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-display text-[1.4rem] leading-tight">{item.name}</h3>
                    <ChevronRight className="mt-1 size-4 shrink-0 text-[#aaa399] transition group-hover:translate-x-0.5" />
                  </div>
                  <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-[#777168]">
                    {item.description}
                  </p>
                  <div className="mt-4 flex items-center justify-between">
                    <strong className="text-[15px]">{formatMoney(item.price)}</strong>
                    {item.weight && <span className="text-xs text-[#9b948a]">{item.weight}</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-[26px] border border-dashed border-black/15 px-6 py-16 text-center">
            <Search className="mx-auto size-8 text-[#aaa399]" />
            <h3 className="mt-4 font-display text-2xl">Ничего не нашли</h3>
            <p className="mt-2 text-sm text-[#777168]">Попробуйте изменить запрос.</p>
          </div>
        )}
      </section>

      {(cartCount > 0 || activeSession) && (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 mx-auto max-w-3xl px-4 pt-3">
          <div className="glass flex gap-2 rounded-[24px] border border-black/8 p-2 shadow-[0_18px_46px_rgba(64,48,36,.18)]">
            {activeSession && (
              <button
                type="button"
                onClick={() => setCheckOpen(true)}
                className={`flex min-h-14 items-center justify-between rounded-[18px] bg-[#26302a] px-4 text-white ${cartCount ? "min-w-[42%]" : "w-full"}`}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <ReceiptText className="size-4" /> Мой чек
                </span>
                <strong className="text-sm">{formatMoney(activeSession.total)}</strong>
              </button>
            )}
            {cartCount > 0 && (
              <button
                type="button"
                onClick={() => setCartOpen(true)}
                className="flex min-h-14 flex-1 items-center justify-between rounded-[18px] bg-[#b9573d] px-4 text-white transition hover:bg-[#a64b34] active:scale-[.99]"
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <ShoppingBag className="size-4" /> Корзина · {cartCount}
                </span>
                <strong className="text-sm">{formatMoney(cartTotal)}</strong>
              </button>
            )}
          </div>
        </div>
      )}

      {checkOpen && activeSession && (
        <CheckDrawer session={activeSession} onClose={() => setCheckOpen(false)} />
      )}

      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={selectedItem.name}>
          <button className="absolute inset-0 cursor-default" onClick={() => setSelectedItem(null)} aria-label="Закрыть карточку блюда" />
          <div className="animate-rise relative max-h-[94dvh] w-full max-w-xl overflow-y-auto rounded-t-[34px] bg-[#fbf8f1] shadow-2xl sm:rounded-[34px]">
            <div className="relative aspect-[1.65] overflow-hidden bg-[#e8e0d4]">
              <Image src={selectedItem.image} alt={selectedItem.name} fill sizes="600px" className="object-cover" />
              <button type="button" onClick={() => setSelectedItem(null)} aria-label="Закрыть" className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-white/90 shadow-md backdrop-blur transition hover:bg-white">
                <X className="size-5" />
              </button>
            </div>
            <div className="p-5 pb-7 sm:p-7">
              <div className="flex items-start justify-between gap-5">
                <div>
                  <h2 className="font-display text-3xl leading-tight">{selectedItem.name}</h2>
                  <p className="mt-3 text-sm leading-6 text-[#777168]">{selectedItem.description}</p>
                </div>
                {selectedItem.weight && <span className="shrink-0 text-xs text-[#9b948a]">{selectedItem.weight}</span>}
              </div>

              {selectedItem.modifierGroups.map((group) => (
                <fieldset key={group.id} className="mt-7 border-t border-black/8 pt-6">
                  <legend className="flex w-full items-center justify-between pt-6 font-semibold">
                    <span>{group.name}</span>
                    <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${group.required ? "bg-[#f0d8ce] text-[#963f2c]" : "bg-black/5 text-[#777168]"}`}>
                      {group.required ? "Обязательно" : "По желанию"}
                    </span>
                  </legend>
                  <div className="mt-3 space-y-2">
                    {group.modifiers.map((modifier) => {
                      const checked = selectedModifierIds.includes(modifier.id);
                      const unavailable = modifier.available === false;
                      return (
                        <label key={modifier.id} className={`flex items-center justify-between rounded-2xl border px-4 py-3.5 transition ${unavailable ? "cursor-not-allowed border-black/5 bg-black/[.025] opacity-50" : checked ? "cursor-pointer border-[#b9573d]/40 bg-[#f0d8ce]/45" : "cursor-pointer border-black/8 bg-white hover:border-black/15"}`}>
                          <span className="flex items-center gap-3 text-sm font-medium">
                            <input type={group.maxSelected === 1 ? "radio" : "checkbox"} name={group.id} checked={checked} disabled={unavailable} onChange={() => toggleModifier(group.id, modifier.id)} className="size-4 accent-[#b9573d]" />
                            {modifier.name}
                          </span>
                          {unavailable ? <span className="text-xs text-[#777168]">Нет</span> : modifier.price > 0 && <span className="text-xs text-[#777168]">+ {formatMoney(modifier.price)}</span>}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ))}

              {detailError && <p role="alert" className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{detailError}</p>}

              <div className="mt-7 flex items-center gap-3">
                <div className="flex h-14 items-center rounded-full border border-black/10 bg-white p-1">
                  <button type="button" onClick={() => setDetailQuantity((value) => Math.max(1, value - 1))} disabled={detailQuantity === 1} aria-label="Уменьшить количество" className="grid size-11 place-items-center rounded-full transition hover:bg-black/5 disabled:opacity-30"><Minus className="size-4" /></button>
                  <span className="w-7 text-center font-semibold">{detailQuantity}</span>
                  <button type="button" onClick={() => setDetailQuantity((value) => Math.min(20, value + 1))} aria-label="Увеличить количество" className="grid size-11 place-items-center rounded-full transition hover:bg-black/5"><Plus className="size-4" /></button>
                </div>
                <button type="button" onClick={addSelectedItem} className="flex h-14 flex-1 items-center justify-between rounded-full bg-[#b9573d] px-5 font-semibold text-white transition hover:bg-[#a64b34]">
                  <span>Добавить</span>
                  <span>{formatMoney((selectedItem.price + selectedItem.modifierGroups.flatMap((group) => group.modifiers).filter((modifier) => selectedModifierIds.includes(modifier.id)).reduce((sum, modifier) => sum + modifier.price, 0)) * detailQuantity)}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/35" role="dialog" aria-modal="true" aria-label="Корзина">
          <button className="absolute inset-0 cursor-default" onClick={() => setCartOpen(false)} aria-label="Закрыть корзину" />
          <div className="animate-rise relative flex h-full w-full max-w-xl flex-col bg-[#fbf8f1] shadow-2xl">
            <header className="flex items-center justify-between border-b border-black/8 px-5 py-5 sm:px-7">
              <button type="button" onClick={() => setCartOpen(false)} aria-label="Назад в меню" className="grid size-10 place-items-center rounded-full border border-black/10 bg-white"><ArrowLeft className="size-4" /></button>
              <h2 className="font-display text-2xl">Ваш заказ</h2>
              <span className="grid size-10 place-items-center rounded-full bg-[#f0d8ce] text-xs font-bold text-[#963f2c]">{cartCount}</span>
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-7">
              {cart.length ? (
                <div className="space-y-3">
                  {cart.map((line) => {
                    const unitPrice = line.basePrice + line.modifiers.reduce((sum, modifier) => sum + modifier.price, 0);
                    return (
                      <article key={line.key} className="flex gap-3 rounded-[22px] border border-black/7 bg-white p-3">
                        <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl bg-[#e8e0d4]">
                          <Image src={line.image} alt="" fill sizes="80px" className="object-cover" />
                        </div>
                        <div className="min-w-0 flex-1 py-1">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-display text-lg leading-tight">{line.name}</h3>
                            <button type="button" onClick={() => setCart((current) => current.filter((item) => item.key !== line.key))} aria-label={`Удалить ${line.name}`} className="rounded-full p-1.5 text-[#9b948a] transition hover:bg-red-50 hover:text-red-600"><Trash2 className="size-4" /></button>
                          </div>
                          {line.modifiers.length > 0 && <p className="mt-1 text-xs leading-4 text-[#8a8379]">{line.modifiers.map((modifier) => modifier.name).join(", ")}</p>}
                          <div className="mt-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <button type="button" onClick={() => changeCartQuantity(line.key, -1)} aria-label="Уменьшить количество" className="grid size-7 place-items-center rounded-full bg-black/5"><Minus className="size-3" /></button>
                              <span className="w-4 text-center text-sm font-semibold">{line.quantity}</span>
                              <button type="button" onClick={() => changeCartQuantity(line.key, 1)} aria-label="Увеличить количество" className="grid size-7 place-items-center rounded-full bg-black/5"><Plus className="size-3" /></button>
                            </div>
                            <strong className="text-sm">{formatMoney(unitPrice * line.quantity)}</strong>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="grid h-72 place-items-center text-center"><div><ShoppingBag className="mx-auto size-8 text-[#aaa399]" /><p className="mt-3 font-display text-2xl">Корзина пуста</p></div></div>
              )}

              {cart.length > 0 && (
                <>
                  <label className="mt-6 block">
                    <span className="text-sm font-semibold">Комментарий к заказу</span>
                    <textarea value={comment} onChange={(event) => setComment(event.target.value.slice(0, 500))} placeholder="Например, подать соус отдельно" rows={3} className="mt-2 w-full resize-none rounded-2xl border border-black/10 bg-white p-4 text-sm outline-none transition focus:border-[#b9573d]/50" />
                    <span className="mt-1 block text-right text-[10px] text-[#9b948a]">{comment.length}/500</span>
                  </label>

                  <label className={`mt-5 flex cursor-pointer items-start gap-3 rounded-[22px] border p-4 transition ${confirmed ? "border-[#68705a]/35 bg-[#edf0e8]" : "border-[#b9573d]/25 bg-[#f7e9e2]"}`}>
                    <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[#68705a]" />
                    <span>
                      <span className="block text-sm font-semibold">Подтверждаю: это заказ для стола №{menu.table.number}</span>
                      <span className="mt-1 block text-xs leading-5 text-[#777168]">Номер определён автоматически по QR-коду и изменить его нельзя.</span>
                    </span>
                  </label>

                  {submitError && <p role="alert" className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{submitError}</p>}
                </>
              )}
            </div>

            {cart.length > 0 && (
              <footer className="safe-bottom border-t border-black/8 bg-white px-5 pt-5 sm:px-7">
                <div className="mb-4 flex items-center justify-between"><span className="text-sm text-[#777168]">Итого</span><strong className="font-display text-3xl">{formatMoney(cartTotal)}</strong></div>
                <button type="button" disabled={!confirmed || sending} onClick={submitOrder} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-[#b9573d] px-5 font-semibold text-white transition hover:bg-[#a64b34] disabled:cursor-not-allowed disabled:bg-[#c8b5ac]">
                  {sending ? "Отправляем…" : `Отправить на стол №${menu.table.number}`}
                </button>
              </footer>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function CheckDrawer({
  session,
  onClose,
}: {
  session: TableSession;
  onClose: () => void;
}) {
  const activeCount = session.orders.filter((order) =>
    ["new", "accepted", "entered"].includes(order.status),
  ).length;

  return (
    <div
      className="fixed inset-0 z-[60] flex justify-end bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label="Общий чек стола"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        aria-label="Закрыть общий чек"
      />
      <section className="animate-rise relative flex h-full w-full max-w-xl flex-col bg-[#fbf8f1] shadow-2xl">
        <header className="border-b border-black/8 bg-[#26302a] px-5 pb-6 pt-5 text-white sm:px-7">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.2em] text-white/50">
                Общий чек №{session.publicNumber}
              </p>
              <h2 className="mt-1 font-display text-3xl">Стол №{session.tableNumber}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть"
              className="grid size-11 place-items-center rounded-full bg-white/10"
            >
              <X className="size-5" />
            </button>
          </div>
          <div className="mt-5 flex items-center justify-between rounded-2xl bg-white/8 px-4 py-3">
            <span className="text-sm text-white/65">
              {activeCount ? `${activeCount} сейчас в работе` : "Все позиции выполнены"}
            </span>
            <strong className="font-display text-2xl">{formatMoney(session.total)}</strong>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-7">
          <div className="space-y-4">
            {session.orders
              .slice()
              .reverse()
              .map((batch, index) => {
                const current = statusCopy[batch.status];
                return (
                  <article
                    key={batch.id}
                    className="overflow-hidden rounded-[24px] border border-black/8 bg-white"
                  >
                    <div className="flex items-start justify-between gap-4 border-b border-black/7 px-4 py-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#8a8379]">
                          {index === 0 ? "Последнее добавление" : `Заказ №${batch.publicNumber}`}
                        </p>
                        <p className="mt-1 text-sm font-semibold">{current.title}</p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1.5 text-[10px] font-bold ${
                          batch.status === "completed"
                            ? "bg-[#e8eee2] text-[#59604d]"
                            : batch.status === "cancelled"
                              ? "bg-red-50 text-red-700"
                              : batch.status === "entered"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-[#f0d8ce] text-[#963f2c]"
                        }`}
                      >
                        {batch.status === "completed" ? "Принесено" : current.title}
                      </span>
                    </div>
                    <div className="space-y-4 p-4">
                      {batch.items.map((item) => (
                        <div key={item.id} className="flex gap-3">
                          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-black/5 text-xs font-bold">
                            {item.quantity}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex justify-between gap-3 text-sm">
                              <span className="font-medium">{item.name}</span>
                              <strong>{formatMoney(item.lineTotal)}</strong>
                            </div>
                            {item.modifiers.length > 0 && (
                              <p className="mt-1 text-xs leading-5 text-[#8a8379]">
                                {item.modifiers.map((modifier) => modifier.name).join(" · ")}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                      {batch.comment && (
                        <p className="rounded-xl bg-[#f5efe4] px-3 py-2 text-xs leading-5 text-[#625d55]">
                          Комментарий: {batch.comment}
                        </p>
                      )}
                    </div>
                  </article>
                );
              })}
          </div>
        </div>
        <footer className="safe-bottom border-t border-black/8 bg-white px-5 pt-5 sm:px-7">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[#777168]">Общая сумма к оплате</span>
            <strong className="font-display text-3xl">{formatMoney(session.total)}</strong>
          </div>
          <p className="mt-2 text-xs leading-5 text-[#9b948a]">
            Оплата производится сотруднику ресторана. Отменённые позиции в сумму не входят.
          </p>
        </footer>
      </section>
    </div>
  );
}
