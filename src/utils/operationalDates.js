function dateKeyInSaoPaulo(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {})
  return `${parts.year}-${parts.month}-${parts.day}`
}

function shiftDateKey(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function getOperationalDate(date = new Date()) {
  return dateKeyInSaoPaulo(date)
}

export function getFinancialPeriodDates(date = new Date()) {
  const today = dateKeyInSaoPaulo(date)
  const calendarDate = new Date(`${today}T00:00:00Z`)
  const weekday = calendarDate.getUTCDay() || 7
  const weekStart = shiftDateKey(today, -(weekday - 1))
  const monthStart = `${today.slice(0, 8)}01`
  return {
    today,
    weekStart,
    monthStart,
    queryStart: weekStart < monthStart ? weekStart : monthStart,
  }
}
