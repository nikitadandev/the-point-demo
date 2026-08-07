import type { TableSession } from "@/lib/types";

export function findOpenSessionForTable(
  sessions: TableSession[],
  tableNumber: number,
) {
  return sessions.find(
    (session) => session.tableNumber === tableNumber && session.status === "open",
  );
}

export function calculateSessionTotal(session: TableSession) {
  return session.orders
    .filter((order) => order.status !== "cancelled")
    .reduce((sum, order) => sum + order.total, 0);
}

export function canCloseSession(session: TableSession) {
  return !session.orders.some((order) =>
    ["new", "accepted", "entered"].includes(order.status),
  );
}

