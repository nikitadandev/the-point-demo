create extension if not exists pgcrypto;

create type public.order_status as enum (
  'new',
  'accepted',
  'entered',
  'completed',
  'cancelled'
);

create table public.restaurant_settings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  logo_url text,
  cover_url text,
  colors jsonb not null default '{}'::jsonb,
  contacts jsonb not null default '{}'::jsonb,
  locale text not null default 'ru-RU',
  currency text not null default 'RUB',
  updated_at timestamptz not null default now()
);

create table public.tables (
  id uuid primary key default gen_random_uuid(),
  table_number integer not null unique check (table_number > 0),
  token text not null unique check (char_length(token) >= 8),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 0,
  active boolean not null default true
);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete restrict,
  name text not null,
  description text not null default '',
  price integer not null check (price >= 0),
  image_url text not null,
  weight text,
  popular boolean not null default false,
  spicy boolean not null default false,
  available boolean not null default true,
  active boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table public.modifier_groups (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  name text not null,
  required boolean not null default false,
  min_selected integer not null default 0 check (min_selected >= 0),
  max_selected integer not null default 1 check (max_selected >= min_selected),
  sort_order integer not null default 0
);

create table public.modifiers (
  id uuid primary key default gen_random_uuid(),
  modifier_group_id uuid not null references public.modifier_groups(id) on delete cascade,
  name text not null,
  price integer not null default 0 check (price >= 0),
  available boolean not null default true,
  sort_order integer not null default 0
);

create table public.staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default 'cashier' check (role in ('cashier', 'manager')),
  created_at timestamptz not null default now()
);

create sequence public.order_public_number_seq start 1000;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  public_number bigint not null unique default nextval('public.order_public_number_seq'),
  table_id uuid not null references public.tables(id) on delete restrict,
  visitor_token uuid not null unique,
  idempotency_key uuid not null unique,
  status public.order_status not null default 'new',
  comment text not null default '' check (char_length(comment) <= 500),
  total integer not null default 0 check (total >= 0),
  viewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete restrict,
  name_snapshot text not null,
  base_price_snapshot integer not null check (base_price_snapshot >= 0),
  quantity integer not null check (quantity between 1 and 20),
  unit_price integer not null check (unit_price >= 0),
  line_total integer not null check (line_total >= 0)
);

create table public.order_item_modifiers (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  modifier_id uuid not null references public.modifiers(id) on delete restrict,
  name_snapshot text not null,
  price_snapshot integer not null check (price_snapshot >= 0)
);

create index orders_status_created_at_idx on public.orders(status, created_at desc);
create index orders_table_id_idx on public.orders(table_id);
create index order_items_order_id_idx on public.order_items(order_id);
create index modifier_groups_menu_item_id_idx on public.modifier_groups(menu_item_id);
create index modifiers_group_id_idx on public.modifiers(modifier_group_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger restaurant_settings_updated_at
before update on public.restaurant_settings
for each row execute function public.set_updated_at();

create trigger menu_items_updated_at
before update on public.menu_items
for each row execute function public.set_updated_at();

create trigger orders_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff_profiles where user_id = auth.uid()
  );
$$;

alter table public.restaurant_settings enable row level security;
alter table public.tables enable row level security;
alter table public.categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.modifier_groups enable row level security;
alter table public.modifiers enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_item_modifiers enable row level security;

create policy "public can read restaurant settings"
on public.restaurant_settings for select to anon, authenticated using (true);

create policy "public can read active categories"
on public.categories for select to anon, authenticated using (active);

create policy "public can read active menu items"
on public.menu_items for select to anon, authenticated using (active);

create policy "public can read modifier groups for active items"
on public.modifier_groups for select to anon, authenticated
using (exists (select 1 from public.menu_items where id = menu_item_id and active));

create policy "public can read modifiers for active items"
on public.modifiers for select to anon, authenticated
using (
  exists (
    select 1
    from public.modifier_groups mg
    join public.menu_items mi on mi.id = mg.menu_item_id
    where mg.id = modifier_group_id and mi.active
  )
);

create policy "staff can read own profile"
on public.staff_profiles for select to authenticated using (user_id = auth.uid());

create policy "staff can read tables"
on public.tables for select to authenticated using (public.is_staff());

create policy "staff can manage menu"
on public.menu_items for update to authenticated
using (public.is_staff()) with check (public.is_staff());

create policy "staff can read orders"
on public.orders for select to authenticated using (public.is_staff());

create policy "staff can update orders"
on public.orders for update to authenticated
using (public.is_staff()) with check (public.is_staff());

create policy "staff can read order items"
on public.order_items for select to authenticated using (public.is_staff());

create policy "staff can read order modifiers"
on public.order_item_modifiers for select to authenticated using (public.is_staff());

-- Анонимные пользователи намеренно не получают SELECT к tables/orders.
-- Токен стола и visitor_token проверяются только серверными маршрутами.

