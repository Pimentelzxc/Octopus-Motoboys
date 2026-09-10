import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import LoadingScreen from './LoadingScreen'

export default function ProtectedRoute({ allowedRoles }) {
  const { session, profile, loading } = useAuth()
  const location = useLocation()
  if (loading) return <LoadingScreen />
  if (!session || !profile) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!profile.active) return <Navigate to="/login" replace />
  if (!allowedRoles.includes(profile.role)) {
    const route = profile.role === 'admin' ? '/admin' : profile.role === 'kitchen' ? '/cozinha' : '/motoboy'
    return <Navigate to={route} replace />
  }
  return <Outlet />
}
