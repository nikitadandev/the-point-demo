"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  CircleX,
  Clock3,
  ReceiptText,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { StaffShell } from "@/components/staff/staff-shell";
import { formatMoney } from "@/config/restaurant";
import {
  type AnalyticsPeriod,
  type AnalyticsSummary,
} from "@/lib/analytics";
import { isDemoMode } from "@/lib/runtime";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const periodOptions: Array<{ value: AnalyticsPeriod; label: string }> = [
  { value: 1, label: "Сегодня" },
  { value: 7, label: "7 дней" },
  { value: 30, label: "30 дней" },
];

const statusNames = {
  new: "Новые",
  accepted: "Приняты",
  entered: "Готовятся",
  completed: "Выполнены",
  cancelled: "Отменены",
};

export default function AnalyticsPage() {
  const router = useRouter();
  const [period, setPeriod] = useState<AnalyticsPeriod>(7);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [error, setError] = useState("");

  const loadRemote = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const authSession = (await supabase?.auth.getSession()).data.session;
    if (!authSession) {
      router.replace("/staff/login");
      return;
    }
    const response = await fetch(`/api/staff/analytics?period=${period}`, {
      headers: { authorization: `Bearer ${authSession.access_token}` },
    });
    const body = (await response.json()) as AnalyticsSummary & { error?: string };
    if (!response.ok) throw new Error(body.error || "Не удалось загрузить статистику");
    setSummary(body);
    setError("");
  }, [period, router]);

  const loadDemo = useCallback(async () => {
    const response = await fetch(`/api/demo/analytics?period=${period}`, { cache: "no-store" });
    const body = (await response.json()) as AnalyticsSummary & { error?: string };
    if (!response.ok) throw new Error(body.error || "Не удалось загрузить статистику");
    setSummary(body);
    setError("");
  }, [period]);

  useEffect(() => {
    if (isDemoMode) {
      void Promise.resolve().then(() => loadDemo().catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Ошибка статистики"),
      ));
      const timer = window.setInterval(
        () => void loadDemo().catch(() => setError("Нет связи с сервером")),
        3_000,
      );
      return () => window.clearInterval(timer);
    }
    void Promise.resolve().then(() => {
      void loadRemote().catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Ошибка статистики"),
      );
    });
  }, [loadDemo, loadRemote]);

  const maxHourly = useMemo(
    () => Math.max(1, ...(summary?.hourly.map((item) => item.orders) ?? [1])),
    [summary],
  );
  const maxStatus = useMemo(
    () => Math.max(1, ...(summary?.statuses.map((item) => item.count) ?? [1])),
    [summary],
  );

  return (
    <StaffShell>
      <main className="px-4 py-6 sm:px-7 lg:px-9 lg:py-8">
        <header className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-[#b9573d]">
              Простая CRM
            </p>
            <h1 className="mt-1 font-display text-4xl sm:text-5xl">Статистика</h1>
            <p className="mt-2 text-sm text-[#777168]">
              Главные показатели ресторана без лишних отчётов.
            </p>
          </div>
          <div className="flex rounded-full border border-black/8 bg-white/65 p-1">
            {periodOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setPeriod(option.value)}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                  period === option.value ? "bg-[#26302a] text-white" : "text-[#777168]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </header>

        {error && <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}

        {!summary ? (
          <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="h-36 animate-pulse rounded-[26px] bg-white/60" />
            ))}
          </div>
        ) : (
          <>
            <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Доход"
                value={formatMoney(summary.revenue)}
                caption={`${summary.revenueChange >= 0 ? "+" : ""}${summary.revenueChange}% к прошлому периоду`}
                icon={<Banknote className="size-5" />}
                positive={summary.revenueChange >= 0}
              />
              <MetricCard
                label="Заказов"
                value={String(summary.orderCount)}
                caption={`${summary.completedCount} выполнено`}
                icon={<ReceiptText className="size-5" />}
              />
              <MetricCard
                label="Средний чек"
                value={formatMoney(summary.averageCheck)}
                caption="без отменённых позиций"
                icon={<TrendingUp className="size-5" />}
              />
              <MetricCard
                label="Активных столов"
                value={String(summary.activeTables)}
                caption={`${summary.cancelledCount} отмен за период`}
                icon={<UsersRound className="size-5" />}
              />
            </section>

            <section className="mt-5 grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
              <article className="rounded-[28px] border border-black/8 bg-[#fffdf8] p-5 sm:p-7">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[.16em] text-[#8a8379]">
                      Нагрузка кухни
                    </p>
                    <h2 className="mt-1 font-display text-2xl">Заказы по часам</h2>
                  </div>
                  <Clock3 className="size-5 text-[#b9573d]" />
                </div>
                <div className="mt-8 flex h-48 items-end gap-2 sm:gap-3">
                  {summary.hourly.map((item) => (
                    <div key={item.hour} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                      <span className="text-[10px] font-bold text-[#777168]">{item.orders || ""}</span>
                      <div
                        className="w-full rounded-t-lg bg-[#b9573d] transition-all"
                        style={{ height: `${Math.max(4, (item.orders / maxHourly) * 145)}px` }}
                      />
                      <span className="hidden text-[9px] text-[#8a8379] sm:block">{item.hour.slice(0, 2)}</span>
                    </div>
                  ))}
                </div>
              </article>

              <article className="rounded-[28px] border border-black/8 bg-[#26302a] p-5 text-white sm:p-7">
                <p className="text-xs font-bold uppercase tracking-[.16em] text-white/45">
                  Воронка заказов
                </p>
                <h2 className="mt-1 font-display text-2xl">По статусам</h2>
                <div className="mt-7 space-y-4">
                  {summary.statuses.map((item) => (
                    <div key={item.status}>
                      <div className="flex justify-between text-xs">
                        <span className="text-white/65">{statusNames[item.status]}</span>
                        <strong>{item.count}</strong>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-[#d78369]"
                          style={{ width: `${(item.count / maxStatus) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </section>

            <section className="mt-5 grid gap-5 lg:grid-cols-[1fr_.7fr]">
              <article className="rounded-[28px] border border-black/8 bg-[#fffdf8] p-5 sm:p-7">
                <p className="text-xs font-bold uppercase tracking-[.16em] text-[#8a8379]">
                  Бестселлеры
                </p>
                <h2 className="mt-1 font-display text-2xl">Топ блюд</h2>
                <div className="mt-6 divide-y divide-black/7">
                  {summary.topItems.length ? (
                    summary.topItems.map((item, index) => (
                      <div key={item.name} className="flex items-center gap-4 py-4 first:pt-0">
                        <span className="grid size-9 place-items-center rounded-full bg-[#f0d8ce] font-display text-lg text-[#963f2c]">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{item.name}</p>
                          <p className="mt-1 text-xs text-[#8a8379]">{item.quantity} порций</p>
                        </div>
                        <strong className="text-sm">{formatMoney(item.revenue)}</strong>
                      </div>
                    ))
                  ) : (
                    <p className="py-10 text-center text-sm text-[#8a8379]">Нет данных за период</p>
                  )}
                </div>
              </article>

              <article className="rounded-[28px] border border-black/8 bg-[#fffdf8] p-5 sm:p-7">
                <p className="text-xs font-bold uppercase tracking-[.16em] text-[#8a8379]">
                  Качество смены
                </p>
                <div className="mt-6 space-y-4">
                  <div className="flex items-center justify-between rounded-2xl bg-[#edf0e8] p-4">
                    <span className="flex items-center gap-3 text-sm font-semibold text-[#59604d]">
                      <CheckCircle2 className="size-5" /> Выполнено
                    </span>
                    <strong className="font-display text-2xl">{summary.completedCount}</strong>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-red-50 p-4">
                    <span className="flex items-center gap-3 text-sm font-semibold text-red-700">
                      <CircleX className="size-5" /> Отменено
                    </span>
                    <strong className="font-display text-2xl text-red-700">{summary.cancelledCount}</strong>
                  </div>
                </div>
              </article>
            </section>
          </>
        )}
      </main>
    </StaffShell>
  );
}

function MetricCard({
  label,
  value,
  caption,
  icon,
  positive,
}: {
  label: string;
  value: string;
  caption: string;
  icon: React.ReactNode;
  positive?: boolean;
}) {
  return (
    <article className="rounded-[26px] border border-black/8 bg-[#fffdf8] p-5">
      <div className="flex items-center justify-between text-[#b9573d]">
        <span className="text-xs font-bold uppercase tracking-[.14em] text-[#8a8379]">{label}</span>
        {icon}
      </div>
      <p className="mt-5 font-display text-3xl">{value}</p>
      <p className={`mt-2 flex items-center gap-1 text-xs ${positive === false ? "text-red-700" : "text-[#777168]"}`}>
        {positive === true && <ArrowUpRight className="size-3.5 text-[#68705a]" />}
        {positive === false && <ArrowDownRight className="size-3.5" />}
        {caption}
      </p>
    </article>
  );
}
