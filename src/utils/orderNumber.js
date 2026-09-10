export function normalizeOrderNumber(value) {
  return String(value ?? '').trim().replace(/\s+/g, '').toUpperCase()
}

export function formatOrderNumber(value) {
  const normalized = normalizeOrderNumber(value)
  return normalized ? `#${normalized}` : '—'
}
