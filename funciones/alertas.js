/* ================================================================
   alertasSinCompraEmail — alertas AUTOMÁTICAS de clientes sin compra
   ----------------------------------------------------------------
   Sustituye las alertas de prueba "[04MAS] N cliente(s) sin compra"
   del Apps Script anterior. Ahora salen del sistema de ventas vigente
   (ventas.html), con los mismos umbrales del tab Alertas:
     🔴 Crítico   45+ días sin compra
     🟠 Atención  30 a 44 días
     🟡 Seguimiento 15 a 29 días (o el mínimo que elijas)

   De dónde salen los datos:
   - /skan/_alertasSinCompra  → lo publica ventas.html cada vez que
     se carga un reporte de Odoo o se publica a la nube. Trae la
     FECHA de última compra de cada cliente, así los días se cuentan
     contra el día del envío.
   - /skan/_config → alertasAutoCfg04mas (encendido, días, mínimo,
     destinatarios) y vendCfg04mas (correo de cada vendedor). Todo se
     configura desde ventas.html, sin tocar este código.

   Corre todos los días a las 8:00 am (Ciudad de México) y solo manda
   correo los días de la semana que se eligieron en ventas.html.
   Guarda una marca por día en /skan/_alertasLog para no mandar doble.
   ================================================================ */

const {onSchedule} = require('firebase-functions/v2/scheduler');
const {defineSecret} = require('firebase-functions/params');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

if (!admin.apps.length) admin.initializeApp();

const GMAIL_USER = defineSecret('GMAIL_USER');
const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');

const TZ = 'America/Mexico_City';
const FIRMA_NOMBRE = 'Lic. Ricardo Barba Gómez';
const FIRMA_PUESTO = 'Gerencia Comercial · División Pet Food';

/* ---------------- Lógica pura (se prueba sin Firebase) ---------------- */

