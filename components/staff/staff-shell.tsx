"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChartNoAxesCombined,
  ClipboardList,
  LogOut,
  QrCode,
  UtensilsCrossed,
} from "lucide-react";
import { restaurantConfig } from "@/config/restaurant";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function StaffShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const links = [
    { href: "/staff/orders", label: "Заказы", icon: ClipboardList },
    { href: "/staff/menu", label: "Стоп-лист", icon: UtensilsCrossed },
    { href: "/staff/analytics", label: "Статистика", icon: ChartNoAxesCombined },
    { href: "/staff/qr", label: "QR-коды", icon: QrCode },
  ];

  async function signOut() {
    window.localStorage.removeItem("point-demo-staff");
    await getSupabaseBrowserClient()?.auth.signOut();
    router.push("/staff/login");
  }

  return (
    <div className="min-h-screen bg-[#eee8dc] text-[#282724] lg:grid lg:grid-cols-[244px_1fr]">
      <aside className="sticky top-0 z-30 flex h-18 items-center justify-between border-b border-black/10 bg-[#26302a] px-5 text-white lg:h-screen lg:flex-col lg:items-stretch lg:border-b-0 lg:px-4 lg:py-6">
        <div className="flex min-w-0 items-center gap-2 lg:block">
          <Link href="/demo" className="flex items-center gap-3 px-2">
            <span className="grid size-10 place-items-center rounded-full bg-[#b9573d] font-display text-xl">
              {restaurantConfig.shortName}
            </span>
            <div className="hidden lg:block">
              <p className="font-display text-xl leading-none">{restaurantConfig.name}</p>
              <p className="mt-1 text-[9px] font-bold uppercase tracking-[.19em] text-white/45">
                рабочее место
              </p>
            </div>
          </Link>
          <nav className="flex items-center gap-1 lg:mt-10 lg:block lg:space-y-2" aria-label="Разделы кассира">
            {links.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition lg:px-4 lg:py-3 ${
                    active ? "bg-white text-[#26302a]" : "text-white/65 hover:bg-white/8 hover:text-white"
                  }`}
                >
                  <Icon className="size-4" />
                  <span className="hidden lg:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-1 lg:block lg:space-y-2">
          <Link href="/demo" className="hidden items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-white/55 transition hover:bg-white/8 hover:text-white lg:flex">
            <QrCode className="size-4" /> Демо-страница
          </Link>
          <button type="button" onClick={signOut} className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-white/55 transition hover:bg-white/8 hover:text-white lg:w-full lg:px-4 lg:py-3">
            <LogOut className="size-4" /> <span className="hidden lg:inline">Выйти</span>
          </button>
        </div>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
