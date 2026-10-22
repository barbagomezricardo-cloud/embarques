/* ================================================================
   App Clientes 19 Hermanos — funciones en la nube (Firebase)
   ----------------------------------------------------------------
   Se agrega a tu index.js de Cloud Shell con UNA línea al final:

       Object.assign(exports, require('./clientes'));

   y copiando junto a él este archivo y cli-core.js (ver LEEME.md).

   Qué hace:
   · cliApi      → única puerta de entrada de la app de clientes y del
                   panel del personal. Valida quién llama y aplica la
                   lógica de cli-core.js sobre el nodo /cli, que está
                   cerrado al público (nadie lo lee ni lo escribe sin
                   pasar por aquí).
   · cliEmbarque → escucha /embarques: cuando Cargadores finaliza una
                   unidad cuyo pedido coincide con un prepedido fincado,
                   lo marca "liberado" con lotes y hora, y avisa al cliente.

   Secreto requerido (una sola vez, en Cloud Shell):
       firebase functions:secrets:set CLI_MAESTRO
   (una frase larga que solo tú conoces; con ella das de alta los PIN
    del personal desde ventas.html).
   ================================================================ */
const {onRequest} = require('firebase-functions/v2/https');
const {onValueWritten} = require('firebase-functions/v2/database');
const {defineSecret} = require('firebase-functions/params');
const admin = require('firebase-admin');
const crypto = require('crypto');
const CliCore = require('./cli-core');

if (!admin.apps.length) admin.initializeApp();
const rtdb = admin.database();
const CLI_MAESTRO = defineSecret('CLI_MAESTRO');

// Desde dónde se acepta la llamada: tu GitHub Pages y las apps de tienda (Capacitor).
const ALLOWED_ORIGINS = [
  'https://barbagomezricardo-cloud.github.io',
  'capacitor://localhost',      // iPhone (App Store)
  'https://localhost',          // Android (Google Play)
  'http://localhost'
];

const dbAdapter = {
  get: (p) => rtdb.ref(p).get().then((s) => s.val()),
  set: (p, v) => rtdb.ref(p).set(v === undefined ? null : v),
  update: (p, o) => rtdb.ref(p).update(o),
  remove: (p) => rtdb.ref(p).remove()
};

function hashPin(pin, salt) {
  return crypto.scryptSync(String(pin), String(salt), 32).toString('hex');
}
function b64u(buf) { return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'); }
function hmacKey() { return crypto.createHash('sha256').update('cli-sesion:' + CLI_MAESTRO.value()).digest(); }
function firmar(payload) {
  const body = b64u(JSON.stringify(payload));
  const sig = b64u(crypto.createHmac('sha256', hmacKey()).update(body).digest());
  return body + '.' + sig;
}
function verificar(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const esperado = b64u(crypto.createHmac('sha256', hmacKey()).update(body).digest());
  if (esperado.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(sig))) return null;
  let p; try { p = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); } catch (e) { return null; }
  if (!p || !p.exp || p.exp < Date.now()) return null;
  return p;
}
function igualSeguro(a, b) {
  const x = crypto.createHash('sha256').update(String(a || '')).digest();
  const y = crypto.createHash('sha256').update(String(b || '')).digest();
  return crypto.timingSafeEqual(x, y) && String(a || '').length > 0;
}

async function notifyPush(tokens, titulo, cuerpo, datos) {
  const data = {};
  Object.keys(datos || {}).forEach((k) => { data[k] = String(datos[k]); });
  try {
    await admin.messaging().sendEachForMulticast({
      tokens: tokens.slice(0, 20),
      notification: {title: titulo, body: cuerpo},
      data,
      webpush: {fcmOptions: {link: 'https://barbagomezricardo-cloud.github.io/embarques/clientes/'}},
      apns: {payload: {aps: {sound: 'default'}}}
    });
  } catch (e) { console.warn('push', e.message); }
}

const core = CliCore.create({
  db: dbAdapter,
  hashPin,
  randomSalt: () => crypto.randomBytes(16).toString('hex'),
  newId: () => rtdb.ref('cli/_ids').push().key,
  notifyPush
});

// Tu Panel de Licencia manda: licencia general + interruptor por app.
async function licenciaOk(appId) {
  const l = (await rtdb.ref('licencia').get()).val() || {};
  if (l.activa !== true) return false;
  if (l.hasta && Date.now() >= Number(l.hasta)) return false;
  const a = l.apps && l.apps[appId];
  if (a === undefined || a === null) return true;            // sin nodo propio: hereda la licencia general
  if (typeof a === 'object') return a.activa === true && !(a.hasta && Date.now() >= Number(a.hasta));
  return a === true;
}

