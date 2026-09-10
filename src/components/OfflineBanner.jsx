import { WifiOff } from 'lucide-react'
import useOnlineStatus from '../hooks/useOnlineStatus'

export default function OfflineBanner() {
  const online = useOnlineStatus()
  if (online) return null
  return (
    <div className="offline-banner" role="alert">
      <WifiOff size={17} /> Sem conexão com o servidor. As alterações serão liberadas ao reconectar.
    </div>
  )
}
