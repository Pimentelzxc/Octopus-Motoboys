-- Migração incremental: execute somente se o schema de entregas/pagamentos anterior já existe.
-- Para instalações novas, execute supabase/schema.sql em vez desta migration isolada.

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
alter table public.deliveries add constraint deliveries_status_check check (status in ('pending','in_progress','completed','cancelled','adjusted'));
alter table public.deliveries drop constraint if exists deliveries_distance_km_check;
alter table public.deliveries add constraint deliveries_distance_km_check check (distance_km is null or distance_km > 0);
do $$ begin
  alter table public.deliveries add constraint deliveries_order_number_not_empty check (public.normalize_order_number(order_number) <> '');
exception when duplicate_object then null; end $$;
drop index if exists public.deliveries_order_date_unique;
create unique index deliveries_order_date_unique on public.deliveries(order_number, operational_date) where status <> 'cancelled';
create unique index if not exists deliveries_one_active_per_motoboy on public.deliveries(motoboy_id) where status = 'in_progress';
create index if not exists deliveries_order_search_idx on public.deliveries(order_number, delivered_at desc);

create or replace function public.secure_delivery_pricing()
returns trigger language plpgsql security definer set search_path = '' as $$
declare official_price numeric(10,2);
begin
  new.order_number := public.normalize_order_number(new.order_number);
  if new.order_number = '' then raise exception 'Informe o número do pedido'; end if;
  new.operational_date := coalesce(new.operational_date, (now() at time zone 'America/Sao_Paulo')::date);
  if new.status = 'in_progress' then
    new.distance_km := null; new.calculated_value := null; new.final_value := null; new.pricing_status := 'pending'; new.updated_at := now(); return new;
  end if;
  if new.distance_km is null or new.distance_km <= 0 then raise exception 'A quilometragem deve ser maior que zero'; end if;
  official_price := public.calculate_delivery_price(new.distance_km); new.calculated_value := official_price;
  if public.is_admin() and new.pricing_status = 'adjusted' and new.final_value is not null then
    if new.final_value < 0 then raise exception 'O valor final não pode ser negativo'; end if;
  elsif official_price is null then new.pricing_status := 'pending'; new.final_value := null;
  else new.pricing_status := 'automatic'; new.final_value := official_price; end if;
  new.updated_at := now(); return new;
end;
$$;
drop trigger if exists deliveries_secure_pricing on public.deliveries;
create trigger deliveries_secure_pricing before insert or update of order_number,distance_km,final_value,pricing_status,status on public.deliveries
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
  else return new; end if;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,old_data,new_data)
  values(auth.uid(),audit_action,'delivery',new.id,to_jsonb(old),to_jsonb(new)); return new;
end;
$$;

drop function if exists public.dispatch_motoboy(uuid);
create or replace function public.dispatch_motoboy(target_motoboy_id uuid, delivery_order_number text default null)
returns public.availability language plpgsql security definer set search_path = '' as $$
declare result public.availability; normalized_order text; existing_name text; existing_time text;
begin
  if coalesce(public.current_user_role()::text,'') not in ('kitchen','admin') then raise exception 'Acesso negado'; end if;
  normalized_order := public.normalize_order_number(delivery_order_number);
  if normalized_order <> '' then
    select p.full_name,to_char(d.delivered_at at time zone 'America/Sao_Paulo','HH24:MI') into existing_name,existing_time
    from public.deliveries d join public.profiles p on p.id=d.motoboy_id where d.order_number=normalized_order
      and d.operational_date=(now() at time zone 'America/Sao_Paulo')::date and d.status<>'cancelled' limit 1;
  end if;
  if existing_name is not null then raise exception 'O pedido #% já foi registrado hoje por % às %',normalized_order,existing_name,existing_time; end if;
  update public.availability set status='on_delivery',current_source='dispatch' where user_id=target_motoboy_id and status='available' returning * into result;
  if result.id is null then raise exception 'Este motoboy não está mais disponível'; end if;
  if normalized_order <> '' then
    insert into public.deliveries(motoboy_id,order_number,distance_km,pricing_status,created_by,source,status)
    values(target_motoboy_id,normalized_order,null,'pending',auth.uid(),'dispatch','in_progress');
  end if;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,new_data) values(auth.uid(),'motoboy_dispatched','availability',result.id,to_jsonb(result));
  return result;
end;
$$;

