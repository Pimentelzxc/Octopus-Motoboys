-- Troca o cancelamento lógico pela exclusão definitiva de entregas.
-- O nome das RPCs antigas é mantido para não interromper clientes durante o deploy.

begin;

create or replace function public.motoboy_cancel_delivery(target_delivery_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_delivery public.deliveries;
begin
  if not public.can_operate_motoboy(auth.uid()) then
    raise exception 'Acesso exclusivo do motoboy';
  end if;

  delete from public.deliveries
  where id = target_delivery_id
    and motoboy_id = auth.uid()
    and status in ('completed', 'adjusted')
    and payment_closing_id is null
    and delivered_at >= now() - interval '10 minutes'
  returning * into deleted_delivery;

  if deleted_delivery.id is null then
    raise exception 'O prazo de exclusão expirou ou a entrega já foi fechada';
  end if;

  -- Apaga também qualquer histórico de alteração desta entrega.
  delete from public.audit_logs
  where entity_type = 'delivery' and entity_id = deleted_delivery.id;

  -- Notifica as telas em tempo real sem guardar dados do pedido excluído.
  insert into public.delivery_activity(motoboy_id, updated_at)
  values (deleted_delivery.motoboy_id, now())
  on conflict (motoboy_id) do update set updated_at = excluded.updated_at;
end;
$$;

create or replace function public.admin_cancel_delivery(target_delivery_id uuid)
returns public.deliveries
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.deliveries;
begin
  if not public.is_admin() then
    raise exception 'Acesso negado';
  end if;

  delete from public.deliveries
  where id = target_delivery_id
    and payment_closing_id is null
    and status in ('completed', 'adjusted')
  returning * into result;

  if result.id is null then
    raise exception 'Entrega fechada ou não encontrada';
  end if;

  delete from public.audit_logs
  where entity_type = 'delivery' and entity_id = result.id;

  insert into public.delivery_activity(motoboy_id, updated_at)
  values (result.motoboy_id, now())
  on conflict (motoboy_id) do update set updated_at = excluded.updated_at;

  return result;
end;
$$;

-- Remove registros antigos que já estavam apenas marcados como cancelados,
-- juntamente com seus rastros de auditoria.
delete from public.audit_logs log
where log.entity_type = 'delivery'
  and (
    exists (
      select 1 from public.deliveries delivery
      where delivery.id = log.entity_id and delivery.status = 'cancelled'
    )
    or not exists (
      select 1 from public.deliveries delivery where delivery.id = log.entity_id
    )
  );

delete from public.deliveries where status = 'cancelled';

revoke all on function public.motoboy_cancel_delivery(uuid) from public;
revoke all on function public.admin_cancel_delivery(uuid) from public;
grant execute on function public.motoboy_cancel_delivery(uuid) to authenticated;
grant execute on function public.admin_cancel_delivery(uuid) to authenticated;

commit;
