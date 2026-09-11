-- Finaliza uma chamada da cozinha sem criar entrega ou solicitar pedido/KM.
-- O registro de pedidos continua disponível apenas pela ação manual do motoboy.
-- Execute após 20260911160000_push_notifications_simple_dispatch.sql.

begin;

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
  set status = 'available',
    available_since = now(),
    current_source = null
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

commit;
