/* Service worker de la App Clientes: arranque rápido sin conexión y avisos push. */
const CACHE = 'cli19h-v1';
const BASE = ['./', 'index.html', 'config.js', 'manifest.json', 'img/logo-petfood.png', 'img/logo-19h.png', 'img/icono-192.png', 'img/favicon.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;   // la API y Firebase nunca se guardan
  // Red primero (siempre la versión más nueva); si no hay señal, lo guardado.
  e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
});
self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) {}
  const n = d.notification || {};
  e.waitUntil(self.registration.showNotification(n.title || 'Los 19 Hermanos', { body: n.body || '', icon: 'img/icono-192.png', badge: 'img/favicon.png', data: d.data || {} }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((ws) => { for (const w of ws) { if ('focus' in w) return w.focus(); } return self.clients.openWindow('./'); }));
});
