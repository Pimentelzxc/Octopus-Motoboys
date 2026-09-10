import { requireSupabase } from '../lib/supabase'
import { PRICE_RANGES, getDistanceRange } from './pricingService'
import { normalizeOrderNumber } from '../utils/orderNumber'

export function getPresetRange(preset, customStart, customEnd) {
  const now = new Date()
  const start = new Date(now)
  const end = new Date(now)
  start.setHours(0, 0, 0, 0)
  end.setHours(23, 59, 59, 999)
  if (preset === 'yesterday') { start.setDate(start.getDate() - 1); end.setDate(end.getDate() - 1) }
  if (preset === 'this_week') { const day = (start.getDay() + 6) % 7; start.setDate(start.getDate() - day) }
  if (preset === 'last_week') { const day = (start.getDay() + 6) % 7; start.setDate(start.getDate() - day - 7); end.setTime(start.getTime()); end.setDate(end.getDate() + 6); end.setHours(23, 59, 59, 999) }
  if (preset === 'this_month') start.setDate(1)
  if (preset === 'last_month') { start.setMonth(start.getMonth() - 1, 1); end.setFullYear(start.getFullYear(), start.getMonth() + 1, 0); end.setHours(23, 59, 59, 999) }
  if (preset === 'custom') {
    if (customStart && customEnd) {
      start.setTime(new Date(`${customStart}T00:00:00`).getTime())
      end.setTime(new Date(`${customEnd}T23:59:59.999`).getTime())
    }
  }
  return { start, end }
}

export async function getDeliveriesReport(start, end) {
  const client = requireSupabase()
  const dateKey = (value) => {
    const date = new Date(value)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }
  const { data, error } = await client.from('deliveries')
    .select('*, profiles!deliveries_motoboy_id_fkey(full_name, username), payment_closings!deliveries_payment_closing_id_fkey(status,start_date,end_date)')
    .gte('operational_date', dateKey(start)).lte('operational_date', dateKey(end))
    .order('delivered_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function searchOrders(orderNumber) {
  const client = requireSupabase()
  const normalized = normalizeOrderNumber(orderNumber)
  if (!normalized) return []
  const { data, error } = await client.from('deliveries')
    .select('*, profiles!deliveries_motoboy_id_fkey(full_name, username), payment_closings!deliveries_payment_closing_id_fkey(status,start_date,end_date)')
    .ilike('order_number', `%${normalized}%`).order('delivered_at', { ascending: false }).limit(20)
  if (error) throw error
  return data ?? []
}

export async function getDeliveryAudit(deliveryId) {
  const client = requireSupabase()
  const { data, error } = await client.from('audit_logs').select('*, profiles!audit_logs_user_id_fkey(full_name, role)').eq('entity_type', 'delivery').eq('entity_id', deliveryId).order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export function buildMotoboyReport(deliveries) {
  const groups = new Map()
  deliveries.filter((item) => ['completed', 'adjusted'].includes(item.status)).forEach((delivery) => {
    const current = groups.get(delivery.motoboy_id) ?? {
      id: delivery.motoboy_id, name: delivery.profiles?.full_name ?? 'Motoboy', count: 0, distance: 0, amount: 0, pending: 0,
      ranges: PRICE_RANGES.map((range) => ({ ...range, count: 0, subtotal: 0 })),
    }
    current.count += 1
    current.distance += Number(delivery.distance_km) || 0
    current.amount += Number(delivery.final_value) || 0
    if (delivery.pricing_status === 'pending') current.pending += 1
    const index = PRICE_RANGES.findIndex((range) => Number(delivery.distance_km) <= range.max)
    if (index >= 0) { current.ranges[index].count += 1; current.ranges[index].subtotal += Number(delivery.final_value) || 0 }
    groups.set(delivery.motoboy_id, current)
  })
  return [...groups.values()].sort((a, b) => b.count - a.count)
}

function csvEscape(value) { return `"${String(value ?? '').replaceAll('"', '""')}"` }
function downloadCsv(filename, rows) {
  const content = `\uFEFF${rows.map((row) => row.map(csvEscape).join(';')).join('\n')}`
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url)
}

export function exportDetailedCsv(deliveries) {
  downloadCsv('entregas-octopus.csv', [
    ['Pedido', 'Data', 'Horário', 'Motoboy', 'KM', 'Faixa de KM', 'Valor', 'Status', 'Origem', 'Status do pagamento'],
    ...deliveries.map((item) => {
      const date = new Date(item.delivered_at)
      const closing = Array.isArray(item.payment_closings) ? item.payment_closings[0] : item.payment_closings
      const paymentStatus = !item.payment_closing_id ? 'Em aberto' : closing?.status === 'paid' ? 'Pago' : 'Fechado'
      return [item.order_number, date.toLocaleDateString('pt-BR'), date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), item.profiles?.full_name, item.distance_km == null ? '' : Number(item.distance_km).toFixed(2).replace('.', ','), item.distance_km == null ? '' : getDistanceRange(item.distance_km), item.final_value == null ? 'Pendente' : Number(item.final_value).toFixed(2).replace('.', ','), item.status, item.source, paymentStatus]
    }),
  ])
}

export function exportSummaryCsv(report) {
  downloadCsv('resumo-motoboys-octopus.csv', [['Motoboy', 'Quantidade de entregas', 'KM total', 'Valor total'], ...report.map((item) => [item.name, item.count, item.distance.toFixed(2).replace('.', ','), item.amount.toFixed(2).replace('.', ',')])])
}
