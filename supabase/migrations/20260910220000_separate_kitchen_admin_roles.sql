-- Separa definitivamente as permissões operacionais da cozinha e do administrador.
-- Execute após 20260910190000_add_order_numbers.sql em bancos existentes.

begin;

create or replace function public.is_kitchen()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_user_role() = 'kitchen', false);
$$;

revoke all on function public.is_kitchen() from public;
grant execute on function public.is_kitchen() to authenticated;

create or replace function public.get_kitchen_queue()
returns table (
  user_id uuid,
  full_name text,
  username text,
  phone text,
  motorcycle_model text,
  motorcycle_plate text,
  last_seen timestamptz,
  available_since timestamptz,
  deliveries_today integer,
  distance_today numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_kitchen() then
    raise exception 'Acesso exclusivo da cozinha';
  end if;

  return query
  select
    p.id,
    p.full_name,
    p.username,
    p.phone,
    p.motorcycle_model,
    p.motorcycle_plate,
    p.last_seen,
    a.available_since,
    count(d.id)::integer,
    coalesce(sum(d.distance_km), 0)::numeric
  from public.availability a
  join public.profiles p on p.id = a.user_id
  left join public.deliveries d
    on d.motoboy_id = p.id
    and d.status in ('completed', 'adjusted')
    and d.operational_date = (now() at time zone 'America/Sao_Paulo')::date
  where a.status = 'available'
    and p.active = true
    and p.role = 'motoboy'
  group by p.id, p.full_name, p.username, p.phone, p.motorcycle_model,
    p.motorcycle_plate, p.last_seen, a.available_since
  order by a.available_since asc, p.id asc;
end;
$$;

create or replace function public.dispatch_motoboy(
  target_motoboy_id uuid,
  delivery_order_number text default null
)
returns public.availability
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.availability;
  normalized_order text;
  existing_name text;
  existing_time text;
begin
  if not public.is_kitchen() then
    raise exception 'Acesso exclusivo da cozinha';
  end if;

  normalized_order := public.normalize_order_number(delivery_order_number);
  if normalized_order <> '' then
    select p.full_name,
      to_char(d.delivered_at at time zone 'America/Sao_Paulo', 'HH24:MI')
    into existing_name, existing_time
    from public.deliveries d
    join public.profiles p on p.id = d.motoboy_id
    where d.order_number = normalized_order
      and d.operational_date = (now() at time zone 'America/Sao_Paulo')::date
      and d.status <> 'cancelled'
    limit 1;
  end if;

  if existing_name is not null then
    raise exception 'O pedido #% já foi registrado hoje por % às %',
      normalized_order, existing_name, existing_time;
  end if;

  update public.availability
  set status = 'on_delivery', current_source = 'dispatch'
  where user_id = target_motoboy_id and status = 'available'
  returning * into result;

  if result.id is null then
    raise exception 'Este motoboy não está mais disponível';
  end if;

  if normalized_order <> '' then
    insert into public.deliveries (
      motoboy_id, order_number, distance_km, pricing_status,
      created_by, source, status
    ) values (
      target_motoboy_id, normalized_order, null, 'pending',
      auth.uid(), 'dispatch', 'in_progress'
    );
  end if;

  insert into public.audit_logs(user_id, action, entity_type, entity_id, new_data)
  values (auth.uid(), 'motoboy_dispatched', 'availability', result.id, to_jsonb(result));

  return result;
end;
$$;

commit;
