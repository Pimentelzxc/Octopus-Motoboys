import { requireSupabase } from '../lib/supabase'

export async function updateOwnProfile(userId, changes) {
  const client = requireSupabase()
  const allowed = {
    full_name: changes.full_name,
    username: changes.username?.toLowerCase(),
    phone: changes.phone,
    motorcycle_model: changes.motorcycle_model || null,
    motorcycle_plate: changes.motorcycle_plate?.toUpperCase() || null,
  }
  const { data, error } = await client.from('profiles').update(allowed).eq('id', userId).select().single()
  if (error) throw error
  return data
}

export async function getAllProfiles() {
  const client = requireSupabase()
  const { data, error } = await client
    .from('profiles')
    .select('*, availability(is_available, available_since, updated_at)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function adminUpdateProfile(userId, changes) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('admin_update_profile', {
    target_user_id: userId,
    new_full_name: changes.full_name,
    new_username: changes.username.toLowerCase(),
    new_phone: changes.phone,
    new_motorcycle_model: changes.motorcycle_model || null,
    new_motorcycle_plate: changes.motorcycle_plate?.toUpperCase() || null,
    new_role: changes.role,
    new_active: changes.active,
  })
  if (error) throw error
  return data
}

export async function adminDeleteUser(userId) {
  const client = requireSupabase()
  const { error } = await client.rpc('admin_delete_user', { target_user_id: userId })
  if (error) throw error
}
