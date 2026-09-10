import { CalendarRange, CheckCircle2, Clock3, WalletCards } from 'lucide-react'
import { formatCurrency, formatDistance, formatShortDate } from '../utils/formatters'

export default function PaymentHistory({ payments }) {
  return (
    <section className="motoboy-section">
      <div className="section-heading"><div><WalletCards /><span><p className="eyebrow">Financeiro</p><h2>Meus pagamentos</h2></span></div></div>
      {payments.length === 0 ? <div className="compact-empty">Nenhum fechamento de pagamento disponível.</div> : <div className="payment-list">
        {payments.map((payment) => <article className="payment-card" key={payment.id}>
          <div className="payment-card__top"><span><CalendarRange /> {formatShortDate(payment.start_date)} até {formatShortDate(payment.end_date)}</span><span className={`payment-status payment-status--${payment.status}`}>{payment.status === 'paid' ? <CheckCircle2 /> : <Clock3 />}{payment.status === 'paid' ? 'Pago' : 'Aguardando pagamento'}</span></div>
          <strong>{formatCurrency(payment.total_amount)}</strong>
          <p>{payment.deliveries_count} entregas <i /> {formatDistance(payment.total_distance_km)}</p>
        </article>)}
      </div>}
    </section>
  )
}
