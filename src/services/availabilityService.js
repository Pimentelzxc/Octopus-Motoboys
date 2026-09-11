import { requireSupabase } from '../lib/supabase'
import { normalizeOrderNumber } from '../utils/orderNumber'

const AVAILABLE_SELECT = `
  id,
  user_id,
  is_available,
  available_since,
  updated_at,
  profiles!availability_user_id_fkey (
    id,
    full_name,
    username,
    phone,
    motorcycle_model,
    motorcycle_plate,
    last_seen
  )
`

export async function getOwnAvailability(userId) {
  const client = requireSupabase()
  const { data, error } = await client.from('availability').select('*').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data ?? { user_id: userId, status: 'offline', is_available: false, available_since: null, current_source: null }
}

export async function setAvailability(userId, isAvailable) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('set_my_status', { requested_status: isAvailable ? 'available' : 'offline' })
  if (error) throw error
  return data
}

export async function setMyStatus(status) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('set_my_status', { requested_status: status })
  if (error) throw error
  return data
}

export async function getMyQueuePosition() {
  const client = requireSupabase()
  const { data, error } = await client.rpc('get_my_queue_position')
  if (error) throw error
  return data
}

export async function getKitchenQueue() {
  const client = requireSupabase()
  const { data, error } = await client.rpc('get_kitchen_queue')
  if (error) throw error
  return data ?? []
}

export async function dispatchMotoboy(userId, orderNumbers = []) {
  const client = requireSupabase()
  const normalizedOrders = orderNumbers.map(normalizeOrderNumber).filter(Boolean)
  const { data, error } = await client.rpc('dispatch_motoboy', { target_motoboy_id: userId, delivery_order_numbers: normalizedOrders })
  if (error) throw error
  return data
}

export async function getAvailableMotoboys() {
  const client = requireSupabase()
  const { data, error } = await client
    .from('availability')
    .select(AVAILABLE_SELECT)
    .eq('is_available', true)
    .order('available_since', { ascending: true })
  if (error) throw error
  return (data ?? []).filter((item) => item.profiles)
}

export function subscribeToAvailability(onChange) {
  const client = requireSupabase()
  const channel = client
    .channel(`availability-live-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'availability' }, onChange)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_activity' }, onChange)
    .subscribe()
  return () => client.removeChannel(channel)
}

export async function updateLastSeen(userId) {
  const client = requireSupabase()
  const { error } = await client.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', userId)
  if (error) throw error
}
