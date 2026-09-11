-- Octopus Motoboy Control
-- Execute todo este arquivo no SQL Editor de um projeto Supabase novo.

create extension if not exists pgcrypto;

do $$ begin
  create type public.user_role as enum ('motoboy', 'kitchen', 'admin');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 3 and 120),
  username text not null unique check (username = lower(username) and char_length(username) between 3 and 40),
  phone text not null check (char_length(phone) between 10 and 20),
  email text not null,
  motorcycle_model text,
  motorcycle_plate text,
  role public.user_role not null default 'motoboy',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen timestamptz
);

create table if not exists public.availability (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique constraint availability_user_id_fkey references public.profiles(id) on delete cascade,
  is_available boolean not null default false,
  available_since timestamptz,
  updated_at timestamptz not null default now(),
  constraint available_since_consistency check (
    (is_available = true and available_since is not null)
    or (is_available = false and available_since is null)
  )
);

create index if not exists availability_queue_idx
  on public.availability (available_since asc)
  where is_available = true;
create index if not exists profiles_role_active_idx on public.profiles (role, active);
create index if not exists profiles_full_name_idx on public.profiles (lower(full_name));

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists availability_set_updated_at on public.availability;
create trigger availability_set_updated_at before update on public.availability
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
begin
  requested_username := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1))));

  insert into public.profiles (
    id, full_name, username, phone, email, motorcycle_model, motorcycle_plate, role
  ) values (
    new.id,
    trim(coalesce(new.raw_user_meta_data ->> 'full_name', 'Novo motoboy')),
    requested_username,
    trim(coalesce(new.raw_user_meta_data ->> 'phone', 'Não informado')),
    new.email,
    nullif(trim(new.raw_user_meta_data ->> 'motorcycle_model'), ''),
    nullif(upper(trim(new.raw_user_meta_data ->> 'motorcycle_plate')), ''),
    'motoboy'
  );

  insert into public.availability (user_id, is_available, available_since)
  values (new.id, false, null);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Funções auxiliares SECURITY DEFINER evitam recursão nas policies de profiles.
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid() and active = true;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_user_role() = 'admin', false);
$$;

create or replace function public.is_kitchen()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_user_role() = 'kitchen', false);
$$;

create or replace function public.can_operate_motoboy(target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = target_id and id = auth.uid() and role = 'motoboy' and active = true
  );
$$;

alter table public.profiles enable row level security;
alter table public.availability enable row level security;

drop policy if exists profiles_select_by_role on public.profiles;
create policy profiles_select_by_role on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or public.is_admin()
  or (
    public.current_user_role() = 'kitchen'
    and role = 'motoboy'
    and active = true
    and exists (
      select 1 from public.availability a
      where a.user_id = profiles.id and a.is_available = true
    )
  )
);

drop policy if exists profiles_update_self_or_admin on public.profiles;
create policy profiles_update_self_or_admin on public.profiles
for update to authenticated
using ((id = auth.uid() and role = 'motoboy' and active = true) or public.is_admin())
with check ((id = auth.uid() and role = 'motoboy' and active = true) or public.is_admin());

drop policy if exists availability_select_by_role on public.availability;
create policy availability_select_by_role on public.availability
for select to authenticated
using (
  user_id = auth.uid()
  or public.is_admin()
  or (public.current_user_role() = 'kitchen' and is_available = true)
);

drop policy if exists availability_insert_self_or_admin on public.availability;
create policy availability_insert_self_or_admin on public.availability
for insert to authenticated
with check (public.can_operate_motoboy(user_id) or public.is_admin());

drop policy if exists availability_update_self_or_admin on public.availability;
create policy availability_update_self_or_admin on public.availability
for update to authenticated
using (public.can_operate_motoboy(user_id) or public.is_admin())
with check (public.can_operate_motoboy(user_id) or public.is_admin());

drop policy if exists availability_delete_admin on public.availability;
create policy availability_delete_admin on public.availability
for delete to authenticated
using (public.is_admin());