function fechaLocal(d, tz) {
  // 'YYYY-MM-DD' y día de la semana (0=domingo) en la zona horaria dada
  const p = new Intl.DateTimeFormat('en-CA', {timeZone: tz || TZ, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short'})
    .formatToParts(d).reduce((o, x) => { o[x.type] = x.value; return o; }, {});
  const dow = {Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6}[p.weekday];
  return {iso: p.year + '-' + p.month + '-' + p.day, dow};
}

function diasEntre(isoDesde, isoHasta) {
  const a = Date.UTC(+isoDesde.slice(0, 4), +isoDesde.slice(5, 7) - 1, +isoDesde.slice(8, 10));
  const b = Date.UTC(+isoHasta.slice(0, 4), +isoHasta.slice(5, 7) - 1, +isoHasta.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

function parseCfg(raw, def) {
  if (!raw) return Object.assign({}, def);
  try { return Object.assign({}, def, typeof raw === 'string' ? JSON.parse(raw) : raw); } catch (e) { return Object.assign({}, def); }
}

function listaCorreos(s) {
  return String(s || '').split(/[,;\s]+/).map((x) => x.trim()).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
}

/**
 * Arma los correos a mandar. No envía nada: regresa [{to, subject, html, text}].
 * payload: /skan/_alertasSinCompra   cfgRaw: /skan/_config   hoy: {iso, dow}
 */
function armarAlertas(payload, cfgRaw, hoy) {
  const cfg = parseCfg(cfgRaw && cfgRaw.alertasAutoCfg04mas, {enabled: false, dias: [1], minDias: 15, aVendedores: true, gerencia: ''});
  const vendCfg = parseCfg(cfgRaw && cfgRaw.vendCfg04mas, {});
  if (!cfg.enabled) return {motivo: 'apagado', correos: []};
  if (!(cfg.dias || []).includes(hoy.dow)) return {motivo: 'hoy no toca', correos: []};
  if (!payload || !Array.isArray(payload.clientes)) return {motivo: 'sin datos publicados', correos: []};

  const min = Math.max(1, +cfg.minDias || 15);
  const clientes = payload.clientes
    .map((c) => Object.assign({}, c, {dias: diasEntre(c.ult, hoy.iso)}))
    .filter((c) => c.dias >= min && c.dias <= 365);

  const porVend = {};
  clientes.forEach((c) => { (porVend[c.v || '(sin asignar)'] = porVend[c.v || '(sin asignar)'] || []).push(c); });
  Object.values(porVend).forEach((cs) => cs.sort((a, b) => b.dias - a.dias || b.prom - a.prom));

  const fechaTxt = fmtFecha(hoy.iso);
  const reporteTxt = payload.reporte ? fmtFecha(payload.reporte) : '';
  const viejo = payload.reporte ? diasEntre(payload.reporte, hoy.iso) : 0;
  const correos = [];

  // 1) Un correo por vendedor (solo sus clientes)
  if (cfg.aVendedores) {
    Object.keys(porVend).sort().forEach((v) => {
      const mail = listaCorreos(vendCfg[v] && vendCfg[v].email);
      if (!mail.length || v === '(sin asignar)') return;
      const cs = porVend[v];
      const cont = conteo(cs);
      correos.push({
        to: mail,
        subject: 'Clientes sin compra · ' + v + ' · ' + cs.length + ' cliente(s)' + (cont.crit ? ' (' + cont.crit + ' críticos)' : '') + ' — ' + fechaTxt,
        html: htmlCorreo({titulo: 'Clientes que conviene contactar', saludo: 'Hola ' + nombreCorto(v) + ',',
          intro: 'Te comparto los clientes de tu cartera que llevan ' + min + ' días o más sin compra. Sugiero dar prioridad a los marcados en rojo esta semana.',
          bloques: [{vend: v, clientes: cs}], fechaTxt, reporteTxt, viejo}),
        text: textoCorreo(v, cs, fechaTxt, reporteTxt)
      });
    });
  }

  // 2) Consolidado para gerencia (todos los vendedores)
  const ger = listaCorreos(cfg.gerencia);
  if (ger.length && clientes.length) {
    const vends = Object.keys(porVend).sort((a, b) => conteo(porVend[b]).crit - conteo(porVend[a]).crit || porVend[b].length - porVend[a].length);
    const tot = conteo(clientes);
    correos.push({
      to: ger,
      subject: 'Consolidado clientes sin compra · ' + clientes.length + ' cliente(s), ' + tot.crit + ' críticos — ' + fechaTxt,
      html: htmlCorreo({titulo: 'Consolidado de clientes sin compra', saludo: '',
        intro: 'Resumen por vendedor de los clientes con ' + min + '+ días sin compra.' + (cfg.aVendedores ? ' Cada vendedor con correo registrado recibió su propia lista.' : ''),
        resumen: vends.map((v) => Object.assign({vend: v, total: porVend[v].length, correo: !!listaCorreos(vendCfg[v] && vendCfg[v].email).length}, conteo(porVend[v]))),
        bloques: vends.map((v) => ({vend: v, clientes: porVend[v]})), fechaTxt, reporteTxt, viejo}),
      text: vends.map((v) => textoCorreo(v, porVend[v], fechaTxt, reporteTxt)).join('\n\n')
    });
  }
  return {motivo: correos.length ? 'ok' : 'sin destinatarios o sin clientes', correos, totalClientes: clientes.length};
}

function conteo(cs) {
  return {crit: cs.filter((c) => c.dias >= 45).length, aten: cs.filter((c) => c.dias >= 30 && c.dias < 45).length, seg: cs.filter((c) => c.dias < 30).length};
}
function nombreCorto(v) { const w = String(v || '').trim().split(/\s+/)[0] || ''; return w.charAt(0) + w.slice(1).toLowerCase(); }
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function fmtFecha(iso) { return +iso.slice(8, 10) + ' de ' + MESES[+iso.slice(5, 7) - 1] + ' de ' + iso.slice(0, 4); }
function fmtCorta(iso) { return iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4); }
function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function fmtN(n) { return Math.round(+n || 0).toLocaleString('es-MX'); }

function nivelDe(d) {
  if (d >= 45) return {txt: 'Crítico', bg: '#dc2626', fg: '#fff'};
  if (d >= 30) return {txt: 'Atención', bg: '#f97316', fg: '#fff'};
  return {txt: 'Seguimiento', bg: '#fbbf24', fg: '#422006'};
}

function tablaClientes(cs) {
  const th = 'style="padding:7px 8px;text-align:left;font-size:12px;color:#475569;border-bottom:2px solid #e2e8f0;white-space:nowrap"';
  const td = 'style="padding:7px 8px;font-size:13px;color:#1e293b;border-bottom:1px solid #f1f5f9;vertical-align:top"';
  return '<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:6px 0 4px">' +
    '<tr><th ' + th + '>Cliente</th><th ' + th + '>Días</th><th ' + th + '>Última compra</th><th ' + th + '>Nivel</th><th ' + th + '>Sacos/mes</th><th ' + th + '>Estado</th><th ' + th + '>Sugerencia</th></tr>' +
    cs.map((c) => {
      const nv = nivelDe(c.dias);
      const sug = c.dias >= 45 ? ('Llamada de reactivación' + (c.promo ? ' · ofrecer ' + esc(c.promo) : '')) :
        c.dias >= 30 ? ('Contactar esta semana' + (c.promo ? ' · ' + esc(c.promo) : '')) : 'Seguimiento normal';
      return '<tr><td ' + td + '><b>' + esc(c.n) + '</b></td>' +
        '<td ' + td + '><span style="display:inline-block;background:' + nv.bg + ';color:' + nv.fg + ';border-radius:10px;padding:2px 8px;font-weight:700;font-size:12px;white-space:nowrap">' + c.dias + ' · ' + nv.txt + '</span></td>' +
        '<td ' + td + '>' + fmtCorta(c.ult) + '</td><td ' + td + '>' + esc(c.nivel || '—') + '</td>' +
        '<td ' + td + ' align="right">' + fmtN(c.prom) + '</td><td ' + td + '>' + esc(c.est || '—') + '</td>' +
        '<td ' + td + '>' + sug + '</td></tr>';
    }).join('') + '</table>';
}

function htmlCorreo(o) {
  let h = '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:820px;margin:0 auto;color:#1e293b">' +
    '<div style="background:#1A2E5A;color:#fff;padding:16px 20px;border-radius:10px 10px 0 0">' +
    '<div style="font-size:12px;opacity:.8">Silver Kan · ' + esc(o.fechaTxt) + '</div>' +
    '<div style="font-size:19px;font-weight:800;margin-top:2px">' + esc(o.titulo) + '</div></div>' +
    '<div style="border:1px solid #e2e8f0;border-top:none;padding:16px 20px;border-radius:0 0 10px 10px">';
  if (o.saludo) h += '<p style="margin:0 0 8px">' + esc(o.saludo) + '</p>';
  h += '<p style="margin:0 0 12px;font-size:14px;color:#334155">' + esc(o.intro) + '</p>';
  if (o.viejo > 7) {
    h += '<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:8px 12px;font-size:12px;color:#92400e;margin-bottom:12px">' +
      'Nota: el último reporte de Odoo cargado es del ' + esc(o.reporteTxt) + '. Si algún cliente compró después de esa fecha, puede aparecer aquí aunque ya esté al corriente.</div>';
  }
  if (o.resumen) {
    h += '<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-bottom:14px">' +
      '<tr style="background:#f8fafc"><th style="padding:7px 8px;text-align:left;font-size:12px">Vendedor</th><th style="padding:7px 8px;font-size:12px">🔴</th><th style="padding:7px 8px;font-size:12px">🟠</th><th style="padding:7px 8px;font-size:12px">🟡</th><th style="padding:7px 8px;font-size:12px">Total</th><th style="padding:7px 8px;text-align:left;font-size:12px">Recibió su lista</th></tr>' +
      o.resumen.map((r) => '<tr><td style="padding:6px 8px;border-top:1px solid #f1f5f9;font-weight:700">' + esc(r.vend) + '</td><td align="center" style="border-top:1px solid #f1f5f9">' + r.crit + '</td><td align="center" style="border-top:1px solid #f1f5f9">' + r.aten + '</td><td align="center" style="border-top:1px solid #f1f5f9">' + r.seg + '</td><td align="center" style="border-top:1px solid #f1f5f9;font-weight:700">' + r.total + '</td><td style="padding:6px 8px;border-top:1px solid #f1f5f9;font-size:12px;color:' + (r.correo ? '#15803d' : '#b45309') + '">' + (r.correo ? 'Sí' : 'Sin correo en ⚙ Config') + '</td></tr>').join('') +
      '</table>';
  }
  o.bloques.forEach((b) => {
    if (o.resumen) h += '<div style="font-weight:800;font-size:15px;margin:16px 0 2px;color:#1A2E5A">' + esc(b.vend) + ' · ' + b.clientes.length + ' cliente(s)</div>';
    h += tablaClientes(b.clientes);
  });
  h += '<p style="font-size:12px;color:#64748b;margin:12px 0 0">🔴 Crítico = 45+ días · 🟠 Atención = 30 a 44 · 🟡 Seguimiento = menos de 30. Datos del sistema de ventas' + (o.reporteTxt ? ' (último reporte de Odoo: ' + esc(o.reporteTxt) + ')' : '') + '.</p>' +
    '<p style="margin:16px 0 0;font-size:13px">Saludos,<br><b>' + FIRMA_NOMBRE + '</b><br><span style="color:#64748b">' + FIRMA_PUESTO + '</span></p>' +
    '</div><div style="font-size:11px;color:#94a3b8;text-align:center;margin-top:8px">Mensaje automático del sistema de ventas Silver Kan.</div></div>';
  return h;
}

function textoCorreo(v, cs, fechaTxt, reporteTxt) {
  let t = 'Clientes sin compra — ' + v + ' — ' + fechaTxt + '\n';
  cs.forEach((c) => { t += '• ' + c.n + ' — ' + c.dias + ' días (última compra ' + fmtCorta(c.ult) + ') · ' + (c.nivel || '—') + ' · ' + fmtN(c.prom) + ' sacos/mes · ' + (c.est || '—') + '\n'; });
  if (reporteTxt) t += '(Último reporte de Odoo: ' + reporteTxt + ')\n';
  return t + '\n' + FIRMA_NOMBRE + '\n' + FIRMA_PUESTO;
}

/* ---------------- Función programada ---------------- */

const alertasSinCompraEmail = onSchedule(
  {
    schedule: '0 8 * * *',
    timeZone: TZ,
    secrets: [GMAIL_USER, GMAIL_APP_PASSWORD],
    region: 'us-central1',
    cpu: 1,
    memory: '256MiB'
  },
  async () => {
    try {
      const db = admin.database();
      const hoy = fechaLocal(new Date(), TZ);
      const logRef = db.ref('skan/_alertasLog/' + hoy.iso);
      if ((await logRef.get()).exists()) { console.log('alertasSinCompraEmail: ya se mandó hoy (' + hoy.iso + ').'); return; }

      const [pSnap, cSnap] = await Promise.all([db.ref('skan/_alertasSinCompra').get(), db.ref('skan/_config').get()]);
      const r = armarAlertas(pSnap.val(), cSnap.val() || {}, hoy);
      if (!r.correos.length) { console.log('alertasSinCompraEmail: no se manda nada —', r.motivo); return; }

      const transporter = nodemailer.createTransport({service: 'gmail', auth: {user: GMAIL_USER.value(), pass: GMAIL_APP_PASSWORD.value()}});
      const enviados = [];
      for (const c of r.correos) {
        try {
          await transporter.sendMail({from: 'Silver Kan — Alertas de clientes <' + GMAIL_USER.value() + '>', to: c.to.join(', '), subject: c.subject, html: c.html, text: c.text});
          enviados.push(c.to.join(', '));
        } catch (e) { console.error('alertasSinCompraEmail: falló el envío a', c.to.join(', '), e); }
      }
      await logRef.set({enviadoA: enviados, clientes: r.totalClientes || 0, at: new Date().toISOString()});
      console.log('alertasSinCompraEmail: enviados', enviados.length, 'correo(s):', enviados.join(' | '));
    } catch (err) {
      console.error('alertasSinCompraEmail error', err);
    }
  }
);

module.exports = {alertasSinCompraEmail, _test: {armarAlertas, fechaLocal, diasEntre}};
