import { useEffect, useState } from 'react'
import { Bike, Eye, EyeOff, IdCard, LockKeyhole, Mail, Phone, Shield, UserRound } from 'lucide-react'
import FormField from './FormField'
import Modal from './Modal'
import { useToast } from '../contexts/ToastContext'
import { adminCreateUser } from '../services/profileService'
import { formatPhone } from '../utils/formatters'

const initialForm = {
  fullName: '', username: '', phone: '', email: '', password: '', role: 'motoboy', motorcycleModel: '', motorcyclePlate: '',
}

export default function AdminUserCreator({ open, onClose, onSaved }) {
  const { showToast } = useToast()
  const [form, setForm] = useState(initialForm)
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setForm(initialForm)
    setShowPassword(false)
    setError('')
  }, [open])

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
      await adminCreateUser(form)
      await onSaved()
      showToast('Usuário criado e pronto para entrar.')
      onClose()
    } catch (createError) {
      setError(createError.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Cadastrar usuário">
      <form className="modal-body edit-form" onSubmit={submit}>
        {error && <div className="form-alert" role="alert">{error}</div>}
        <div className="form-grid">
          <FormField label="Nome completo" icon={UserRound}><input autoComplete="name" value={form.fullName} onChange={(e) => change('fullName', e.target.value)} required minLength={3} /></FormField>
          <FormField label="Usuário" icon={IdCard}><input autoComplete="username" placeholder="ex: joao.silva" value={form.username} onChange={(e) => change('username', e.target.value.replace(/\s/g, ''))} required minLength={3} /></FormField>
          <FormField label="Telefone / WhatsApp" icon={Phone}><input inputMode="tel" autoComplete="tel" placeholder="(41) 99999-9999" value={form.phone} onChange={(e) => change('phone', formatPhone(e.target.value))} required minLength={14} /></FormField>
          <FormField label="E-mail de acesso" icon={Mail}><input type="email" autoComplete="email" value={form.email} onChange={(e) => change('email', e.target.value)} required /></FormField>
          <FormField label="Função" icon={Shield}><select value={form.role} onChange={(e) => change('role', e.target.value)}><option value="motoboy">Motoboy</option><option value="kitchen">Cozinha</option><option value="admin">Administrador</option></select></FormField>
          <FormField label="Senha inicial" icon={LockKeyhole}>
            <input type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Mínimo de 8 caracteres" value={form.password} onChange={(e) => change('password', e.target.value)} required minLength={8} />
            <button type="button" className="password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </FormField>
          {form.role === 'motoboy' && <>
            <FormField label="Modelo da moto (opcional)" icon={Bike}><input value={form.motorcycleModel} onChange={(e) => change('motorcycleModel', e.target.value)} /></FormField>
            <FormField label="Placa (opcional)" icon={IdCard}><input placeholder="ABC1D23" value={form.motorcyclePlate} onChange={(e) => change('motorcyclePlate', e.target.value.toUpperCase().slice(0, 7))} /></FormField>
          </>}
        </div>
        <p className="form-hint">A conta será criada ativa e com o e-mail já confirmado.</p>
        <div className="modal-actions">
          <button type="button" className="button button--ghost" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="button button--primary" disabled={busy}>{busy ? <><span className="button-spinner" /> Criando...</> : 'Cadastrar usuário'}</button>
        </div>
      </form>
    </Modal>
  )
}
