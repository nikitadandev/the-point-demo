"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, CheckCircle2, Eye, EyeOff, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { restaurantConfig } from "@/config/restaurant";
import { isDemoMode } from "@/lib/runtime";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const loginSchema = z.object({
  email: z.string().email("Введите корректную почту"),
  password: z.string().min(6, "Минимум 6 символов"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function StaffLoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: isDemoMode
      ? { email: "demo@thepoint.local", password: "demo123" }
      : undefined,
  });

  async function onSubmit(values: LoginForm) {
    setServerError("");
    if (isDemoMode) {
      if (values.email !== "demo@thepoint.local" || values.password !== "demo123") {
        setServerError("Для демо используйте данные, указанные под формой");
        return;
      }
      window.localStorage.setItem("point-demo-staff", "true");
      router.push("/staff/orders");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setServerError("Подключение к Supabase не настроено");
      return;
    }
    const { error } = await supabase.auth.signInWithPassword(values);
    if (error) {
      setServerError("Неверная почта или пароль");
      return;
    }
    router.push("/staff/orders");
  }

  return (
    <main className="grid min-h-screen bg-[#eee8dc] lg:grid-cols-[.9fr_1.1fr]">
      <section className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md rounded-[34px] border border-black/8 bg-[#fffdf8] p-6 shadow-[0_24px_90px_rgba(68,48,36,.12)] sm:p-9">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-full bg-[#b9573d] font-display text-2xl text-white">
              {restaurantConfig.shortName}
            </span>
            <div>
              <p className="font-display text-2xl">{restaurantConfig.name}</p>
              <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#8a8379]">для сотрудников</p>
            </div>
          </div>
          <h1 className="mt-10 font-display text-5xl leading-none">Вход в смену</h1>
          <p className="mt-3 text-sm leading-6 text-[#777168]">
            Заказы гостей, статусы и стоп-лист — в одном рабочем окне.
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5" noValidate>
            <label className="block">
              <span className="text-sm font-semibold">Рабочая почта</span>
              <input type="email" autoComplete="email" {...register("email")} className="mt-2 h-13 w-full rounded-2xl border border-black/10 bg-white px-4 outline-none transition focus:border-[#b9573d]/50" />
              {errors.email && <span className="mt-1 block text-xs text-red-700">{errors.email.message}</span>}
            </label>
            <label className="block">
              <span className="text-sm font-semibold">Пароль</span>
              <span className="relative mt-2 block">
                <input type={showPassword ? "text" : "password"} autoComplete="current-password" {...register("password")} className="h-13 w-full rounded-2xl border border-black/10 bg-white px-4 pr-12 outline-none transition focus:border-[#b9573d]/50" />
                <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"} className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-[#8a8379] hover:bg-black/5">{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
              </span>
              {errors.password && <span className="mt-1 block text-xs text-red-700">{errors.password.message}</span>}
            </label>

            {serverError && <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{serverError}</p>}

            <button type="submit" disabled={isSubmitting} className="flex min-h-14 w-full items-center justify-between rounded-full bg-[#26302a] px-6 font-semibold text-white transition hover:bg-[#354038] disabled:cursor-wait disabled:opacity-60">
              <span>{isSubmitting ? "Входим…" : "Открыть рабочее место"}</span>
              <ArrowRight className="size-4" />
            </button>
          </form>

          {isDemoMode && (
            <div className="mt-6 rounded-2xl bg-[#edf0e8] p-4 text-xs leading-5 text-[#59604d]">
              <p className="flex items-center gap-2 font-bold"><CheckCircle2 className="size-4" /> Демо-доступ уже заполнен</p>
              <p className="mt-1">demo@thepoint.local · demo123</p>
            </div>
          )}
        </div>
      </section>

      <section className="relative hidden overflow-hidden bg-[#26302a] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-40 -top-40 size-[520px] rounded-full border border-white/10" />
        <div className="absolute -bottom-64 -left-40 size-[620px] rounded-full border border-white/10" />
        <LockKeyhole className="relative size-10 text-[#dca08e]" strokeWidth={1.4} />
        <div className="relative max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[.22em] text-[#dca08e]">Панель кассира</p>
          <h2 className="mt-5 font-display text-[clamp(4rem,6vw,7rem)] leading-[.88] tracking-[-.05em]">
            Ни один заказ не потеряется.
          </h2>
          <div className="mt-10 grid grid-cols-3 gap-4">
            {["Сразу на экране", "Статусы в один клик", "Стоп-лист онлайн"].map((item, index) => (
              <div key={item} className="border-t border-white/20 pt-4">
                <span className="text-xs text-white/40">0{index + 1}</span>
                <p className="mt-2 text-sm font-medium text-white/80">{item}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-white/35">Только для авторизованных сотрудников</p>
      </section>
    </main>
  );
}
