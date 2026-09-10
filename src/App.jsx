import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import AppShell from './components/AppShell'
import LoadingScreen from './components/LoadingScreen'

const LoginPage = lazy(() => import('./pages/LoginPage'))
const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const MotoboyPage = lazy(() => import('./pages/MotoboyPage'))
const KitchenPage = lazy(() => import('./pages/KitchenPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

function HomeRedirect() {
  const { session, profile, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!session || !profile) return <Navigate to="/login" replace />
  const route = profile.role === 'admin' ? '/admin' : profile.role === 'kitchen' ? '/cozinha' : '/motoboy'
  return <Navigate to={route} replace />
}

export default function App() {
  return (
    <Suspense fallback={<LoadingScreen />}><Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/cadastro" element={<RegisterPage />} />
      <Route element={<ProtectedRoute allowedRoles={['motoboy']} />}>
        <Route element={<AppShell />}>
          <Route path="/motoboy" element={<MotoboyPage />} />
        </Route>
      </Route>
      <Route element={<ProtectedRoute allowedRoles={['kitchen', 'admin']} />}>
        <Route element={<AppShell />}>
          <Route path="/cozinha" element={<KitchenPage />} />
        </Route>
      </Route>
      <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
        <Route element={<AppShell />}>
          <Route path="/admin" element={<AdminPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes></Suspense>
  )
}
