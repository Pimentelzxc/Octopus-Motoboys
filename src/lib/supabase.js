import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabasePublicKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY)?.trim()
const usesSecretKey = supabasePublicKey?.startsWith('sb_secret_')

export const supabaseConfigurationError = usesSecretKey
  ? 'Chave secreta não pode ser usada no navegador. Configure VITE_SUPABASE_PUBLISHABLE_KEY com uma chave sb_publishable_... do Supabase.'
  : null

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabasePublicKey &&
  !usesSecretKey &&
  !supabaseUrl.includes('seu-projeto') &&
  !supabasePublicKey.includes('sua-chave'),
)

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublicKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  : null

export function requireSupabase() {
  if (!supabase) {
    throw new Error(supabaseConfigurationError || 'Supabase não configurado. Preencha VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no arquivo .env.')
  }
  return supabase
}
