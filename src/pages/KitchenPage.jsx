import { useCallback, useEffect, useState } from 'react'
import { Bike, ChefHat, Clock3, Navigation, RefreshCw, TimerReset, UsersRound } from 'lucide-react'
import EmptyState from '../components/EmptyState'
import { useToast } from '../contexts/ToastContext'
import useNow from '../hooks/useNow'
import useOnlineStatus from '../hooks/useOnlineStatus'
import { dispatchMotoboy, getKitchenQueue, subscribeToAvailability } from '../services/availabilityService'
import { elapsedTime, getInitials, whatsappUrl } from '../utils/formatters'

function WhatsAppIcon() {
  return (
    <svg className="whatsapp-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479s1.065 2.875 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.262.489 1.693.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.981.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.002-5.45 4.437-9.884 9.892-9.884a9.821 9.821 0 0 1 7.021 2.91 9.825 9.825 0 0 1 2.897 7.027c-.003 5.45-4.438 9.884-9.888 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  )
}

function whatsappCallMessage(fullName) {
  const firstName = fullName.trim().split(/\s+/)[0]
  return `Olá, ${firstName}! A cozinha da Octopus chamou você para uma entrega. Por favor, confirme o recebimento.`
}

export default function KitchenPage() {
  const { showToast } = useToast()
  const online = useOnlineStatus()
  const now = useNow(10000)
  const [motoboys, setMotoboys] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [dispatching, setDispatching] = useState(null)

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
  const callMotoboy = async (person) => {
    setDispatching(person.user_id)
    try {
      const { notification } = await dispatchMotoboy(person.user_id)
      if (notification?.sent > 0) showToast(`${person.full_name} foi chamado e recebeu a notificação.`)
      else showToast(`${person.full_name} foi chamado, mas o push não foi entregue: ${notification?.message || 'nenhum aparelho cadastrado'}.`, 'info')
      await load()
    }
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
                <a className="whatsapp-link" href={whatsappUrl(person.phone, whatsappCallMessage(person.full_name))} target="_blank" rel="noreferrer"><WhatsAppIcon /><span>Chamar no WhatsApp</span></a>
                <button type="button" className="button button--dispatch button--full" onClick={() => callMotoboy(person)} disabled={Boolean(dispatching)}><Navigation size={18} />{dispatching === person.user_id ? 'Chamando...' : index === 0 ? 'Chamar próximo motoboy' : 'Chamar motoboy'}</button>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
