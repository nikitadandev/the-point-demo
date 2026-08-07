"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { ArrowUpRight, Check, ChefHat, QrCode, ReceiptText } from "lucide-react";
import { restaurantConfig } from "@/config/restaurant";
import { resolveShareOrigin } from "@/lib/share-origin";

export default function DemoPage() {
  const [menuUrl, setMenuUrl] = useState("");
  const [demoToken, setDemoToken] = useState<string>(restaurantConfig.demoTable.token);

  useEffect(() => {
    let active = true;
    void Promise.all([
      resolveShareOrigin(),
      fetch("/api/demo/tables", { cache: "no-store" })
        .then((response) => response.json())
        .then((tables) => (tables as Array<{ number: number; token: string }>).find((table) => table.number === 7)?.token)
        .catch(() => undefined),
    ]).then(([origin, currentToken]) => {
      if (!active) return;
      const nextToken = currentToken ?? restaurantConfig.demoTable.token;
      setDemoToken(nextToken);
      setMenuUrl(`${origin}/menu/${nextToken}`);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="min-h-screen overflow-hidden bg-[#efe8db] px-5 py-5 text-[#282724] sm:px-8 sm:py-8 lg:px-12">
      <div className="mx-auto max-w-[1420px] overflow-hidden rounded-[28px] border border-black/10 bg-[#f8f3e9] shadow-[0_30px_100px_rgba(74,50,36,0.16)] sm:rounded-[38px]">
        <header className="flex items-center justify-between border-b border-black/10 px-6 py-5 sm:px-10">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-[#b9573d] font-display text-xl text-white">
              {restaurantConfig.shortName}
            </span>
            <div>
              <p className="font-display text-xl leading-none">{restaurantConfig.name}</p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#777168]">
                демонстрация QR-меню
              </p>
            </div>
          </div>
          <span className="hidden rounded-full border border-[#68705a]/30 bg-[#68705a]/10 px-4 py-2 text-xs font-semibold text-[#59604d] sm:block">
            Demo MVP · Live
          </span>
        </header>

        <section className="grid lg:min-h-[720px] lg:grid-cols-[1.05fr_.95fr]">
          <div className="flex flex-col justify-between px-6 py-12 sm:px-10 lg:px-16 lg:py-16">
            <div>
              <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-[#b9573d]/25 bg-[#b9573d]/8 px-4 py-2 text-xs font-semibold text-[#963f2c]">
                <span className="size-2 animate-pulse rounded-full bg-[#b9573d]" />
                Живой ресторанный сценарий
              </div>
              <h1 className="max-w-3xl font-display text-[clamp(3.4rem,7vw,7.4rem)] leading-[.82] tracking-[-.065em]">
                Заказ —<br />
                <span className="italic text-[#b9573d]">без ожидания.</span>
              </h1>
              <p className="mt-8 max-w-xl text-base leading-7 text-[#625d55] sm:text-lg">
                Гость сканирует QR своего стола, собирает заказ, а кассир сразу
                получает его и ведёт до готовности.
              </p>

              <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                <Link
                  href={`/menu/${demoToken}`}
                  className="group inline-flex min-h-14 items-center justify-center gap-3 rounded-full bg-[#b9573d] px-7 font-semibold text-white shadow-[0_14px_30px_rgba(185,87,61,.25)] transition hover:-translate-y-0.5 hover:bg-[#a64b34]"
                >
                  Открыть меню гостя
                  <ArrowUpRight className="size-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </Link>
                <Link
                  href="/staff/orders"
                  className="inline-flex min-h-14 items-center justify-center gap-3 rounded-full border border-black/15 bg-white/40 px-7 font-semibold transition hover:bg-white/80"
                >
                  Интерфейс кассира
                  <ReceiptText className="size-4" />
                </Link>
                <Link
                  href="/staff/qr"
                  className="inline-flex min-h-14 items-center justify-center gap-3 rounded-full border border-black/15 bg-white/40 px-6 font-semibold transition hover:bg-white/80"
                >
                  Создать QR
                  <QrCode className="size-4" />
                </Link>
              </div>
            </div>

            <ol className="mt-14 grid gap-5 border-t border-black/10 pt-8 sm:grid-cols-3 lg:mt-20">
              {[
                ["01", "Сканируйте", "QR определит стол №7"],
                ["02", "Закажите", "Выберите блюда и опции"],
                ["03", "Следите", "Статус обновится сам"],
              ].map(([number, title, copy]) => (
                <li key={number} className="flex gap-3 sm:block">
                  <span className="font-display text-2xl text-[#b9573d]">{number}</span>
                  <div className="sm:mt-3">
                    <p className="font-semibold">{title}</p>
                    <p className="mt-1 text-sm text-[#777168]">{copy}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="relative flex min-h-[620px] items-center justify-center overflow-hidden bg-[#28302a] p-8 sm:p-12">
            <div className="absolute -right-28 -top-28 size-80 rounded-full border border-white/10" />
            <div className="absolute -bottom-52 -left-40 size-[480px] rounded-full border border-white/10" />
            <div className="absolute left-10 top-12 text-white/20">
              <ChefHat className="size-10" strokeWidth={1.2} />
            </div>

            <div className="relative w-full max-w-[440px] rounded-[36px] bg-[#fffdf8] p-6 shadow-[0_35px_100px_rgba(0,0,0,.32)] sm:p-9">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[.2em] text-[#b9573d]">
                    Тестовый стол
                  </p>
                  <p className="mt-1 font-display text-4xl">№ 7</p>
                </div>
                <span className="grid size-11 place-items-center rounded-full bg-[#f0d8ce] text-[#b9573d]">
                  <QrCode className="size-5" />
                </span>
              </div>

              <div className="my-7 flex aspect-square items-center justify-center rounded-[26px] border border-black/10 bg-white p-5">
                {menuUrl ? (
                  <QRCodeCanvas
                    value={menuUrl}
                    size={320}
                    level="H"
                    marginSize={1}
                    fgColor="#282724"
                    bgColor="#ffffff"
                    title="QR-код меню для стола №7"
                    className="h-auto w-full"
                  />
                ) : (
                  <div className="grid size-full place-items-center text-sm text-[#8a8379]">
                    Готовим QR…
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 rounded-2xl bg-[#edf0e8] px-4 py-3 text-sm text-[#59604d]">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#68705a] text-white">
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
                Наведите камеру телефона — стол уже определён
              </div>
              <Link
                href={`/menu/${demoToken}`}
                className="mt-5 block truncate text-center text-xs font-medium text-[#777168] underline decoration-black/20 underline-offset-4"
              >
                {menuUrl ? menuUrl.replace(/^https?:\/\//, "") : "Определяем адрес для телефона…"}
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
