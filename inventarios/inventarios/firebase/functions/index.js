/* ================================================================
   Silver Kan — función segura para el asistente de IA
   ----------------------------------------------------------------
   Esta función vive en Firebase Cloud Functions (no en las apps
   estáticas). Aquí — y SOLO aquí — vive la llave de la API de
   Anthropic, guardada como "secret" de Firebase, nunca en el HTML.
   Recibe la pregunta + un bloque de contexto (datos ya calculados
   por ventas.html/vendedor.html/maestra.html), controla cuántas
   preguntas puede hacer cada quien al mes (para que el gasto nunca
   se salga de control), llama a la IA de Anthropic, y regresa la
   respuesta.
   ================================================================ */

const {onRequest} = require('firebase-functions/v2/https');
const {defineSecret} = require('firebase-functions/params');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.database();

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

/* ---------------------------------------------------------------
   AJUSTES — puedes tocar estos valores aquí si algún día quieres
   cambiar el comportamiento por defecto (requiere volver a
   desplegar la función con `firebase deploy --only functions`).
   Los topes de uso normales NO se cambian aquí: se ajustan desde
   ventas.html (global y por vendedor) o desde maestra.html
   (autorizar más a un vendedor específico), sin tocar código.
   --------------------------------------------------------------- */

// Dominios desde los que se acepta la llamada (tu GitHub Pages).
// Agrega aquí cualquier otro dominio donde llegues a publicar las apps.
const ALLOWED_ORIGINS = [
  'https://barbagomezricardo-cloud.github.io'
];

// Modelos permitidos: la app solo puede pedir uno de estos dos alias,
// nunca un modelo arbitrario. Si Anthropic renombra sus modelos más
// adelante, solo hay que actualizar los valores de la derecha aquí.
const MODEL_MAP = {
  haiku: 'claude-haiku-4-5-20251001',   // económico y rápido — el recomendado para uso diario
  sonnet: 'claude-sonnet-5'             // más elaborado/razonador — cuesta más por pregunta
};

// Topes por defecto si nunca se configuran en ventas.html (red de seguridad).
const DEFAULT_GLOBAL_MONTHLY_CAP = 500;   // preguntas de IA para TODA la empresa, al mes
const DEFAULT_VENDOR_MONTHLY_CAP = 30;    // preguntas de IA por vendedor, al mes (~1 al día)
const ADMIN_MONTHLY_CAP = 300;            // ventas.html / maestra.html (gerencia) — solo red de seguridad, no un límite de negocio

const MAX_QUESTION_CHARS = 800;
const MAX_OUTPUT_TOKENS = 600;

function monthKey() {
  const d = new Date();
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

function normKey(s) {
  const k = String(s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return k || 'ANON';
}

/* Revisa y — si hay cupo — reserva de una vez el uso, para que dos
   preguntas que lleguen al mismo tiempo no se pasen del tope. */
async function checkAndReserveQuota(vendorKey, role) {
  const mk = monthKey();
  const isAdmin = role === 'admin';

  const [overrideSnap, defaultsSnap] = await Promise.all([
    db.ref('ai_caps/overrides/' + vendorKey).get(),
    db.ref('ai_caps').get()
  ]);
  const defaults = defaultsSnap.val() || {};
  const globalCap = Number(defaults.globalMonthly) || DEFAULT_GLOBAL_MONTHLY_CAP;
  const vendorDefaultCap = Number(defaults.perVendorDefault) || DEFAULT_VENDOR_MONTHLY_CAP;
  const vendorCap = isAdmin ? ADMIN_MONTHLY_CAP : (Number(overrideSnap.val()) || vendorDefaultCap);

  const totalRef = db.ref('ai_usage/' + mk + '/_total/count');
  const vendorRef = db.ref('ai_usage/' + mk + '/' + vendorKey + '/count');

  const [totalSnap, vendorSnap] = await Promise.all([totalRef.get(), vendorRef.get()]);
  const totalCount = Number(totalSnap.val()) || 0;
  const vendorCount = Number(vendorSnap.val()) || 0;

  if (!isAdmin && vendorCount >= vendorCap) {
    return {ok: false, reason: 'vendor_cap', vendorCount, vendorCap};
  }
  if (totalCount >= globalCap) {
    return {ok: false, reason: 'global_cap', totalCount, globalCap};
  }

  await Promise.all([
    totalRef.transaction((v) => (v || 0) + 1),
    vendorRef.transaction((v) => (v || 0) + 1)
  ]);
  return {ok: true};
}

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '3600'
  };
}

