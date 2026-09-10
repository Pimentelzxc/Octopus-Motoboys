-- Execute após schema.sql. O bloco falha imediatamente se algum limite estiver incorreto.
do $$
declare
  distances numeric[] := array[4,4.01,5,5.01,6,6.01,7,7.01,8,8.01,10,10.01,12,12.01,13,13.01];
  expected numeric[] := array[6,7,7,8,8,9.5,9.5,11,11,15,15,17,17,19,19,null];
  index integer;
  actual numeric;
begin
  for index in 1..array_length(distances, 1) loop
    actual := public.calculate_delivery_price(distances[index]);
    if actual is distinct from expected[index] then
      raise exception 'Preço incorreto para % km: esperado %, recebido %', distances[index], expected[index], actual;
    end if;
  end loop;
  if public.normalize_order_number(' 001 ') is distinct from '001' then
    raise exception 'A normalização não preservou os zeros à esquerda';
  end if;
  if public.normalize_order_number(' ab 10 ') is distinct from 'AB10' then
    raise exception 'A normalização não removeu espaços/caixa corretamente';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'deliveries' and column_name = 'order_number'
      and data_type = 'text' and is_nullable = 'NO'
  ) then
    raise exception 'deliveries.order_number precisa ser TEXT NOT NULL';
  end if;
  if to_regclass('public.deliveries_order_date_unique') is null then
    raise exception 'Índice único por pedido e data operacional não encontrado';
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'deliveries_order_date_unique'
      and indexdef ilike '%order_number, operational_date%'
  ) then
    raise exception 'Índice de duplicidade não usa order_number + operational_date';
  end if;
  raise notice 'Tabela oficial e estrutura de pedidos aprovadas: 16 limites corretos.';
end $$;
