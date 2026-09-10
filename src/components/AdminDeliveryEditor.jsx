import { useEffect, useState } from 'react'
import Modal from './Modal'
import { parseDistance } from '../services/pricingService'
import { formatCurrency } from '../utils/formatters'
import { normalizeOrderNumber } from '../utils/orderNumber'

export default function AdminDeliveryEditor({ delivery, open, onClose, onSave, onCancelDelivery }) {
  const [orderNumber, setOrderNumber] = useState('')
  const [distance, setDistance] = useState('')
  const [notes, setNotes] = useState('')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { setOrderNumber(delivery?.order_number ?? ''); setDistance(String(delivery?.distance_km ?? '').replace('.', ',')); setNotes(delivery?.notes ?? ''); setValue(''); setError('') }, [delivery])
  if (!delivery) return null
  const submit = async (event) => {
    event.preventDefault(); const parsed = parseDistance(distance)
    if (!parsed || parsed <= 0) { setError('Informe uma quilometragem válida.'); return }
    if (!orderNumber.trim()) { setError('Informe o número do pedido.'); return }
    const parsedValue = value === '' ? null : Number(String(value).replace(',', '.'))
    if (parsedValue !== null && (!Number.isFinite(parsedValue) || parsedValue < 0)) { setError('Informe um valor válido.'); return }
    setBusy(true); setError('')
    try { await onSave(delivery, { orderNumber: normalizeOrderNumber(orderNumber), distance: parsed, notes, finalValue: parsedValue }); onClose() }
    catch (saveError) { setError(saveError.message) } finally { setBusy(false) }
  }
  return <Modal open={open} onClose={onClose} title="Corrigir entrega"><form className="modal-body edit-form" onSubmit={submit}>
    {error && <div className="form-alert">{error}</div>}
    {delivery.payment_closing_id && <div className="config-alert">Esta entrega pertence a um fechamento e está congelada.</div>}
    <label className="plain-field"><span>Número do pedido</span><div><b>#</b><input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value.toUpperCase())} /></div></label>
    <label className="plain-field"><span>Quilometragem</span><div><input value={distance} onChange={(e) => setDistance(e.target.value.replace(/[^\d.,]/g, ''))} inputMode="decimal" /><b>km</b></div></label>
    <label className="plain-field"><span>Valor final ajustado</span><div><b>R$</b><input value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, ''))} inputMode="decimal" placeholder="Vazio = cálculo automático" /></div><small>Atual: {formatCurrency(delivery.final_value)}. Preencha somente quando precisar substituir o cálculo ou aprovar uma distância acima de 13 km.</small></label>
    <label className="notes-field"><span>Observação</span><textarea rows="3" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
    <div className="modal-actions"><button type="button" className="button button--danger" disabled={busy || delivery.payment_closing_id} onClick={() => onCancelDelivery(delivery)}>Cancelar entrega</button><button className="button button--primary" disabled={busy || delivery.payment_closing_id}>{busy ? 'Salvando...' : 'Salvar correção'}</button></div>
  </form></Modal>
}