exports.vzAsk = onRequest(
  {secrets: [ANTHROPIC_API_KEY], region: 'us-central1', cpu: 1, memory: '256MiB'},
  async (req, res) => {
    const origin = req.get('origin') || '';
    const headers = corsHeaders(origin);
    Object.keys(headers).forEach((k) => res.set(k, headers[k]));

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ok: false, message: 'Método no permitido.'});
      return;
    }

    try {
      const body = req.body || {};
      const question = String(body.question || '').slice(0, MAX_QUESTION_CHARS).trim();
      if (!question) {
        res.status(400).json({ok: false, message: 'Falta la pregunta.'});
        return;
      }

      const modelKey = MODEL_MAP[body.model] ? body.model : 'haiku';
      const model = MODEL_MAP[modelKey];
      const role = body.role === 'admin' ? 'admin' : 'vendedor';
      const vendorKey = normKey(body.vendorKey || 'ANON');
      const context = (body.context && typeof body.context === 'object') ? body.context : {};

      const quota = await checkAndReserveQuota(vendorKey, role);
      if (!quota.ok) {
        const message = quota.reason === 'vendor_cap'
          ? ('Ya usaste tus ' + quota.vendorCap + ' preguntas de IA de este mes. Pídele a tu gerente que te autorice más.')
          : 'Se llegó al límite de preguntas de IA de la empresa este mes. Vuelve a intentar el próximo mes.';
        res.status(200).json({ok: false, reason: quota.reason, message});
        return;
      }

      const systemPrompt =
        'Eres el asistente de datos de ventas de Silver Kan (alimento para mascotas), usado por vendedores y gerencia. ' +
        'SOLO puedes usar los datos del bloque JSON de contexto que te doy abajo — nunca inventes clientes, cifras o nombres que no estén ahí. ' +
        'Si no tienes datos suficientes para responder con certeza, dilo claramente en vez de adivinar. ' +
        'Responde siempre en español de México, de forma breve, clara y directa — la respuesta se puede leer en voz alta o mostrar en la pantalla de un celular, así que evita tablas, markdown o listas largas; usa prosa corta. ' +
        'Contexto de datos (JSON):\n' + JSON.stringify(context);

      const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY.value(),
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model,
          max_tokens: MAX_OUTPUT_TOKENS,
          system: systemPrompt,
          messages: [{role: 'user', content: question}]
        })
      });

      if (!aiResp.ok) {
        const errText = await aiResp.text().catch(() => '');
        console.error('Anthropic API error', aiResp.status, errText);
        res.status(200).json({ok: false, message: 'Hubo un problema consultando la IA. Intenta de nuevo en un momento.'});
        return;
      }

      const data = await aiResp.json();
      const answer = (data.content && data.content[0] && data.content[0].text) ? data.content[0].text.trim() : '';
      if (!answer) {
        res.status(200).json({ok: false, message: 'La IA no devolvió una respuesta. Intenta de nuevo.'});
        return;
      }

      res.status(200).json({ok: true, answer, model: modelKey});
    } catch (err) {
      console.error('vzAsk error', err);
      res.status(200).json({ok: false, message: 'Hubo un error inesperado. Intenta de nuevo.'});
    }
  }
);


/* ================================================================
   INVENTARIOS PET FOOD — funciones del sistema de inventarios
   (se agregan a las de Silver Kan; vzAsk sigue igual)
   - invAsk:          IA solo para el usuario master
   - invAdmin:        restablecer contraseñas / notificación de prueba
   - invRecordatorio: recordatorio diario a producción (hora configurable)
   Todas revisan tu licencia (licencia/activa, hasta y licencia/apps/<id>)
   ================================================================ */
const {onSchedule} = require('firebase-functions/v2/scheduler');

const INV_MODEL_MAP = MODEL_MAP;
const INV_MONTHLY_CAP = 400;           // preguntas de IA al mes para inventarios (red de seguridad)
const INV_MAX_CONTEXT_CHARS = 120000;

