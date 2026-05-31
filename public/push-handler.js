// Service worker push event handlers — imported by the generated Workbox SW

self.addEventListener('push', event => {
  if (!event.data) return

  let data
  try {
    data = event.data.json()
  } catch {
    return
  }

  const hex = data.hex
  const deepLink = hex && !String(hex).startsWith('__')

  event.waitUntil(
    self.registration.showNotification(data.title || 'Military Radar', {
      body: data.body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: data.tag || 'mil-alert',
      renotify: true,
      vibrate: [200, 100, 200],
      data: { hex },
      // "Pokaż na mapie" — only when there's a real aircraft to deep-link to.
      actions: deepLink ? [{ action: 'show', title: 'Pokaż na mapie' }] : [],
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()

  // Deep-link to the aircraft when the notification carries a real hex.
  const hex = event.notification.data?.hex
  const deepLink = hex && !String(hex).startsWith('__')
  const url = deepLink ? `/#hex=${hex}` : '/'

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        for (const client of windowClients) {
          if ('focus' in client) {
            // App is already open — tell it which aircraft to select, since a
            // hash change alone won't re-trigger the on-load deep-link effect.
            if (deepLink) client.postMessage({ type: 'select-hex', hex })
            return client.focus()
          }
        }
        return clients.openWindow(url)
      })
  )
})
