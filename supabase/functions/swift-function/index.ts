import { createClient } from 'npm:@supabase/supabase-js@2.116.0'
import webpush from 'npm:web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const vapidPublicKey = Deno.env.get('WEB_PUSH_VAPID_PUBLIC_KEY')
  const vapidPrivateKey = Deno.env.get('WEB_PUSH_VAPID_PRIVATE_KEY')
  const vapidSubject = Deno.env.get('WEB_PUSH_VAPID_SUBJECT') || 'mailto:admin@octopus.com'

  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
    return json({ error: 'Web Push ainda não foi configurado no servidor' }, 503)
  }

  const authorization = request.headers.get('Authorization')
  const accessToken = authorization?.replace(/^Bearer\s+/i, '')
  if (!accessToken) return json({ error: 'Sessão obrigatória' }, 401)

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: authData, error: authError } = await admin.auth.getUser(accessToken)
  if (authError || !authData.user) return json({ error: 'Sessão inválida' }, 401)

  const { data: caller } = await admin
    .from('profiles')
    .select('role, active')
    .eq('id', authData.user.id)
    .maybeSingle()

  if (!caller?.active || caller.role !== 'kitchen') {
    return json({ error: 'Acesso exclusivo da cozinha' }, 403)
  }

  let body: { targetUserId?: string }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Corpo da requisição inválido' }, 400)
  }

  const targetUserId = body.targetUserId?.trim()
  if (!targetUserId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetUserId)) {
    return json({ error: 'Motoboy inválido' }, 400)
  }

  // Só aceita o push logo após uma chamada real feita pela cozinha.
  const recentThreshold = new Date(Date.now() - 2 * 60 * 1000).toISOString()
  const { data: availability } = await admin
    .from('availability')
    .select('status, current_source, updated_at')
    .eq('user_id', targetUserId)
    .eq('status', 'on_delivery')
    .eq('current_source', 'dispatch')
    .gte('updated_at', recentThreshold)
    .maybeSingle()

  if (!availability) {
    return json({ error: 'Não existe uma chamada recente para este motoboy' }, 409)
  }

  const { data: target } = await admin
    .from('profiles')
    .select('full_name, role, active')
    .eq('id', targetUserId)
    .maybeSingle()

  if (!target?.active || target.role !== 'motoboy') {
    return json({ error: 'Motoboy não encontrado' }, 404)
  }

  const { data: subscriptions, error: subscriptionsError } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_key')
    .eq('user_id', targetUserId)

  if (subscriptionsError) return json({ error: 'Não foi possível consultar as notificações' }, 500)
  if (!subscriptions?.length) {
    return json({ sent: 0, failed: 0, message: 'O motoboy ainda não ativou as notificações neste aparelho' })
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

  const notificationTimestamp = Date.now()
  const payload = JSON.stringify({
    title: 'Octopus — Nova entrega',
    body: `${target.full_name.split(' ')[0]}, a cozinha chamou você para uma entrega.`,
    icon: '/pwa-icon-192.png',
    badge: '/pwa-icon-192.png',
    tag: `dispatch-${targetUserId}-${notificationTimestamp}`,
    url: '/motoboy',
    timestamp: notificationTimestamp,
  })

  let sent = 0
  let failed = 0

  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth_key },
      }, payload, { TTL: 60, urgency: 'high' })
      sent += 1
    } catch (error) {
      failed += 1
      const statusCode = typeof error === 'object' && error && 'statusCode' in error
        ? Number(error.statusCode)
        : 0
      if (statusCode === 404 || statusCode === 410) {
        await admin.from('push_subscriptions').delete().eq('id', subscription.id)
      }
    }
  }))

  return json({
    sent,
    failed,
    message: sent > 0 ? 'Notificação enviada' : 'Nenhum aparelho recebeu a notificação',
  })
})
