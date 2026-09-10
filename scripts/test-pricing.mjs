import { calculateDeliveryPreview, parseDistance } from '../src/services/pricingService.js'
import { normalizeOrderNumber } from '../src/utils/orderNumber.js'

const cases = [
  [4, 6], [4.01, 7], [5, 7], [5.01, 8], [6, 8], [6.01, 9.5],
  [7, 9.5], [7.01, 11], [8, 11], [8.01, 15], [10, 15], [10.01, 17],
  [12, 17], [12.01, 19], [13, 19], [13.01, null],
]

for (const [distance, expected] of cases) {
  const result = calculateDeliveryPreview(distance)
  if (result.value !== expected) throw new Error(`${distance} km: esperado ${expected}, recebido ${result.value}`)
}

if (parseDistance('6,5') !== 6.5 || parseDistance('6.5') !== 6.5) throw new Error('Falha ao normalizar separador decimal')
if (parseDistance('-1') !== null || parseDistance('texto') !== null) throw new Error('Entrada inválida foi aceita')
if (normalizeOrderNumber(' 001 ') !== '001' || normalizeOrderNumber(' ab 10 ') !== 'AB10') throw new Error('Número do pedido não preservado/normalizado')

console.log('Tabela de preços: 16 limites, decimais e número do pedido aprovados.')