create or replace function public.order_as_json(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', o.id,
    'publicNumber', o.public_number::text,
    'tableNumber', t.table_number,
    'visitorToken', o.visitor_token,
    'status', o.status,
    'comment', o.comment,
    'total', o.total,
    'createdAt', o.created_at,
    'updatedAt', o.updated_at,
    'viewed', o.viewed_at is not null,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', oi.id,
          'menuItemId', oi.menu_item_id,
          'name', oi.name_snapshot,
          'basePrice', oi.base_price_snapshot,
          'quantity', oi.quantity,
          'unitPrice', oi.unit_price,
          'lineTotal', oi.line_total,
          'modifiers', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', oim.modifier_id,
              'name', oim.name_snapshot,
              'price', oim.price_snapshot
            ))
            from public.order_item_modifiers oim
            where oim.order_item_id = oi.id
          ), '[]'::jsonb)
        ) order by oi.id
      )
      from public.order_items oi
      where oi.order_id = o.id
    ), '[]'::jsonb)
  )
  from public.orders o
  join public.tables t on t.id = o.table_id
  where o.id = p_order_id;
$$;

create or replace function public.create_order(
  p_table_token text,
  p_idempotency_key uuid,
  p_visitor_token uuid,
  p_comment text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table_id uuid;
  v_order_id uuid;
  v_item jsonb;
  v_menu_item public.menu_items%rowtype;
  v_quantity integer;
  v_selected_ids uuid[];
  v_modifier_total integer;
  v_unit_price integer;
  v_line_total integer;
  v_order_total integer := 0;
  v_order_item_id uuid;
  v_group public.modifier_groups%rowtype;
  v_selected_count integer;
begin
  if p_comment is null or char_length(p_comment) > 500 then
    raise exception 'Комментарий слишком длинный';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'Заказ должен содержать от 1 до 50 позиций';
  end if;

  select id into v_table_id
  from public.tables
  where token = p_table_token and active = true;
  if v_table_id is null then
    raise exception 'Стол не найден';
  end if;

  select id into v_order_id
  from public.orders
  where idempotency_key = p_idempotency_key;
  if v_order_id is not null then
    return public.order_as_json(v_order_id);
  end if;

  insert into public.orders (
    table_id, visitor_token, idempotency_key, comment, total
  ) values (
    v_table_id, p_visitor_token, p_idempotency_key, trim(p_comment), 0
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item ->> 'quantity')::integer;
    if v_quantity not between 1 and 20 then
      raise exception 'Некорректное количество';
    end if;

    select * into v_menu_item
    from public.menu_items
    where id = (v_item ->> 'itemId')::uuid and active = true;
    if v_menu_item.id is null then
      raise exception 'Блюдо не найдено';
    end if;
    if not v_menu_item.available then
      raise exception 'Блюдо «%» сейчас недоступно', v_menu_item.name;
    end if;

    select coalesce(array_agg(value::uuid), array[]::uuid[])
      into v_selected_ids
    from jsonb_array_elements_text(coalesce(v_item -> 'selectedModifierIds', '[]'::jsonb));

    if cardinality(v_selected_ids) <> (
      select count(distinct id) from unnest(v_selected_ids) as selected(id)
    ) then
      raise exception 'Модификатор выбран дважды';
    end if;

    if exists (
      select 1
      from unnest(v_selected_ids) selected(id)
      left join public.modifiers m on m.id = selected.id
      left join public.modifier_groups mg on mg.id = m.modifier_group_id
      where m.id is null or not m.available or mg.menu_item_id <> v_menu_item.id
    ) then
      raise exception 'Выбран недоступный модификатор';
    end if;

    for v_group in
      select * from public.modifier_groups where menu_item_id = v_menu_item.id
    loop
      select count(*) into v_selected_count
      from public.modifiers
      where modifier_group_id = v_group.id and id = any(v_selected_ids);
      if v_selected_count < v_group.min_selected or v_selected_count > v_group.max_selected then
        raise exception 'Проверьте выбор в группе «%»', v_group.name;
      end if;
    end loop;

    select coalesce(sum(price), 0) into v_modifier_total
    from public.modifiers where id = any(v_selected_ids);
    v_unit_price := v_menu_item.price + v_modifier_total;
    v_line_total := v_unit_price * v_quantity;
    v_order_total := v_order_total + v_line_total;

    insert into public.order_items (
      order_id, menu_item_id, name_snapshot, base_price_snapshot,
      quantity, unit_price, line_total
    ) values (
      v_order_id, v_menu_item.id, v_menu_item.name, v_menu_item.price,
      v_quantity, v_unit_price, v_line_total
    ) returning id into v_order_item_id;

    insert into public.order_item_modifiers (
      order_item_id, modifier_id, name_snapshot, price_snapshot
    )
    select v_order_item_id, id, name, price
    from public.modifiers
    where id = any(v_selected_ids);
  end loop;

  update public.orders set total = v_order_total where id = v_order_id;
  return public.order_as_json(v_order_id);
end;
$$;

revoke all on function public.order_as_json(uuid) from public, anon, authenticated;
revoke all on function public.create_order(text, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.order_as_json(uuid) to service_role;
grant execute on function public.create_order(text, uuid, uuid, text, jsonb) to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'menu_items'
  ) then
    alter publication supabase_realtime add table public.menu_items;
  end if;
end $$;

