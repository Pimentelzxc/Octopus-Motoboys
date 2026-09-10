import { useState } from 'react'
import { Ban, ChevronRight, Clock3, MapPin, Pencil, ReceiptText } from 'lucide-react'
import Modal from './Modal'
import DeliveryFormModal from './DeliveryFormModal'
import { formatCurrency, formatDateTime, formatDistance } from '../utils/formatters'

export default function DeliveryHistory({ deliveries, onEdit, onCancel }) {
  const [selected, setSelected] = useState(null)
  const [editing, setEditing] = useState(null)
  const activeDeliveries = deliveries.filter((item) => ['completed', 'adjusted'].includes(item.status))

  const canEdit = (delivery) => !delivery.payment_closing_id && Date.now() - new Date(delivery.delivered_at).getTime() <= 10 * 60000
  return (
    <>
      <section className="motoboy-section">
        <div className="section-heading"><div><ReceiptText /><span><p className="eyebrow">Histórico</p><h2>Entregas de hoje</h2></span></div><small>{activeDeliveries.length} registradas</small></div>
        {activeDeliveries.length === 0 ? <div className="compact-empty">Suas entregas aparecerão aqui depois do primeiro registro.</div> : (
          <div className="delivery-list">
            {activeDeliveries.map((delivery) => (
              <button type="button" className="delivery-row" key={delivery.id} onClick={() => setSelected(delivery)}>
                <span className="delivery-number">Pedido #{delivery.order_number}</span>
                <span className="delivery-main"><strong>{formatDistance(delivery.distance_km)}</strong><small>{new Date(delivery.delivered_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · {delivery.source === 'dispatch' ? 'Despacho' : 'Manual'}</small></span>
                <span className={delivery.final_value == null ? 'pending-value' : ''}>{delivery.final_value == null ? 'Pendente' : formatCurrency(delivery.final_value)}</span>
                <ChevronRight size={18} />
              </button>
            ))}
          </div>
        )}
      </section>
      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title="Detalhes da entrega">
        {selected && <div className="modal-body delivery-details">
          <div className="order-detail-banner">Pedido <strong>#{selected.order_number}</strong></div>
          <div className="detail-value"><MapPin /><span><small>Distância</small><strong>{formatDistance(selected.distance_km)}</strong></span></div>
          <div className="detail-value"><ReceiptText /><span><small>Valor</small><strong>{formatCurrency(selected.final_value)}</strong></span></div>
          <dl><div><dt>Registrada em</dt><dd>{formatDateTime(selected.delivered_at)}</dd></div><div><dt>Origem</dt><dd>{selected.source === 'dispatch' ? 'Despacho da cozinha' : 'Registro manual'}</dd></div><div><dt>Precificação</dt><dd>{selected.pricing_status === 'pending' ? 'Pendente' : selected.pricing_status === 'adjusted' ? 'Ajustada' : 'Automática'}</dd></div><div><dt>Observação</dt><dd>{selected.notes || 'Nenhuma observação'}</dd></div></dl>
          {canEdit(selected) ? <div className="detail-actions"><button className="button button--ghost" type="button" onClick={() => { setEditing(selected); setSelected(null) }}><Pencil size={17} /> Corrigir</button><button className="button button--danger" type="button" onClick={async () => { await onCancel(selected); setSelected(null) }}><Ban size={17} /> Cancelar</button></div> : <div className="edit-expired"><Clock3 size={16} /> O prazo de 10 minutos para correção terminou. Procure um administrador.</div>}
        </div>}
      </Modal>
      <DeliveryFormModal open={Boolean(editing)} mode="edit" delivery={editing} onClose={() => setEditing(null)} onSubmit={(data) => onEdit(editing, data)} />
    </>
  )
}
