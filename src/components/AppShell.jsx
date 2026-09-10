import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { Bike, ChefHat, LayoutDashboard, LogOut } from 'lucide-react'
import { brand } from '../config/brand'
import { useAuth } from '../contexts/AuthContext'
import OfflineBanner from './OfflineBanner'

export default function AppShell() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const logout = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }
  return (
    <div className="app-shell">
      <OfflineBanner />
      <header className="app-header">
        <a href="/" className="brand" aria-label="Página inicial">
          <img src={brand.logo} alt="" />
          <span><strong>{brand.name}</strong><small>{brand.product}</small></span>
        </a>
        <nav className="main-nav" aria-label="Navegação principal">
          {profile?.role === 'motoboy' && <NavLink to="/motoboy"><Bike size={18} /> Meu status</NavLink>}
          {profile?.role === 'kitchen' && <NavLink to="/cozinha"><ChefHat size={18} /> Cozinha</NavLink>}
          {profile?.role === 'admin' && <NavLink to="/admin"><LayoutDashboard size={18} /> Administração</NavLink>}
        </nav>
        <button className="header-logout" type="button" onClick={logout} title="Sair da conta">
          <LogOut size={19} /><span>Sair</span>
        </button>
      </header>
      <main className="app-main"><Outlet /></main>
    </div>
  )
}
