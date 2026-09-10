import { requireSupabase } from '../lib/supabase'

export async function getMyPaymentClosings(userId) {
  const client = requireSupabase()
  const { data, error } = await client.from('payment_closings').select('*').eq('motoboy_id', userId).order('end_date', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getAllPaymentClosings() {
  const client = requireSupabase()
  const { data, error } = await client.from('payment_closings').select('*, profiles!payment_closings_motoboy_id_fkey(full_name, username)').order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createPaymentClosing(motoboyId, startDate, endDate) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('create_payment_closing', { target_motoboy_id: motoboyId, period_start: startDate, period_end: endDate })
  if (error) throw error
  return data
}

export async function getPaymentClosingPreview(motoboyId, startDate, endDate) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('preview_payment_closing', { target_motoboy_id: motoboyId, period_start: startDate, period_end: endDate })
  if (error) throw error
  return data?.[0] ?? { deliveries_count: 0, total_distance_km: 0, total_amount: 0, pending_count: 0 }
}

export async function markPaymentPaid(closingId) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('mark_payment_paid', { closing_id: closingId })
  if (error) throw error
  return data
}

export function subscribeToPayments(onChange) {
  const client = requireSupabase()
  const channel = client.channel(`payments-${crypto.randomUUID()}`).on('postgres_changes', { event: '*', schema: 'public', table: 'payment_closings' }, onChange).subscribe()
  return () => client.removeChannel(channel)
}
