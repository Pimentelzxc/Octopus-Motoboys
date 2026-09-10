import { useState } from 'react'
import { Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import FormField from '../components/FormField'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'

export default function LoginPage() {
  const { signIn, session, profile, configured } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (session && profile) {
    const route = profile.role === 'admin' ? '/admin' : profile.role === 'kitchen' ? '/cozinha' : '/motoboy'
    return <Navigate to={route} replace />
  }

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const signedProfile = await signIn(form.email.trim(), form.password)
      const route = signedProfile.role === 'admin' ? '/admin' : signedProfile.role === 'kitchen' ? '/cozinha' : '/motoboy'
      showToast(`Bem-vindo, ${signedProfile.full_name.split(' ')[0]}!`)
      navigate(route, { replace: true })
    } catch (loginError) {
      const message = loginError.message.includes('Invalid login') ? 'E-mail ou senha incorretos.' : loginError.message
      setError(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout eyebrow="Acesso à operação" title="Bem-vindo de volta" subtitle="Entre para atualizar seu status ou acompanhar a equipe." footerText="Ainda não tem uma conta?" footerLink="/cadastro" footerLabel="Cadastre-se">
      {!configured && <div className="config-alert">Configure o arquivo <code>.env</code> para conectar ao Supabase.</div>}
      {error && <div className="form-alert" role="alert">{error}</div>}
      <form className="auth-form" onSubmit={submit}>
        <FormField label="E-mail" icon={Mail}>
          <input type="email" autoComplete="email" placeholder="voce@exemplo.com" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
        </FormField>
        <FormField label="Senha" icon={LockKeyhole}>
          <input type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Sua senha" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required />
          <button type="button" className="password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </FormField>
        <button className="button button--primary button--full" disabled={busy || !configured}>
          {busy ? <><span className="button-spinner" /> Entrando...</> : 'Entrar no sistema'}
        </button>
      </form>
    </AuthLayout>
  )
}
