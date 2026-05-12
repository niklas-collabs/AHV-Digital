// AHV Push-Handler — wird von Workbox per importScripts in den Service
// Worker geladen. Hier kein Build-Step, daher kein TypeScript.
//
// Nimmt Push-Events vom Backend an (web-push-Library) und zeigt eine
// Browser-Notification. Klick auf die Notification öffnet/fokussiert
// die App auf der gewünschten Route.

/* eslint-disable no-undef */

self.addEventListener('push', (event) => {
  let payload = { title: 'AHV', body: '', url: '/', tag: undefined };
  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: payload.tag,
      data: { url: payload.url ?? '/' },
      renotify: !!payload.tag,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url ?? '/';

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      // Wenn die App schon offen ist: dort hin navigieren statt neuen Tab
      for (const client of allClients) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) {
            try {
              await client.navigate(targetUrl);
            } catch {
              // navigate() darf nur same-origin — bei Fehler einfach focus reichen
            }
          }
          return;
        }
      }
      // Sonst neu öffnen
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })(),
  );
});
