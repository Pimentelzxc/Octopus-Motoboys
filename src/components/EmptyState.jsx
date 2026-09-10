import { createElement } from 'react'

export default function EmptyState({ icon, title, description }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{createElement(icon, { size: 30 })}</div>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  )
}
