export const restaurantConfig = {
  name: "The Point",
  shortName: "P",
  description: "Современная кухня с южным характером",
  story:
    "Готовим на открытом огне, выбираем сезонные продукты и подаём привычные вкусы по-новому.",
  locale: "ru-RU",
  currency: "RUB",
  contacts: {
    phone: "+7 (999) 700-07-07",
    address: "Набережная, 14",
  },
  colors: {
    cream: "#f5efe4",
    graphite: "#282724",
    terracotta: "#b9573d",
    olive: "#68705a",
  },
  coverImage:
    "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1800&q=86",
  demoTable: {
    number: 7,
    token: "table-7-the-point-demo",
  },
} as const;

export const demoTables = Array.from({ length: 10 }, (_, index) => {
  const number = index + 1;
  return {
    number,
    token:
      number === restaurantConfig.demoTable.number
        ? restaurantConfig.demoTable.token
        : `point-table-${String(number).padStart(2, "0")}-demo`,
  };
});

export function formatMoney(valueInMinorUnits: number) {
  const rounded = Math.round(valueInMinorUnits / 100);
  const sign = rounded < 0 ? "−" : "";
  const grouped = String(Math.abs(rounded)).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    "\u00a0",
  );
  return `${sign}${grouped}\u00a0₽`;
}

export function formatTime(value: string | Date) {
  return new Intl.DateTimeFormat(restaurantConfig.locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
