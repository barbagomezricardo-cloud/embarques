/* Service worker de la App de Administracion (Silver Kan).
   Guarda el "cascarón" de la app la primera vez que abre con buena señal, para que si después
   la abre con datos móviles débiles el teléfono muestre la última versión guardada en vez de
   la pantalla de "Safari no puede abrir la página".
   Los datos del vendedor siguen viniendo siempre en vivo de Firebase: este service worker
   NUNCA toca esas llamadas, solo el cascarón. */
var CACHE_NAME = 'admin-shell-v1';
var SHELL_URLS = [
  './',
  './index.html',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];
self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(function (c) {
      return Promise.all(SHELL_URLS.map(function (u) {
        return fetch(u, { cache: 'no-store' }).then(function (res) {
          if (res && res.ok) return c.put(u, res);
        }).catch(function () {});
      }));
    })
  );
});
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var sameOrigin = new URL(req.url).origin === self.location.origin;
  var isShellAsset = sameOrigin || SHELL_URLS.indexOf(req.url) > -1;
  if (!isShellAsset) return;
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function (c) { c.put('./index.html', copy); });
        return res;
      }).catch(function () {
        return caches.match('./index.html').then(function (r) { return r || caches.match('./'); });
      })
    );
    return;
  }
  e.respondWith(
    fetch(req).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE_NAME).then(function (c) { c.put(req, copy); });
      return res;
    }).catch(function () { return caches.match(req); })
  );
});
