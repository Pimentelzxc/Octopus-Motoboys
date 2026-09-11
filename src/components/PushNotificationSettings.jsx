import { useEffect, useState } from 'react'
import { Bell, BellOff, Download, LoaderCircle, Smartphone } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import { disablePushNotifications, enablePushNotifications, getPushNotificationState } from '../services/pushNotificationService'

const content = {
  enabled: {
    icon: Bell,
    title: 'Notificações ativadas',
    description: 'Você receberá um aviso quando a cozinha chamar.',
    action: 'Desativar',
  },
  disabled: {
    icon: BellOff,
    title: 'Ative as chamadas no celular',
    description: 'Receba o aviso mesmo quando a Octopus estiver fechada.',
    action: 'Ativar notificações',
  },
  needs_install: {
    icon: Download,
    title: 'Instale no iPhone primeiro',
    description: 'No Safari, toque em Compartilhar e depois em Adicionar à Tela de Início.',
  },
  denied: {
    icon: BellOff,
    title: 'Notificações bloqueadas',
    description: 'Libere a Octopus nos ajustes de notificações do aparelho.',
  },
  unsupported: {
    icon: Smartphone,
    title: 'Notificações indisponíveis',
    description: 'Este navegador ou aparelho não oferece suporte a Web Push.',
  },
  unconfigured: {
    icon: BellOff,
    title: 'Notificações aguardando configuração',
    description: 'A chave pública Web Push ainda precisa ser adicionada ao ambiente.',
  },
}

export default function PushNotificationSettings() {
  const { showToast } = useToast()
  const [status, setStatus] = useState('loading')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getPushNotificationState()
      .then((state) => setStatus(state.status))
      .catch(() => setStatus('unsupported'))
  }, [])

  const toggle = async () => {
    setBusy(true)
    try {
      const next = status === 'enabled'
        ? await disablePushNotifications()
        : await enablePushNotifications()
      setStatus(next.status)
      showToast(next.status === 'enabled' ? 'Notificações ativadas neste aparelho.' : 'Notificações desativadas.', next.status === 'enabled' ? 'success' : 'info')
    } catch (error) {
      showToast(`Não foi possível alterar as notificações: ${error.message}`, 'error')
      const current = await getPushNotificationState().catch(() => ({ status: 'unsupported' }))
      setStatus(current.status)
    } finally {
      setBusy(false)
    }
  }

  if (status === 'loading') {
    return <section className="push-settings"><LoaderCircle className="spin" /><span><strong>Verificando notificações...</strong><small>Aguarde um instante.</small></span></section>
  }

  const state = content[status] ?? content.unsupported
  const Icon = state.icon
  const canToggle = status === 'enabled' || status === 'disabled'

  return (
    <section className={`push-settings push-settings--${status}`}>
      <div className="push-settings__icon"><Icon /></div>
      <span><strong>{state.title}</strong><small>{state.description}</small></span>
      {canToggle && <button type="button" className="button button--subtle" onClick={toggle} disabled={busy}>{busy ? 'Aguarde...' : state.action}</button>}
    </section>
  )
}
