"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Check,
  ChefHat,
  ChevronRight,
  MessageSquareText,
  ReceiptText,
  RotateCw,
  Utensils,
  X,
} from "lucide-react";
import { StaffShell } from "@/components/staff/staff-shell";
import { formatMoney, formatTime } from "@/config/restaurant";
import { canTransitionOrder } from "@/lib/order-domain";
import { isDemoMode } from "@/lib/runtime";
import { canCloseSession } from "@/lib/session-domain";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Order, OrderStatus, TableSession } from "@/lib/types";

const statusLabels: Record<OrderStatus, string> = {
  new: "Новый",
  accepted: "Принят",
  entered: "Готовится",
  completed: "Принесено",
  cancelled: "Отменено",
};

const filters = [
  { id: "open", label: "Открытые чеки" },
  { id: "closed", label: "Закрытые" },
  { id: "cancelled", label: "Отменённые" },
] as const;

type Filter = (typeof filters)[number]["id"];

function waitLabel(createdAt: string, now: number) {
  const timestamp = now || new Date(createdAt).getTime();
  const minutes = Math.max(
    0,
    Math.floor((timestamp - new Date(createdAt).getTime()) / 60_000),
  );
  return minutes < 1 ? "только что" : `${minutes} мин`;
}

function statusClass(status: OrderStatus) {
  if (status === "new") return "bg-[#f0d8ce] text-[#963f2c]";
  if (status === "accepted") return "bg-amber-100 text-amber-800";
  if (status === "entered") return "bg-blue-100 text-blue-800";
  if (status === "completed") return "bg-[#e8eee2] text-[#59604d]";
  return "bg-red-50 text-red-700";
}

