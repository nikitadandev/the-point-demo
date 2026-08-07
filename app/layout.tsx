import type { Metadata } from "next";
import { headers } from "next/headers";
import { restaurantConfig } from "@/config/restaurant";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);
  const description = `${restaurantConfig.description}. Заказ со стола без ожидания официанта.`;

  return {
    metadataBase,
    title: {
      default: `${restaurantConfig.name} — QR-меню`,
      template: `%s · ${restaurantConfig.name}`,
    },
    description,
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title: `${restaurantConfig.name} — QR-меню`,
      description,
      locale: "ru_RU",
      type: "website",
      images: [{ url: "/og.png", width: 1200, height: 630, alt: "The Point — QR-меню" }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${restaurantConfig.name} — QR-меню`,
      description,
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
