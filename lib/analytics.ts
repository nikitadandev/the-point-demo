import type { OrderStatus, TableSession } from "@/lib/types";

export type AnalyticsPeriod = 1 | 7 | 30;

export type AnalyticsSummary = {
  revenue: number;
  orderCount: number;
  averageCheck: number;
  activeTables: number;
  cancelledCount: number;
  completedCount: number;
  revenueChange: number;
  topItems: Array<{ name: string; quantity: number; revenue: number }>;
  hourly: Array<{ hour: string; orders: number }>;
  statuses: Array<{ status: OrderStatus; count: number }>;
};

function periodRevenue(sessions: TableSession[], from: number, to: number) {
  return sessions
    .flatMap((session) => session.orders)
    .filter((order) => {
      const time = new Date(order.createdAt).getTime();
      return order.status === "completed" && time >= from && time < to;
    })
    .reduce((sum, order) => sum + order.total, 0);
}

export function computeAnalytics(
  sessions: TableSession[],
  period: AnalyticsPeriod,
  now = Date.now(),
): AnalyticsSummary {
  const periodMs = period * 24 * 60 * 60 * 1000;
  const from = now - periodMs;
  const relevantOrders = sessions
    .flatMap((session) => session.orders)
    .filter((order) => new Date(order.createdAt).getTime() >= from);
  const billableOrders = relevantOrders.filter(
    (order) => order.status !== "cancelled",
  );
  const completedOrders = relevantOrders.filter(
    (order) => order.status === "completed",
  );
  const revenue = completedOrders.reduce((sum, order) => sum + order.total, 0);
  const previousRevenue = periodRevenue(sessions, from - periodMs, from);
  const revenueChange = previousRevenue
    ? Math.round(((revenue - previousRevenue) / previousRevenue) * 100)
    : revenue > 0
      ? 100
      : 0;

  const itemMap = new Map<string, { name: string; quantity: number; revenue: number }>();
  billableOrders.forEach((order) => {
    order.items.forEach((item) => {
      const current = itemMap.get(item.menuItemId) ?? {
        name: item.name,
        quantity: 0,
        revenue: 0,
      };
      current.quantity += item.quantity;
      current.revenue += item.lineTotal;
      itemMap.set(item.menuItemId, current);
    });
  });

  const hours = new Map<number, number>();
  relevantOrders.forEach((order) => {
    const hour = new Date(order.createdAt).getHours();
    hours.set(hour, (hours.get(hour) ?? 0) + 1);
  });

  const statusOrder: OrderStatus[] = [
    "new",
    "accepted",
    "entered",
    "completed",
    "cancelled",
  ];

  return {
    revenue,
    orderCount: relevantOrders.length,
    averageCheck: billableOrders.length
      ? Math.round(
          billableOrders.reduce((sum, order) => sum + order.total, 0) /
            billableOrders.length,
        )
      : 0,
    activeTables: sessions.filter((session) => session.status === "open").length,
    cancelledCount: relevantOrders.filter((order) => order.status === "cancelled").length,
    completedCount: completedOrders.length,
    revenueChange,
    topItems: Array.from(itemMap.values())
      .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
      .slice(0, 5),
    hourly: Array.from({ length: 12 }, (_, index) => {
      const hour = 10 + index;
      return {
        hour: `${String(hour).padStart(2, "0")}:00`,
        orders: hours.get(hour) ?? 0,
      };
    }),
    statuses: statusOrder.map((status) => ({
      status,
      count: relevantOrders.filter((order) => order.status === status).length,
    })),
  };
}

