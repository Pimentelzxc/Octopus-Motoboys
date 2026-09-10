export default function FormField({ label, icon: Icon, error, children }) {
  return (
    <label className={`form-field ${error ? 'form-field--error' : ''}`}>
      <span>{label}</span>
      <div className="input-wrap">
        {Icon && <Icon size={18} />}
        {children}
      </div>
      {error && <small className="field-error">{error}</small>}
    </label>
  )
}
