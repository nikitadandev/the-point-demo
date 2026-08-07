import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RestaurantMenu } from "@/components/menu/restaurant-menu";
import { getDemoServerMenu } from "@/lib/demo-server-store";
import { isDemoMode } from "@/lib/runtime";

export const metadata: Metadata = {
  title: "Меню",
};

export default async function MenuPage({
  params,
}: {
  params: Promise<{ tableToken: string }>;
}) {
  const { tableToken } = await params;

  const initialMenu = isDemoMode ? getDemoServerMenu(tableToken) : null;
  if (isDemoMode && !initialMenu) notFound();

  return (
    <RestaurantMenu
      tableToken={tableToken}
      initialMenu={initialMenu}
      demoMode={isDemoMode}
    />
  );
}
