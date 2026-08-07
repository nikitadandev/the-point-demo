"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, ExternalLink, Printer, QrCode } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { StaffShell } from "@/components/staff/staff-shell";
import { demoTables, restaurantConfig } from "@/config/restaurant";
import { isDemoMode } from "@/lib/runtime";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { resolveShareOrigin } from "@/lib/share-origin";
import { tableTokenSchema } from "@/lib/table-token";

type QrTable = { number: number; token: string };

export default function QrGeneratorPage() {
  const router = useRouter();
  const [tables, setTables] = useState<QrTable[]>(isDemoMode ? demoTables : []);
  const [tableNumber, setTableNumber] = useState(isDemoMode ? 7 : 0);
  const [token, setToken] = useState<string>(
    isDemoMode ? restaurantConfig.demoTable.token : "",
  );
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  const [tokenStatus, setTokenStatus] = useState<"saving" | "saved" | "error">("saved");
  const [tokenError, setTokenError] = useState("");
  const qrRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let active = true;
    void resolveShareOrigin().then((resolvedOrigin) => {
      if (active) setOrigin(resolvedOrigin);
    });
    void (async () => {
      if (isDemoMode) {
        const response = await fetch("/api/demo/tables", { cache: "no-store" });
        const body = (await response.json()) as QrTable[] & { error?: string };
        if (!active || !response.ok) return;
        setTables(body);
        const selected = body.find((table) => table.number === 7) ?? body[0];
        if (selected) {
          setTableNumber(selected.number);
          setToken(selected.token);
        }
      } else {
        const authSession = (await getSupabaseBrowserClient()?.auth.getSession()).data.session;
        if (!authSession) {
          router.replace("/staff/login");
          return;
        }
        const response = await fetch("/api/staff/tables", {
          headers: { authorization: `Bearer ${authSession.access_token}` },
        });
        const body = (await response.json()) as QrTable[] & { error?: string };
        if (!response.ok) return;
        if (!active) return;
        setTables(body);
        if (body[0]) {
          setTableNumber(body[0].number);
          setToken(body[0].token);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (!tableNumber) return;
    const normalized = token.trim();
    const current = tables.find((table) => table.number === tableNumber);
    if (current?.token === normalized) return;
    const parsed = tableTokenSchema.safeParse(normalized);
    if (!parsed.success) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const endpoint = isDemoMode
          ? `/api/demo/tables/${tableNumber}`
          : `/api/staff/tables/${tableNumber}`;
        const headers: Record<string, string> = { "content-type": "application/json" };
        if (!isDemoMode) {
          const authSession = (await getSupabaseBrowserClient()?.auth.getSession()).data.session;
          if (!authSession) {
            router.replace("/staff/login");
            return;
          }
          headers.authorization = `Bearer ${authSession.access_token}`;
        }
        const response = await fetch(endpoint, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ token: parsed.data }),
        });
        const body = (await response.json()) as QrTable & { error?: string };
        if (cancelled) return;
        if (!response.ok) {
          setTokenStatus("error");
          setTokenError(body.error || "Не удалось сохранить токен");
          return;
        }
        setTables((items) =>
          items.map((table) =>
            table.number === tableNumber ? { ...table, token: body.token } : table,
          ),
        );
        setTokenStatus("saved");
      })();
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [router, tableNumber, tables, token]);

  const url = useMemo(() => {
    if (!tableTokenSchema.safeParse(token.trim()).success) return "";
    try {
      const parsedOrigin = new URL(origin);
      if (!["http:", "https:"].includes(parsedOrigin.protocol)) return "";
      return new URL(`/menu/${encodeURIComponent(token.trim())}`, parsedOrigin).toString();
    } catch {
      return "";
    }
  }, [origin, token]);

  const tokenStored = tables.some(
    (table) => table.number === tableNumber && table.token === token.trim(),
  );
  const readyUrl = tokenStored ? url : "";

  function chooseTable(number: number) {
    const table = tables.find((item) => item.number === number);
    setTableNumber(number);
    setToken(table?.token ?? `point-table-${String(number).padStart(2, "0")}-demo`);
    setTokenStatus("saved");
    setTokenError("");
  }

  function changeToken(value: string) {
    setToken(value);
    const normalized = value.trim();
    const current = tables.find((table) => table.number === tableNumber);
    if (current?.token === normalized) {
      setTokenStatus("saved");
      setTokenError("");
      return;
    }
    const parsed = tableTokenSchema.safeParse(normalized);
    if (!parsed.success) {
      setTokenStatus("error");
      setTokenError(parsed.error.issues[0]?.message ?? "Некорректный токен");
      return;
    }
    setTokenStatus("saving");
    setTokenError("");
  }

  function downloadQr() {
    const canvas = qrRef.current;
    if (!canvas || !readyUrl) return;
    const link = document.createElement("a");
    link.download = `the-point-table-${tableNumber}-qr.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  async function copyUrl() {
    if (!readyUrl) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(readyUrl);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = readyUrl;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <StaffShell>
      <main className="px-4 py-6 sm:px-7 lg:px-9 lg:py-8">
        <header>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#b9573d]">
            Наглядный конструктор
          </p>
          <h1 className="mt-1 font-display text-4xl sm:text-5xl">QR-коды столов</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#777168]">
            Выберите стол, проверьте ссылку и скачайте готовый QR или распечатайте карточку.
          </p>
        </header>

        <div className="mt-7 grid gap-5 xl:grid-cols-[.78fr_1.22fr]">
          <section className="rounded-[28px] border border-black/8 bg-[#fffdf8] p-5 sm:p-7">
            <h2 className="font-display text-2xl">1. Выберите стол</h2>
            <div className="mt-5 grid grid-cols-5 gap-2">
              {tables.map((table) => (
                <button
                  key={table.number}
                  type="button"
                  onClick={() => chooseTable(table.number)}
                  className={`aspect-square rounded-2xl text-sm font-bold transition ${
                    tableNumber === table.number
                      ? "bg-[#b9573d] text-white shadow-lg"
                      : "border border-black/8 bg-[#f5efe4] hover:border-black/20"
                  }`}
                >
                  {table.number}
                </button>
              ))}
            </div>

            <label className="mt-7 block">
              <span className="text-sm font-semibold">Токен стола</span>
              <input
                value={token}
                onChange={(event) => changeToken(event.target.value)}
                className="mt-2 h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-sm outline-none focus:border-[#b9573d]/50"
              />
              <span className="mt-2 block text-xs leading-5 text-[#8a8379]">
                {tokenStatus === "saving" && "Сохраняем новый токен…"}
                {tokenStatus === "saved" && "Токен сохранён — ссылка уже работает."}
                {tokenStatus === "error" && <span className="text-red-700">{tokenError}</span>}
              </span>
            </label>

            <label className="mt-5 block">
              <span className="text-sm font-semibold">Адрес сайта</span>
              <input
                value={origin}
                onChange={(event) => setOrigin(event.target.value.replace(/\/$/, ""))}
                className="mt-2 h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-sm outline-none focus:border-[#b9573d]/50"
              />
            </label>

            <div className="mt-6 rounded-2xl bg-[#f5efe4] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[.15em] text-[#8a8379]">
                Итоговая ссылка
              </p>
              <p className={`mt-2 break-all text-xs leading-5 ${readyUrl ? "" : "text-red-700"}`}>
                {readyUrl || (tokenStatus === "saving" ? "Ссылка включится после сохранения…" : "Проверьте адрес сайта и токен стола")}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void copyUrl()}
                  disabled={!readyUrl}
                  className="flex min-h-10 items-center gap-2 rounded-full bg-white px-4 text-xs font-semibold"
                >
                  {copied ? <Check className="size-4 text-[#68705a]" /> : <Copy className="size-4" />}
                  {copied ? "Скопировано" : "Копировать"}
                </button>
                {readyUrl && (
                  <Link
                    href={readyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-h-10 items-center gap-2 rounded-full bg-white px-4 text-xs font-semibold"
                  >
                    <ExternalLink className="size-4" /> Проверить
                  </Link>
                )}
              </div>
            </div>
          </section>

          <section className="relative overflow-hidden rounded-[28px] bg-[#26302a] p-5 sm:p-9">
            <div className="absolute -right-24 -top-24 size-72 rounded-full border border-white/10" />
            <div className="relative grid gap-7 lg:grid-cols-[1fr_auto] lg:items-center">
              <div id="qr-print-card" className="mx-auto w-full max-w-[390px] rounded-[34px] bg-[#fffdf8] p-7 text-center shadow-2xl sm:p-9">
                <span className="mx-auto grid size-11 place-items-center rounded-full bg-[#b9573d] font-display text-xl text-white">
                  {restaurantConfig.shortName}
                </span>
                <p className="mt-4 font-display text-3xl">{restaurantConfig.name}</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[.18em] text-[#8a8379]">
                  Меню и заказ со стола
                </p>
                <div className="my-6 rounded-[24px] border border-black/8 bg-white p-5">
                  {readyUrl ? (
                    <QRCodeCanvas
                      ref={qrRef}
                      value={readyUrl}
                      size={290}
                      level="H"
                      marginSize={1}
                      fgColor="#282724"
                      bgColor="#ffffff"
                      title={`QR-код для стола №${tableNumber}`}
                      className="h-auto w-full"
                    />
                  ) : (
                    <div className="grid aspect-square place-items-center text-sm text-[#8a8379]">
                      Заполните корректную ссылку
                    </div>
                  )}
                </div>
                <p className="text-xs font-bold uppercase tracking-[.18em] text-[#b9573d]">
                  Ваш стол
                </p>
                <p className="mt-1 font-display text-6xl">№ {tableNumber}</p>
                <p className="mt-4 text-xs leading-5 text-[#777168]">
                  Наведите камеру телефона.<br />Номер стола определится автоматически.
                </p>
              </div>

              <div className="flex flex-row justify-center gap-2 lg:flex-col">
                <button
                  type="button"
                  onClick={downloadQr}
                  disabled={!readyUrl}
                  className="flex min-h-12 items-center gap-2 rounded-full bg-[#b9573d] px-5 text-sm font-semibold text-white disabled:opacity-45"
                >
                  <Download className="size-4" /> Скачать QR
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  disabled={!readyUrl}
                  className="flex min-h-12 items-center gap-2 rounded-full bg-white/10 px-5 text-sm font-semibold text-white disabled:opacity-45"
                >
                  <Printer className="size-4" /> Печать
                </button>
              </div>
            </div>
          </section>
        </div>

        <div className="mt-5 flex items-start gap-3 rounded-[22px] border border-[#68705a]/20 bg-[#edf0e8] p-4 text-sm leading-6 text-[#59604d]">
          <QrCode className="mt-1 size-5 shrink-0" />
          Для реального ресторана распечатайте отдельную карточку для каждого стола. Не используйте номер стола вместо уникального токена.
        </div>
      </main>
    </StaffShell>
  );
}
