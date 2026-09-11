import { useEffect, useState } from 'react'
import { Navigation, Plus, UserRound, X } from 'lucide-react'
import Modal from './Modal'
import { normalizeOrderNumber } from '../utils/orderNumber'

export default function DispatchModal({ motoboy, open, busy, onClose, onConfirm }) {
  const [orderNumber, setOrderNumber] = useState('')
  const [orders, setOrders] = useState([])
  const [error, setError] = useState('')
  useEffect(() => { setOrderNumber(''); setOrders([]); setError('') }, [motoboy])
  if (!motoboy) return null

  const addOrder = () => {
    const normalized = normalizeOrderNumber(orderNumber)
    if (!normalized) return
    if (orders.includes(normalized)) { setError(`O pedido #${normalized} já foi adicionado.`); return }
    if (orders.length >= 20) { setError('É possível despachar até 20 pedidos por vez.'); return }
    setOrders((current) => [...current, normalized]); setOrderNumber(''); setError('')
  }
  const submit = async (event) => {
    event.preventDefault()
    const pendingOrder = normalizeOrderNumber(orderNumber)
    if (pendingOrder && orders.includes(pendingOrder)) { setError(`O pedido #${pendingOrder} já foi adicionado.`); return }
    const finalOrders = pendingOrder && !orders.includes(pendingOrder) ? [...orders, pendingOrder] : orders
    if (finalOrders.length > 20) { setError('É possível despachar até 20 pedidos por vez.'); return }
    await onConfirm(finalOrders)
  }
  const pendingOrder = normalizeOrderNumber(orderNumber)
  const totalOrders = orders.length + (pendingOrder && !orders.includes(pendingOrder) ? 1 : 0)
  return <Modal open={open} onClose={busy ? undefined : onClose} title="Chamar motoboy"><form className="modal-body dispatch-form" onSubmit={submit}>
    <div className="dispatch-person"><UserRound /><span><small>Motoboy selecionado</small><strong>{motoboy.full_name}</strong></span></div>
    {error && <div className="form-alert" role="alert">{error}</div>}
    <label className="order-field"><span>Números dos pedidos <small>(opcional)</small></span><div><b>#</b><input autoFocus inputMode="text" maxLength="30" placeholder="010" value={orderNumber} onChange={(event) => setOrderNumber(event.target.value.toUpperCase())} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); addOrder() } }} /><button type="button" className="order-add-button" onClick={addOrder} disabled={!orderNumber.trim()} aria-label="Adicionar pedido"><Plus /></button></div><small>Digite um pedido e pressione Enter. Repita para adicionar vários.</small></label>
    {orders.length > 0 && <div className="dispatch-orders"><div><span>Pedidos deste despacho</span><strong>{orders.length}</strong></div><ul>{orders.map((order) => <li key={order}><b>#{order}</b><button type="button" onClick={() => setOrders((current) => current.filter((item) => item !== order))} aria-label={`Remover pedido ${order}`}><X /></button></li>)}</ul></div>}
    <button className="button button--primary button--full" disabled={busy}><Navigation />{busy ? 'Chamando...' : totalOrders > 1 ? `Despachar ${totalOrders} pedidos` : 'Confirmar despacho'}</button>
  </form></Modal>
}
