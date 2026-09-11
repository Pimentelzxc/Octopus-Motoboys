import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bike, CalendarRange, CheckCircle2, ChevronDown, Download, Filter, Gauge, Navigation, PackageCheck, ReceiptText, Search, Trophy, UsersRound, WalletCards } from 'lucide-react'
import AdminDeliveryEditor from './AdminDeliveryEditor'
import AdminOrderDetails from './AdminOrderDetails'
import { useToast } from '../contexts/ToastContext'
import { subscribeToAvailability } from '../services/availabilityService'
import { adminDeleteDelivery, adminUpdateDelivery, summarizeDeliveries } from '../services/deliveryService'
import { createPaymentClosing, getAllPaymentClosings, getPaymentClosingPreview, markPaymentPaid, subscribeToPayments } from '../services/paymentService'
import { buildMotoboyReport, exportDetailedCsv, exportSummaryCsv, getDeliveriesReport, getPresetRange, searchOrders } from '../services/reportService'
import { getDistanceRange, PRICE_RANGES } from '../services/pricingService'
import { formatCurrency, formatDateTime, formatDistance, formatShortDate } from '../utils/formatters'
import { normalizeOrderNumber } from '../utils/orderNumber'

const presets = [['today', 'Hoje'], ['yesterday', 'Ontem'], ['this_week', 'Esta semana'], ['last_week', 'Semana passada'], ['this_month', 'Este mês'], ['last_month', 'Mês passado'], ['custom', 'Personalizado']]
const statusLabels = { pending: 'Pendente', in_progress: 'Em andamento', completed: 'Concluída', adjusted: 'Alterada', cancelled: 'Cancelada' }
const localDate = (date) => { const copy = new Date(date); copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset()); return copy.toISOString().slice(0, 10) }
const paymentState = (delivery) => {
  const closing = Array.isArray(delivery.payment_closings) ? delivery.payment_closings[0] : delivery.payment_closings
  return !delivery.payment_closing_id ? 'open' : closing?.status === 'paid' ? 'paid' : 'closed'
}