async function invLicenciaOk(appId) {
  const l = (await db.ref('licencia').get()).val();
  if (!l || l.activa !== true) return false;
  if (l.hasta && Date.now() >= Number(l.hasta)) return false;
  const a = appId && l.apps && l.apps[appId];
  if (a && typeof a === 'object') { if (a.activa !== true) return false; if (a.hasta && Date.now() >= Number(a.hasta)) return false; }
  if (a === false) return false;
  return true;
}
async function invUsuario(req) {
  const h = req.get('authorization') || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!tok) return null;
  const dec = await admin.auth().verifyIdToken(tok).catch(() => null);
  if (!dec) return null;
  const p = (await db.ref('inv/usuarios/' + dec.uid).get()).val();
  if (!p || p.activo !== true) return null;
  return Object.assign({uid: dec.uid}, p);
}
function invCors(req, res) {
  const headers = corsHeaders(req.get('origin') || '');
  Object.keys(headers).forEach((k) => res.set(k, headers[k]));
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return true; }
  if (req.method !== 'POST') { res.status(405).json({ok: false, message: 'Método no permitido.'}); return true; }
  return false;
}

exports.invAsk = onRequest(
  {secrets: [ANTHROPIC_API_KEY], region: 'us-central1', cpu: 1, memory: '512MiB', timeoutSeconds: 120},
  async (req, res) => {
    if (invCors(req, res)) return;
    try {
      if (!(await invLicenciaOk('inventarios'))) { res.status(200).json({ok: false, message: 'Licencia desactivada.'}); return; }
      const u = await invUsuario(req);
      if (!u || u.rol !== 'master') { res.status(200).json({ok: false, message: 'La IA solo está disponible para el usuario master.'}); return; }
      const body = req.body || {};
      const question = String(body.question || '').slice(0, 1500).trim();
      if (!question) { res.status(400).json({ok: false, message: 'Falta la pregunta.'}); return; }
      const mk = monthKey();
      const cRef = db.ref('inv_ia_uso/' + mk + '/count');
      const used = Number((await cRef.get()).val()) || 0;
      if (used >= INV_MONTHLY_CAP) { res.status(200).json({ok: false, message: 'Se llegó al tope mensual de preguntas de IA de inventarios.'}); return; }
      await cRef.transaction((v) => (v || 0) + 1);
      const model = INV_MODEL_MAP[body.model] || INV_MODEL_MAP.haiku;
      let ctx = JSON.stringify(body.context || {});
      if (ctx.length > INV_MAX_CONTEXT_CHARS) ctx = ctx.slice(0, INV_MAX_CONTEXT_CHARS);
      const system =
        'Eres el analista de inventarios de la planta de alimento para mascotas de Leche 19 Diecinueve Hermanos (División Pet Food). ' +
        'Hablas con el gerente (usuario master). Usa SOLO los datos del bloque JSON de contexto: existencias físicas (almacén MDE + almacén de insumos PT), ' +
        'alertas de compra (stock mínimo = consumo diario × lead time + 30% de seguridad), proyección, diferencias contra Odoo, conteos cíclicos, ' +
        'transferencias a PT, cortes de PT con Odoo, ajustes manuales, niveles de silos y la bitácora reciente. Nunca inventes cifras. ' +
        'Para anomalías busca: ajustes manuales repetidos o grandes, diferencias recurrentes contra Odoo, entregas distintas a lo solicitado, ' +
        'consumos de PT fuera de lo normal, existencias negativas, transferencias sin reflejar en Odoo y lecturas de silo incongruentes. ' +
        'Responde en español de México, directo y ejecutivo, con cifras concretas y la acción sugerida. Si faltan datos, dilo.\n\nContexto (JSON):\n' + ctx;
      const msgs = (Array.isArray(body.history) ? body.history : []).filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content).slice(-6).map((m) => ({role: m.role, content: String(m.content).slice(0, 4000)}));
      msgs.push({role: 'user', content: question});
      while (msgs.length && msgs[0].role !== 'user') msgs.shift();
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {'content-type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY.value(), 'anthropic-version': '2023-06-01'},
        body: JSON.stringify({model, max_tokens: 1200, system, messages: msgs})
      });
      if (!r.ok) { console.error('invAsk anthropic', r.status, await r.text().catch(() => '')); res.status(200).json({ok: false, message: 'Hubo un problema consultando la IA.'}); return; }
      const data = await r.json();
      const answer = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
      res.status(200).json({ok: !!answer, answer, message: answer ? '' : 'La IA no devolvió respuesta.'});
    } catch (e) { console.error('invAsk', e); res.status(200).json({ok: false, message: 'Error inesperado.'}); }
  }
);

