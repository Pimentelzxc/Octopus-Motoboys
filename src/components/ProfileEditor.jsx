import { useEffect, useState } from 'react'
import { Bike, IdCard, Phone, UserRound } from 'lucide-react'
import FormField from './FormField'
import Modal from './Modal'
import { updateOwnProfile } from '../services/profileService'
import { formatPhone } from '../utils/formatters'
import { useToast } from '../contexts/ToastContext'

export default function ProfileEditor({ open, onClose, profile, onSaved }) {
  const { showToast } = useToast()
  const [form, setForm] = useState(profile)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => setForm(profile), [profile])
  if (!form) return null

  const change = (field, value) => setForm((current) => ({ ...current, [field]: value }))
  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await updateOwnProfile(profile.id, form)
      await onSaved()
      showToast('Seus dados foram atualizados.')
      onClose()
    } catch (saveError) {
      setError(saveError.message.includes('profiles_username') ? 'Este nome de usuário já está em uso.' : saveError.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Meus dados">
      <form className="modal-body edit-form" onSubmit={submit}>
        {error && <div className="form-alert" role="alert">{error}</div>}
        <FormField label="Nome completo" icon={UserRound}><input value={form.full_name} onChange={(e) => change('full_name', e.target.value)} required /></FormField>
        <FormField label="Nome de usuário" icon={IdCard}><input value={form.username} onChange={(e) => change('username', e.target.value.replace(/\s/g, ''))} required /></FormField>
        <FormField label="Telefone / WhatsApp" icon={Phone}><input value={form.phone} onChange={(e) => change('phone', formatPhone(e.target.value))} required /></FormField>
        <div className="form-grid">
          <FormField label="Modelo da moto" icon={Bike}><input value={form.motorcycle_model ?? ''} onChange={(e) => change('motorcycle_model', e.target.value)} /></FormField>
          <FormField label="Placa" icon={IdCard}><input value={form.motorcycle_plate ?? ''} onChange={(e) => change('motorcycle_plate', e.target.value.toUpperCase().slice(0, 7))} /></FormField>
        </div>
        <div className="modal-actions">
          <button type="button" className="button button--ghost" onClick={onClose}>Cancelar</button>
          <button className="button button--primary" disabled={busy}>{busy ? 'Salvando...' : 'Salvar alterações'}</button>
        </div>
      </form>
    </Modal>
  )
}
