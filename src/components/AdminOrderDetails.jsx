import { useEffect, useState } from 'react'
import { AlertTriangle, History, Pencil, ReceiptText } from 'lucide-react'
import Modal from './Modal'
import { getDeliveryAudit } from '../services/reportService'
import { getDistanceRange } from '../services/pricingService'
import { formatCurrency, formatDateTime, formatDistance, formatShortDate } from '../utils/formatters'

const statusLabels = { pending: 'Pendente', in_progress: 'Em andamento', completed: 'Concluída', cancelled: 'Cancelada', adjusted: 'Alterada' }
const actionLabels = { order_number_changed: 'Número do pedido alterado', distance_changed: 'Quilometragem alterada', value_changed: 'Valor alterado', delivery_cancelled: 'Entrega cancelada', status_changed: 'Status alterado', motoboy_changed: 'Motoboy alterado', delivery_added_to_closing: 'Incluída no fechamento' }

function auditSummary(entry) {
  const oldData = entry.old_data ?? {}
  const newData = entry.new_data ?? {}
  const changes = []
  if (oldData.order_number !== newData.order_number) changes.push(`Pedido #${oldData.order_number ?? '—'} → #${newData.order_number ?? '—'}`)
  if (oldData.distance_km !== newData.distance_km) changes.push(`KM ${oldData.distance_km ?? '—'} → ${newData.distance_km ?? '—'}`)
  if (oldData.calculated_value !== newData.calculated_value) changes.push(`Calculado ${formatCurrency(oldData.calculated_value)} → ${formatCurrency(newData.calculated_value)}`)
  if (oldData.final_value !== newData.final_value) changes.push(`Final ${formatCurrency(oldData.final_value)} → ${formatCurrency(newData.final_value)}`)
  if (oldData.status !== newData.status) changes.push(`Status ${statusLabels[oldData.status] ?? oldData.status ?? '—'} → ${statusLabels[newData.status] ?? newData.status ?? '—'}`)
  if (oldData.motoboy_id !== newData.motoboy_id) changes.push(`Motoboy ${oldData.motoboy_id ?? '—'} → ${newData.motoboy_id ?? '—'}`)
  if (oldData.payment_closing_id !== newData.payment_closing_id) changes.push(`Fechamento ${oldData.payment_closing_id ?? 'nenhum'} → ${newData.payment_closing_id ?? 'nenhum'}`)
  return changes
}

export default function AdminOrderDetails({ delivery, open, onClose, onEdit }) {
  const [audit, setAudit] = useState([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    let active = true
    if (!delivery) return undefined
    setLoading(true)
    getDeliveryAudit(delivery.id).then((rows) => { if (active) setAudit(rows) }).catch(() => { if (active) setAudit([]) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [delivery])
  if (!delivery) return null
  const closing = Array.isArray(delivery.payment_closings) ? delivery.payment_closings[0] : delivery.payment_closings
  const altered = delivery.status === 'adjusted' || audit.some((item) => ['order_number_changed', 'distance_changed', 'value_changed', 'motoboy_changed'].includes(item.action))
  return <Modal open={open} onClose={onClose} title="Detalhes da entrega"><div className="modal-body admin-order-details">
    <div className="admin-order-title"><ReceiptText /><span><small>Pedido</small><strong>#{delivery.order_number}</strong></span>{altered && <em><AlertTriangle /> Entrega alterada</em>}</div>
    <dl className="order-data-grid"><div><dt>Motoboy</dt><dd>{delivery.profiles?.full_name ?? '—'}</dd></div><div><dt>Data e horário</dt><dd>{formatDateTime(delivery.delivered_at)}</dd></div><div><dt>Quilometragem</dt><dd>{delivery.distance_km == null ? 'Ainda não informada' : formatDistance(delivery.distance_km)}</dd></div><div><dt>Faixa</dt><dd>{delivery.distance_km == null ? '—' : getDistanceRange(delivery.distance_km)}</dd></div><div><dt>Valor calculado</dt><dd>{formatCurrency(delivery.calculated_value)}</dd></div><div><dt>Valor final</dt><dd>{formatCurrency(delivery.final_value)}</dd></div><div><dt>Status</dt><dd>{statusLabels[delivery.status] ?? delivery.status}</dd></div><div><dt>Origem</dt><dd>{delivery.source === 'dispatch' ? 'Despacho' : 'Manual'}</dd></div><div><dt>Criado em</dt><dd>{formatDateTime(delivery.created_at)}</dd></div><div><dt>Última alteração</dt><dd>{formatDateTime(delivery.updated_at)}</dd></div><div className="order-data-wide"><dt>Observação</dt><dd>{delivery.notes || 'Nenhuma observação'}</dd></div><div className="order-data-wide"><dt>Pagamento</dt><dd>{!delivery.payment_closing_id ? 'Ainda não fechado' : closing?.status === 'paid' ? '✓ Pago' : 'Fechado, aguardando pagamento'}{closing?.start_date && <small>Fechamento: {formatShortDate(closing.start_date)} até {formatShortDate(closing.end_date)}</small>}</dd></div></dl>
    <button className="button button--subtle" type="button" disabled={Boolean(delivery.payment_closing_id) || !['completed', 'adjusted'].includes(delivery.status)} onClick={() => onEdit(delivery)}><Pencil /> Corrigir entrega</button>
    <section className="audit-section"><h3><History /> Histórico de auditoria</h3>{loading ? <p>Carregando...</p> : audit.length === 0 ? <p>Nenhuma alteração registrada.</p> : <div>{audit.map((entry) => { const actor = Array.isArray(entry.profiles) ? entry.profiles[0] : entry.profiles; const changes = auditSummary(entry); return <article key={entry.id}><span><strong>{actionLabels[entry.action] ?? entry.action}</strong><small>{actor?.full_name ?? 'Sistema'} · {formatDateTime(entry.created_at)}</small></span>{changes.length > 0 && <ul>{changes.map((change) => <li key={change}>{change}</li>)}</ul>}</article> })}</div>}</section>
  </div></Modal>
}
