export const PRICE_RANGES = [
  { max: 4, label: 'Até 4 km', shortLabel: '0–4 km', value: 6 },
  { max: 5, label: 'Acima de 4 até 5 km', shortLabel: '4–5 km', value: 7 },
  { max: 6, label: 'Acima de 5 até 6 km', shortLabel: '5–6 km', value: 8 },
  { max: 7, label: 'Acima de 6 até 7 km', shortLabel: '6–7 km', value: 9.5 },
  { max: 8, label: 'Acima de 7 até 8 km', shortLabel: '7–8 km', value: 11 },
  { max: 10, label: 'Acima de 8 até 10 km', shortLabel: '8–10 km', value: 15 },
  { max: 12, label: 'Acima de 10 até 12 km', shortLabel: '10–12 km', value: 17 },
  { max: 13, label: 'Acima de 12 até 13 km', shortLabel: '12–13 km', value: 19 },
]

export function parseDistance(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const normalized = String(value ?? '').trim().replace(',', '.')
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return null
  const number = Number(normalized)
  return Number.isFinite(number) ? number : null
}

export function calculateDeliveryPreview(distance) {
  const value = parseDistance(distance)
  if (!value || value <= 0) return { valid: false, value: null, pending: false, range: null }
  const range = PRICE_RANGES.find((item) => value <= item.max)
  if (!range) return { valid: true, value: null, pending: true, range: 'Acima de 13 km' }
  return { valid: true, value: range.value, pending: false, range: range.shortLabel }
}

export function getDistanceRange(distance) {
  const result = calculateDeliveryPreview(distance)
  return result.range ?? 'Não classificada'
}
