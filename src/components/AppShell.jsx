import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { Bike, ChefHat, History, LayoutDashboard, LogOut, Settings, WalletCards } from 'lucide-react'
import { brand } from '../config/brand'
import { useAuth } from '../contexts/AuthContext'
import OfflineBanner from './OfflineBanner'

function NavigationLinks({ role }) {
  return <>
    {role === 'motoboy' && <>
      <NavLink to="/motoboy" end><Bike size={18} /> Status</NavLink>
      <NavLink to="/motoboy/historico"><History size={18} /> Histórico</NavLink>
      <NavLink to="/motoboy/financeiro"><WalletCards size={18} /> Financeiro</NavLink>
      <NavLink to="/motoboy/configuracoes"><Settings size={18} /> Configurações</NavLink>
    </>}
    {role === 'kitchen' && <NavLink to="/cozinha"><ChefHat size={18} /> Cozinha</NavLink>}
    {role === 'admin' && <NavLink to="/admin"><LayoutDashboard size={18} /> Administração</NavLink>}
  </>
}

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
        <nav className="main-nav main-nav--desktop" aria-label="Navegação principal"><NavigationLinks role={profile?.role} /></nav>
        <button className="header-logout" type="button" onClick={logout} title="Sair da conta">
          <LogOut size={19} /><span>Sair</span>
        </button>
      </header>
      <nav className="main-nav main-nav--mobile" aria-label="Navegação principal"><NavigationLinks role={profile?.role} /></nav>
      <main className="app-main"><Outlet /></main>
    </div>
  )
}
