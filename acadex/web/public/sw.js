// Acadex service worker: shows push notifications and opens the linked page when one is clicked.
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { /* not JSON */ }
  event.waitUntil(self.registration.showNotification(data.title || 'Acadex', { body: data.body || '', data: { url: data.url || '/' } }))
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(self.clients.openWindow(event.notification.data.url))
})
