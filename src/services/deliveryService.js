import { requireSupabase } from '../lib/supabase'
import { normalizeOrderNumber } from '../utils/orderNumber'

function currentOperationalDate() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).reduce((result, part) => ({ ...result, [part.type]: part.value }), {})
  return `${parts.year}-${parts.month}-${parts.day}`
}

export async function getMyDeliveries(userId, limit = 100) {
  const client = requireSupabase()
  const { data, error } = await client.from('deliveries').select('*').eq('motoboy_id', userId).order('delivered_at', { ascending: false }).limit(limit)
  if (error) throw error
  return data ?? []
}

export async function getMyTodayDeliveries(userId) {
  const client = requireSupabase()
  const { data, error } = await client.from('deliveries').select('*').eq('motoboy_id', userId).eq('operational_date', currentOperationalDate()).order('delivered_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getActiveDeliveries(userId) {
  const client = requireSupabase()
  const { data, error } = await client.from('deliveries').select('*').eq('motoboy_id', userId).eq('status', 'in_progress').order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function registerManualDelivery(orderNumber, distanceKm, notes) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('register_manual_delivery', { delivery_order_number: normalizeOrderNumber(orderNumber), delivery_distance_km: distanceKm, delivery_notes: notes || null })
  if (error) throw error
  return data
}

export async function finishDispatchedDelivery(deliveryId, orderNumber, distanceKm, notes, returnToAvailable) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('finish_dispatched_delivery', {
    target_delivery_id: deliveryId || null,
    delivery_distance_km: distanceKm,
    delivery_order_number: normalizeOrderNumber(orderNumber),
    delivery_notes: notes || null,
    return_to_available: returnToAvailable,
  })
  if (error) throw error
  return data
}

export async function updateOwnDelivery(deliveryId, orderNumber, distanceKm, notes) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('motoboy_update_delivery', { target_delivery_id: deliveryId, new_order_number: normalizeOrderNumber(orderNumber), new_distance_km: distanceKm, new_notes: notes || null })
  if (error) throw error
  return data
}

export async function cancelOwnDelivery(deliveryId) {
  const client = requireSupabase()
  const { error } = await client.rpc('motoboy_cancel_delivery', { target_delivery_id: deliveryId })
  if (error) throw error
}

export async function adminUpdateDelivery(deliveryId, orderNumber, distanceKm, notes, finalValue) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('admin_update_delivery', {
    target_delivery_id: deliveryId,
    new_order_number: normalizeOrderNumber(orderNumber),
    new_distance_km: distanceKm,
    new_notes: notes || null,
    adjusted_final_value: finalValue === '' || finalValue === null ? null : Number(finalValue),
  })
  if (error) throw error
  return data
}

export async function adminCancelDelivery(deliveryId) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('admin_cancel_delivery', { target_delivery_id: deliveryId })
  if (error) throw error
  return data
}

export function subscribeToMyDeliveries(userId, onChange) {
  const client = requireSupabase()
  const channel = client.channel(`my-deliveries-${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries', filter: `motoboy_id=eq.${userId}` }, onChange)
    .subscribe()
  return () => client.removeChannel(channel)
}

export function summarizeDeliveries(deliveries) {
  return deliveries.reduce((summary, delivery) => {
    if (!['completed', 'adjusted'].includes(delivery.status)) return summary
    summary.count += 1
    summary.distance += Number(delivery.distance_km) || 0
    summary.amount += Number(delivery.final_value) || 0
    summary.pending += delivery.pricing_status === 'pending' ? 1 : 0
    return summary
  }, { count: 0, distance: 0, amount: 0, pending: 0 })
}