// Revisa que el nodo /cli siga cerrado al público (si alguien publica reglas viejas, lo avisa).
async function reglasCerradas() {
  try {
    const url = (process.env.FIREBASE_CONFIG ? JSON.parse(process.env.FIREBASE_CONFIG).databaseURL : '') + '/cli/config.json';
    const r = await fetch(url);
    return r.status === 401 || r.status === 403;
  } catch (e) { return null; }
}

exports.cliApi = onRequest(
  {secrets: [CLI_MAESTRO], region: 'us-central1', cpu: 1, memory: '256MiB', maxInstances: 10},
  async (req, res) => {
    const origin = req.get('origin') || '';
    res.set('Access-Control-Allow-Origin', ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Cli-Sesion, X-Cli-Maestro');
    res.set('Access-Control-Max-Age', '3600');
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).json({error: 'Método no permitido'});
    const raw = JSON.stringify(req.body || {});
    if (raw.length > 900000) return res.status(413).json({error: 'Solicitud demasiado grande'});

    const {modo, accion, datos} = req.body || {};
    try {
      let out;
      if (modo === 'cliente') {
        if (!(await licenciaOk('clientes'))) return res.status(423).json({error: 'La app está en mantenimiento. Intenta más tarde.'});
        const m = /^Bearer (.+)$/.exec(req.get('authorization') || '');
        if (!m) return res.status(401).json({error: 'Inicia sesión de nuevo.', code: 'sin_sesion'});
        let dec;
        try { dec = await admin.auth().verifyIdToken(m[1], true); } catch (e) { return res.status(401).json({error: 'Tu sesión expiró. Entra de nuevo.', code: 'sin_sesion'}); }
        if (!dec.phone_number) return res.status(403).json({error: 'Tu cuenta debe estar verificada con tu celular.'});
        out = await core.cliente({uid: dec.uid, tel: dec.phone_number}, accion, datos);
        if (out && out.borrarAuth) { try { await admin.auth().deleteUser(dec.uid); } catch (e) { console.warn('baja', e.message); } delete out.borrarAuth; }
      } else if (modo === 'login') {
        if (!(await licenciaOk('clientes_personal'))) return res.status(423).json({error: 'Módulo apagado desde el Panel de Licencia.'});
        const ses = await core.staffLogin(datos && datos.usuario, datos && datos.pin);
        const exp = Date.now() + 30 * 24 * 3600 * 1000;
        out = {token: firmar(Object.assign({}, ses, {exp})), yo: ses, exp};
      } else if (modo === 'loginProg') {
        if (!(await licenciaOk('clientes_personal'))) return res.status(423).json({error: 'Módulo apagado desde el Panel de Licencia.'});
        const ses = await core.progLogin(datos && datos.pwd);
        const exp = Date.now() + 7 * 24 * 3600 * 1000;
        out = {token: firmar(Object.assign({}, ses, {exp})), yo: {u: ses.u, nombre: ses.nombre, rol: ses.rol, vk: ''}, exp};
      } else if (modo === 'staff') {
        if (!(await licenciaOk('clientes_personal'))) return res.status(423).json({error: 'Módulo apagado desde el Panel de Licencia.'});
        const ses = verificar(req.get('x-cli-sesion'));
        if (!ses) return res.status(401).json({error: 'Tu sesión terminó. Entra con tu PIN.', code: 'sin_sesion'});
        out = await core.staff(ses, accion, datos);
      } else if (modo === 'maestro') {
        if (!igualSeguro(req.get('x-cli-maestro'), CLI_MAESTRO.value())) {
          await new Promise((r) => setTimeout(r, 1200));
          return res.status(401).json({error: 'Llave maestra incorrecta.'});
        }
        if (accion === 'estado') out = {reglasCerradas: await reglasCerradas(), licenciaClientes: await licenciaOk('clientes'), licenciaPersonal: await licenciaOk('clientes_personal')};
        else out = await core.maestro(accion, datos);
      } else {
        return res.status(400).json({error: 'Solicitud no válida'});
      }
      return res.json(out);
    } catch (e) {
      if (e && e.publico) return res.status(e.status || 400).json({error: e.publico, code: e.code});
      console.error(e);
      return res.status(500).json({error: 'Ocurrió un error. Intenta de nuevo.'});
    }
  }
);

exports.cliEmbarque = onValueWritten(
  {ref: '/embarques/{id}', region: 'us-central1'},
  async (event) => {
    const antes = event.data.before.exists() ? event.data.before.val() : null;
    const despues = event.data.after.exists() ? event.data.after.val() : null;
    if (despues && !despues.id) despues.id = event.params.id;
    try { await core.onEmbarque(antes, despues); } catch (e) { console.error('cliEmbarque', e); }
  }
);
