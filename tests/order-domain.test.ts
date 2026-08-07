import { describe, expect, it } from "vitest";
import { formatMoney } from "@/config/restaurant";
import { tableTokenSchema } from "@/lib/table-token";
import { demoMenuItems } from "@/lib/demo-data";
import {
  assertStatusTransition,
  calculateCartTotal,
  canTransitionOrder,
  orderDraftSchema,
  priceOrderFromCatalog,
  reconcileStoredCart,
  validateAndPriceItem,
  validateRequiredModifiers,
} from "@/lib/order-domain";

describe("расчёт корзины", () => {
  it("форматирует сумму одинаково на сервере и мобильном браузере", () => {
    expect(formatMoney(169_000)).toBe("1\u00a0690\u00a0₽");
  });

  it("учитывает количество и выбранные модификаторы", () => {
    expect(
      calculateCartTotal([
        {
          key: "steak:pepper",
          itemId: "steak",
          name: "Стейк",
          image: "image.jpg",
          basePrice: 169_000,
          quantity: 2,
          modifiers: [{ id: "pepper", name: "Перечный", price: 12_000 }],
        },
      ]),
    ).toBe(362_000);
  });

  it("безопасно восстанавливает корзину и обновляет цены из каталога", () => {
    expect(reconcileStoredCart({ broken: true }, demoMenuItems)).toEqual([]);
    expect(
      reconcileStoredCart(
        [{
          key: "old",
          itemId: "lemonade",
          name: "Старое название",
          image: "old.jpg",
          basePrice: 1,
          quantity: 2,
          modifiers: [{ id: "lemonade-500", name: "Старый объём", price: 1 }],
        }],
        demoMenuItems,
      ),
    ).toMatchObject([
      {
        key: "lemonade:lemonade-500",
        name: "Лимонад тархун — груша",
        basePrice: 32_000,
        quantity: 2,
        modifiers: [{ id: "lemonade-500", name: "500 мл", price: 14_000 }],
      },
    ]);
  });

  it("удаляет из сохранённой корзины стоп-позиции", () => {
    expect(
      reconcileStoredCart(
        [{
          key: "pavlova:",
          itemId: "pavlova",
          name: "Павлова",
          image: "old.jpg",
          basePrice: 52_000,
          quantity: 1,
          modifiers: [],
        }],
        demoMenuItems,
      ),
    ).toEqual([]);
  });
});

describe("обязательные модификаторы", () => {
  const steak = demoMenuItems.find((item) => item.id === "steak")!;

  it("отклоняет позицию без обязательной прожарки", () => {
    expect(() => validateRequiredModifiers(steak, [])).toThrow("Прожарка");
  });

  it("принимает ровно один вариант обязательной группы", () => {
    expect(() =>
      validateRequiredModifiers(steak, ["steak-medium"]),
    ).not.toThrow();
  });
});

describe("серверная валидация заказа", () => {
  it("принимает URL-безопасный токен стола и отклоняет пробелы", () => {
    expect(tableTokenSchema.safeParse("point-table-07-new").success).toBe(true);
    expect(tableTokenSchema.safeParse("новый токен со пробелами").success).toBe(false);
  });

  it("отклоняет пустой заказ и некорректное количество", () => {
    expect(
      orderDraftSchema.safeParse({
        tableToken: "table-7-the-point-demo",
        idempotencyKey: "11111111-1111-4111-a111-111111111111",
        comment: "",
        items: [],
      }).success,
    ).toBe(false);

    expect(
      orderDraftSchema.safeParse({
        tableToken: "table-7-the-point-demo",
        idempotencyKey: "22222222-2222-4222-a222-222222222222",
        comment: "",
        items: [
          { itemId: "tea", quantity: 0, selectedModifierIds: [] },
        ],
      }).success,
    ).toBe(false);
  });

  it("пересчитывает цену только по каталогу", () => {
    const draft = orderDraftSchema.parse({
      tableToken: "table-7-the-point-demo",
      idempotencyKey: "33333333-3333-4333-a333-333333333333",
      comment: "",
      items: [
        {
          itemId: "lemonade",
          quantity: 2,
          selectedModifierIds: ["lemonade-500"],
        },
      ],
    });
    expect(priceOrderFromCatalog(draft, demoMenuItems).total).toBe(92_000);
  });
});

describe("недоступное блюдо", () => {
  it("не позволяет заказать позицию из стоп-листа", () => {
    const pavlova = demoMenuItems.find((item) => item.id === "pavlova")!;
    expect(() => validateAndPriceItem(pavlova, 1, [])).toThrow(
      "нет в наличии",
    );
  });
});

describe("переходы статусов", () => {
  it("разрешает рабочий маршрут new → accepted → entered → completed", () => {
    expect(canTransitionOrder("new", "accepted")).toBe(true);
    expect(canTransitionOrder("accepted", "entered")).toBe(true);
    expect(canTransitionOrder("entered", "completed")).toBe(true);
  });

  it("запрещает пропуск этапа и изменение закрытого заказа", () => {
    expect(() => assertStatusTransition("new", "completed")).toThrow();
    expect(() => assertStatusTransition("completed", "accepted")).toThrow();
  });
});
