-- Ativa assinaturas Web Push e volta o despacho da cozinha ao modo simples.
-- A cozinha apenas chama o motoboy; o pedido e a quilometragem são informados
-- pelo próprio motoboy ao finalizar a entrega.
-- Execute após 20260911110000_multi_order_dispatch.sql.

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

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

drop trigger if exists push_subscriptions_set_updated_at on public.push_subscriptions;
create trigger push_subscriptions_set_updated_at
before update on public.push_subscriptions
for each row execute function public.set_updated_at();

alter table public.push_subscriptions enable row level security;

-- As assinaturas contêm credenciais do dispositivo. O frontend acessa somente
-- as RPCs abaixo; a Edge Function usa a service role no ambiente do servidor.
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

  insert into public.push_subscriptions (
    user_id, endpoint, p256dh, auth_key, user_agent
  ) values (
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

create or replace function public.delete_my_push_subscription(
  subscription_endpoint text
)
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

-- Remove todas as assinaturas antigas que aceitavam pedido(s) no despacho.
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

commit;
