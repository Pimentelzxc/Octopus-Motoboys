import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bike, Check, Clock3, MapPinned, PackageCheck, Pencil, Plus, Power, ShieldCheck, WalletCards, WifiOff } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import useNow from '../hooks/useNow'
import useOnlineStatus from '../hooks/useOnlineStatus'
import { getMyQueuePosition, getOwnAvailability, setMyStatus, subscribeToAvailability, updateLastSeen } from '../services/availabilityService'
import { cancelOwnDelivery, finishDispatchedDelivery, getActiveDelivery, getMyTodayDeliveries, registerManualDelivery, subscribeToMyDeliveries, summarizeDeliveries, updateOwnDelivery } from '../services/deliveryService'
import { getMyPaymentClosings, subscribeToPayments } from '../services/paymentService'
import { elapsedTime, formatCurrency, formatDistance } from '../utils/formatters'
import DeliveryFormModal from '../components/DeliveryFormModal'
import DeliveryHistory from '../components/DeliveryHistory'
import PaymentHistory from '../components/PaymentHistory'
import ProfileEditor from '../components/ProfileEditor'

export default function MotoboyPage() {
  const { profile, user, refreshProfile } = useAuth()
  const { showToast } = useToast()
  const online = useOnlineStatus()
  const now = useNow(15000)
  const [availability, setAvailability] = useState(null)
  const [queuePosition, setQueuePosition] = useState(null)
  const [deliveries, setDeliveries] = useState([])
  const [activeDelivery, setActiveDelivery] = useState(null)
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [changing, setChanging] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deliveryMode, setDeliveryMode] = useState(null)

  const loadOperationalData = useCallback(async () => {
    try {
      const [statusData, position, todayDeliveries, currentDelivery] = await Promise.all([getOwnAvailability(user.id), getMyQueuePosition(), getMyTodayDeliveries(user.id), getActiveDelivery(user.id)])
      setAvailability(statusData); setQueuePosition(position); setDeliveries(todayDeliveries); setActiveDelivery(currentDelivery)
    } catch (error) { showToast(`Não foi possível atualizar seus dados: ${error.message}`, 'error') }
    finally { setLoading(false) }
  }, [showToast, user.id])

  const loadPayments = useCallback(async () => {
    try { setPayments(await getMyPaymentClosings(user.id)) }
    catch (error) { showToast(`Erro ao carregar pagamentos: ${error.message}`, 'error') }
  }, [showToast, user.id])

  useEffect(() => {
    loadOperationalData(); loadPayments()
    let refreshTimer
    const refresh = () => { window.clearTimeout(refreshTimer); refreshTimer = window.setTimeout(loadOperationalData, 150) }
    const offAvailability = subscribeToAvailability(refresh)
    const offDeliveries = subscribeToMyDeliveries(user.id, refresh)
    const offPayments = subscribeToPayments(loadPayments)
    return () => { window.clearTimeout(refreshTimer); offAvailability(); offDeliveries(); offPayments() }
  }, [loadOperationalData, loadPayments, user.id])

  useEffect(() => {
    if (!online) return undefined
    const heartbeat = () => updateLastSeen(user.id).catch(() => {})
    heartbeat(); const timer = window.setInterval(heartbeat, 120000)
    return () => window.clearInterval(timer)
  }, [online, user.id])

  const status = availability?.status ?? (availability?.is_available ? 'available' : 'offline')
  const available = status === 'available'
  const onDelivery = status === 'on_delivery'
  const summary = useMemo(() => summarizeDeliveries(deliveries), [deliveries])

  const changeStatus = async () => {
    if (!online || changing || onDelivery) return
    const next = available ? 'offline' : 'available'; const previous = availability
    setChanging(true)
    setAvailability((current) => ({ ...current, status: next, is_available: next === 'available', available_since: next === 'available' ? new Date().toISOString() : null }))
    try {
      const saved = await setMyStatus(next); setAvailability(saved)
      showToast(next === 'available' ? 'Você está disponível para entregas.' : 'Você está indisponível.', next === 'available' ? 'success' : 'info')
      await loadOperationalData()
    } catch (error) { setAvailability(previous); showToast(`Status não alterado: ${error.message}`, 'error') }
    finally { setChanging(false) }
  }

  const submitDelivery = async ({ orderNumber, distance, notes, returnAvailable }) => {
    if (deliveryMode === 'finish') await finishDispatchedDelivery(orderNumber, distance, notes, returnAvailable)
    else await registerManualDelivery(orderNumber, distance, notes)
    showToast(deliveryMode === 'finish' ? 'Entrega finalizada e registrada!' : 'Entrega registrada com sucesso!')
    await loadOperationalData()
  }
  const editDelivery = async (delivery, data) => { await updateOwnDelivery(delivery.id, data.orderNumber, data.distance, data.notes); showToast('Entrega corrigida e valor recalculado.'); await loadOperationalData() }
  const cancelDelivery = async (delivery) => {
    if (!window.confirm('Cancelar este registro de entrega? O histórico será preservado.')) return
    try { await cancelOwnDelivery(delivery.id); showToast('Entrega cancelada.', 'info'); await loadOperationalData() }
    catch (error) { showToast(error.message, 'error') }
  }

  const stateClass = onDelivery ? 'status-control--delivery' : available ? 'status-control--available' : 'status-control--unavailable'
  return (
    <div className="motoboy-page page-container">
      <header className="page-intro motoboy-intro"><div><p className="eyebrow">Área do motoboy</p><h1>Olá, {profile.full_name.split(' ')[0]} <span aria-hidden="true">👋</span></h1><p>Seu turno, suas entregas e pagamentos em um só lugar.</p></div><button className="button button--subtle" type="button" onClick={() => setEditOpen(true)}><Pencil size={17} /> Meus dados</button></header>
      <section className={`status-control ${stateClass}`}>
        <div className="status-glow" /><div className="status-label"><span className="status-dot" /> Status atual</div>
        <h2>{loading ? 'Consultando...' : onDelivery ? 'Em entrega' : available ? 'Disponível' : 'Indisponível'}</h2>
        <p className="status-time">{onDelivery ? <><Bike size={18} /> {activeDelivery?.order_number ? `Pedido #${activeDelivery.order_number}` : 'Você foi chamado pela cozinha'}</> : available ? <><Clock3 size={18} /> #{queuePosition ?? '—'} na fila · há {elapsedTime(availability?.available_since, now)}</> : 'Você não está na fila de entregas.'}</p>
        {onDelivery ? <button className="availability-button availability-button--finish" type="button" onClick={() => setDeliveryMode('finish')} disabled={!online}><span className="availability-button__icon"><PackageCheck /></span><span><small>CORRIDA EM ANDAMENTO</small>Finalizar entrega</span></button> : <button className="availability-button" type="button" onClick={changeStatus} disabled={loading || changing || !online}><span className="availability-button__icon">{changing ? <span className="button-spinner" /> : available ? <Power /> : <Check />}</span><span><small>{available ? 'ENCERRAR TURNO' : 'PRONTO PARA ENTREGAR?'}</small>{changing ? 'Alterando status...' : available ? 'Ficar indisponível' : 'Ficar disponível'}</span></button>}
        {!online && <div className="inline-offline"><WifiOff size={17} /> Reconecte-se para continuar.</div>}
      </section>
      <section className="today-summary">
        <div className="today-summary__head"><span><p className="eyebrow">Hoje</p><h2>Seu movimento</h2></span><button type="button" className="button button--register" onClick={() => setDeliveryMode('manual')} disabled={onDelivery || !online}><Plus size={19} /> Registrar entrega</button></div>
        <div className="summary-grid"><div><PackageCheck /><span><small>Entregas</small><strong>{summary.count}</strong></span></div><div><MapPinned /><span><small>Quilometragem</small><strong>{formatDistance(summary.distance)}</strong></span></div><div><WalletCards /><span><small>Valor</small><strong>{formatCurrency(summary.amount)}</strong>{summary.pending > 0 && <em>{summary.pending} pendente</em>}</span></div></div>
      </section>
      <DeliveryHistory deliveries={deliveries} onEdit={editDelivery} onCancel={cancelDelivery} />
      <PaymentHistory payments={payments} />
      <div className="motoboy-info-grid"><div className="info-tile"><Bike /><span><small>Moto cadastrada</small><strong>{profile.motorcycle_model || 'Não informada'}</strong></span></div><div className="info-tile"><ShieldCheck /><span><small>Operação</small><strong>{onDelivery ? 'Em rota de entrega' : available ? 'Aguardando chamada' : 'Fora da fila'}</strong></span></div></div>
      <ProfileEditor open={editOpen} onClose={() => setEditOpen(false)} profile={profile} onSaved={refreshProfile} />
      <DeliveryFormModal open={Boolean(deliveryMode)} mode={deliveryMode ?? 'manual'} activeOrder={deliveryMode === 'finish' ? activeDelivery?.order_number : null} onClose={() => setDeliveryMode(null)} onSubmit={submitDelivery} />
    </div>
  )
}
