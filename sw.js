/* Respaldo de arranque de las apps de Pet Food (vendedor, gerencia, ventas, cargadores…).
   Red primero: siempre se usa la versión más nueva. Si la señal no responde en 7 s (típico con
   datos móviles) o no hay internet, se abre la última copia guardada de la página y sus scripts.
   Firebase, Odoo y cualquier otro servidor NO pasan por aquí: los datos siempre van en vivo. */
const CACHE = 'apps19h-v2';   // v2: borra las copias guardadas antes del 17-nov (traían la librería de Excel que dejaba la pantalla negra)
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('apps19h-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== 'GET' || u.origin !== location.origin) return;
  if (!/\.(html|js|css|png|svg|ico|webmanifest)$/i.test(u.pathname) && !u.pathname.endsWith('/')) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const red = fetch(req).then((r) => { if (r && r.ok) cache.put(req, r.clone()); return r; });
    const guardada = await cache.match(req, { ignoreSearch: true });
    if (!guardada) return red;   // primera vez: solo red
    const limite = new Promise((ok) => setTimeout(() => ok(null), 12000));
    try { const r = await Promise.race([red, limite]); return r || guardada; } catch (x) { return guardada; }
  })());
});