export default function StaffOrdersPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<TableSession[]>([]);
  const [filter, setFilter] = useState<Filter>("open");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const previousUnread = useRef(0);
  const initialized = useRef(false);

  const loadRemoteSessions = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const session = (await supabase?.auth.getSession()).data.session;
    if (!session) {
      router.replace("/staff/login");
      return;
    }
    const response = await fetch("/api/staff/orders", {
      headers: { authorization: `Bearer ${session.access_token}` },
    });
    const body = (await response.json()) as TableSession[] & { error?: string };
    if (!response.ok) {
      throw new Error(body.error || "Не удалось загрузить чеки");
    }
    setSessions(body);
    setError("");
    setLoading(false);
  }, [router]);

  const loadDemoSessions = useCallback(async () => {
    const response = await fetch("/api/demo/sessions", { cache: "no-store" });
    const body = (await response.json()) as TableSession[] & { error?: string };
    if (!response.ok) throw new Error(body.error || "Не удалось загрузить чеки");
    setSessions(body);
    setError("");
    setLoading(false);
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    if (isDemoMode) {
      void Promise.resolve().then(() => loadDemoSessions().catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Не удалось загрузить чеки");
        setLoading(false);
      }));
      const demoTimer = window.setInterval(
        () => void loadDemoSessions().catch(() => setError("Нет связи с сервером")),
        2_000,
      );
      return () => {
        window.clearTimeout(initialTimer);
        window.clearInterval(timer);
        window.clearInterval(demoTimer);
      };
    }

    void Promise.resolve().then(() => {
      void loadRemoteSessions().catch((reason: unknown) => {
        setError(
          reason instanceof Error ? reason.message : "Не удалось загрузить чеки",
        );
        setLoading(false);
      });
    });
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      ?.channel("staff-checks")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => void loadRemoteSessions(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "table_sessions" },
        () => void loadRemoteSessions(),
      )
      .subscribe();
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
      if (channel && supabase) void supabase.removeChannel(channel);
    };
  }, [loadDemoSessions, loadRemoteSessions]);

  const unread = sessions
    .flatMap((session) => session.orders)
    .filter((order) => order.status === "new" && !order.viewed).length;

  useEffect(() => {
    if (initialized.current && unread > previousUnread.current) {
      try {
        const context = new AudioContext();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = 720;
        gain.gain.setValueAtTime(0.06, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.22);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.22);
      } catch {
        // Автовоспроизведение может быть запрещено до первого касания.
      }
    }
    previousUnread.current = unread;
    initialized.current = true;
  }, [unread]);

  const filteredSessions = useMemo(() => {
    return sessions
      .filter((session) => session.status === filter)
      .sort((a, b) => {
        const aUnread = a.orders.some((order) => !order.viewed && order.status === "new");
        const bUnread = b.orders.some((order) => !order.viewed && order.status === "new");
        if (aUnread !== bUnread) return aUnread ? -1 : 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [filter, sessions]);

  const selected =
    filteredSessions.find((session) => session.id === selectedId) ??
    filteredSessions[0] ??
    null;

  async function selectSession(tableSession: TableSession) {
    setSelectedId(tableSession.id);
    const unseen = tableSession.orders.filter((order) => !order.viewed);
    if (!unseen.length) return;

    if (isDemoMode) {
      const responses = await Promise.all(
        unseen.map((order) =>
          fetch(`/api/demo/orders/${order.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ viewed: true }),
          }),
        ),
      );
      if (responses.some((response) => !response.ok)) {
        setError("Не удалось отметить заказ просмотренным");
        return;
      }
      await loadDemoSessions();
      return;
    }
    const authSession = (await getSupabaseBrowserClient()?.auth.getSession()).data
      .session;
    if (!authSession) return;
    await Promise.all(
      unseen.map((order) =>
        fetch(`/api/staff/orders/${order.id}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${authSession.access_token}`,
          },
          body: JSON.stringify({ viewed: true }),
        }),
      ),
    );
    setSessions((current) =>
      current.map((session) =>
        session.id === tableSession.id
          ? {
              ...session,
              orders: session.orders.map((order) => ({ ...order, viewed: true })),
            }
          : session,
      ),
    );
  }

  async function changeStatus(order: Order, status: OrderStatus) {
    if (!canTransitionOrder(order.status, status) || updatingId) return;
    setUpdatingId(order.id);
    setError("");
    try {
      if (isDemoMode) {
        const response = await fetch(`/api/demo/orders/${order.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status }),
        });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(body.error || "Не удалось изменить статус");
        await loadDemoSessions();
      } else {
        const authSession = (await getSupabaseBrowserClient()?.auth.getSession()).data
          .session;
        if (!authSession) throw new Error("Сессия истекла");
        const response = await fetch(`/api/staff/orders/${order.id}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${authSession.access_token}`,
          },
          body: JSON.stringify({ status }),
        });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(body.error || "Не удалось изменить статус");
        }
        await loadRemoteSessions();
      }
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Не удалось изменить статус",
      );
    } finally {
      setUpdatingId(null);
    }
  }

  async function closeCheck(tableSession: TableSession) {
    if (!canCloseSession(tableSession)) {
      setError("Сначала завершите или отмените все позиции в чеке");
      return;
    }
    setUpdatingId(tableSession.id);
    try {
      if (isDemoMode) {
        const response = await fetch(`/api/demo/sessions/${tableSession.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "close" }),
        });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(body.error || "Не удалось закрыть чек");
        await loadDemoSessions();
      } else {
        const authSession = (await getSupabaseBrowserClient()?.auth.getSession()).data
          .session;
        if (!authSession) throw new Error("Сессия истекла");
        const response = await fetch(`/api/staff/sessions/${tableSession.id}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${authSession.access_token}`,
          },
          body: JSON.stringify({ action: "close" }),
        });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(body.error || "Не удалось закрыть чек");
        await loadRemoteSessions();
      }
      setSelectedId(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось закрыть чек");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <StaffShell>
      <main className="px-4 py-6 sm:px-7 lg:px-9 lg:py-8">
        <header className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-display text-4xl sm:text-5xl">Чеки столов</h1>
              {unread > 0 && (
                <span className="flex items-center gap-1.5 rounded-full bg-[#b9573d] px-3 py-1.5 text-xs font-bold text-white">
                  <Bell className="size-3.5" /> {unread} дополнений
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-[#777168]">
              Новые подтверждения дополняют открытый чек стола.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-black/8 bg-white/65 px-4 py-2 text-xs font-semibold text-[#59604d]">
            <span className="size-2 animate-pulse rounded-full bg-[#6f8f59]" />
            Realtime включён
          </div>
        </header>

        <div className="hide-scrollbar mt-7 flex gap-2 overflow-x-auto">
          {filters.map((item) => {
            const count = sessions.filter((session) => session.status === item.id).length;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setFilter(item.id);
                  setSelectedId(null);
                }}
                className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                  filter === item.id
                    ? "bg-[#26302a] text-white"
                    : "border border-black/8 bg-white/55 text-[#625d55] hover:bg-white"
                }`}
              >
                {item.label} <span className="ml-1 opacity-55">{count}</span>
              </button>
            );
          })}
        </div>

        {error && (
          <div
            role="alert"
            className="mt-5 flex items-center justify-between rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            <span>{error}</span>
            <button type="button" onClick={() => setError("")} aria-label="Закрыть ошибку">
              <X className="size-4" />
            </button>
          </div>
        )}

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(350px,.72fr)_minmax(560px,1.28fr)]">
          <section aria-label="Список чеков" className="space-y-3">
            {loading ? (
              [1, 2, 3].map((item) => (
                <div key={item} className="h-36 animate-pulse rounded-[24px] bg-white/60" />
              ))
            ) : filteredSessions.length ? (
              filteredSessions.map((tableSession) => {
                const isSelected = selected?.id === tableSession.id;
                const newCount = tableSession.orders.filter(
                  (order) => order.status === "new" && !order.viewed,
                ).length;
                const activeCount = tableSession.orders.filter((order) =>
                  ["new", "accepted", "entered"].includes(order.status),
                ).length;
                return (
                  <button
                    key={tableSession.id}
                    type="button"
                    onClick={() => void selectSession(tableSession)}
                    className={`relative w-full rounded-[24px] border p-4 text-left transition ${
                      isSelected
                        ? "border-[#b9573d]/35 bg-white shadow-[0_12px_36px_rgba(66,48,37,.10)]"
                        : "border-black/7 bg-white/55 hover:bg-white"
                    } ${newCount ? "ring-2 ring-[#b9573d]/25" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="grid size-13 place-items-center rounded-2xl bg-[#26302a] font-display text-xl text-white">
                        {tableSession.tableNumber}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold">Стол №{tableSession.tableNumber}</p>
                            <p className="mt-0.5 text-xs text-[#8a8379]">
                              Чек №{tableSession.publicNumber} · {tableSession.orders.length} подач
                            </p>
                          </div>
                          <ChevronRight className="size-4 text-[#aaa399]" />
                        </div>
                        <div className="mt-4 flex items-center justify-between border-t border-black/7 pt-3">
                          <span className="text-xs font-semibold text-[#777168]">
                            {newCount
                              ? `+ ${newCount} новых дополнений`
                              : activeCount
                                ? `${activeCount} в работе`
                                : "Все принесено"}
                          </span>
                          <strong>{formatMoney(tableSession.total)}</strong>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="rounded-[26px] border border-dashed border-black/15 bg-white/35 px-6 py-16 text-center">
                <Check className="mx-auto size-8 text-[#879078]" />
                <h2 className="mt-4 font-display text-2xl">Здесь пока пусто</h2>
                <p className="mt-2 text-sm text-[#777168]">Чеки появятся автоматически.</p>
              </div>
            )}
          </section>

          <section className="min-w-0">
            {selected ? (
              <article className="rounded-[28px] border border-black/8 bg-[#fffdf8] shadow-[0_18px_60px_rgba(66,48,37,.08)] xl:sticky xl:top-8">
                <header className="flex flex-wrap items-start justify-between gap-4 border-b border-black/8 p-5 sm:p-7">
                  <div className="flex items-center gap-4">
                    <span className="grid size-14 place-items-center rounded-2xl bg-[#26302a] font-display text-2xl text-white">
                      {selected.tableNumber}
                    </span>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[.16em] text-[#b9573d]">
                        Открытый чек №{selected.publicNumber}
                      </p>
                      <h2 className="mt-1 font-display text-3xl">Стол №{selected.tableNumber}</h2>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-2xl">{formatMoney(selected.total)}</p>
                    <p className="mt-1 text-xs text-[#8a8379]">
                      открыт {waitLabel(selected.createdAt, now)} назад
                    </p>
                  </div>
                </header>

                <div className="space-y-4 p-5 sm:p-7">
                  {selected.orders
                    .slice()
                    .reverse()
                    .map((order, index) => (
                      <section
                        key={order.id}
                        className={`overflow-hidden rounded-[22px] border bg-white ${
                          !order.viewed && order.status === "new"
                            ? "border-[#b9573d]/35 ring-2 ring-[#b9573d]/10"
                            : "border-black/8"
                        }`}
                      >
                        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-black/7 px-4 py-4">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[.15em] text-[#8a8379]">
                              {index === 0 ? "Последнее дополнение" : `Заказ №${order.publicNumber}`}
                            </p>
                            <p className="mt-1 text-sm font-semibold">
                              {formatTime(order.createdAt)} · {waitLabel(order.createdAt, now)}
                            </p>
                          </div>
                          <span className={`rounded-full px-3 py-1.5 text-[10px] font-bold ${statusClass(order.status)}`}>
                            {statusLabels[order.status]}
                          </span>
                        </header>

                        <div className="space-y-4 p-4">
                          {order.items.map((line) => (
                            <div key={line.id} className="flex gap-3">
                              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#f0d8ce] text-sm font-bold text-[#963f2c]">
                                {line.quantity}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex justify-between gap-4">
                                  <h3 className="text-sm font-semibold">{line.name}</h3>
                                  <strong className="shrink-0 text-sm">{formatMoney(line.lineTotal)}</strong>
                                </div>
                                {line.modifiers.length > 0 && (
                                  <p className="mt-1 text-xs leading-5 text-[#8a8379]">
                                    Опции: {line.modifiers.map((modifier) => modifier.name).join(" · ")}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                          {order.comment && (
                            <div className="flex gap-3 rounded-[18px] bg-[#f5efe4] p-3">
                              <MessageSquareText className="mt-0.5 size-4 shrink-0 text-[#b9573d]" />
                              <p className="text-xs leading-5">{order.comment}</p>
                            </div>
                          )}
                        </div>

                        <footer className="border-t border-black/7 bg-[#fbf8f1] px-4 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <strong className="text-sm">{formatMoney(order.total)}</strong>
                            <div className="flex flex-wrap justify-end gap-2">
                              {canTransitionOrder(order.status, "accepted") && (
                                <ActionButton
                                  disabled={updatingId === order.id}
                                  onClick={() => void changeStatus(order, "accepted")}
                                  icon={<Check className="size-3.5" />}
                                >
                                  Принять
                                </ActionButton>
                              )}
                              {canTransitionOrder(order.status, "entered") && (
                                <ActionButton
                                  disabled={updatingId === order.id}
                                  onClick={() => void changeStatus(order, "entered")}
                                  icon={<Utensils className="size-3.5" />}
                                >
                                  На кухню
                                </ActionButton>
                              )}
                              {canTransitionOrder(order.status, "completed") && (
                                <ActionButton
                                  disabled={updatingId === order.id}
                                  onClick={() => void changeStatus(order, "completed")}
                                  icon={<ChefHat className="size-3.5" />}
                                >
                                  Принесено
                                </ActionButton>
                              )}
                              {canTransitionOrder(order.status, "cancelled") && (
                                <button
                                  type="button"
                                  disabled={updatingId === order.id}
                                  onClick={() => void changeStatus(order, "cancelled")}
                                  className="min-h-9 rounded-full px-3 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                                >
                                  Отменить
                                </button>
                              )}
                            </div>
                          </div>
                        </footer>
                      </section>
                    ))}

                  <div className="flex flex-wrap items-center justify-between gap-4 border-t border-black/10 pt-5">
                    <div>
                      <p className="text-xs text-[#8a8379]">Итого по общему чеку</p>
                      <p className="mt-1 font-display text-3xl">{formatMoney(selected.total)}</p>
                    </div>
                    {selected.status === "open" && (
                      <button
                        type="button"
                        disabled={updatingId === selected.id}
                        onClick={() => void closeCheck(selected)}
                        className="flex min-h-12 items-center gap-2 rounded-full bg-[#26302a] px-5 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        <ReceiptText className="size-4" /> Закрыть чек
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ) : (
              <div className="grid min-h-96 place-items-center rounded-[28px] border border-dashed border-black/15 bg-white/35 text-center">
                <div>
                  <ReceiptText className="mx-auto size-9 text-[#aaa399]" />
                  <p className="mt-3 font-display text-2xl">Выберите чек</p>
                  <p className="mt-2 text-sm text-[#8a8379]">Откроется полный состав и комментарии.</p>
                </div>
              </div>
            )}
          </section>
        </div>

        {!loading && !error && (
          <button
            type="button"
            onClick={() =>
              isDemoMode ? void loadDemoSessions() : void loadRemoteSessions()
            }
            className="mt-6 flex items-center gap-2 text-xs font-semibold text-[#777168] hover:text-[#282724]"
          >
            <RotateCw className="size-3.5" /> Обновить вручную
          </button>
        )}
      </main>
    </StaffShell>
  );
}

function ActionButton({
  children,
  icon,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-9 items-center gap-1.5 rounded-full bg-[#26302a] px-3 text-xs font-semibold text-white disabled:opacity-50"
    >
      {icon}
      {children}
    </button>
  );
}
