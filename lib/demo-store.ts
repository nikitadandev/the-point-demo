"use client";

import { demoMenuItems, demoSeedSessions } from "@/lib/demo-data";
import { createClientId } from "@/lib/client-id";
import { priceOrderFromCatalog, type OrderDraft } from "@/lib/order-domain";
import {
  calculateSessionTotal,
  findOpenSessionForTable,
} from "@/lib/session-domain";
import type {
  CreateOrderResult,
  MenuItem,
  Order,
  OrderStatus,
  TableSession,
} from "@/lib/types";

const SESSIONS_KEY = "point-demo-sessions-v2";
const AVAILABILITY_KEY = "point-demo-availability-v2";
const CHANNEL = "point-live-demo";
const CHANGE_EVENT = "point-demo-change";

function emit(detail: { type: "orders" | "menu"; sessionId?: string }) {
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail }));
  if (typeof BroadcastChannel === "undefined") return;
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage(detail);
    channel.close();
  } catch {
    // localStorage + the in-page event remain as a mobile-safe fallback.
  }
}

export function subscribeDemoStore(callback: () => void) {
  const listener = () => callback();
  let channel: BroadcastChannel | null = null;
  try {
    channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL);
  } catch {
    channel = null;
  }
  window.addEventListener(CHANGE_EVENT, listener);
  channel?.addEventListener("message", listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
    channel?.close();
  };
}

function saveSessions(sessions: TableSession[]) {
  window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

export function getDemoSessions(): TableSession[] {
  const raw = window.localStorage.getItem(SESSIONS_KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as TableSession[];
    } catch {
      window.localStorage.removeItem(SESSIONS_KEY);
    }
  }
  saveSessions(demoSeedSessions);
  return demoSeedSessions;
}

export function getDemoOrders(): Order[] {
  return getDemoSessions().flatMap((session) => session.orders);
}

export function getDemoMenuItems(): MenuItem[] {
  let availability: Record<string, boolean> = {};
  try {
    availability = JSON.parse(
      window.localStorage.getItem(AVAILABILITY_KEY) ?? "{}",
    ) as Record<string, boolean>;
  } catch {
    window.localStorage.removeItem(AVAILABILITY_KEY);
  }
  return demoMenuItems.map((item) => ({
    ...item,
    available: availability[item.id] ?? item.available,
  }));
}

function withTotals(session: TableSession): TableSession {
  return {
    ...session,
    total: calculateSessionTotal(session),
    updatedAt: session.orders.reduce(
      (latest, order) =>
        new Date(order.updatedAt).getTime() > new Date(latest).getTime()
          ? order.updatedAt
          : latest,
      session.updatedAt,
    ),
  };
}

export function createDemoOrder(
  draft: OrderDraft,
  tableNumber: number,
): CreateOrderResult {
  const priced = priceOrderFromCatalog(draft, getDemoMenuItems());
  const sessions = getDemoSessions();
  const duplicateSession = sessions.find((session) =>
    session.orders.some((order) => order.id === `demo-${draft.idempotencyKey}`),
  );
  const duplicate = duplicateSession?.orders.find(
    (order) => order.id === `demo-${draft.idempotencyKey}`,
  );
  if (duplicate && duplicateSession) {
    return { order: duplicate, session: duplicateSession };
  }

  const now = new Date().toISOString();
  const allOrders = sessions.flatMap((session) => session.orders);
  const nextOrderNumber = String(
    Math.max(1042, ...allOrders.map((order) => Number(order.publicNumber) || 0)) + 1,
  );
  let activeSession = findOpenSessionForTable(sessions, tableNumber);
  if (!activeSession) {
    const nextCheckNumber = String(
      Math.max(200, ...sessions.map((session) => Number(session.publicNumber) || 0)) + 1,
    );
    activeSession = {
      id: `demo-session-${createClientId()}`,
      publicNumber: nextCheckNumber,
      tableNumber,
      status: "open",
      total: 0,
      createdAt: now,
      updatedAt: now,
      orders: [],
    };
  }

  const order: Order = {
    id: `demo-${draft.idempotencyKey}`,
    publicNumber: nextOrderNumber,
    sessionId: activeSession.id,
    sessionPublicNumber: activeSession.publicNumber,
    sessionStatus: "open",
    tableNumber,
    visitorToken: createClientId(),
    status: "new",
    comment: draft.comment,
    total: priced.total,
    createdAt: now,
    updatedAt: now,
    viewed: false,
    items: priced.lines.map((line) => ({
      id: createClientId(),
      menuItemId: line.item.id,
      name: line.item.name,
      basePrice: line.item.price,
      quantity: line.quantity,
      modifiers: line.modifiers,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
    })),
  };
  const updatedSession = withTotals({
    ...activeSession,
    orders: [...activeSession.orders, order],
    updatedAt: now,
  });
  const nextSessions = sessions.some((session) => session.id === updatedSession.id)
    ? sessions.map((session) =>
        session.id === updatedSession.id ? updatedSession : session,
      )
    : [updatedSession, ...sessions];
  saveSessions(nextSessions);
  emit({ type: "orders", sessionId: updatedSession.id });
  return { order, session: updatedSession };
}

export function updateDemoOrderStatus(id: string, status: OrderStatus) {
  let updatedOrder: Order | undefined;
  const sessions = getDemoSessions().map((session) => {
    if (!session.orders.some((order) => order.id === id)) return session;
    const orders = session.orders.map((order) => {
      if (order.id !== id) return order;
      updatedOrder = {
        ...order,
        status,
        viewed: true,
        updatedAt: new Date().toISOString(),
      };
      return updatedOrder;
    });
    return withTotals({ ...session, orders });
  });
  saveSessions(sessions);
  emit({ type: "orders", sessionId: updatedOrder?.sessionId });
  return updatedOrder;
}

export function markDemoOrderViewed(id: string) {
  const sessions = getDemoSessions().map((session) => ({
    ...session,
    orders: session.orders.map((order) =>
      order.id === id ? { ...order, viewed: true } : order,
    ),
  }));
  saveSessions(sessions);
  emit({ type: "orders" });
}

export function closeDemoSession(id: string) {
  const now = new Date().toISOString();
  const sessions = getDemoSessions().map((session) =>
    session.id === id
      ? {
          ...session,
          status: "closed" as const,
          closedAt: now,
          updatedAt: now,
          orders: session.orders.map((order) => ({
            ...order,
            sessionStatus: "closed" as const,
          })),
        }
      : session,
  );
  saveSessions(sessions);
  emit({ type: "orders", sessionId: id });
}

export function setDemoItemAvailability(id: string, available: boolean) {
  const current = Object.fromEntries(
    getDemoMenuItems().map((item) => [item.id, item.available]),
  );
  current[id] = available;
  window.localStorage.setItem(AVAILABILITY_KEY, JSON.stringify(current));
  emit({ type: "menu" });
}

export function getDemoOrderByVisitorToken(visitorToken: string) {
  return getDemoOrders().find((order) => order.visitorToken === visitorToken);
}

export function getDemoSessionById(id: string) {
  return getDemoSessions().find((session) => session.id === id);
}

export function getDemoOpenSessionByTable(tableNumber: number) {
  return findOpenSessionForTable(getDemoSessions(), tableNumber);
}
