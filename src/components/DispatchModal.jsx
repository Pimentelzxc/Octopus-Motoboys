import { useEffect, useState } from 'react'
import { Navigation, UserRound } from 'lucide-react'
import Modal from './Modal'
import { normalizeOrderNumber } from '../utils/orderNumber'

export default function DispatchModal({ motoboy, open, busy, onClose, onConfirm }) {
  const [orderNumber, setOrderNumber] = useState('')
  useEffect(() => setOrderNumber(''), [motoboy])
  if (!motoboy) return null
  const submit = async (event) => { event.preventDefault(); await onConfirm(normalizeOrderNumber(orderNumber)) }
  return <Modal open={open} onClose={busy ? undefined : onClose} title="Chamar motoboy"><form className="modal-body dispatch-form" onSubmit={submit}>
    <div className="dispatch-person"><UserRound /><span><small>Motoboy selecionado</small><strong>{motoboy.full_name}</strong></span></div>
    <label className="order-field"><span>Número do pedido <small>(opcional)</small></span><div><b>#</b><input autoFocus inputMode="text" maxLength="30" placeholder="010" value={orderNumber} onChange={(event) => setOrderNumber(event.target.value.toUpperCase())} /></div><small>Se preenchido, o pedido será iniciado agora e o motoboy não precisará digitá-lo novamente.</small></label>
    <button className="button button--primary button--full" disabled={busy}><Navigation />{busy ? 'Chamando...' : 'Confirmar despacho'}</button>
  </form></Modal>
}
