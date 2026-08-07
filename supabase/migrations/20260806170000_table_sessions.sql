create type public.table_session_status as enum ('open', 'closed', 'cancelled');

create sequence public.table_session_public_number_seq start 200;

create table public.table_sessions (
  id uuid primary key default gen_random_uuid(),
  public_number bigint not null unique default nextval('public.table_session_public_number_seq'),
  table_id uuid not null references public.tables(id) on delete restrict,
  status public.table_session_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create unique index one_open_session_per_table_idx
on public.table_sessions(table_id)
where status = 'open';

create index table_sessions_status_created_at_idx
on public.table_sessions(status, created_at desc);

alter table public.orders add column table_session_id uuid;

-- Existing active orders for a table become additions to one shared open check.
insert into public.table_sessions (table_id, status, created_at, updated_at)
select
  table_id,
  'open'::public.table_session_status,
  min(created_at),
  max(updated_at)
from public.orders
where status in ('new', 'accepted', 'entered')
group by table_id;

update public.orders o
set table_session_id = s.id
from public.table_sessions s
where s.table_id = o.table_id
  and s.status = 'open'
  and o.status in ('new', 'accepted', 'entered');

-- Historical closed orders receive an individual closed check.
do $$
declare
  existing_order record;
  new_session_id uuid;
begin
  for existing_order in
    select id, table_id, created_at, updated_at
    from public.orders
    where table_session_id is null
  loop
    insert into public.table_sessions (
      table_id, status, created_at, updated_at, closed_at
    ) values (
      existing_order.table_id,
      'closed',
      existing_order.created_at,
      existing_order.updated_at,
      existing_order.updated_at
    ) returning id into new_session_id;

    update public.orders
    set table_session_id = new_session_id
    where id = existing_order.id;
  end loop;
end $$;

alter table public.orders
  alter column table_session_id set not null,
  add constraint orders_table_session_id_fkey
    foreign key (table_session_id) references public.table_sessions(id) on delete restrict;

create index orders_table_session_id_idx on public.orders(table_session_id, created_at);

create trigger table_sessions_updated_at
before update on public.table_sessions
for each row execute function public.set_updated_at();

alter table public.table_sessions enable row level security;

create policy "staff can read table sessions"
on public.table_sessions for select to authenticated using (public.is_staff());

create policy "staff can update table sessions"
on public.table_sessions for update to authenticated
using (public.is_staff()) with check (public.is_staff());

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
    'sessionId', s.id,
    'sessionPublicNumber', s.public_number::text,
    'sessionStatus', s.status,
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
  join public.table_sessions s on s.id = o.table_session_id
  join public.tables t on t.id = s.table_id
  where o.id = p_order_id;
$$;

create or replace function public.table_session_as_json(p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', s.id,
    'publicNumber', s.public_number::text,
    'tableNumber', t.table_number,
    'status', s.status,
    'total', coalesce((
      select sum(o.total) from public.orders o
      where o.table_session_id = s.id and o.status <> 'cancelled'
    ), 0),
    'createdAt', s.created_at,
    'updatedAt', s.updated_at,
    'closedAt', s.closed_at,
    'orders', coalesce((
      select jsonb_agg(public.order_as_json(o.id) order by o.created_at)
      from public.orders o where o.table_session_id = s.id
    ), '[]'::jsonb)
  )
  from public.table_sessions s
  join public.tables t on t.id = s.table_id
  where s.id = p_session_id;
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
  v_session_id uuid;
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

  select id into v_session_id
  from public.table_sessions
  where table_id = v_table_id and status = 'open'
  for update;

  if v_session_id is null then
    begin
      insert into public.table_sessions (table_id)
      values (v_table_id)
      returning id into v_session_id;
    exception when unique_violation then
      select id into v_session_id
      from public.table_sessions
      where table_id = v_table_id and status = 'open'
      for update;
    end;
  end if;

  insert into public.orders (
    table_id, table_session_id, visitor_token, idempotency_key, comment, total
  ) values (
    v_table_id, v_session_id, p_visitor_token, p_idempotency_key, trim(p_comment), 0
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
  update public.table_sessions set updated_at = now() where id = v_session_id;
  return public.order_as_json(v_order_id);
end;
$$;

revoke all on function public.table_session_as_json(uuid) from public, anon, authenticated;
grant execute on function public.table_session_as_json(uuid) to service_role;
grant execute on function public.order_as_json(uuid) to service_role;
grant execute on function public.create_order(text, uuid, uuid, text, jsonb) to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'table_sessions'
  ) then
    alter publication supabase_realtime add table public.table_sessions;
  end if;
end $$;