drop function if exists public.register_manual_delivery(numeric,text);
create or replace function public.register_manual_delivery(delivery_order_number text, delivery_distance_km numeric, delivery_notes text default null)
returns public.deliveries language plpgsql security definer set search_path = '' as $$
declare result public.deliveries; current_status text; normalized_order text;
begin
  if not public.can_operate_motoboy(auth.uid()) then raise exception 'Acesso negado'; end if;
  select status into current_status from public.availability where user_id=auth.uid();
  if current_status='on_delivery' then raise exception 'Finalize a entrega em andamento antes do registro manual'; end if;
  normalized_order:=public.normalize_order_number(delivery_order_number); if normalized_order='' then raise exception 'Informe o número do pedido'; end if;
  if exists(select 1 from public.deliveries where order_number=normalized_order and operational_date=(now() at time zone 'America/Sao_Paulo')::date and status<>'cancelled') then raise exception 'O pedido #% já foi registrado hoje',normalized_order; end if;
  insert into public.deliveries(motoboy_id,order_number,distance_km,pricing_status,notes,created_by,source,status)
  values(auth.uid(),normalized_order,delivery_distance_km,'automatic',nullif(trim(delivery_notes),''),auth.uid(),'manual','completed') returning * into result;
  return result;
end;
$$;

drop function if exists public.finish_dispatched_delivery(numeric,text,boolean);
create or replace function public.finish_dispatched_delivery(delivery_order_number text, delivery_distance_km numeric, delivery_notes text default null, return_to_available boolean default true)
returns public.deliveries language plpgsql security definer set search_path = '' as $$
declare result public.deliveries; current_status text; normalized_order text; active_id uuid;
begin
  if not public.can_operate_motoboy(auth.uid()) then raise exception 'Acesso negado'; end if;
  select status into current_status from public.availability where user_id=auth.uid() for update;
  if current_status<>'on_delivery' then raise exception 'Não existe entrega em andamento'; end if;
  select id into active_id from public.deliveries where motoboy_id=auth.uid() and status='in_progress' for update;
  if active_id is not null then
    update public.deliveries set distance_km=delivery_distance_km,notes=nullif(trim(delivery_notes),''),status='completed',pricing_status='automatic',delivered_at=now() where id=active_id returning * into result;
  else
    normalized_order:=public.normalize_order_number(delivery_order_number); if normalized_order='' then raise exception 'Informe o número do pedido'; end if;
    if exists(select 1 from public.deliveries where order_number=normalized_order and operational_date=(now() at time zone 'America/Sao_Paulo')::date and status<>'cancelled') then raise exception 'O pedido #% já foi registrado hoje',normalized_order; end if;
    insert into public.deliveries(motoboy_id,order_number,distance_km,pricing_status,notes,created_by,source,status)
    values(auth.uid(),normalized_order,delivery_distance_km,'automatic',nullif(trim(delivery_notes),''),auth.uid(),'dispatch','completed') returning * into result;
  end if;
  update public.availability set status=case when return_to_available then 'available' else 'offline' end,
    available_since=case when return_to_available then now() else null end,current_source=null where user_id=auth.uid(); return result;
end;
$$;

drop function if exists public.motoboy_update_delivery(uuid,numeric,text);
create or replace function public.motoboy_update_delivery(target_delivery_id uuid,new_order_number text,new_distance_km numeric,new_notes text default null)
returns public.deliveries language plpgsql security definer set search_path = '' as $$
declare result public.deliveries; normalized_order text; delivery_date date;
begin
  normalized_order:=public.normalize_order_number(new_order_number); select operational_date into delivery_date from public.deliveries where id=target_delivery_id and motoboy_id=auth.uid();
  if normalized_order='' then raise exception 'Informe o número do pedido'; end if;
  if exists(select 1 from public.deliveries where order_number=normalized_order and operational_date=delivery_date and id<>target_delivery_id and status<>'cancelled') then raise exception 'O pedido #% já foi registrado nesta data',normalized_order; end if;
  update public.deliveries set order_number=normalized_order,distance_km=new_distance_km,notes=nullif(trim(new_notes),''),status='adjusted',pricing_status='automatic'
  where id=target_delivery_id and motoboy_id=auth.uid() and status in ('completed','adjusted') and payment_closing_id is null and delivered_at>=now()-interval '10 minutes' returning * into result;
  if result.id is null then raise exception 'O prazo de correção expirou ou a entrega já foi fechada'; end if; return result;
end;
$$;

