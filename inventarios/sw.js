/* Service worker: notificaciones push (recordatorio de las 8 am a producción) */
importScripts('config.js');
const CFG = self.INV_CONFIG || {};
if (CFG.FIREBASE && !/demo=1/.test(self.location.search)) {
  try {
    importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js', 'https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');
    firebase.initializeApp(CFG.FIREBASE);
    firebase.messaging().onBackgroundMessage(p => {
      const n = (p && p.notification) || {}, d = (p && p.data) || {};
      self.registration.showNotification(n.title || d.title || 'Inventarios', { body: n.body || d.body || '', icon: 'icons/icono-192.png', badge: 'icons/icono-192.png', data: { link: d.link || 'produccion.html' }, tag: d.tag || 'inv' });
    });
  } catch (e) { }
}
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const link = (e.notification.data && e.notification.data.link) || 'produccion.html';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => { for (const c of cs) { if (c.url.includes(link) && 'focus' in c) return c.focus(); } return self.clients.openWindow(link); }));
});