async function invEnviarRecordatorio(titulo, cuerpo) {
  const [us, toks] = await Promise.all([db.ref('inv/usuarios').get(), db.ref('inv/tokens').get()]);
  const usuarios = us.val() || {}, tokens = toks.val() || {};
  const lista = [];
  Object.keys(tokens).forEach((uid) => { const p = usuarios[uid]; if (!p || p.activo !== true || p.rol !== 'produccion') return; Object.keys(tokens[uid] || {}).forEach((k) => { const t = tokens[uid][k]; if (t && t.token) lista.push({uid, k, token: t.token}); }); });
  if (!lista.length) return 0;
  const resp = await admin.messaging().sendEachForMulticast({
    tokens: lista.map((x) => x.token),
    notification: {title: titulo, body: cuerpo},
    data: {link: 'produccion.html', tag: 'recordatorio'},
    webpush: {fcmOptions: {link: 'produccion.html'}, notification: {icon: 'icons/icono-192.png', tag: 'recordatorio'}}
  });
  const limpiar = {};
  resp.responses.forEach((r, i) => { if (!r.success && /registration-token-not-registered|invalid-argument/.test((r.error && r.error.code) || '')) limpiar['inv/tokens/' + lista[i].uid + '/' + lista[i].k] = null; });
  if (Object.keys(limpiar).length) await db.ref().update(limpiar);
  return resp.successCount;
}

exports.invAdmin = onRequest(
  {region: 'us-central1', cpu: 1, memory: '256MiB'},
  async (req, res) => {
    if (invCors(req, res)) return;
    try {
      if (!(await invLicenciaOk('inventarios'))) { res.status(200).json({ok: false, message: 'Licencia desactivada.'}); return; }
      const u = await invUsuario(req);
      if (!u || u.rol !== 'master') { res.status(200).json({ok: false, message: 'Solo el master puede hacer esto.'}); return; }
      const b = req.body || {};
      if (b.accion === 'password') {
        if (!b.uid || String(b.pass || '').length < 6) { res.status(200).json({ok: false, message: 'Datos incompletos.'}); return; }
        await admin.auth().updateUser(String(b.uid), {password: String(b.pass)});
        await db.ref('inv/movimientos').push({tipo: 'usuario', ts: Date.now(), fecha: new Date().toISOString().slice(0, 10), por: u.nombre, nota: 'Restableció contraseña de ' + b.uid});
        res.status(200).json({ok: true}); return;
      }
      if (b.accion === 'notifPrueba') {
        const n = await invEnviarRecordatorio('Prueba de notificación', 'Así te llegará el recordatorio de solicitud de empaque.');
        res.status(200).json({ok: true, enviados: n}); return;
      }
      res.status(200).json({ok: false, message: 'Acción desconocida.'});
    } catch (e) { console.error('invAdmin', e); res.status(200).json({ok: false, message: e.message || 'Error inesperado.'}); }
  }
);

// Corre cada 15 minutos y envía el recordatorio cuando llega la hora configurada en el programa
exports.invRecordatorio = onSchedule(
  {schedule: 'every 15 minutes', timeZone: 'America/Mexico_City', region: 'us-central1', memory: '256MiB'},
  async () => {
    if (!(await invLicenciaOk('inventarios_produccion'))) return;
    const cfg = (await db.ref('inv/config/recordatorio').get()).val() || {hora: '08:00', activo: true, dias: [1, 2, 3, 4, 5, 6]};
    if (cfg.activo === false) return;
    const now = new Date(new Date().toLocaleString('en-US', {timeZone: 'America/Mexico_City'}));
    const hoy = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    if (!(cfg.dias || [1, 2, 3, 4, 5, 6]).includes(now.getDay())) return;
    const [h, m] = String(cfg.hora || '08:00').split(':').map(Number);
    if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return;
    if (cfg.ultimoEnvio === hoy) return;
    await db.ref('inv/config/recordatorio/ultimoEnvio').set(hoy);
    const n = await invEnviarRecordatorio('Solicitud de empaque e insumos', 'Buenos días: captura lo que vas a necesitar hoy en la app de Producción.');
    console.log('invRecordatorio enviados', n);
  }
);
