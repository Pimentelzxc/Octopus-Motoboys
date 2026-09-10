-- Execute após schema.sql (ou após todas as migrations) para validar a separação de funções.
do $$
declare
  queue_definition text;
  dispatch_definition text;
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
  dispatch_definition := pg_get_functiondef('public.dispatch_motoboy(uuid,text)'::regprocedure);

  if position('public.is_kitchen()' in queue_definition) = 0 then
    raise exception 'get_kitchen_queue não exige o perfil kitchen';
  end if;

  if position('public.is_kitchen()' in dispatch_definition) = 0 then
    raise exception 'dispatch_motoboy não exige o perfil kitchen';
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
