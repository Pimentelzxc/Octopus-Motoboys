self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data?.json() ?? {}
  } catch {
    payload = { body: event.data?.text() }
  }

  const notificationTimestamp = payload.timestamp || Date.now()

  event.waitUntil(self.registration.showNotification(payload.title || 'Octopus', {
    body: payload.body || 'Você recebeu uma nova chamada.',
    icon: payload.icon || '/pwa-icon-192.png',
    badge: payload.badge || '/pwa-icon-192.png',
    // Uma tag única impede que iOS/Android substituam silenciosamente a chamada anterior.
    tag: `octopus-dispatch-${notificationTimestamp}`,
    renotify: true,
    requireInteraction: true,
    silent: false,
    vibrate: [300, 120, 300],
    timestamp: notificationTimestamp,
    data: { url: payload.url || '/motoboy' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const destination = new URL(event.notification.data?.url || '/motoboy', self.location.origin).href

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if ('navigate' in client) await client.navigate(destination)
      if ('focus' in client) return client.focus()
    }
    return self.clients.openWindow(destination)
  })())
})
