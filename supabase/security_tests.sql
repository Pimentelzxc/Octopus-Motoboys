-- Execute após schema.sql (ou após todas as migrations) para validar a separação de funções.
do $$
declare
  queue_definition text;
  dispatch_definition text;
  finish_definition text;
begin
  if not exists (
    select 1
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'user_role' and e.enumlabel = 'kitchen'
  ) or not exists (
    select 1
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'user_role' and e.enumlabel = 'admin'
  ) then
    raise exception 'As funções kitchen e admin não estão definidas separadamente';
  end if;

  queue_definition := pg_get_functiondef('public.get_kitchen_queue()'::regprocedure);
  dispatch_definition := pg_get_functiondef('public.dispatch_motoboy(uuid)'::regprocedure);
  finish_definition := pg_get_functiondef('public.finish_dispatch_call()'::regprocedure);

  if position('public.is_kitchen()' in queue_definition) = 0 then
    raise exception 'get_kitchen_queue não exige o perfil kitchen';
  end if;

  if position('public.is_kitchen()' in dispatch_definition) = 0 then
    raise exception 'dispatch_motoboy não exige o perfil kitchen';
  end if;

  if to_regprocedure('public.dispatch_motoboy(uuid)') is null then
    raise exception 'A função de chamada simples não foi instalada';
  end if;

  if to_regprocedure('public.dispatch_motoboy(uuid,text[])') is not null
    or to_regprocedure('public.dispatch_motoboy(uuid,text)') is not null then
    raise exception 'Uma função antiga ainda permite à cozinha despachar pedidos';
  end if;

  if position('insert into public.deliveries' in lower(dispatch_definition)) > 0 then
    raise exception 'A chamada simples ainda cria pedidos pela cozinha';
  end if;

  if position('public.can_operate_motoboy' in finish_definition) = 0
    or position('insert into public.deliveries' in lower(finish_definition)) > 0 then
    raise exception 'A finalização da chamada não está protegida ou ainda cria pedido';
  end if;

  if to_regprocedure('public.finish_dispatched_delivery(uuid,text,numeric,text,boolean)') is not null
    or to_regprocedure('public.finish_dispatched_delivery(text,numeric,text,boolean)') is not null
    or to_regprocedure('public.finish_dispatched_delivery(numeric,text,boolean)') is not null then
    raise exception 'Uma função antiga ainda exige pedido ao finalizar a chamada';
  end if;

  if to_regclass('public.push_subscriptions') is null
    or to_regprocedure('public.save_my_push_subscription(text,text,text,text)') is null
    or to_regprocedure('public.delete_my_push_subscription(text)') is null then
    raise exception 'A estrutura segura de assinaturas Web Push não foi instalada';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'audit_logs'
      and policyname = 'audit_select_admin'
  ) then
    raise exception 'A auditoria não está protegida pela policy administrativa';
  end if;

  raise notice 'Separação kitchen/admin aprovada.';
end $$;
