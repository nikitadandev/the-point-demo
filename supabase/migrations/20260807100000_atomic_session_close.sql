create or replace function public.close_table_session(p_session_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.table_sessions%rowtype;
  v_closed_at timestamptz := now();
begin
  select * into v_session
  from public.table_sessions
  where id = p_session_id
  for update;

  if v_session.id is null then
    raise exception 'Чек не найден';
  end if;
  if v_session.status <> 'open' then
    raise exception 'Чек уже закрыт';
  end if;
  if exists (
    select 1 from public.orders
    where table_session_id = p_session_id
      and status in ('new', 'accepted', 'entered')
  ) then
    raise exception 'Сначала завершите или отмените все позиции';
  end if;

  update public.table_sessions
  set status = 'closed', closed_at = v_closed_at, updated_at = v_closed_at
  where id = p_session_id;

  return v_closed_at;
end;
$$;

revoke all on function public.close_table_session(uuid) from public, anon, authenticated;
grant execute on function public.close_table_session(uuid) to service_role;
