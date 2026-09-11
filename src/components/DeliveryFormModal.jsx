import { useEffect, useMemo, useState } from 'react'
import { Calculator, MapPin, Route } from 'lucide-react'
import Modal from './Modal'
import { calculateDeliveryPreview, parseDistance } from '../services/pricingService'
import { formatCurrency } from '../utils/formatters'
import { normalizeOrderNumber } from '../utils/orderNumber'

export default function DeliveryFormModal({ open, mode = 'manual', delivery, onClose, onSubmit }) {
  const [orderNumber, setOrderNumber] = useState('')
  const [distance, setDistance] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  useEffect(() => {
    setOrderNumber(delivery?.order_number ?? '')
    setDistance(delivery?.distance_km ? String(delivery.distance_km).replace('.', ',') : '')
    setNotes(delivery?.notes ?? '')
    setError('')
    setConfirming(false)
  }, [delivery, open])
  const preview = useMemo(() => calculateDeliveryPreview(distance), [distance])
  const title = mode === 'edit' ? 'Corrigir entrega' : 'Registrar entrega'

  const submit = async (event) => {
    event.preventDefault()
    const parsed = parseDistance(distance)
    const normalizedOrder = normalizeOrderNumber(orderNumber)
    if (!normalizedOrder) { setError('Informe o número do pedido.'); return }
    if (!parsed || parsed <= 0) { setError('Informe uma quilometragem maior que zero.'); return }
    if (parsed > 999999.99) { setError('A quilometragem informada é muito alta.'); return }
    if (!confirming) { setOrderNumber(normalizedOrder); setConfirming(true); setError(''); return }
    setBusy(true); setError('')
    try {
      await onSubmit({ orderNumber: normalizedOrder, distance: parsed, notes: notes.trim() })
      onClose()
    } catch (submitError) {
      setError(submitError.message)
    } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={busy ? undefined : onClose} title={title}>
      <form className="modal-body delivery-form" onSubmit={submit}>
        {error && <div className="form-alert" role="alert">{error}</div>}
        {confirming ? <div className="delivery-confirmation"><p className="eyebrow">Confirmar entrega</p><h3>Confira antes de salvar</h3><dl><div><dt>Pedido</dt><dd>#{orderNumber}</dd></div><div><dt>Distância</dt><dd>{String(parseDistance(distance)).replace('.', ',')} km</dd></div><div><dt>Valor</dt><dd>{preview.pending ? 'Pendente de aprovação' : formatCurrency(preview.value)}</dd></div></dl></div> : <>
        <div className="delivery-form__hero"><span><Route /></span><div><strong>Quilometragem da entrega</strong><small>Use vírgula ou ponto. Máximo de 2 casas decimais.</small></div></div>
        <label className="order-field"><span>Número do pedido</span><div><b>#</b><input inputMode="text" autoComplete="off" placeholder="010" maxLength="30" value={orderNumber} onChange={(event) => setOrderNumber(event.target.value.toUpperCase())} /></div></label>
        <label className="distance-field">
          <MapPin />
          <input inputMode="decimal" autoFocus placeholder="0,0" value={distance} onChange={(event) => setDistance(event.target.value.replace(/[^\d.,]/g, '').slice(0, 9))} />
          <span>km</span>
        </label>
        <div className={`price-preview ${preview.pending ? 'price-preview--pending' : ''}`}>
          <Calculator />
          <div><small>Valor calculado</small><strong>{!preview.valid ? 'Informe a distância' : preview.pending ? '⚠ Valor pendente' : formatCurrency(preview.value)}</strong>{preview.valid && <span>{preview.pending ? 'Acima de 13 km: aprovação do administrador' : `Faixa ${preview.range}`}</span>}</div>
        </div>
        <label className="notes-field"><span>Observação <small>(opcional)</small></span><textarea rows="3" maxLength="500" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ex: entrega no condomínio, retorno pela avenida..." /></label>
        </>}
        <div className="delivery-confirm-actions">{confirming && <button type="button" className="button button--ghost" onClick={() => setConfirming(false)}>Voltar</button>}<button className="button button--primary button--full" disabled={busy || !preview.valid}>{busy ? <><span className="button-spinner" /> Salvando...</> : confirming ? 'Confirmar' : mode === 'edit' ? 'Revisar correção' : 'Revisar entrega'}</button></div>
        <p className="secure-price-note">O valor exibido é uma prévia. O cálculo oficial é realizado com segurança pelo banco de dados.</p>
      </form>
    </Modal>
  )
}
