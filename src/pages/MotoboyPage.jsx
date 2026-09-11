import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Bike, Check, Clock3, MapPinned, PackageCheck, Pencil, Plus, Power, UserRound, WalletCards, WifiOff } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import useNow from '../hooks/useNow'
import useOnlineStatus from '../hooks/useOnlineStatus'
import { finishDispatchCall, getMyQueuePosition, getOwnAvailability, setMyStatus, subscribeToAvailability, updateLastSeen } from '../services/availabilityService'
import { cancelOwnDelivery, getMyDeliveries, getMyTodayDeliveries, registerManualDelivery, subscribeToMyDeliveries, summarizeDeliveries, updateOwnDelivery } from '../services/deliveryService'
import { getMyPaymentClosings, subscribeToPayments } from '../services/paymentService'
import { elapsedTime, formatCurrency, formatDistance } from '../utils/formatters'
import DeliveryFormModal from '../components/DeliveryFormModal'
import DeliveryHistory from '../components/DeliveryHistory'
import PaymentHistory from '../components/PaymentHistory'
import ProfileEditor from '../components/ProfileEditor'
import PushNotificationSettings from '../components/PushNotificationSettings'

export default function MotoboyPage() {
  const location = useLocation()
  const { profile, user, refreshProfile } = useAuth()
  const { showToast } = useToast()
  const online = useOnlineStatus()
  const now = useNow(15000)
  const [availability, setAvailability] = useState(null)
  const [queuePosition, setQueuePosition] = useState(null)
  const [deliveries, setDeliveries] = useState([])
  const [todayDeliveries, setTodayDeliveries] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [changing, setChanging] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deliveryMode, setDeliveryMode] = useState(null)

  const loadOperationalData = useCallback(async () => {
    try {
      const [statusData, position, today, history] = await Promise.all([getOwnAvailability(user.id), getMyQueuePosition(), getMyTodayDeliveries(user.id), getMyDeliveries(user.id)])
      setAvailability(statusData); setQueuePosition(position); setTodayDeliveries(today); setDeliveries(history)
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
  const summary = useMemo(() => summarizeDeliveries(todayDeliveries), [todayDeliveries])

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

  const finishDispatch = async () => {
    if (!online || changing || !onDelivery) return
    setChanging(true)
    try {
      const saved = await finishDispatchCall()
      setAvailability(saved)
      showToast('Corrida finalizada. Você voltou ao final da fila.')
      await loadOperationalData()
    } catch (error) {
      showToast(`Não foi possível finalizar: ${error.message}`, 'error')
    } finally { setChanging(false) }
  }

  const submitDelivery = async ({ orderNumber, distance, notes }) => {
    await registerManualDelivery(orderNumber, distance, notes)
    showToast('Entrega registrada com sucesso!')
    await loadOperationalData()
  }
  const editDelivery = async (delivery, data) => { await updateOwnDelivery(delivery.id, data.orderNumber, data.distance, data.notes); showToast('Entrega corrigida e valor recalculado.'); await loadOperationalData() }
  const cancelDelivery = async (delivery) => {
    if (!window.confirm('Cancelar este registro de entrega? O histórico será preservado.')) return
    try { await cancelOwnDelivery(delivery.id); showToast('Entrega cancelada.', 'info'); await loadOperationalData() }
    catch (error) { showToast(error.message, 'error') }
  }

  const stateClass = onDelivery ? 'status-control--delivery' : available ? 'status-control--available' : 'status-control--unavailable'
  const section = location.pathname.endsWith('/historico')
    ? 'history'
    : location.pathname.endsWith('/financeiro')
      ? 'finance'
      : location.pathname.endsWith('/configuracoes')
        ? 'settings'
        : 'status'
  const pageCopy = {
    status: { eyebrow: 'Área do motoboy', title: `Olá, ${profile.full_name.split(' ')[0]} 👋`, description: 'Controle sua disponibilidade e registre suas entregas.' },
    history: { eyebrow: 'Suas entregas', title: 'Histórico', description: 'Consulte os pedidos e os valores das suas entregas recentes.' },
    finance: { eyebrow: 'Seus recebimentos', title: 'Financeiro', description: 'Acompanhe seus fechamentos e pagamentos.' },
    settings: { eyebrow: 'Sua conta', title: 'Configurações', description: 'Gerencie notificações e suas informações pessoais.' },
  }[section]
  return (
    <div className="motoboy-page page-container">
      <header className="page-intro motoboy-intro"><div><p className="eyebrow">{pageCopy.eyebrow}</p><h1>{pageCopy.title}</h1><p>{pageCopy.description}</p></div></header>
      {section === 'status' && <>
        <section className={`status-control ${stateClass}`}>
          <div className="status-glow" /><div className="status-label"><span className="status-dot" /> Status atual</div>
          <h2>{loading ? 'Consultando...' : onDelivery ? 'Em entrega' : available ? 'Disponível' : 'Indisponível'}</h2>
          <p className="status-time">{onDelivery ? <><Bike size={18} /> Você foi chamado pela cozinha</> : available ? <><Clock3 size={18} /> #{queuePosition ?? '—'} na fila · há {elapsedTime(availability?.available_since, now)}</> : 'Você não está na fila de entregas.'}</p>
          {onDelivery ? <button className="availability-button availability-button--finish" type="button" onClick={finishDispatch} disabled={changing || !online}><span className="availability-button__icon">{changing ? <span className="button-spinner" /> : <PackageCheck />}</span><span><small>CORRIDA EM ANDAMENTO</small>{changing ? 'Finalizando...' : 'Finalizar e voltar à fila'}</span></button> : <button className="availability-button" type="button" onClick={changeStatus} disabled={loading || changing || !online}><span className="availability-button__icon">{changing ? <span className="button-spinner" /> : available ? <Power /> : <Check />}</span><span><small>{available ? 'ENCERRAR TURNO' : 'PRONTO PARA ENTREGAR?'}</small>{changing ? 'Alterando status...' : available ? 'Ficar indisponível' : 'Ficar disponível'}</span></button>}
          {!online && <div className="inline-offline"><WifiOff size={17} /> Reconecte-se para continuar.</div>}
        </section>
        <section className="today-summary">
          <div className="today-summary__head"><span><p className="eyebrow">Hoje</p><h2>Seu movimento</h2></span><button type="button" className="button button--register" onClick={() => setDeliveryMode('manual')} disabled={onDelivery || !online}><Plus size={19} /> Registrar entrega</button></div>
          <div className="summary-grid"><div><PackageCheck /><span><small>Entregas</small><strong>{summary.count}</strong></span></div><div><MapPinned /><span><small>Quilometragem</small><strong>{formatDistance(summary.distance)}</strong></span></div><div><WalletCards /><span><small>Valor</small><strong>{formatCurrency(summary.amount)}</strong>{summary.pending > 0 && <em>{summary.pending} pendente</em>}</span></div></div>
        </section>
      </>}
      {section === 'history' && <DeliveryHistory deliveries={deliveries} onEdit={editDelivery} onCancel={cancelDelivery} />}
      {section === 'finance' && <PaymentHistory payments={payments} />}
      {section === 'settings' && <>
        <PushNotificationSettings />
        <section className="motoboy-section profile-settings">
          <div className="section-heading"><div><UserRound /><span><p className="eyebrow">Cadastro</p><h2>Minhas informações</h2></span></div></div>
          <div className="motoboy-info-grid"><div className="info-tile"><UserRound /><span><small>Nome</small><strong>{profile.full_name}</strong></span></div><div className="info-tile"><Bike /><span><small>Moto cadastrada</small><strong>{profile.motorcycle_model || 'Não informada'}</strong></span></div></div>
          <button className="button button--primary button--full profile-settings__button" type="button" onClick={() => setEditOpen(true)}><Pencil size={17} /> Alterar minhas informações</button>
        </section>
      </>}
      <ProfileEditor open={editOpen} onClose={() => setEditOpen(false)} profile={profile} onSaved={refreshProfile} />
      <DeliveryFormModal open={deliveryMode === 'manual'} mode="manual" onClose={() => setDeliveryMode(null)} onSubmit={submitDelivery} />
    </div>
  )
}
