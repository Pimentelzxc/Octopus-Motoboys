import { Link } from 'react-router-dom'
import { brand } from '../config/brand'

export default function AuthLayout({ eyebrow, title, subtitle, children, footerText, footerLink, footerLabel }) {
  return (
    <main className="auth-page">
      <section className="auth-brand-panel">
        <div className="auth-brand-copy">
          <img src={brand.logo} alt="Logo Octopus" />
          <p className="brand-kicker">{brand.tagline}</p>
          <h1>Entregas em movimento.<br />Operação no controle.</h1>
          <p>Disponibilidade, fila e equipe sincronizadas em tempo real.</p>
        </div>
        <span className="auth-decor auth-decor--one" />
        <span className="auth-decor auth-decor--two" />
      </section>
      <section className="auth-form-panel">
        <div className="auth-card">
          <Link to="/" className="mobile-brand"><img src={brand.logo} alt="" /><strong>{brand.name}</strong></Link>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          <p className="auth-subtitle">{subtitle}</p>
          {children}
          <p className="auth-footer">{footerText} <Link to={footerLink}>{footerLabel}</Link></p>
        </div>
      </section>
    </main>
  )
}
