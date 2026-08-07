import { z } from "zod";
import type {
  CartLine,
  MenuItem,
  OrderStatus,
  SelectedModifier,
} from "@/lib/types";

export const orderDraftSchema = z.object({
  tableToken: z.string().min(8).max(160),
  idempotencyKey: z.string().uuid(),
  comment: z.string().trim().max(500).default(""),
  items: z
    .array(
      z.object({
        itemId: z.string().min(1).max(120),
        quantity: z.number().int().min(1).max(20),
        selectedModifierIds: z.array(z.string().min(1).max(120)).max(20),
      }),
    )
    .min(1)
    .max(50),
});

export type OrderDraft = z.infer<typeof orderDraftSchema>;

export function calculateCartTotal(lines: CartLine[]) {
  return lines.reduce((total, line) => {
    const modifierTotal = line.modifiers.reduce(
      (sum, modifier) => sum + modifier.price,
      0,
    );
    return total + (line.basePrice + modifierTotal) * line.quantity;
  }, 0);
}

export function reconcileStoredCart(value: unknown, catalog: MenuItem[]): CartLine[] {
  if (!Array.isArray(value)) return [];
  const items = new Map(catalog.map((item) => [item.id, item]));
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const stored = candidate as Partial<CartLine>;
    const item = typeof stored.itemId === "string" ? items.get(stored.itemId) : undefined;
    if (!item || !item.available || !Number.isInteger(stored.quantity)) return [];
    const quantity = Number(stored.quantity);
    if (quantity < 1 || quantity > 20 || !Array.isArray(stored.modifiers)) return [];
    const availableModifiers = new Map(
      item.modifierGroups.flatMap((group) =>
        group.modifiers
          .filter((modifier) => modifier.available !== false)
          .map((modifier) => [modifier.id, modifier] as const),
      ),
    );
    const modifierIds = stored.modifiers.flatMap((modifier) =>
      modifier && typeof modifier.id === "string" && availableModifiers.has(modifier.id)
        ? [modifier.id]
        : [],
    );
    if (new Set(modifierIds).size !== modifierIds.length) return [];
    try {
      validateAndPriceItem(item, quantity, modifierIds);
    } catch {
      return [];
    }
    const modifiers = modifierIds.map((id) => {
      const modifier = availableModifiers.get(id)!;
      return { id: modifier.id, name: modifier.name, price: modifier.price };
    });
    return [{
      key: `${item.id}:${modifierIds.slice().sort().join(",")}`,
      itemId: item.id,
      name: item.name,
      image: item.image,
      basePrice: item.price,
      quantity,
      modifiers,
    }];
  });
}

export function validateRequiredModifiers(
  item: MenuItem,
  selectedModifierIds: string[],
) {
  for (const group of item.modifierGroups) {
    const groupModifierIds = new Set(group.modifiers.map((modifier) => modifier.id));
    const selectedInGroup = selectedModifierIds.filter((id) =>
      groupModifierIds.has(id),
    );

    if (selectedInGroup.length < group.minSelected) {
      throw new Error(`Выберите: ${group.name}`);
    }

    if (selectedInGroup.length > group.maxSelected) {
      throw new Error(`Слишком много вариантов в группе «${group.name}»`);
    }
  }
}

export function validateAndPriceItem(
  item: MenuItem,
  quantity: number,
  selectedModifierIds: string[],
) {
  if (!item.available) {
    throw new Error(`«${item.name}» сейчас нет в наличии`);
  }

  validateRequiredModifiers(item, selectedModifierIds);

  const allowedModifiers = new Map(
    item.modifierGroups.flatMap((group) =>
      group.modifiers.map((modifier) => [modifier.id, modifier] as const),
    ),
  );

  const uniqueIds = new Set(selectedModifierIds);
  if (uniqueIds.size !== selectedModifierIds.length) {
    throw new Error("Один модификатор нельзя выбрать дважды");
  }

  const modifiers: SelectedModifier[] = selectedModifierIds.map((id) => {
    const modifier = allowedModifiers.get(id);
    if (!modifier || modifier.available === false) {
      throw new Error("Выбран недоступный модификатор");
    }
    return { id: modifier.id, name: modifier.name, price: modifier.price };
  });

  const unitPrice =
    item.price + modifiers.reduce((sum, modifier) => sum + modifier.price, 0);

  return {
    modifiers,
    unitPrice,
    lineTotal: unitPrice * quantity,
  };
}

export function priceOrderFromCatalog(draft: OrderDraft, catalog: MenuItem[]) {
  const itemMap = new Map(catalog.map((item) => [item.id, item]));
  const lines = draft.items.map((line) => {
    const item = itemMap.get(line.itemId);
    if (!item) throw new Error("Блюдо не найдено");
    const priced = validateAndPriceItem(
      item,
      line.quantity,
      line.selectedModifierIds,
    );
    return { item, quantity: line.quantity, ...priced };
  });

  return {
    lines,
    total: lines.reduce((sum, line) => sum + line.lineTotal, 0),
  };
}

const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
  new: ["accepted", "cancelled"],
  accepted: ["entered", "cancelled"],
  entered: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function canTransitionOrder(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  return allowedTransitions[from].includes(to);
}

export function assertStatusTransition(from: OrderStatus, to: OrderStatus) {
  if (!canTransitionOrder(from, to)) {
    throw new Error(`Недопустимый переход статуса: ${from} → ${to}`);
  }
}
