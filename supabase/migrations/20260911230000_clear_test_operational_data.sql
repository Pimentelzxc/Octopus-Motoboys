-- LIMPEZA DE PRODUÇÃO — operação destrutiva e irreversível.
-- Remove somente dados operacionais de teste. Usuários, perfis,
-- configurações e assinaturas de notificação são preservados.

begin;

-- As duas tabelas precisam ser limpas juntas porque as entregas podem
-- pertencer a um fechamento de pagamento.
truncate table
  public.deliveries,
  public.payment_closings,
  public.delivery_activity;

-- Exclui cópias dos dados operacionais mantidas na auditoria, sem apagar
-- logs relacionados a usuários e perfis.
delete from public.audit_logs
where entity_type in ('delivery', 'payment_closing')
   or action in ('motoboy_dispatched', 'dispatch_call_finished');

-- Ninguém deve iniciar a operação real preso em uma fila ou chamada de teste.
-- O trigger availability_sync_status também mantém is_available sincronizado.
update public.availability
set status = 'offline',
    is_available = false,
    available_since = null,
    current_source = null;

commit;

-- Conferência: todos os resultados abaixo devem ser zero.
select
  (select count(*) from public.deliveries) as entregas,
  (select count(*) from public.payment_closings) as pagamentos,
  (select count(*) from public.delivery_activity) as atividades,
  (select count(*) from public.availability where status <> 'offline' or is_available) as status_ativos;
