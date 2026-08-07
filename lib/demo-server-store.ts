import "server-only";

import { demoTables } from "@/config/restaurant";
import { demoCategories, demoMenuItems, demoSeedSessions } from "@/lib/demo-data";
import {
  assertStatusTransition,
  orderDraftSchema,
  priceOrderFromCatalog,
  type OrderDraft,
} from "@/lib/order-domain";
import {
  calculateSessionTotal,
  canCloseSession,
  findOpenSessionForTable,
} from "@/lib/session-domain";
import type {
  MenuItem,
  MenuPayload,
  Order,
  OrderStatus,
  TableSession,
} from "@/lib/types";

type DemoServerState = {
  sessions: TableSession[];
  availability: Record<string, boolean>;
  tables: Array<{ number: number; token: string }>;
};

const globalDemo = globalThis as typeof globalThis & {
  __thePointDemoState?: DemoServerState;
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function state() {
  globalDemo.__thePointDemoState ??= {
    sessions: clone(demoSeedSessions),
    availability: Object.fromEntries(
      demoMenuItems.map((item) => [item.id, item.available]),
    ),
    tables: clone(demoTables),
  };
  globalDemo.__thePointDemoState.tables ??= clone(demoTables);
  return globalDemo.__thePointDemoState;
}

function menuItems(): MenuItem[] {
  const current = state();
  return demoMenuItems.map((item) => ({
    ...item,
    available: current.availability[item.id] ?? item.available,
  }));
}

function tableFromToken(tableToken: string) {
  return state().tables.find((table) => table.token === tableToken);
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

export function getDemoServerMenu(tableToken: string): MenuPayload | null {
  const table = tableFromToken(tableToken);
  if (!table) return null;
  return {
    table: { id: `table-${table.number}`, number: table.number, token: table.token },
    categories: clone(demoCategories),
    items: menuItems(),
  };
}

export function getDemoServerSessions() {
  return clone(state().sessions);
}

export function getDemoServerTables() {
  return clone(state().tables);
}

export function updateDemoServerTableToken(tableNumber: number, token: string) {
  const current = state();
  const table = current.tables.find((item) => item.number === tableNumber);
  if (!table) throw new Error("Стол не найден");
  if (current.tables.some((item) => item.number !== tableNumber && item.token === token)) {
    throw new Error("Этот токен уже используется другим столом");
  }
  table.token = token;
  return clone(table);
}

export function getDemoServerOpenSession(tableToken: string) {
  const table = tableFromToken(tableToken);
  if (!table) return undefined;
  const session = findOpenSessionForTable(state().sessions, table.number);
  return session ? clone(session) : undefined;
}

export function createDemoServerOrder(input: unknown) {
  const draft = orderDraftSchema.parse(input);
  const table = tableFromToken(draft.tableToken);
  if (!table) throw new Error("Стол не найден");
  return createOrder(draft, table.number);
}

function createOrder(draft: OrderDraft, tableNumber: number) {
  const current = state();
  const duplicateSession = current.sessions.find((session) =>
    session.orders.some((order) => order.id === `demo-${draft.idempotencyKey}`),
  );
  const duplicate = duplicateSession?.orders.find(
    (order) => order.id === `demo-${draft.idempotencyKey}`,
  );
  if (duplicate && duplicateSession) {
    return { order: clone(duplicate), session: clone(duplicateSession) };
  }

  const priced = priceOrderFromCatalog(draft, menuItems());
  const now = new Date().toISOString();
  const allOrders = current.sessions.flatMap((session) => session.orders);
  const nextOrderNumber = String(
    Math.max(1042, ...allOrders.map((order) => Number(order.publicNumber) || 0)) + 1,
  );
  let activeSession = findOpenSessionForTable(current.sessions, tableNumber);
  if (!activeSession) {
    const nextCheckNumber = String(
      Math.max(
        200,
        ...current.sessions.map((session) => Number(session.publicNumber) || 0),
      ) + 1,
    );
    activeSession = {
      id: crypto.randomUUID(),
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
    visitorToken: crypto.randomUUID(),
    status: "new",
    comment: draft.comment,
    total: priced.total,
    createdAt: now,
    updatedAt: now,
    viewed: false,
    items: priced.lines.map((line) => ({
      id: crypto.randomUUID(),
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
  current.sessions = current.sessions.some(
    (session) => session.id === updatedSession.id,
  )
    ? current.sessions.map((session) =>
        session.id === updatedSession.id ? updatedSession : session,
      )
    : [updatedSession, ...current.sessions];
  return { order: clone(order), session: clone(updatedSession) };
}

export function updateDemoServerOrder(
  id: string,
  update: { status?: OrderStatus; viewed?: true },
) {
  const current = state();
  let found: Order | undefined;
  current.sessions = current.sessions.map((session) => {
    if (!session.orders.some((order) => order.id === id)) return session;
    const orders = session.orders.map((order) => {
      if (order.id !== id) return order;
      if (update.status) assertStatusTransition(order.status, update.status);
      found = {
        ...order,
        status: update.status ?? order.status,
        viewed: update.viewed ?? order.viewed,
        updatedAt: update.status ? new Date().toISOString() : order.updatedAt,
      };
      return found;
    });
    return withTotals({ ...session, orders });
  });
  if (!found) throw new Error("Заказ не найден");
  return clone(found);
}

export function closeDemoServerSession(id: string) {
  const current = state();
  const target = current.sessions.find((session) => session.id === id);
  if (!target) throw new Error("Чек не найден");
  if (target.status !== "open") throw new Error("Чек уже закрыт");
  if (!canCloseSession(target)) {
    throw new Error("Сначала завершите или отмените все позиции");
  }
  const now = new Date().toISOString();
  const closed: TableSession = {
    ...target,
    status: "closed",
    closedAt: now,
    updatedAt: now,
    orders: target.orders.map((order) => ({
      ...order,
      sessionStatus: "closed",
    })),
  };
  current.sessions = current.sessions.map((session) =>
    session.id === id ? closed : session,
  );
  return clone(closed);
}

export function setDemoServerAvailability(id: string, available: boolean) {
  if (!demoMenuItems.some((item) => item.id === id)) {
    throw new Error("Блюдо не найдено");
  }
  state().availability[id] = available;
  return { id, available };
}
