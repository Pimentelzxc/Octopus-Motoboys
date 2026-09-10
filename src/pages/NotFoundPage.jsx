import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <main className="not-found">
      <span>404</span>
      <h1>Essa rota saiu para entrega.</h1>
      <p>A página que você procurou não existe ou mudou de endereço.</p>
      <Link className="button button--primary" to="/"><ArrowLeft size={18} /> Voltar ao início</Link>
    </main>
  )
}