-- Operações administrativas passam por RPCs auditáveis e não dependem do frontend.
create or replace function public.admin_update_profile(
  target_user_id uuid,
  new_full_name text,
  new_username text,
  new_phone text,
  new_motorcycle_model text,
  new_motorcycle_plate text,
  new_role public.user_role,
  new_active boolean
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.profiles;
begin
  if not public.is_admin() then
    raise exception 'Acesso negado';
  end if;
  if target_user_id = auth.uid() and (new_role <> 'admin' or new_active = false) then
    raise exception 'Você não pode remover seu próprio acesso administrativo';
  end if;

  update public.profiles set
    full_name = trim(new_full_name),
    username = lower(trim(new_username)),
    phone = trim(new_phone),
    motorcycle_model = nullif(trim(new_motorcycle_model), ''),
    motorcycle_plate = nullif(upper(trim(new_motorcycle_plate)), ''),
    role = new_role,
    active = new_active
  where id = target_user_id
  returning * into result;

  if result.id is null then raise exception 'Usuário não encontrado'; end if;
  return result;
end;
$$;

create or replace function public.admin_delete_user(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Acesso negado'; end if;
  if target_user_id = auth.uid() then raise exception 'Você não pode excluir sua própria conta'; end if;
  delete from auth.users where id = target_user_id;
end;
$$;

-- Privilégios por coluna impedem alteração direta de role/active/email no cliente.
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (full_name, username, phone, motorcycle_model, motorcycle_plate, last_seen) on public.profiles to authenticated;
grant select, insert, update, delete on table public.availability to authenticated;

revoke all on function public.admin_update_profile(uuid, text, text, text, text, text, public.user_role, boolean) from public;
revoke all on function public.admin_delete_user(uuid) from public;
grant execute on function public.admin_update_profile(uuid, text, text, text, text, text, public.user_role, boolean) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
revoke all on function public.is_kitchen() from public;
grant execute on function public.is_kitchen() to authenticated;
grant execute on function public.can_operate_motoboy(uuid) to authenticated;

-- Inclui as tabelas no Realtime sem falhar se o script for executado novamente.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'availability'
  ) then
    alter publication supabase_realtime add table public.availability;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;

alter table public.availability replica identity full;
alter table public.profiles replica identity full;

-- ================================================================
-- EVOLUÇÃO: STATUS, ENTREGAS, RELATÓRIOS E PAGAMENTOS
-- Este bloco é idempotente e pode ser executado sobre a versão anterior.
-- ================================================================

alter table public.availability add column if not exists status text not null default 'offline';
alter table public.availability add column if not exists current_source text;
update public.availability set status = case when is_available then 'available' else 'offline' end
where status = 'offline' and is_available = true;

do $$ begin
  alter table public.availability add constraint availability_status_check check (status in ('offline', 'available', 'on_delivery'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.availability add constraint availability_source_check check (current_source is null or current_source in ('dispatch', 'manual'));
exception when duplicate_object then null; end $$;

create or replace function public.sync_availability_status()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status and new.is_available is distinct from old.is_available then
    new.status := case when new.is_available then 'available' else 'offline' end;
  end if;
  new.is_available := new.status = 'available';
  if new.status = 'available' then
    new.available_since := coalesce(new.available_since, now());
    new.current_source := null;
  else
    new.available_since := null;
    if new.status <> 'on_delivery' then new.current_source := null; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists availability_sync_status on public.availability;
create trigger availability_sync_status before insert or update on public.availability
for each row execute function public.sync_availability_status();

create or replace function public.reset_non_motoboy_availability()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role <> 'motoboy' or new.active = false then
    update public.availability set status = 'offline', current_source = null where user_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_reset_availability_on_role on public.profiles;
create trigger profiles_reset_availability_on_role after update of role, active on public.profiles
for each row when (old.role is distinct from new.role or old.active is distinct from new.active) execute function public.reset_non_motoboy_availability();

create table if not exists public.payment_closings (
  id uuid primary key default gen_random_uuid(),
  motoboy_id uuid not null constraint payment_closings_motoboy_id_fkey references public.profiles(id) on delete restrict,
  start_date date not null,
  end_date date not null,
  deliveries_count integer not null check (deliveries_count > 0),
  total_distance_km numeric(12,2) not null check (total_distance_km > 0),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  status text not null default 'closed' check (status in ('open', 'closed', 'paid')),
  created_at timestamptz not null default now(),
  closed_by uuid not null references public.profiles(id) on delete restrict,
  paid_at timestamptz,
  constraint payment_closing_dates check (start_date <= end_date)
);

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  motoboy_id uuid not null constraint deliveries_motoboy_id_fkey references public.profiles(id) on delete restrict,
  distance_km numeric(8,2) not null check (distance_km > 0),
  calculated_value numeric(10,2),
  final_value numeric(10,2),
  pricing_status text not null check (pricing_status in ('automatic', 'pending', 'adjusted')),
  notes text check (char_length(notes) <= 500),
  delivered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'completed' check (status in ('completed', 'cancelled', 'adjusted')),
  source text not null check (source in ('dispatch', 'manual')),
  payment_closing_id uuid references public.payment_closings(id) on delete restrict
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

-- Canal operacional sem dados financeiros para atualizar a cozinha em entregas manuais.
create table if not exists public.delivery_activity (
  motoboy_id uuid primary key references public.profiles(id) on delete cascade,
  updated_at timestamptz not null default now()
);

create index if not exists deliveries_motoboy_date_idx on public.deliveries (motoboy_id, delivered_at desc);
create index if not exists deliveries_period_idx on public.deliveries (delivered_at desc) where status <> 'cancelled';
create index if not exists deliveries_closing_idx on public.deliveries (payment_closing_id);
create index if not exists payment_closings_motoboy_idx on public.payment_closings (motoboy_id, end_date desc);
create index if not exists audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);

create or replace function public.notify_delivery_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.delivery_activity(motoboy_id, updated_at) values (new.motoboy_id, now())
  on conflict (motoboy_id) do update set updated_at = excluded.updated_at;
  return new;
end;
$$;
drop trigger if exists deliveries_notify_activity on public.deliveries;
create trigger deliveries_notify_activity after insert or update on public.deliveries
for each row execute function public.notify_delivery_activity();

create or replace function public.calculate_delivery_price(distance_km numeric)
returns numeric language sql immutable set search_path = '' as $$
  select case
    when distance_km <= 0 then null
    when distance_km <= 4 then 6.00::numeric
    when distance_km <= 5 then 7.00::numeric
    when distance_km <= 6 then 8.00::numeric
    when distance_km <= 7 then 9.50::numeric
    when distance_km <= 8 then 11.00::numeric
    when distance_km <= 10 then 15.00::numeric
    when distance_km <= 12 then 17.00::numeric
    when distance_km <= 13 then 19.00::numeric
    else null
  end;
$$;

create or replace function public.secure_delivery_pricing()
returns trigger language plpgsql security definer set search_path = '' as $$
declare official_price numeric(10,2);
begin
  if new.distance_km <= 0 then raise exception 'A quilometragem deve ser maior que zero'; end if;
  official_price := public.calculate_delivery_price(new.distance_km);
  new.calculated_value := official_price;
  if public.is_admin() and new.pricing_status = 'adjusted' and new.final_value is not null then
    if new.final_value < 0 then raise exception 'O valor final não pode ser negativo'; end if;
  elsif official_price is null then
    new.pricing_status := 'pending'; new.final_value := null;
  else
    new.pricing_status := 'automatic'; new.final_value := official_price;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists deliveries_secure_pricing on public.deliveries;
create trigger deliveries_secure_pricing before insert or update of distance_km, final_value, pricing_status on public.deliveries
for each row execute function public.secure_delivery_pricing();

create or replace function public.audit_delivery_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare audit_action text;
begin
  if old.status is distinct from new.status and new.status = 'cancelled' then audit_action := 'delivery_cancelled';
  elsif old.payment_closing_id is distinct from new.payment_closing_id then audit_action := 'delivery_added_to_closing';
  elsif old.distance_km is distinct from new.distance_km then audit_action := 'distance_changed';
  elsif old.final_value is distinct from new.final_value then audit_action := 'value_changed';
  else return new;
  end if;
  insert into public.audit_logs(user_id, action, entity_type, entity_id, old_data, new_data)
  values (auth.uid(), audit_action, 'delivery', new.id, to_jsonb(old), to_jsonb(new));
  return new;
end;
$$;
drop trigger if exists deliveries_audit_update on public.deliveries;
create trigger deliveries_audit_update after update on public.deliveries
for each row execute function public.audit_delivery_change();

create or replace function public.audit_payment_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_logs(user_id, action, entity_type, entity_id, old_data, new_data)
  values (auth.uid(), case when tg_op = 'INSERT' then 'payment_closed' else 'payment_marked_paid' end, 'payment_closing', new.id, case when tg_op = 'UPDATE' then to_jsonb(old) else null end, to_jsonb(new));
  return new;
end;
$$;
drop trigger if exists payment_closings_audit_insert on public.payment_closings;
create trigger payment_closings_audit_insert after insert on public.payment_closings for each row execute function public.audit_payment_change();
drop trigger if exists payment_closings_audit_update on public.payment_closings;
create trigger payment_closings_audit_update after update on public.payment_closings for each row execute function public.audit_payment_change();

create or replace function public.set_my_status(requested_status text)
returns public.availability language plpgsql security definer set search_path = '' as $$
declare result public.availability; current_status text;
begin
  if requested_status not in ('offline', 'available') then raise exception 'Status inválido'; end if;
  if not public.can_operate_motoboy(auth.uid()) then raise exception 'Conta sem permissão ou desativada'; end if;
  select status into current_status from public.availability where user_id = auth.uid();
  if current_status = 'on_delivery' then raise exception 'Finalize a entrega antes de alterar o status'; end if;
  update public.availability set status = requested_status, available_since = case when requested_status = 'available' then now() else null end
  where user_id = auth.uid() returning * into result;
  return result;
end;
$$;

create or replace function public.get_my_queue_position()
returns integer language sql stable security definer set search_path = '' as $$
  select position::integer from (
    select user_id, row_number() over (order by available_since asc, user_id asc) position
    from public.availability where status = 'available'
  ) queue where user_id = auth.uid();
$$;

create or replace function public.get_kitchen_queue()
returns table (
  user_id uuid, full_name text, username text, phone text, motorcycle_model text,
  motorcycle_plate text, last_seen timestamptz, available_since timestamptz,
  deliveries_today integer, distance_today numeric
) language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_kitchen() then raise exception 'Acesso exclusivo da cozinha'; end if;
  return query
  select p.id, p.full_name, p.username, p.phone, p.motorcycle_model, p.motorcycle_plate, p.last_seen, a.available_since,
    count(d.id)::integer, coalesce(sum(d.distance_km), 0)::numeric
  from public.availability a join public.profiles p on p.id = a.user_id
  left join public.deliveries d on d.motoboy_id = p.id and d.status <> 'cancelled'
    and (d.delivered_at at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date
  where a.status = 'available' and p.active = true and p.role = 'motoboy'
  group by p.id, p.full_name, p.username, p.phone, p.motorcycle_model, p.motorcycle_plate, p.last_seen, a.available_since
  order by a.available_since asc, p.id asc;
end;
$$;

create or replace function public.dispatch_motoboy(target_motoboy_id uuid)
returns public.availability language plpgsql security definer set search_path = '' as $$
declare result public.availability;
begin
  if not public.is_kitchen() then raise exception 'Acesso exclusivo da cozinha'; end if;
  update public.availability set status = 'on_delivery', current_source = 'dispatch'
  where user_id = target_motoboy_id and status = 'available' returning * into result;
  if result.id is null then raise exception 'Este motoboy não está mais disponível'; end if;
  insert into public.audit_logs(user_id, action, entity_type, entity_id, new_data)
  values (auth.uid(), 'motoboy_dispatched', 'availability', result.id, to_jsonb(result));
  return result;
end;
$$;

create or replace function public.register_manual_delivery(delivery_distance_km numeric, delivery_notes text default null)
returns public.deliveries language plpgsql security definer set search_path = '' as $$
declare result public.deliveries; current_status text;
begin
  if not public.can_operate_motoboy(auth.uid()) then raise exception 'Acesso negado'; end if;
  select status into current_status from public.availability where user_id = auth.uid();
  if current_status = 'on_delivery' then raise exception 'Finalize a entrega em andamento antes do registro manual'; end if;
  insert into public.deliveries(motoboy_id, distance_km, pricing_status, notes, created_by, source)
  values (auth.uid(), delivery_distance_km, 'automatic', nullif(trim(delivery_notes), ''), auth.uid(), 'manual') returning * into result;
  return result;
end;
$$;

create or replace function public.finish_dispatched_delivery(delivery_distance_km numeric, delivery_notes text default null, return_to_available boolean default true)
returns public.deliveries language plpgsql security definer set search_path = '' as $$
declare result public.deliveries; current_status text;
begin
  if not public.can_operate_motoboy(auth.uid()) then raise exception 'Acesso negado'; end if;
  select status into current_status from public.availability where user_id = auth.uid() for update;
  if current_status <> 'on_delivery' then raise exception 'Não existe entrega em andamento'; end if;
  insert into public.deliveries(motoboy_id, distance_km, pricing_status, notes, created_by, source)
  values (auth.uid(), delivery_distance_km, 'automatic', nullif(trim(delivery_notes), ''), auth.uid(), 'dispatch') returning * into result;
  update public.availability set status = case when return_to_available then 'available' else 'offline' end,
    available_since = case when return_to_available then now() else null end, current_source = null
  where user_id = auth.uid();
  return result;
end;
$$;

create or replace function public.motoboy_update_delivery(target_delivery_id uuid, new_distance_km numeric, new_notes text default null)
returns public.deliveries language plpgsql security definer set search_path = '' as $$
declare result public.deliveries;
begin
  update public.deliveries set distance_km = new_distance_km, notes = nullif(trim(new_notes), ''), status = 'adjusted', pricing_status = 'automatic'
  where id = target_delivery_id and motoboy_id = auth.uid() and status <> 'cancelled' and payment_closing_id is null
    and delivered_at >= now() - interval '10 minutes' returning * into result;
  if result.id is null then raise exception 'O prazo de correção expirou ou a entrega já foi fechada'; end if;
  return result;
end;
$$;

create or replace function public.motoboy_cancel_delivery(target_delivery_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.deliveries set status = 'cancelled'
  where id = target_delivery_id and motoboy_id = auth.uid() and status <> 'cancelled' and payment_closing_id is null
    and delivered_at >= now() - interval '10 minutes';
  if not found then raise exception 'O prazo de cancelamento expirou ou a entrega já foi fechada'; end if;
end;
$$;

create or replace function public.admin_update_delivery(target_delivery_id uuid, new_distance_km numeric, new_notes text default null, adjusted_final_value numeric default null)
returns public.deliveries language plpgsql security definer set search_path = '' as $$
declare result public.deliveries;
begin
  if not public.is_admin() then raise exception 'Acesso negado'; end if;
  update public.deliveries set distance_km = new_distance_km, notes = nullif(trim(new_notes), ''), final_value = adjusted_final_value,
    pricing_status = case when adjusted_final_value is null then 'automatic' else 'adjusted' end, status = 'adjusted'
  where id = target_delivery_id and payment_closing_id is null and status <> 'cancelled' returning * into result;
  if result.id is null then raise exception 'Entrega fechada, cancelada ou não encontrada'; end if;
  return result;
end;
$$;

create or replace function public.admin_cancel_delivery(target_delivery_id uuid)
returns public.deliveries language plpgsql security definer set search_path = '' as $$
declare result public.deliveries;
begin
  if not public.is_admin() then raise exception 'Acesso negado'; end if;
  update public.deliveries set status = 'cancelled' where id = target_delivery_id and payment_closing_id is null returning * into result;
  if result.id is null then raise exception 'Entrega fechada ou não encontrada'; end if;
  return result;
end;
$$;

create or replace function public.create_payment_closing(target_motoboy_id uuid, period_start date, period_end date)
returns public.payment_closings language plpgsql security definer set search_path = '' as $$
declare result public.payment_closings; item_count integer; distance_total numeric; amount_total numeric; pending_count integer;
begin
  if not public.is_admin() then raise exception 'Acesso negado'; end if;
  if period_start > period_end then raise exception 'Período inválido'; end if;
  perform 1 from public.profiles where id = target_motoboy_id and role = 'motoboy' for update;
  if not found then raise exception 'Motoboy não encontrado'; end if;
  select count(*) filter (where pricing_status = 'pending'), count(*), coalesce(sum(distance_km),0), coalesce(sum(final_value),0)
  into pending_count, item_count, distance_total, amount_total from public.deliveries
  where motoboy_id = target_motoboy_id and status <> 'cancelled' and payment_closing_id is null
    and (delivered_at at time zone 'America/Sao_Paulo')::date between period_start and period_end;
  if pending_count > 0 then raise exception 'Existem entregas com valor pendente neste período'; end if;
  if item_count = 0 then raise exception 'Nenhuma entrega em aberto neste período'; end if;
  insert into public.payment_closings(motoboy_id, start_date, end_date, deliveries_count, total_distance_km, total_amount, status, closed_by)
  values (target_motoboy_id, period_start, period_end, item_count, distance_total, amount_total, 'closed', auth.uid()) returning * into result;
  update public.deliveries set payment_closing_id = result.id where motoboy_id = target_motoboy_id and status <> 'cancelled'
    and payment_closing_id is null and (delivered_at at time zone 'America/Sao_Paulo')::date between period_start and period_end;
  return result;
end;
$$;

create or replace function public.preview_payment_closing(target_motoboy_id uuid, period_start date, period_end date)
returns table(deliveries_count bigint, total_distance_km numeric, total_amount numeric, pending_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Acesso negado'; end if;
  return query select count(*), coalesce(sum(d.distance_km), 0), coalesce(sum(d.final_value), 0), count(*) filter (where d.pricing_status = 'pending')
  from public.deliveries d where d.motoboy_id = target_motoboy_id and d.status <> 'cancelled' and d.payment_closing_id is null
    and (d.delivered_at at time zone 'America/Sao_Paulo')::date between period_start and period_end;
end;
$$;

create or replace function public.mark_payment_paid(closing_id uuid)
returns public.payment_closings language plpgsql security definer set search_path = '' as $$
declare result public.payment_closings;
begin
  if not public.is_admin() then raise exception 'Acesso negado'; end if;
  update public.payment_closings set status = 'paid', paid_at = now() where id = closing_id and status = 'closed' returning * into result;
  if result.id is null then raise exception 'Fechamento não encontrado ou já pago'; end if;
  return result;
end;
$$;

alter table public.deliveries enable row level security;
alter table public.payment_closings enable row level security;
alter table public.audit_logs enable row level security;
alter table public.delivery_activity enable row level security;
drop policy if exists deliveries_select_own_or_admin on public.deliveries;
create policy deliveries_select_own_or_admin on public.deliveries for select to authenticated using (motoboy_id = auth.uid() or public.is_admin());
drop policy if exists closings_select_own_or_admin on public.payment_closings;
create policy closings_select_own_or_admin on public.payment_closings for select to authenticated using (motoboy_id = auth.uid() or public.is_admin());
drop policy if exists audit_select_admin on public.audit_logs;
create policy audit_select_admin on public.audit_logs for select to authenticated using (public.is_admin());
drop policy if exists delivery_activity_select_operational on public.delivery_activity;
create policy delivery_activity_select_operational on public.delivery_activity for select to authenticated
using (motoboy_id = auth.uid() or coalesce(public.current_user_role()::text, '') in ('kitchen', 'admin'));

revoke all on table public.deliveries, public.payment_closings, public.audit_logs from anon, authenticated;
grant select on table public.deliveries, public.payment_closings to authenticated;
grant select on table public.audit_logs to authenticated;
grant select on table public.delivery_activity to authenticated;
-- Status só pode mudar pelas funções de fluxo; ninguém escreve diretamente na tabela.
revoke insert, update, delete on table public.availability from authenticated;

-- Usuários com histórico financeiro são preservados; devem ser desativados, não apagados.
create or replace function public.admin_delete_user(target_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Acesso negado'; end if;
  if target_user_id = auth.uid() then raise exception 'Você não pode excluir sua própria conta'; end if;
  if exists (select 1 from public.deliveries where motoboy_id = target_user_id)
    or exists (select 1 from public.payment_closings where motoboy_id = target_user_id or closed_by = target_user_id) then
    raise exception 'Este usuário possui histórico financeiro. Desative a conta para preservar a auditoria';
  end if;
  delete from auth.users where id = target_user_id;
end;
$$;

revoke all on function public.set_my_status(text), public.get_my_queue_position(), public.get_kitchen_queue(), public.dispatch_motoboy(uuid), public.register_manual_delivery(numeric,text), public.finish_dispatched_delivery(numeric,text,boolean), public.motoboy_update_delivery(uuid,numeric,text), public.motoboy_cancel_delivery(uuid), public.admin_update_delivery(uuid,numeric,text,numeric), public.admin_cancel_delivery(uuid), public.create_payment_closing(uuid,date,date), public.preview_payment_closing(uuid,date,date), public.mark_payment_paid(uuid) from public;
grant execute on function public.set_my_status(text), public.get_my_queue_position(), public.get_kitchen_queue(), public.dispatch_motoboy(uuid), public.register_manual_delivery(numeric,text), public.finish_dispatched_delivery(numeric,text,boolean), public.motoboy_update_delivery(uuid,numeric,text), public.motoboy_cancel_delivery(uuid), public.admin_update_delivery(uuid,numeric,text,numeric), public.admin_cancel_delivery(uuid), public.create_payment_closing(uuid,date,date), public.preview_payment_closing(uuid,date,date), public.mark_payment_paid(uuid) to authenticated;
grant execute on function public.calculate_delivery_price(numeric) to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'deliveries') then
    alter publication supabase_realtime add table public.deliveries;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'payment_closings') then
    alter publication supabase_realtime add table public.payment_closings;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'delivery_activity') then
    alter publication supabase_realtime add table public.delivery_activity;
  end if;
end $$;
alter table public.deliveries replica identity full;
alter table public.payment_closings replica identity full;
alter table public.delivery_activity replica identity full;

-- ================================================================
-- EVOLUÇÃO: IDENTIFICAÇÃO POR NÚMERO DO PEDIDO
-- Mantém zeros à esquerda e permite repetição somente em outros dias.
-- ================================================================

create or replace function public.normalize_order_number(value text)
returns text language sql immutable set search_path = '' as $$
  select upper(regexp_replace(trim(coalesce(value, '')), '\s+', '', 'g'));
$$;

alter table public.deliveries add column if not exists order_number text;
alter table public.deliveries add column if not exists operational_date date;
update public.deliveries set order_number = 'LEGACY-' || upper(substr(id::text, 1, 8))
where order_number is null or public.normalize_order_number(order_number) = '';
update public.deliveries set order_number = public.normalize_order_number(order_number);
update public.deliveries set operational_date = (delivered_at at time zone 'America/Sao_Paulo')::date where operational_date is null;
alter table public.deliveries alter column order_number set not null;
alter table public.deliveries alter column operational_date set default ((now() at time zone 'America/Sao_Paulo')::date);
alter table public.deliveries alter column operational_date set not null;
alter table public.deliveries alter column distance_km drop not null;

alter table public.deliveries drop constraint if exists deliveries_status_check;
alter table public.deliveries add constraint deliveries_status_check check (status in ('pending', 'in_progress', 'completed', 'cancelled', 'adjusted'));
alter table public.deliveries drop constraint if exists deliveries_distance_km_check;
alter table public.deliveries add constraint deliveries_distance_km_check check (distance_km is null or distance_km > 0);
do $$ begin
  alter table public.deliveries add constraint deliveries_order_number_not_empty check (public.normalize_order_number(order_number) <> '');
exception when duplicate_object then null; end $$;

drop index if exists public.deliveries_order_date_unique;
create unique index deliveries_order_date_unique on public.deliveries (order_number, operational_date) where status <> 'cancelled';
create unique index if not exists deliveries_one_active_per_motoboy on public.deliveries (motoboy_id) where status = 'in_progress';
create index if not exists deliveries_order_search_idx on public.deliveries (order_number, delivered_at desc);

create or replace function public.secure_delivery_pricing()
returns trigger language plpgsql security definer set search_path = '' as $$
declare official_price numeric(10,2);
begin
  new.order_number := public.normalize_order_number(new.order_number);
  if new.order_number = '' then raise exception 'Informe o número do pedido'; end if;
  new.operational_date := coalesce(new.operational_date, (now() at time zone 'America/Sao_Paulo')::date);
  if new.status = 'in_progress' then
    new.distance_km := null; new.calculated_value := null; new.final_value := null; new.pricing_status := 'pending'; new.updated_at := now();
    return new;
  end if;
  if new.distance_km is null or new.distance_km <= 0 then raise exception 'A quilometragem deve ser maior que zero'; end if;
  official_price := public.calculate_delivery_price(new.distance_km);
  new.calculated_value := official_price;
  if public.is_admin() and new.pricing_status = 'adjusted' and new.final_value is not null then
    if new.final_value < 0 then raise exception 'O valor final não pode ser negativo'; end if;
  elsif official_price is null then new.pricing_status := 'pending'; new.final_value := null;
  else new.pricing_status := 'automatic'; new.final_value := official_price;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists deliveries_secure_pricing on public.deliveries;
create trigger deliveries_secure_pricing before insert or update of order_number, distance_km, final_value, pricing_status, status on public.deliveries
for each row execute function public.secure_delivery_pricing();

create or replace function public.audit_delivery_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare audit_action text;
begin
  if old.order_number is distinct from new.order_number then audit_action := 'order_number_changed';
  elsif old.motoboy_id is distinct from new.motoboy_id then audit_action := 'motoboy_changed';
  elsif old.distance_km is distinct from new.distance_km then audit_action := 'distance_changed';
  elsif old.calculated_value is distinct from new.calculated_value or old.final_value is distinct from new.final_value then audit_action := 'value_changed';
  elsif old.status is distinct from new.status and new.status = 'cancelled' then audit_action := 'delivery_cancelled';
  elsif old.status is distinct from new.status then audit_action := 'status_changed';
  elsif old.payment_closing_id is distinct from new.payment_closing_id then audit_action := 'delivery_added_to_closing';
  else return new;
  end if;
  insert into public.audit_logs(user_id, action, entity_type, entity_id, old_data, new_data)
  values (auth.uid(), audit_action, 'delivery', new.id, to_jsonb(old), to_jsonb(new));
  return new;
end;
$$;

drop function if exists public.dispatch_motoboy(uuid);
create or replace function public.dispatch_motoboy(target_motoboy_id uuid, delivery_order_number text default null)
returns public.availability language plpgsql security definer set search_path = '' as $$
declare result public.availability; normalized_order text; existing_name text; existing_time text;
begin
  if not public.is_kitchen() then raise exception 'Acesso exclusivo da cozinha'; end if;
  normalized_order := public.normalize_order_number(delivery_order_number);
  if normalized_order <> '' then
    select p.full_name, to_char(d.delivered_at at time zone 'America/Sao_Paulo', 'HH24:MI') into existing_name, existing_time
    from public.deliveries d join public.profiles p on p.id = d.motoboy_id
    where d.order_number = normalized_order and d.operational_date = (now() at time zone 'America/Sao_Paulo')::date and d.status <> 'cancelled' limit 1;
  end if;
  if existing_name is not null then
    raise exception 'O pedido #% já foi registrado hoje por % às %', normalized_order, existing_name, existing_time;
  end if;
  update public.availability set status = 'on_delivery', current_source = 'dispatch'
  where user_id = target_motoboy_id and status = 'available' returning * into result;
  if result.id is null then raise exception 'Este motoboy não está mais disponível'; end if;
  if normalized_order <> '' then
    insert into public.deliveries(motoboy_id, order_number, distance_km, pricing_status, created_by, source, status)
    values (target_motoboy_id, normalized_order, null, 'pending', auth.uid(), 'dispatch', 'in_progress');
  end if;
  insert into public.audit_logs(user_id, action, entity_type, entity_id, new_data)
  values (auth.uid(), 'motoboy_dispatched', 'availability', result.id, to_jsonb(result));
  return result;
end;
$$;

drop function if exists public.register_manual_delivery(numeric,text);
create or replace function public.register_manual_delivery(delivery_order_number text, delivery_distance_km numeric, delivery_notes text default null)
returns public.deliveries language plpgsql security definer set search_path = '' as $$
declare result public.deliveries; current_status text; normalized_order text;
begin
  if not public.can_operate_motoboy(auth.uid()) then raise exception 'Acesso negado'; end if;
  select status into current_status from public.availability where user_id = auth.uid();
  if current_status = 'on_delivery' then raise exception 'Finalize a entrega em andamento antes do registro manual'; end if;
  normalized_order := public.normalize_order_number(delivery_order_number);
  if normalized_order = '' then raise exception 'Informe o número do pedido'; end if;
  if exists (select 1 from public.deliveries where order_number = normalized_order and operational_date = (now() at time zone 'America/Sao_Paulo')::date and status <> 'cancelled') then raise exception 'O pedido #% já foi registrado hoje', normalized_order; end if;
  insert into public.deliveries(motoboy_id, order_number, distance_km, pricing_status, notes, created_by, source, status)
  values (auth.uid(), normalized_order, delivery_distance_km, 'automatic', nullif(trim(delivery_notes), ''), auth.uid(), 'manual', 'completed') returning * into result;
  return result;
end;
$$;

drop function if exists public.finish_dispatched_delivery(numeric,text,boolean);
create or replace function public.finish_dispatched_delivery(delivery_order_number text, delivery_distance_km numeric, delivery_notes text default null, return_to_available boolean default true)
returns public.deliveries language plpgsql security definer set search_path = '' as $$
declare result public.deliveries; current_status text; normalized_order text; active_id uuid; reserved_order text;
begin
  if not public.can_operate_motoboy(auth.uid()) then raise exception 'Acesso negado'; end if;
  select status into current_status from public.availability where user_id = auth.uid() for update;
  if current_status <> 'on_delivery' then raise exception 'Não existe entrega em andamento'; end if;
  select id, order_number into active_id, reserved_order from public.deliveries where motoboy_id = auth.uid() and status = 'in_progress' for update;
  if active_id is not null then
    update public.deliveries set distance_km = delivery_distance_km, notes = nullif(trim(delivery_notes), ''), status = 'completed', pricing_status = 'automatic', delivered_at = now()
    where id = active_id returning * into result;
  else
    normalized_order := public.normalize_order_number(delivery_order_number);
    if normalized_order = '' then raise exception 'Informe o número do pedido'; end if;
    if exists (select 1 from public.deliveries where order_number = normalized_order and operational_date = (now() at time zone 'America/Sao_Paulo')::date and status <> 'cancelled') then raise exception 'O pedido #% já foi registrado hoje', normalized_order; end if;
    insert into public.deliveries(motoboy_id, order_number, distance_km, pricing_status, notes, created_by, source, status)
    values (auth.uid(), normalized_order, delivery_distance_km, 'automatic', nullif(trim(delivery_notes), ''), auth.uid(), 'dispatch', 'completed') returning * into result;
  end if;
  update public.availability set status = case when return_to_available then 'available' else 'offline' end,
    available_since = case when return_to_available then now() else null end, current_source = null where user_id = auth.uid();
  return result;
end;
$$;

drop function if exists public.motoboy_update_delivery(uuid,numeric,text);
create or replace function public.motoboy_update_delivery(target_delivery_id uuid, new_order_number text, new_distance_km numeric, new_notes text default null)
returns public.deliveries language plpgsql security definer set search_path = '' as $$
declare result public.deliveries; normalized_order text; delivery_date date;
begin
  normalized_order := public.normalize_order_number(new_order_number);
  select operational_date into delivery_date from public.deliveries where id = target_delivery_id and motoboy_id = auth.uid();
  if normalized_order = '' then raise exception 'Informe o número do pedido'; end if;
  if exists (select 1 from public.deliveries where order_number = normalized_order and operational_date = delivery_date and id <> target_delivery_id and status <> 'cancelled') then raise exception 'O pedido #% já foi registrado nesta data', normalized_order; end if;
  update public.deliveries set order_number = normalized_order, distance_km = new_distance_km, notes = nullif(trim(new_notes), ''), status = 'adjusted', pricing_status = 'automatic'
  where id = target_delivery_id and motoboy_id = auth.uid() and status in ('completed','adjusted') and payment_closing_id is null and delivered_at >= now() - interval '10 minutes' returning * into result;
  if result.id is null then raise exception 'O prazo de correção expirou ou a entrega já foi fechada'; end if;
  return result;
end;
$$;

drop function if exists public.admin_update_delivery(uuid,numeric,text,numeric);
create or replace function public.admin_update_delivery(target_delivery_id uuid, new_order_number text, new_distance_km numeric, new_notes text default null, adjusted_final_value numeric default null)
returns public.deliveries language plpgsql security definer set search_path = '' as $$
declare result public.deliveries; normalized_order text; delivery_date date;
begin
  if not public.is_admin() then raise exception 'Acesso negado'; end if;
  normalized_order := public.normalize_order_number(new_order_number);
  select operational_date into delivery_date from public.deliveries where id = target_delivery_id;
  if normalized_order = '' then raise exception 'Informe o número do pedido'; end if;
  if exists (select 1 from public.deliveries where order_number = normalized_order and operational_date = delivery_date and id <> target_delivery_id and status <> 'cancelled') then raise exception 'O pedido #% já foi registrado nesta data', normalized_order; end if;
  update public.deliveries set order_number = normalized_order, distance_km = new_distance_km, notes = nullif(trim(new_notes), ''), final_value = adjusted_final_value,
    pricing_status = case when adjusted_final_value is null then 'automatic' else 'adjusted' end, status = 'adjusted'
  where id = target_delivery_id and payment_closing_id is null and status in ('completed','adjusted') returning * into result;
  if result.id is null then raise exception 'Entrega fechada, em andamento, cancelada ou não encontrada'; end if;
  return result;
end;
$$;

-- Fechamentos ignoram pedidos ainda em andamento.
create or replace function public.preview_payment_closing(target_motoboy_id uuid, period_start date, period_end date)
returns table(deliveries_count bigint, total_distance_km numeric, total_amount numeric, pending_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Acesso negado'; end if;
  return query select count(*), coalesce(sum(d.distance_km), 0), coalesce(sum(d.final_value), 0), count(*) filter (where d.pricing_status = 'pending')
  from public.deliveries d where d.motoboy_id = target_motoboy_id and d.status in ('completed','adjusted') and d.payment_closing_id is null
    and d.operational_date between period_start and period_end;
end;
$$;

create or replace function public.create_payment_closing(target_motoboy_id uuid, period_start date, period_end date)
returns public.payment_closings language plpgsql security definer set search_path = '' as $$
declare result public.payment_closings; item_count integer; distance_total numeric; amount_total numeric; pending_count integer;
begin
  if not public.is_admin() then raise exception 'Acesso negado'; end if;
  if period_start > period_end then raise exception 'Período inválido'; end if;
  perform 1 from public.profiles where id = target_motoboy_id and role = 'motoboy' for update;
  if not found then raise exception 'Motoboy não encontrado'; end if;
  select count(*) filter (where pricing_status = 'pending'), count(*), coalesce(sum(distance_km),0), coalesce(sum(final_value),0)
  into pending_count, item_count, distance_total, amount_total from public.deliveries
  where motoboy_id = target_motoboy_id and status in ('completed','adjusted') and payment_closing_id is null and operational_date between period_start and period_end;
  if pending_count > 0 then raise exception 'Existem entregas com valor pendente neste período'; end if;
  if item_count = 0 then raise exception 'Nenhuma entrega em aberto neste período'; end if;
  insert into public.payment_closings(motoboy_id, start_date, end_date, deliveries_count, total_distance_km, total_amount, status, closed_by)
  values (target_motoboy_id, period_start, period_end, item_count, distance_total, amount_total, 'closed', auth.uid()) returning * into result;
  update public.deliveries set payment_closing_id = result.id where motoboy_id = target_motoboy_id and status in ('completed','adjusted')
    and payment_closing_id is null and operational_date between period_start and period_end;
  return result;
end;
$$;

create or replace function public.get_kitchen_queue()
returns table (user_id uuid, full_name text, username text, phone text, motorcycle_model text, motorcycle_plate text, last_seen timestamptz, available_since timestamptz, deliveries_today integer, distance_today numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_kitchen() then raise exception 'Acesso exclusivo da cozinha'; end if;
  return query select p.id, p.full_name, p.username, p.phone, p.motorcycle_model, p.motorcycle_plate, p.last_seen, a.available_since,
    count(d.id)::integer, coalesce(sum(d.distance_km), 0)::numeric
  from public.availability a join public.profiles p on p.id = a.user_id
  left join public.deliveries d on d.motoboy_id = p.id and d.status in ('completed','adjusted') and d.operational_date = (now() at time zone 'America/Sao_Paulo')::date
  where a.status = 'available' and p.active = true and p.role = 'motoboy'
  group by p.id, p.full_name, p.username, p.phone, p.motorcycle_model, p.motorcycle_plate, p.last_seen, a.available_since
  order by a.available_since asc, p.id asc;
end;
$$;

revoke all on function public.dispatch_motoboy(uuid,text), public.register_manual_delivery(text,numeric,text), public.finish_dispatched_delivery(text,numeric,text,boolean), public.motoboy_update_delivery(uuid,text,numeric,text), public.admin_update_delivery(uuid,text,numeric,text,numeric) from public;
grant execute on function public.dispatch_motoboy(uuid,text), public.register_manual_delivery(text,numeric,text), public.finish_dispatched_delivery(text,numeric,text,boolean), public.motoboy_update_delivery(uuid,text,numeric,text), public.admin_update_delivery(uuid,text,numeric,text,numeric) to authenticated;
grant execute on function public.normalize_order_number(text) to authenticated;

-- ================================================================
-- EVOLUÇÃO: DESPACHO COM VÁRIOS PEDIDOS
-- Cada pedido mantém KM, preço, status e auditoria independentes.
-- ================================================================

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

-- ================================================================
-- EVOLUÇÃO: WEB PUSH E CHAMADA SIMPLES DA COZINHA
-- A cozinha chama o motoboy sem cadastrar ou reservar pedidos.
-- ================================================================

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_length check (char_length(endpoint) between 20 and 2048),
  constraint push_subscriptions_p256dh_length check (char_length(p256dh) between 20 and 512),
  constraint push_subscriptions_auth_length check (char_length(auth_key) between 8 and 256)
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
drop trigger if exists push_subscriptions_set_updated_at on public.push_subscriptions;
create trigger push_subscriptions_set_updated_at before update on public.push_subscriptions
for each row execute function public.set_updated_at();

alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from anon, authenticated;
grant select, delete on table public.push_subscriptions to service_role;

create or replace function public.save_my_push_subscription(
  subscription_endpoint text,
  subscription_p256dh text,
  subscription_auth text,
  device_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_id uuid;
begin
  if not public.can_operate_motoboy(auth.uid()) then
    raise exception 'Acesso exclusivo do motoboy';
  end if;
  if subscription_endpoint is null
    or subscription_endpoint !~ '^https://'
    or char_length(subscription_endpoint) not between 20 and 2048
    or char_length(coalesce(subscription_p256dh, '')) not between 20 and 512
    or char_length(coalesce(subscription_auth, '')) not between 8 and 256 then
    raise exception 'Assinatura de notificação inválida';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth_key, user_agent)
  values (
    auth.uid(), subscription_endpoint, subscription_p256dh,
    subscription_auth, left(nullif(trim(device_user_agent), ''), 500)
  )
  on conflict (endpoint) do update set
    user_id = excluded.user_id,
    p256dh = excluded.p256dh,
    auth_key = excluded.auth_key,
    user_agent = excluded.user_agent,
    updated_at = now()
  returning id into saved_id;
  return saved_id;
end;
$$;

create or replace function public.delete_my_push_subscription(subscription_endpoint text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed_count integer;
begin
  delete from public.push_subscriptions
  where user_id = auth.uid() and endpoint = subscription_endpoint;
  get diagnostics removed_count = row_count;
  return removed_count > 0;
end;
$$;

revoke all on function public.save_my_push_subscription(text, text, text, text) from public;
revoke all on function public.delete_my_push_subscription(text) from public;
grant execute on function public.save_my_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.delete_my_push_subscription(text) to authenticated;

drop function if exists public.dispatch_motoboy(uuid, text[]);
drop function if exists public.dispatch_motoboy(uuid, text);
drop function if exists public.dispatch_motoboy(uuid);

create function public.dispatch_motoboy(target_motoboy_id uuid)
returns public.availability
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.availability;
begin
  if not public.is_kitchen() then
    raise exception 'Acesso exclusivo da cozinha';
  end if;

  update public.availability
  set status = 'on_delivery', current_source = 'dispatch'
  where user_id = target_motoboy_id and status = 'available'
  returning * into result;

  if result.id is null then
    raise exception 'Este motoboy não está mais disponível';
  end if;

  insert into public.audit_logs(user_id, action, entity_type, entity_id, new_data)
  values (
    auth.uid(), 'motoboy_dispatched', 'availability', result.id,
    to_jsonb(result) || jsonb_build_object('push_requested', true)
  );
  return result;
end;
$$;

revoke all on function public.dispatch_motoboy(uuid) from public;
grant execute on function public.dispatch_motoboy(uuid) to authenticated;

-- ================================================================
-- EVOLUÇÃO: FINALIZAÇÃO DE CHAMADA SEM PEDIDO
-- Finalizar a corrida apenas devolve o motoboy ao fim da fila.
-- ================================================================

drop function if exists public.finish_dispatched_delivery(uuid, text, numeric, text, boolean);
drop function if exists public.finish_dispatched_delivery(text, numeric, text, boolean);
drop function if exists public.finish_dispatched_delivery(numeric, text, boolean);
drop function if exists public.finish_dispatch_call();

create function public.finish_dispatch_call()
returns public.availability
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.availability;
begin
  if not public.can_operate_motoboy(auth.uid()) then
    raise exception 'Acesso exclusivo do motoboy';
  end if;

  update public.availability
  set status = 'available', available_since = now(), current_source = null
  where user_id = auth.uid()
    and status = 'on_delivery'
    and current_source = 'dispatch'
  returning * into result;

  if result.id is null then
    raise exception 'Não existe uma chamada da cozinha em andamento';
  end if;

  insert into public.audit_logs(user_id, action, entity_type, entity_id, new_data)
  values (
    auth.uid(), 'dispatch_call_finished', 'availability', result.id,
    to_jsonb(result) || jsonb_build_object('delivery_created', false)
  );
  return result;
end;
$$;

revoke all on function public.finish_dispatch_call() from public;
grant execute on function public.finish_dispatch_call() to authenticated;
