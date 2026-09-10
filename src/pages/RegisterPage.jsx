import { useState } from 'react'
import { Bike, Eye, EyeOff, IdCard, LockKeyhole, Mail, Phone, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import FormField from '../components/FormField'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { formatPhone } from '../utils/formatters'

const initialForm = { fullName: '', username: '', phone: '', email: '', password: '', motorcycleModel: '', motorcyclePlate: '' }

export default function RegisterPage() {
  const { signUp, configured } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [form, setForm] = useState(initialForm)
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const change = (field, value) => setForm((current) => ({ ...current, [field]: value }))
  const submit = async (event) => {
    event.preventDefault()
    setError('')
    if (form.password.length < 8) {
      setError('A senha precisa ter pelo menos 8 caracteres.')
      return
    }
    setBusy(true)
    try {
      const data = await signUp(form)
      if (data.session) {
        showToast('Conta criada com sucesso!')
        navigate('/motoboy', { replace: true })
      } else {
        showToast('Cadastro realizado. Confirme o e-mail para entrar.', 'info')
        navigate('/login', { replace: true })
      }
    } catch (registerError) {
      let message = registerError.message
      if (message.includes('profiles_username')) message = 'Este nome de usuário já está em uso.'
      if (message.includes('already registered')) message = 'Este e-mail já possui cadastro.'
      setError(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout eyebrow="Novo motoboy" title="Crie sua conta" subtitle="Leva menos de um minuto. Dados da moto são opcionais." footerText="Já possui uma conta?" footerLink="/login" footerLabel="Entrar">
      {!configured && <div className="config-alert">Configure o arquivo <code>.env</code> para conectar ao Supabase.</div>}
      {error && <div className="form-alert" role="alert">{error}</div>}
      <form className="auth-form auth-form--register" onSubmit={submit}>
        <div className="form-grid">
          <FormField label="Nome completo" icon={UserRound}>
            <input autoComplete="name" placeholder="Seu nome" value={form.fullName} onChange={(e) => change('fullName', e.target.value)} required minLength={3} />
          </FormField>
          <FormField label="Nome de usuário" icon={IdCard}>
            <input autoComplete="username" placeholder="ex: joao.silva" value={form.username} onChange={(e) => change('username', e.target.value.replace(/\s/g, ''))} required minLength={3} />
          </FormField>
          <FormField label="Telefone / WhatsApp" icon={Phone}>
            <input inputMode="tel" autoComplete="tel" placeholder="(41) 99999-9999" value={form.phone} onChange={(e) => change('phone', formatPhone(e.target.value))} required minLength={14} />
          </FormField>
          <FormField label="E-mail" icon={Mail}>
            <input type="email" autoComplete="email" placeholder="voce@exemplo.com" value={form.email} onChange={(e) => change('email', e.target.value)} required />
          </FormField>
          <FormField label="Modelo da moto (opcional)" icon={Bike}>
            <input placeholder="Ex: Honda CG 160" value={form.motorcycleModel} onChange={(e) => change('motorcycleModel', e.target.value)} />
          </FormField>
          <FormField label="Placa (opcional)" icon={IdCard}>
            <input placeholder="ABC1D23" value={form.motorcyclePlate} onChange={(e) => change('motorcyclePlate', e.target.value.toUpperCase().slice(0, 7))} />
          </FormField>
        </div>
        <FormField label="Senha" icon={LockKeyhole}>
          <input type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Mínimo de 8 caracteres" value={form.password} onChange={(e) => change('password', e.target.value)} required minLength={8} />
          <button type="button" className="password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </FormField>
        <p className="form-hint">Ao criar a conta, seu perfil será cadastrado como motoboy.</p>
        <button className="button button--primary button--full" disabled={busy || !configured}>
          {busy ? <><span className="button-spinner" /> Criando conta...</> : 'Criar minha conta'}
        </button>
      </form>
    </AuthLayout>
  )
}
