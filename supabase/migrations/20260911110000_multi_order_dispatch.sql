-- Permite reservar e despachar vários pedidos para o mesmo motoboy.
-- Execute após 20260910220000_separate_kitchen_admin_roles.sql.

begin;

drop index if exists public.deliveries_one_active_per_motoboy;
create index if not exists deliveries_active_motoboy_idx
  on public.deliveries (motoboy_id, created_at)
  where status = 'in_progress';

drop function if exists public.dispatch_motoboy(uuid, text);
create or replace function public.dispatch_motoboy(
  target_motoboy_id uuid,
  delivery_order_numbers text[] default '{}'::text[]
)
returns public.availability
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.availability;
  raw_order text;
  normalized_order text;
  normalized_orders text[] := '{}'::text[];
  existing_order text;
  existing_name text;
  existing_time text;
begin
  if not public.is_kitchen() then
    raise exception 'Acesso exclusivo da cozinha';
  end if;

  if cardinality(coalesce(delivery_order_numbers, '{}'::text[])) > 20 then
    raise exception 'É possível despachar até 20 pedidos por vez';
  end if;

  foreach raw_order in array coalesce(delivery_order_numbers, '{}'::text[]) loop
    normalized_order := public.normalize_order_number(raw_order);
    if normalized_order <> '' then
      if normalized_order = any(normalized_orders) then
        raise exception 'O pedido #% está repetido neste despacho', normalized_order;
      end if;
      normalized_orders := array_append(normalized_orders, normalized_order);
    end if;
  end loop;

  if cardinality(normalized_orders) > 0 then
    select d.order_number, p.full_name,
      to_char(d.delivered_at at time zone 'America/Sao_Paulo', 'HH24:MI')
    into existing_order, existing_name, existing_time
    from public.deliveries d
    join public.profiles p on p.id = d.motoboy_id
    where d.order_number = any(normalized_orders)
      and d.operational_date = (now() at time zone 'America/Sao_Paulo')::date
      and d.status <> 'cancelled'
    order by d.delivered_at desc
    limit 1;
  end if;

  if existing_order is not null then
    raise exception 'O pedido #% já foi registrado hoje por % às %',
      existing_order, existing_name, existing_time;
  end if;

  update public.availability
  set status = 'on_delivery', current_source = 'dispatch'
  where user_id = target_motoboy_id and status = 'available'
  returning * into result;

  if result.id is null then
    raise exception 'Este motoboy não está mais disponível';
  end if;

  if cardinality(normalized_orders) > 0 then
    insert into public.deliveries (
      motoboy_id, order_number, distance_km, pricing_status,
      created_by, source, status
    )
    select target_motoboy_id, item, null, 'pending', auth.uid(), 'dispatch', 'in_progress'
    from unnest(normalized_orders) as item;
  end if;

  insert into public.audit_logs(user_id, action, entity_type, entity_id, new_data)
  values (
    auth.uid(), 'motoboy_dispatched', 'availability', result.id,
    to_jsonb(result) || jsonb_build_object('order_numbers', normalized_orders)
  );

  return result;
end;
$$;

drop function if exists public.finish_dispatched_delivery(text, numeric, text, boolean);
create or replace function public.finish_dispatched_delivery(
  target_delivery_id uuid,
  delivery_order_number text,
  delivery_distance_km numeric,
  delivery_notes text default null,
  return_to_available boolean default true
)
returns public.deliveries
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.deliveries;
  current_status text;
  normalized_order text;
  remaining_orders integer;
begin
  if not public.can_operate_motoboy(auth.uid()) then
    raise exception 'Acesso negado';
  end if;

  select status into current_status
  from public.availability
  where user_id = auth.uid()
  for update;

  if current_status <> 'on_delivery' then
    raise exception 'Não existe entrega em andamento';
  end if;

  if target_delivery_id is not null then
    update public.deliveries
    set distance_km = delivery_distance_km,
      notes = nullif(trim(delivery_notes), ''),
      status = 'completed',
      pricing_status = 'automatic',
      delivered_at = now()
    where id = target_delivery_id
      and motoboy_id = auth.uid()
      and status = 'in_progress'
    returning * into result;

    if result.id is null then
      raise exception 'Pedido em andamento não encontrado';
    end if;
  else
    if exists (
      select 1 from public.deliveries
      where motoboy_id = auth.uid() and status = 'in_progress'
    ) then
      raise exception 'Selecione um dos pedidos em andamento para finalizar';
    end if;

    normalized_order := public.normalize_order_number(delivery_order_number);
    if normalized_order = '' then
      raise exception 'Informe o número do pedido';
    end if;
    if exists (
      select 1 from public.deliveries
      where order_number = normalized_order
        and operational_date = (now() at time zone 'America/Sao_Paulo')::date
        and status <> 'cancelled'
    ) then
      raise exception 'O pedido #% já foi registrado hoje', normalized_order;
    end if;

    insert into public.deliveries (
      motoboy_id, order_number, distance_km, pricing_status,
      notes, created_by, source, status
    ) values (
      auth.uid(), normalized_order, delivery_distance_km, 'automatic',
      nullif(trim(delivery_notes), ''), auth.uid(), 'dispatch', 'completed'
    ) returning * into result;
  end if;

  select count(*) into remaining_orders
  from public.deliveries
  where motoboy_id = auth.uid() and status = 'in_progress';

  if remaining_orders = 0 then
    update public.availability
    set status = case when return_to_available then 'available' else 'offline' end,
      available_since = case when return_to_available then now() else null end,
      current_source = null
    where user_id = auth.uid();
  end if;

  return result;
end;
$$;

revoke all on function public.dispatch_motoboy(uuid, text[]) from public;
revoke all on function public.finish_dispatched_delivery(uuid, text, numeric, text, boolean) from public;
grant execute on function public.dispatch_motoboy(uuid, text[]) to authenticated;
grant execute on function public.finish_dispatched_delivery(uuid, text, numeric, text, boolean) to authenticated;

commit;
