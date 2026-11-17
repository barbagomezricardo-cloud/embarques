/* SITIO 19H · las apps de Pet Food también en https://embarques-mascotas.web.app
   Algunas redes móviles no alcanzan github.io (la página se queda cargando). Esta función
   recibe la visita en el dominio de Firebase, pide el archivo a GitHub Pages por la red de
   Google y lo entrega igual. Así:
   - Siempre es la versión vigente de GitHub (no hay que publicar dos veces).
   - El CDN de Firebase guarda la respuesta unos minutos: rápido y casi sin costo.
   - Los datos (Firebase) siguen yendo directo, como siempre. */
const { onRequest } = require('firebase-functions/v2/https');

const ORIGEN = 'https://barbagomezricardo-cloud.github.io/embarques';
const TIPOS = { html: 'text/html; charset=utf-8', js: 'application/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', ico: 'image/x-icon', webp: 'image/webp', txt: 'text/plain; charset=utf-8', webmanifest: 'application/manifest+json' };

exports.sitio19h = onRequest({ region: 'us-central1', memory: '256MiB', timeoutSeconds: 30, maxInstances: 10, concurrency: 80, invoker: 'public' }, async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.status(405).send('Método no permitido'); return; }
  let ruta = decodeURIComponent(req.path || '/');
  if (ruta.includes('..') || ruta.includes('\\')) { res.status(400).send('Ruta no válida'); return; }
  if (ruta === '/' ) ruta = '/index.html';
  else if (ruta.endsWith('/')) ruta += 'index.html';
  const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
  let r;
  try {
    r = await fetch(ORIGEN + encodeURI(ruta) + qs, { redirect: 'follow', headers: { 'User-Agent': 'sitio19h' } });
  } catch (e) {
    res.status(502).set('Cache-Control', 'no-store').send('No se pudo obtener la página. Intenta de nuevo.'); return;
  }
  // GitHub manda a la carpeta (p. ej. /inventarios → /inventarios/): lo replicamos para que las rutas relativas funcionen
  const final = new URL(r.url);
  if (r.ok && final.pathname.endsWith('/') && !ruta.endsWith('/index.html') && !ruta.endsWith('/')) {
    res.redirect(301, ruta + '/' + qs); return;
  }
  const ext = (ruta.split('.').pop() || '').toLowerCase();
  const tipo = TIPOS[ext] || r.headers.get('content-type') || 'application/octet-stream';
  const html = tipo.startsWith('text/html'), sw = ruta.endsWith('/sw.js');
  res.status(r.status);
  res.set('Content-Type', tipo);
  // Páginas y respaldo de arranque: casi al momento (1 min). Scripts, estilos e imágenes: 5 min.
  res.set('Cache-Control', r.ok ? (html || sw ? 'public, max-age=0, s-maxage=60' : 'public, max-age=120, s-maxage=300') : 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  if (req.method === 'HEAD') { res.end(); return; }
  res.send(Buffer.from(await r.arrayBuffer()));
});
