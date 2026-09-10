import { brand } from '../config/brand'

export default function LoadingScreen({ label = 'Carregando...' }) {
  return (
    <div className="loading-screen" role="status">
      <img src={brand.logo} alt="" className="loading-logo" />
      <div className="spinner" />
      <p>{label}</p>
    </div>
  )
}
