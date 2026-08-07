import { describe, expect, it } from "vitest";
import { computeAnalytics } from "@/lib/analytics";
import { createClientId } from "@/lib/client-id";
import { demoSeedSessions } from "@/lib/demo-data";
import {
  calculateSessionTotal,
  canCloseSession,
  findOpenSessionForTable,
} from "@/lib/session-domain";

describe("мобильные идентификаторы", () => {
  it("создаёт UUID-совместимый id без привязки к HTTPS", () => {
    expect(createClientId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

describe("общий чек стола", () => {
  it("находит один открытый чек и объединяет дополнения", () => {
    const session = findOpenSessionForTable(demoSeedSessions, 9);
    expect(session?.orders).toHaveLength(2);
    expect(session?.total).toBe(203_000);
    expect(session && calculateSessionTotal(session)).toBe(203_000);
  });

  it("не учитывает отменённые дополнения в общей сумме", () => {
    const source = demoSeedSessions[0];
    const session = {
      ...source,
      orders: source.orders.map((order) => ({ ...order, status: "cancelled" as const })),
    };
    expect(calculateSessionTotal(session)).toBe(0);
  });

  it("не закрывает чек с позициями в работе", () => {
    expect(canCloseSession(demoSeedSessions[0])).toBe(false);
    expect(canCloseSession(demoSeedSessions[2])).toBe(true);
  });
});

describe("CRM", () => {
  it("считает доход, заказы, активные столы и топ блюд", () => {
    const summary = computeAnalytics(demoSeedSessions, 7);
    expect(summary.revenue).toBe(169_000);
    expect(summary.orderCount).toBe(4);
    expect(summary.activeTables).toBe(2);
    expect(summary.topItems[0]).toMatchObject({
      name: "Тартар из говядины",
      quantity: 2,
    });
  });
});

