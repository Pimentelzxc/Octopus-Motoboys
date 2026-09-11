import { useEffect, useMemo, useState } from 'react'
import { Bike, Calculator, MapPin, Route } from 'lucide-react'
import Modal from './Modal'
import { calculateDeliveryPreview, parseDistance } from '../services/pricingService'
import { formatCurrency } from '../utils/formatters'
import { normalizeOrderNumber } from '../utils/orderNumber'

export default function DeliveryFormModal({ open, mode = 'manual', delivery, activeOrder, activeOrdersCount = 0, onClose, onSubmit }) {
  const [orderNumber, setOrderNumber] = useState('')
  const [distance, setDistance] = useState('')
  const [notes, setNotes] = useState('')
  const [returnAvailable, setReturnAvailable] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  useEffect(() => {
    setOrderNumber(delivery?.order_number ?? activeOrder ?? '')
    setDistance(delivery?.distance_km ? String(delivery.distance_km).replace('.', ',') : '')
    setNotes(delivery?.notes ?? '')
    setReturnAvailable(true)
    setError('')
    setConfirming(false)
  }, [activeOrder, delivery, open])
  const preview = useMemo(() => calculateDeliveryPreview(distance), [distance])
  const title = mode === 'finish' ? 'Finalizar entrega' : mode === 'edit' ? 'Corrigir entrega' : 'Registrar entrega'

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
      await onSubmit({ orderNumber: normalizedOrder, distance: parsed, notes: notes.trim(), returnAvailable })
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
        <label className="order-field"><span>Número do pedido</span><div><b>#</b><input inputMode="text" autoComplete="off" placeholder="010" maxLength="30" readOnly={Boolean(activeOrder && mode === 'finish')} value={orderNumber} onChange={(event) => setOrderNumber(event.target.value.toUpperCase())} /></div>{activeOrder && mode === 'finish' && <small>Pedido informado pela cozinha</small>}</label>
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
        {mode === 'finish' && activeOrdersCount > 1 && <div className="batch-progress-note"><Bike /><span><strong>Despacho com vários pedidos</strong><small>Após este, ainda restará {activeOrdersCount - 1} pedido(s). Você continuará em entrega.</small></span></div>}
        {mode === 'finish' && activeOrdersCount <= 1 && (
          <label className="switch-field return-switch"><span><strong>Ficar disponível novamente</strong><small>Você entrará no final da fila com um novo horário.</small></span><input type="checkbox" checked={returnAvailable} onChange={(event) => setReturnAvailable(event.target.checked)} /><i /></label>
        )}
        </>}
        <div className="delivery-confirm-actions">{confirming && <button type="button" className="button button--ghost" onClick={() => setConfirming(false)}>Voltar</button>}<button className="button button--primary button--full" disabled={busy || !preview.valid}>{busy ? <><span className="button-spinner" /> Salvando...</> : confirming ? 'Confirmar' : mode === 'finish' ? <><Bike /> Revisar finalização</> : mode === 'edit' ? 'Revisar correção' : 'Revisar entrega'}</button></div>
        <p className="secure-price-note">O valor exibido é uma prévia. O cálculo oficial é realizado com segurança pelo banco de dados.</p>
      </form>
    </Modal>
  )
}
