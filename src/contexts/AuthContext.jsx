import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, requireSupabase, supabase, supabaseConfigurationError } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(null)

  const fetchProfile = useCallback(async (userId) => {
    if (!supabase || !userId) return null
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (error) throw error
    if (!data.active) {
      await supabase.auth.signOut()
      throw new Error('Sua conta está desativada. Fale com um administrador.')
    }
    setProfile(data)
    return data
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return undefined
    }

    let active = true
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!active) return
      if (error) setAuthError(error.message)
      const currentSession = data.session
      setSession(currentSession)
      if (currentSession) {
        try {
          await fetchProfile(currentSession.user.id)
        } catch (profileError) {
          setAuthError(profileError.message)
          setProfile(null)
        }
      }
      if (active) setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      if (!nextSession) {
        setProfile(null)
        setLoading(false)
        return
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        window.setTimeout(() => {
          fetchProfile(nextSession.user.id).catch((error) => setAuthError(error.message))
        }, 0)
      }
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [fetchProfile])

  const signIn = useCallback(async (email, password) => {
    setAuthError(null)
    const client = requireSupabase()
    const { data, error } = await client.auth.signInWithPassword({ email, password })
    if (error) throw error
    const userProfile = await fetchProfile(data.user.id)
    return userProfile
  }, [fetchProfile])

  const signUp = useCallback(async (form) => {
    setAuthError(null)
    const client = requireSupabase()
    const { data, error } = await client.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        data: {
          full_name: form.fullName.trim(),
          username: form.username.trim().toLowerCase(),
          phone: form.phone.trim(),
          motorcycle_model: form.motorcycleModel.trim() || null,
          motorcycle_plate: form.motorcyclePlate.trim().toUpperCase() || null,
        },
      },
    })
    if (error) throw error
    return data
  }, [])

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut()
    setProfile(null)
    setSession(null)
  }, [])

  const refreshProfile = useCallback(() => {
    if (!session?.user?.id) return Promise.resolve(null)
    return fetchProfile(session.user.id)
  }, [fetchProfile, session])

  const value = useMemo(() => ({
    session,
    user: session?.user ?? null,
    profile,
    loading,
    authError,
    configurationError: supabaseConfigurationError,
    configured: isSupabaseConfigured,
    signIn,
    signUp,
    signOut,
    refreshProfile,
  }), [session, profile, loading, authError, signIn, signUp, signOut, refreshProfile])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return context
}
