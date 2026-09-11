import { Banknote, Bike, CalendarDays, CalendarRange, MapPinned, PackageCheck } from 'lucide-react'
import { summarizeDeliveries } from '../services/deliveryService'
import { formatCurrency, formatDistance } from '../utils/formatters'
import { getFinancialPeriodDates } from '../utils/operationalDates'

export default function FinancialOverview({ deliveries, now }) {
  const dates = getFinancialPeriodDates(new Date(now))
  const periods = [
    { id: 'today', label: 'Hoje', icon: Bike, start: dates.today },
    { id: 'week', label: 'Esta semana', icon: CalendarDays, start: dates.weekStart },
    { id: 'month', label: 'Este mês', icon: CalendarRange, start: dates.monthStart },
  ].map((period) => ({
    ...period,
    summary: summarizeDeliveries(deliveries.filter((delivery) => delivery.operational_date >= period.start && delivery.operational_date <= dates.today)),
  }))

  return (
    <section className="financial-overview">
      <div className="section-heading"><div><Banknote /><span><p className="eyebrow">Resumo</p><h2>Seus ganhos</h2></span></div></div>
      <div className="financial-period-grid">
        {periods.map((period) => {
          const Icon = period.icon
          return <article className={`financial-period financial-period--${period.id}`} key={period.id}>
            <header><span><Icon /></span><h3>{period.label}</h3></header>
            <div className="financial-period__metrics">
              <div><Banknote /><span><small>Ganhos</small><strong>{formatCurrency(period.summary.amount)}</strong></span></div>
              <div><PackageCheck /><span><small>Entregas</small><strong>{period.summary.count}</strong></span></div>
            </div>
            <p><MapPinned /> {formatDistance(period.summary.distance)} percorridos{period.summary.pending > 0 && <em> · {period.summary.pending} valor(es) pendente(s)</em>}</p>
          </article>
        })}
      </div>
    </section>
  )
}
