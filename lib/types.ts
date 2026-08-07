export type OrderStatus =
  | "new"
  | "accepted"
  | "entered"
  | "completed"
  | "cancelled";

export type TableSessionStatus = "open" | "closed" | "cancelled";

export type Modifier = {
  id: string;
  name: string;
  price: number;
  available?: boolean;
};

export type ModifierGroup = {
  id: string;
  name: string;
  required: boolean;
  minSelected: number;
  maxSelected: number;
  modifiers: Modifier[];
};

export type MenuItem = {
  id: string;
  categoryId: string;
  categoryName?: string;
  name: string;
  description: string;
  price: number;
  image: string;
  weight?: string;
  popular?: boolean;
  spicy?: boolean;
  available: boolean;
  modifierGroups: ModifierGroup[];
};

export type Category = {
  id: string;
  name: string;
  sortOrder: number;
};

export type MenuPayload = {
  table: { id: string; number: number; token: string };
  categories: Category[];
  items: MenuItem[];
};

export type SelectedModifier = {
  id: string;
  name: string;
  price: number;
};

export type CartLine = {
  key: string;
  itemId: string;
  name: string;
  image: string;
  basePrice: number;
  quantity: number;
  modifiers: SelectedModifier[];
};

export type OrderLineSnapshot = {
  id: string;
  menuItemId: string;
  name: string;
  basePrice: number;
  quantity: number;
  modifiers: SelectedModifier[];
  unitPrice: number;
  lineTotal: number;
};

export type Order = {
  id: string;
  publicNumber: string;
  sessionId: string;
  sessionPublicNumber: string;
  sessionStatus: TableSessionStatus;
  tableNumber: number;
  visitorToken: string;
  status: OrderStatus;
  comment: string;
  total: number;
  createdAt: string;
  updatedAt: string;
  viewed: boolean;
  items: OrderLineSnapshot[];
};

export type TableSession = {
  id: string;
  publicNumber: string;
  tableNumber: number;
  status: TableSessionStatus;
  total: number;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  orders: Order[];
};

export type CreateOrderResult = {
  order: Order;
  session: TableSession;
};
