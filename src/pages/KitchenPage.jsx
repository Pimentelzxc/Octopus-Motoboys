import { useCallback, useEffect, useState } from 'react'
import { Bike, ChefHat, Clock3, MessageCircle, Navigation, RefreshCw, TimerReset, UsersRound } from 'lucide-react'
import EmptyState from '../components/EmptyState'
import DispatchModal from '../components/DispatchModal'
import { useToast } from '../contexts/ToastContext'
import useNow from '../hooks/useNow'
import useOnlineStatus from '../hooks/useOnlineStatus'
import { dispatchMotoboy, getKitchenQueue, subscribeToAvailability } from '../services/availabilityService'
import { elapsedTime, formatPhone, getInitials, whatsappUrl } from '../utils/formatters'

export default function KitchenPage() {
  const { showToast } = useToast()
  const online = useOnlineStatus()
  const now = useNow(10000)
  const [motoboys, setMotoboys] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [dispatching, setDispatching] = useState(null)
  const [selectedDispatch, setSelectedDispatch] = useState(null)

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true)
    try {
      const data = await getKitchenQueue()
      setMotoboys(data)
      if (manual) showToast('Lista atualizada.')
    } catch (error) {
      showToast(`Erro ao atualizar a fila: ${error.message}`, 'error')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [showToast])

  useEffect(() => {
    load()
    let debounce
    const unsubscribe = subscribeToAvailability(() => {
      window.clearTimeout(debounce)
      debounce = window.setTimeout(load, 150)
    })
    return () => {
      window.clearTimeout(debounce)
      unsubscribe()
    }
  }, [load])

  useEffect(() => {
    if (online) load()
  }, [online, load])

  const currentTime = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(now)
  const callMotoboy = async (person, orderNumbers) => {
    setDispatching(person.user_id)
    try { await dispatchMotoboy(person.user_id, orderNumbers); const count = orderNumbers.length; showToast(`${person.full_name} foi chamado${count === 1 ? ` para o pedido #${orderNumbers[0]}` : count > 1 ? ` com ${count} pedidos` : ' para entrega'}.`); setSelectedDispatch(null); await load() }
    catch (error) { showToast(`Não foi possível chamar: ${error.message}`, 'error') }
    finally { setDispatching(null) }
  }
  return (
    <div className="kitchen-page page-container page-container--wide">
      <header className="kitchen-header">
        <div>
          <p className="eyebrow">Central de despacho</p>
          <h1>Fila da cozinha</h1>
          <p>Equipe disponível em tempo real, por ordem de chegada.</p>
        </div>
        <div className="kitchen-clock"><Clock3 size={22} /><span><small>Horário atual</small><strong>{currentTime}</strong></span></div>
      </header>

      <section className="queue-overview">
        <div className="queue-count">
          <div className="queue-count__icon"><UsersRound /></div>
          <div><span>Motoboys disponíveis</span><strong>{motoboys.length}</strong><small>{motoboys.length === 1 ? 'profissional na fila' : 'profissionais na fila'}</small></div>
        </div>
        <div className="queue-live"><span className="live-dot" /> {online ? 'Atualização em tempo real' : 'Aguardando conexão'}</div>
        <button className="button button--subtle" type="button" onClick={() => load(true)} disabled={refreshing || !online}>
          <RefreshCw size={18} className={refreshing ? 'spin' : ''} /> {refreshing ? 'Atualizando' : 'Atualizar lista'}
        </button>
      </section>

      <div className="queue-section-title"><div><ChefHat /><h2>Próximos para entrega</h2></div><span>Mais tempo esperando primeiro</span></div>
      {loading ? (
        <div className="queue-loading"><span className="spinner" /> Carregando fila...</div>
      ) : motoboys.length === 0 ? (
        <EmptyState icon={Bike} title="Nenhum motoboy disponível" description="Quando alguém ficar disponível, aparecerá aqui automaticamente." />
      ) : (
        <div className="queue-grid">
          {motoboys.map((item, index) => {
            const person = item
            const inactiveMinutes = person.last_seen ? Math.floor((now - new Date(person.last_seen).getTime()) / 60000) : Infinity
            const stale = inactiveMinutes >= 10
            return (
              <article className={`queue-card ${index === 0 ? 'queue-card--first' : ''}`} key={item.user_id}>
                <div className="queue-position"><span>#</span>{index + 1}</div>
                <div className="queue-card__top">
                  <div className="avatar">{getInitials(person.full_name)}</div>
                  <div className="queue-person"><span className="available-chip"><i /> Disponível</span><h3>{person.full_name}</h3><p>{person.motorcycle_model || 'Moto não informada'} {person.motorcycle_plate && <b>• {person.motorcycle_plate}</b>}</p></div>
                </div>
                <div className="waiting-time"><TimerReset /><span><small>Esperando há</small><strong>{elapsedTime(item.available_since, now)}</strong></span></div>
                <div className="kitchen-today"><span><small>Entregas hoje</small><strong>{item.deliveries_today}</strong></span><span><small>KM hoje</small><strong>{Number(item.distance_today || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} km</strong></span></div>
                {stale && <div className="stale-warning">⚠ Sem atividade há {person.last_seen ? elapsedTime(person.last_seen, now) : 'algum tempo'}</div>}
                <a className="whatsapp-link" href={whatsappUrl(person.phone)} target="_blank" rel="noreferrer"><MessageCircle size={19} /><span><small>Chamar no WhatsApp</small>{formatPhone(person.phone)}</span></a>
                <button type="button" className="button button--dispatch button--full" onClick={() => setSelectedDispatch(person)} disabled={dispatching === person.user_id}><Navigation size={18} />{dispatching === person.user_id ? 'Chamando...' : index === 0 ? 'Chamar próximo motoboy' : 'Chamar motoboy'}</button>
              </article>
            )
          })}
        </div>
      )}
      <DispatchModal motoboy={selectedDispatch} open={Boolean(selectedDispatch)} busy={Boolean(dispatching)} onClose={() => setSelectedDispatch(null)} onConfirm={(orders) => callMotoboy(selectedDispatch, orders)} />
    </div>
  )
}
