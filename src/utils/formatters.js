export function formatPhone(value = '') {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 2) return digits
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  const split = digits.length === 11 ? 7 : 6
  return `(${digits.slice(0, 2)}) ${digits.slice(2, split)}-${digits.slice(split)}`
}

export function whatsappUrl(phone = '') {
  const digits = phone.replace(/\D/g, '')
  const international = digits.startsWith('55') ? digits : `55${digits}`
  return `https://wa.me/${international}`
}

export function elapsedTime(date, now = Date.now()) {
  if (!date) return 'agora'
  const minutes = Math.max(0, Math.floor((now - new Date(date).getTime()) / 60000))
  if (minutes < 1) return 'menos de 1 min'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours < 24) return `${hours}h${rest ? ` ${rest}min` : ''}`
  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h`
}

export function formatDateTime(date) {
  if (!date) return '—'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(date))
}

export function formatCurrency(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'Pendente'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value))
}

export function formatDistance(value) {
  const number = Number(value)
  return `${Number.isFinite(number) ? number.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) : '0,0'} km`
}

export function formatShortDate(date) {
  if (!date) return '—'
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(new Date(`${date}T12:00:00`))
}

export function getInitials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'MB'
}

export const roleLabels = { motoboy: 'Motoboy', kitchen: 'Cozinha', admin: 'Administrador' }