create or replace function public.motoboy_cancel_delivery(target_delivery_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.deliveries set status='cancelled' where id=target_delivery_id and motoboy_id=auth.uid()
    and status in ('completed','adjusted') and payment_closing_id is null and delivered_at>=now()-interval '10 minutes';
  if not found then raise exception 'O prazo de cancelamento expirou ou a entrega já foi fechada'; end if;
end;
$$;

drop function if exists public.admin_update_delivery(uuid,numeric,text,numeric);
create or replace function public.admin_update_delivery(target_delivery_id uuid,new_order_number text,new_distance_km numeric,new_notes text default null,adjusted_final_value numeric default null)
returns public.deliveries language plpgsql security definer set search_path = '' as $$
declare result public.deliveries; normalized_order text; delivery_date date;
begin
  if not public.is_admin() then raise exception 'Acesso negado'; end if;
  normalized_order:=public.normalize_order_number(new_order_number); select operational_date into delivery_date from public.deliveries where id=target_delivery_id;
  if normalized_order='' then raise exception 'Informe o número do pedido'; end if;
  if exists(select 1 from public.deliveries where order_number=normalized_order and operational_date=delivery_date and id<>target_delivery_id and status<>'cancelled') then raise exception 'O pedido #% já foi registrado nesta data',normalized_order; end if;
  update public.deliveries set order_number=normalized_order,distance_km=new_distance_km,notes=nullif(trim(new_notes),''),final_value=adjusted_final_value,
    pricing_status=case when adjusted_final_value is null then 'automatic' else 'adjusted' end,status='adjusted'
  where id=target_delivery_id and payment_closing_id is null and status in ('completed','adjusted') returning * into result;
  if result.id is null then raise exception 'Entrega fechada, em andamento, cancelada ou não encontrada'; end if; return result;
end;
$$;

create or replace function public.preview_payment_closing(target_motoboy_id uuid,period_start date,period_end date)
returns table(deliveries_count bigint,total_distance_km numeric,total_amount numeric,pending_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Acesso negado'; end if;
  return query select count(*),coalesce(sum(d.distance_km),0),coalesce(sum(d.final_value),0),count(*) filter(where d.pricing_status='pending')
  from public.deliveries d where d.motoboy_id=target_motoboy_id and d.status in ('completed','adjusted') and d.payment_closing_id is null and d.operational_date between period_start and period_end;
end;
$$;

create or replace function public.create_payment_closing(target_motoboy_id uuid,period_start date,period_end date)
returns public.payment_closings language plpgsql security definer set search_path = '' as $$
declare result public.payment_closings; item_count integer; distance_total numeric; amount_total numeric; pending_count integer;
begin
  if not public.is_admin() then raise exception 'Acesso negado'; end if; if period_start>period_end then raise exception 'Período inválido'; end if;
  perform 1 from public.profiles where id=target_motoboy_id and role='motoboy' for update; if not found then raise exception 'Motoboy não encontrado'; end if;
  select count(*) filter(where pricing_status='pending'),count(*),coalesce(sum(distance_km),0),coalesce(sum(final_value),0)
  into pending_count,item_count,distance_total,amount_total from public.deliveries where motoboy_id=target_motoboy_id and status in ('completed','adjusted') and payment_closing_id is null and operational_date between period_start and period_end;
  if pending_count>0 then raise exception 'Existem entregas com valor pendente neste período'; end if; if item_count=0 then raise exception 'Nenhuma entrega em aberto neste período'; end if;
  insert into public.payment_closings(motoboy_id,start_date,end_date,deliveries_count,total_distance_km,total_amount,status,closed_by)
  values(target_motoboy_id,period_start,period_end,item_count,distance_total,amount_total,'closed',auth.uid()) returning * into result;
  update public.deliveries set payment_closing_id=result.id where motoboy_id=target_motoboy_id and status in ('completed','adjusted') and payment_closing_id is null and operational_date between period_start and period_end; return result;
end;
$$;

create or replace function public.get_kitchen_queue()
returns table(user_id uuid,full_name text,username text,phone text,motorcycle_model text,motorcycle_plate text,last_seen timestamptz,available_since timestamptz,deliveries_today integer,distance_today numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(public.current_user_role()::text,'') not in ('kitchen','admin') then raise exception 'Acesso negado'; end if;
  return query select p.id,p.full_name,p.username,p.phone,p.motorcycle_model,p.motorcycle_plate,p.last_seen,a.available_since,count(d.id)::integer,coalesce(sum(d.distance_km),0)::numeric
  from public.availability a join public.profiles p on p.id=a.user_id left join public.deliveries d on d.motoboy_id=p.id and d.status in ('completed','adjusted') and d.operational_date=(now() at time zone 'America/Sao_Paulo')::date
  where a.status='available' and p.active=true and p.role='motoboy' group by p.id,p.full_name,p.username,p.phone,p.motorcycle_model,p.motorcycle_plate,p.last_seen,a.available_since order by a.available_since,p.id;
end;
$$;

revoke all on function public.dispatch_motoboy(uuid,text),public.register_manual_delivery(text,numeric,text),public.finish_dispatched_delivery(text,numeric,text,boolean),public.motoboy_update_delivery(uuid,text,numeric,text),public.admin_update_delivery(uuid,text,numeric,text,numeric) from public;
grant execute on function public.dispatch_motoboy(uuid,text),public.register_manual_delivery(text,numeric,text),public.finish_dispatched_delivery(text,numeric,text,boolean),public.motoboy_update_delivery(uuid,text,numeric,text),public.admin_update_delivery(uuid,text,numeric,text,numeric) to authenticated;
grant execute on function public.normalize_order_number(text) to authenticated;