export default function AdminOperations({ profiles }) {
  const { showToast } = useToast()
  const today = localDate(new Date())
  const [preset, setPreset] = useState('today')
  const [customStart, setCustomStart] = useState(today)
  const [customEnd, setCustomEnd] = useState(today)
  const [deliveries, setDeliveries] = useState([])
  const [closings, setClosings] = useState([])
  const [reportSearch, setReportSearch] = useState('')
  const [filters, setFilters] = useState({ order: '', motoboy: '', status: '', distanceRange: '', payment: '' })
  const [quickSearch, setQuickSearch] = useState('')
  const [quickResults, setQuickResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [editing, setEditing] = useState(null)
  const [closingForm, setClosingForm] = useState({ motoboyId: '', start: today, end: today })
  const [closingBusy, setClosingBusy] = useState(false)
  const [closingPreview, setClosingPreview] = useState(null)
  const [conference, setConference] = useState({ motoboyId: '', date: today })
  const [conferenceRows, setConferenceRows] = useState([])

  const range = useMemo(() => getPresetRange(preset, customStart, customEnd), [customEnd, customStart, preset])
  const load = useCallback(async () => {
    try {
      const [rows, paymentRows] = await Promise.all([getDeliveriesReport(range.start, range.end), getAllPaymentClosings()])
      setDeliveries(rows); setClosings(paymentRows)
    } catch (error) { showToast(`Erro nos relatórios: ${error.message}`, 'error') }
    finally { setLoading(false) }
  }, [range.end, range.start, showToast])

  useEffect(() => {
    setLoading(true); load(); let refreshTimer
    const refresh = () => { window.clearTimeout(refreshTimer); refreshTimer = window.setTimeout(load, 180) }
    const offPayments = subscribeToPayments(refresh); const offOperations = subscribeToAvailability(refresh)
    return () => { window.clearTimeout(refreshTimer); offPayments(); offOperations() }
  }, [load])

  useEffect(() => {
    let active = true
    if (!closingForm.motoboyId || !closingForm.start || !closingForm.end || closingForm.start > closingForm.end) { setClosingPreview(null); return undefined }
    getPaymentClosingPreview(closingForm.motoboyId, closingForm.start, closingForm.end).then((data) => { if (active) setClosingPreview(data) }).catch(() => { if (active) setClosingPreview(null) })
    return () => { active = false }
  }, [closingForm])

  useEffect(() => {
    let active = true; const timer = window.setTimeout(() => {
      if (!quickSearch.trim()) { setQuickResults([]); return }
      searchOrders(quickSearch).then((rows) => { if (active) setQuickResults(rows) }).catch(() => { if (active) setQuickResults([]) })
    }, 220)
    return () => { active = false; window.clearTimeout(timer) }
  }, [quickSearch])

  useEffect(() => {
    let active = true
    if (!conference.motoboyId || !conference.date) { setConferenceRows([]); return undefined }
    const start = new Date(`${conference.date}T00:00:00`); const end = new Date(`${conference.date}T23:59:59.999`)
    getDeliveriesReport(start, end).then((rows) => { if (active) setConferenceRows(rows.filter((row) => row.motoboy_id === conference.motoboyId && ['completed', 'adjusted'].includes(row.status))) }).catch(() => { if (active) setConferenceRows([]) })
    return () => { active = false }
  }, [conference])

  const filteredDeliveries = useMemo(() => deliveries.filter((delivery) => {
    const normalizedOrder = normalizeOrderNumber(filters.order)
    if (normalizedOrder && !delivery.order_number?.includes(normalizedOrder)) return false
    if (filters.motoboy && delivery.motoboy_id !== filters.motoboy) return false
    if (filters.status && delivery.status !== filters.status) return false
    if (filters.distanceRange && (delivery.distance_km == null || getDistanceRange(delivery.distance_km) !== filters.distanceRange)) return false
    if (filters.payment && paymentState(delivery) !== filters.payment) return false
    return true
  }), [deliveries, filters])
  const report = useMemo(() => buildMotoboyReport(filteredDeliveries).filter((item) => item.name.toLocaleLowerCase('pt-BR').includes(reportSearch.toLocaleLowerCase('pt-BR'))), [filteredDeliveries, reportSearch])
  const validDeliveries = filteredDeliveries.filter((item) => ['completed', 'adjusted'].includes(item.status))
  const totalDistance = validDeliveries.reduce((sum, item) => sum + Number(item.distance_km || 0), 0)
  const totalAmount = validDeliveries.reduce((sum, item) => sum + Number(item.final_value || 0), 0)
  const conferenceSummary = summarizeDeliveries(conferenceRows)
  const statuses = profiles.filter((item) => item.role === 'motoboy' && item.active).map((item) => {
    const availability = Array.isArray(item.availability) ? item.availability[0] : item.availability
    return availability?.status ?? (availability?.is_available ? 'available' : 'offline')
  })
  const availableCount = statuses.filter((status) => status === 'available').length
  const onDeliveryCount = statuses.filter((status) => status === 'on_delivery').length

  const saveDelivery = async (delivery, data) => { await adminUpdateDelivery(delivery.id, data.orderNumber, data.distance, data.notes, data.finalValue); showToast('Entrega corrigida e auditada.'); setSelectedOrder(null); await load() }
  const deleteDelivery = async (delivery) => {
    if (!window.confirm('Excluir esta entrega definitivamente? Esta ação não pode ser desfeita.')) return
    try { await adminDeleteDelivery(delivery.id); setEditing(null); setSelectedOrder(null); showToast('Entrega excluída definitivamente.', 'info'); await load() } catch (error) { showToast(error.message, 'error') }
  }
  const closePayment = async (event) => {
    event.preventDefault()
    if (!closingForm.motoboyId || !window.confirm('Fechar este pagamento? As entregas e os valores serão congelados no fechamento.')) return
    setClosingBusy(true)
    try { await createPaymentClosing(closingForm.motoboyId, closingForm.start, closingForm.end); showToast('Pagamento fechado com sucesso.'); await load() }
    catch (error) { showToast(error.message, 'error') } finally { setClosingBusy(false) }
  }
  const pay = async (closing) => {
    if (!window.confirm(`Confirmar pagamento de ${formatCurrency(closing.total_amount)} para ${closing.profiles?.full_name}?`)) return
    try { await markPaymentPaid(closing.id); showToast('Pagamento marcado como pago.'); await load() } catch (error) { showToast(error.message, 'error') }
  }

  return <div className="operations">
    <section className="quick-order-search">
      <div><Search /><span><p className="eyebrow">Busca rápida</p><h2>Buscar pedido</h2></span></div>
      <label className="search-box"><b>#</b><input value={quickSearch} onChange={(e) => setQuickSearch(e.target.value.toUpperCase())} placeholder="Digite 010" /></label>
      {quickSearch.trim() && <div className="quick-order-results">{quickResults.map((delivery) => <button type="button" key={delivery.id} onClick={() => setSelectedOrder(delivery)}><strong>Pedido #{delivery.order_number}</strong><span>{new Date(delivery.delivered_at).toLocaleDateString('pt-BR')} · {delivery.profiles?.full_name} · {delivery.distance_km == null ? 'Em andamento' : formatDistance(delivery.distance_km)}</span></button>)}{quickResults.length === 0 && <p>Nenhum pedido encontrado.</p>}</div>}
    </section>
    <section className="operations-toolbar"><div className="period-tabs">{presets.map(([id, label]) => <button className={preset === id ? 'active' : ''} type="button" key={id} onClick={() => setPreset(id)}>{label}</button>)}</div>{preset === 'custom' && <div className="custom-dates"><label>Data inicial<input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} /></label><label>Data final<input type="date" value={customEnd} min={customStart} onChange={(e) => setCustomEnd(e.target.value)} /></label></div>}</section>
    <section className="operations-stats"><div><PackageCheck /><span><small>Entregas</small><strong>{validDeliveries.length}</strong></span></div><div><Gauge /><span><small>KM no período</small><strong>{formatDistance(totalDistance)}</strong></span></div><div><UsersRound /><span><small>Trabalhando</small><strong>{availableCount + onDeliveryCount}</strong></span></div><div><Bike /><span><small>Disponíveis</small><strong>{availableCount}</strong></span></div><div><Navigation /><span><small>Em entrega</small><strong>{onDeliveryCount}</strong></span></div><div><WalletCards /><span><small>Pagamentos estimados</small><strong>{formatCurrency(totalAmount)}</strong></span></div></section>
    <section className="combined-filters"><div><Filter /><strong>Filtros de pedidos</strong></div><input placeholder="Número do pedido" value={filters.order} onChange={(e) => setFilters({ ...filters, order: e.target.value.toUpperCase() })} /><select value={filters.motoboy} onChange={(e) => setFilters({ ...filters, motoboy: e.target.value })}><option value="">Todos os motoboys</option>{profiles.filter((item) => item.role === 'motoboy').map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select><select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">Todos os status</option><option value="pending">Pendente</option><option value="in_progress">Em andamento</option><option value="completed">Concluída</option><option value="adjusted">Alterada</option></select><select value={filters.distanceRange} onChange={(e) => setFilters({ ...filters, distanceRange: e.target.value })}><option value="">Todas as faixas</option>{PRICE_RANGES.map((item) => <option key={item.shortLabel} value={item.shortLabel}>{item.label}</option>)}</select><select value={filters.payment} onChange={(e) => setFilters({ ...filters, payment: e.target.value })}><option value="">Todos os pagamentos</option><option value="open">Ainda não fechado</option><option value="closed">Fechado</option><option value="paid">Pago</option></select></section>
    <div className="operations-grid">
      <section className="report-panel">
        <div className="panel-heading"><div><Trophy /><span><p className="eyebrow">Desempenho</p><h2>Relatório dos motoboys</h2></span></div><div className="export-actions"><button className="button button--subtle" onClick={() => exportDetailedCsv(filteredDeliveries)}><Download /> Detalhado</button><button className="button button--subtle" onClick={() => exportSummaryCsv(report)}><Download /> Resumo</button></div></div>
        <label className="search-box report-search"><Search /><input value={reportSearch} onChange={(e) => setReportSearch(e.target.value)} placeholder="Buscar motoboy" /></label>
        {loading ? <div className="queue-loading"><span className="spinner" /> Gerando relatório...</div> : <div className="report-list">{report.map((item, index) => <article className="report-card" key={item.id}><button type="button" className="report-card__main" onClick={() => setExpanded(expanded === item.id ? null : item.id)}><b>#{index + 1}</b><span><strong>{item.name}</strong><small>{item.pending ? `${item.pending} valor(es) pendente(s)` : 'Valores calculados'}</small></span><span><small>Entregas</small><strong>{item.count}</strong></span><span><small>KM</small><strong>{formatDistance(item.distance)}</strong></span><span><small>Valor</small><strong>{formatCurrency(item.amount)}</strong></span><ChevronDown className={expanded === item.id ? 'rotate' : ''} /></button>{expanded === item.id && <div className="report-expanded"><div className="range-breakdown">{item.ranges.map((itemRange) => <div key={itemRange.label}><span>{itemRange.label}</span><b>{itemRange.count} entrega(s)</b><strong>{formatCurrency(itemRange.subtotal)}</strong></div>)}</div><div className="motoboy-orders">{validDeliveries.filter((delivery) => delivery.motoboy_id === item.id).map((delivery) => <button type="button" key={delivery.id} onClick={() => setSelectedOrder(delivery)}><b>#{delivery.order_number}</b><span>{formatDistance(delivery.distance_km)}</span><strong>{formatCurrency(delivery.final_value)}</strong><small>{new Date(delivery.delivered_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small></button>)}</div></div>}</article>)}{!report.length && <div className="compact-empty">Nenhuma entrega encontrada neste período.</div>}</div>}
      </section>
      <section className="closing-panel"><div className="panel-heading"><div><CalendarRange /><span><p className="eyebrow">Financeiro</p><h2>Fechamento</h2></span></div></div><form className="closing-form" onSubmit={closePayment}><label>Motoboy<select required value={closingForm.motoboyId} onChange={(e) => setClosingForm({ ...closingForm, motoboyId: e.target.value })}><option value="">Selecione...</option>{profiles.filter((item) => item.role === 'motoboy').map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label><div><label>Data inicial<input type="date" required value={closingForm.start} onChange={(e) => setClosingForm({ ...closingForm, start: e.target.value })} /></label><label>Data final<input type="date" required min={closingForm.start} value={closingForm.end} onChange={(e) => setClosingForm({ ...closingForm, end: e.target.value })} /></label></div>{closingPreview && <div className="closing-preview"><span><small>Entregas</small><strong>{closingPreview.deliveries_count}</strong></span><span><small>Quilometragem</small><strong>{formatDistance(closingPreview.total_distance_km)}</strong></span><span><small>Total</small><strong>{formatCurrency(closingPreview.total_amount)}</strong></span>{Number(closingPreview.pending_count) > 0 && <em>⚠ {closingPreview.pending_count} valor(es) pendente(s)</em>}</div>}<button className="button button--primary button--full" disabled={closingBusy || !closingPreview || Number(closingPreview.deliveries_count) === 0 || Number(closingPreview.pending_count) > 0}>{closingBusy ? 'Fechando...' : 'Fechar pagamento'}</button></form><div className="closing-history"><h3>Fechamentos recentes</h3>{closings.map((closing) => <article key={closing.id}><div><strong>{closing.profiles?.full_name}</strong><small>{formatShortDate(closing.start_date)}–{formatShortDate(closing.end_date)} · {closing.deliveries_count} entregas</small></div><span><strong>{formatCurrency(closing.total_amount)}</strong><small>{closing.status === 'paid' ? `Pago em ${formatDateTime(closing.paid_at)}` : 'Aguardando pagamento'}</small></span>{closing.status !== 'paid' && <button type="button" className="icon-button icon-button--paid" title="Marcar como pago" onClick={() => pay(closing)}><CheckCircle2 /></button>}</article>)}</div></section>
    </div>
    <section className="conference-panel"><div className="panel-heading"><div><ReceiptText /><span><p className="eyebrow">Conferência</p><h2>Conferência de entregas</h2></span></div></div><div className="conference-controls"><select value={conference.motoboyId} onChange={(e) => setConference({ ...conference, motoboyId: e.target.value })}><option value="">Selecione o motoboy</option>{profiles.filter((item) => item.role === 'motoboy').map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select><input type="date" value={conference.date} onChange={(e) => setConference({ ...conference, date: e.target.value })} /></div>{conference.motoboyId && <><div className="conference-list">{conferenceRows.map((delivery) => <button type="button" key={delivery.id} onClick={() => setSelectedOrder(delivery)}><b>#{delivery.order_number}</b><span>{formatDistance(delivery.distance_km)}</span><strong>{formatCurrency(delivery.final_value)}</strong></button>)}</div><div className="conference-total"><span><small>Total de entregas</small><strong>{conferenceSummary.count}</strong></span><span><small>KM total</small><strong>{formatDistance(conferenceSummary.distance)}</strong></span><span><small>Total</small><strong>{formatCurrency(conferenceSummary.amount)}</strong></span></div></>}</section>
    <section className="deliveries-admin-panel"><div className="panel-heading"><div><PackageCheck /><span><p className="eyebrow">Pedidos</p><h2>Entregas do período</h2></span></div></div><div className="admin-delivery-list">{filteredDeliveries.map((delivery) => <button type="button" key={delivery.id} onClick={() => setSelectedOrder(delivery)}><b className="admin-order-number">#{delivery.order_number}</b><span><strong>{delivery.profiles?.full_name}</strong><small>{formatDateTime(delivery.delivered_at)} · {delivery.source === 'dispatch' ? 'Despacho' : 'Manual'}</small></span><b>{delivery.distance_km == null ? '—' : formatDistance(delivery.distance_km)}</b><strong className={delivery.final_value == null ? 'pending-value' : ''}>{formatCurrency(delivery.final_value)}</strong><em className={`delivery-status delivery-status--${delivery.status}`}>{statusLabels[delivery.status] ?? delivery.status}</em></button>)}</div></section>
    <AdminOrderDetails open={Boolean(selectedOrder)} delivery={selectedOrder} onClose={() => setSelectedOrder(null)} onEdit={(delivery) => { setSelectedOrder(null); setEditing(delivery) }} />
    <AdminDeliveryEditor open={Boolean(editing)} delivery={editing} onClose={() => setEditing(null)} onSave={saveDelivery} onDeleteDelivery={deleteDelivery} />
  </div>
}
