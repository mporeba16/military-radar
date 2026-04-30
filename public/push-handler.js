// Service worker push event handlers — imported by the generated Workbox SW

self.addEventListener('push', event => {
  if (!event.data) return

  let data
  try {
    data = event.data.json()
  } catch {
    return
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Military Radar', {
      body: data.body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: data.tag || 'mil-alert',
      renotify: true,
      vibrate: [200, 100, 200],
      data: { hex: data.hex },
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        for (const client of windowClients) {
          if ('focus' in client) return client.focus()
        }
        return clients.openWindow('/')
      })
  )
})
