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
