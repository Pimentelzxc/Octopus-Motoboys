import { requireSupabase } from '../lib/supabase'

const vapidPublicKey = import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY?.trim()

function isIosDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true
}

function decodeVapidKey(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)))
}

export async function getPushNotificationState() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { status: 'unsupported' }
  }
  if (isIosDevice() && !isStandalone()) return { status: 'needs_install' }
  if (!vapidPublicKey) return { status: 'unconfigured' }
  if (Notification.permission === 'denied') return { status: 'denied' }

  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  return { status: subscription ? 'enabled' : 'disabled' }
}

export async function enablePushNotifications() {
  if (!vapidPublicKey) throw new Error('A chave pública de notificações ainda não foi configurada')
  if (isIosDevice() && !isStandalone()) {
    throw new Error('No iPhone, adicione a Octopus à Tela de Início antes de ativar as notificações')
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    throw new Error('Este navegador não oferece suporte a notificações push')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('A permissão de notificações não foi concedida')

  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeVapidKey(vapidPublicKey),
    })
  }

  const serialized = subscription.toJSON()
  if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys?.auth) {
    throw new Error('O aparelho retornou uma assinatura incompleta')
  }

  const client = requireSupabase()
  const { error } = await client.rpc('save_my_push_subscription', {
    subscription_endpoint: serialized.endpoint,
    subscription_p256dh: serialized.keys.p256dh,
    subscription_auth: serialized.keys.auth,
    device_user_agent: navigator.userAgent,
  })
  if (error) throw error
  return { status: 'enabled' }
}

export async function disablePushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return { status: 'unsupported' }

  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (subscription) {
    const client = requireSupabase()
    const { error } = await client.rpc('delete_my_push_subscription', {
      subscription_endpoint: subscription.endpoint,
    })
    if (error) throw error
    await subscription.unsubscribe()
  }
  return { status: 'disabled' }
}

export async function sendDispatchPush(targetUserId) {
  const client = requireSupabase()
  const { data, error } = await client.functions.invoke('swift-function', {
    body: { targetUserId },
  })
  if (error) throw error
  return data
}
