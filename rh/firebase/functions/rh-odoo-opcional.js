
/* ================================================================
   OPCIONAL — Puente RH → Odoo (pégalo al final de index.js cuando
   tengas los secretos ODOO_URL, ODOO_DB, ODOO_USER y ODOO_API_KEY)
   ================================================================ */
const ODOO_URL = defineSecret('ODOO_URL');
const ODOO_DB = defineSecret('ODOO_DB');
const ODOO_USER = defineSecret('ODOO_USER');
const ODOO_API_KEY = defineSecret('ODOO_API_KEY');

/* Puente con Odoo: envía las asistencias de una semana cerrada a hr.attendance.
   Empata empleados por "barcode" (= número de empleado en RH). */
async function odooCall(model, method, args, kwargs) {
  const url = ODOO_URL.value().replace(/\/$/, '') + '/jsonrpc';
  const call = async (service, m, a) => {
    const r = await fetch(url, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', method: 'call', params: {service, method: m, args: a}, id: Date.now()})});
    const j = await r.json(); if (j.error) throw new Error((j.error.data && j.error.data.message) || j.error.message); return j.result;
  };
  if (!odooCall.uid) odooCall.uid = await call('common', 'login', [ODOO_DB.value(), ODOO_USER.value(), ODOO_API_KEY.value()]);
  if (!odooCall.uid) throw new Error('Odoo rechazó el usuario o la API key');
  return call('object', 'execute_kw', [ODOO_DB.value(), odooCall.uid, ODOO_API_KEY.value(), model, method, args, kwargs || {}]);
}
exports.rhOdoo = onRequest(
  {secrets: [ODOO_URL, ODOO_DB, ODOO_USER, ODOO_API_KEY], region: 'us-central1', cpu: 1, memory: '256MiB', timeoutSeconds: 300},
  async (req, res) => {
    if (invCors(req, res)) return;
    try {
      if (!(await invLicenciaOk('rh'))) { res.status(200).json({ok: false, message: 'Licencia desactivada.'}); return; }
      const u = await rhUsuario(req);
      if (!u || (u.rol !== 'master' && u.rol !== 'rh')) { res.status(200).json({ok: false, message: 'Solo master o RH.'}); return; }
      const b = req.body || {};
      if (b.accion === 'probar') { const n = await odooCall('hr.employee', 'search_count', [[]]); res.status(200).json({ok: true, empleadosOdoo: n}); return; }
      if (b.accion === 'asistencias') {
        const sem = String(b.semana || ''); const cierre = (await db.ref('rh/cierres/' + sem).get()).val();
        if (!cierre) { res.status(200).json({ok: false, message: 'Primero cierra la semana.'}); return; }
        const dias = []; for (let i = 0; i < 7; i++) { const d = new Date(sem + 'T12:00:00'); d.setDate(d.getDate() + i); dias.push(d.toISOString().slice(0, 10)); }
        const emps = (await db.ref('rh/empleados').get()).val() || {};
        const nums = [...new Set(Object.values(emps).map((e) => e.num).filter(Boolean))];
        const od = await odooCall('hr.employee', 'search_read', [[['barcode', 'in', nums]]], {fields: ['id', 'barcode']});
        const map = {}; od.forEach((e) => map[e.barcode] = e.id);
        const utc = (ts) => new Date(ts).toISOString().replace('T', ' ').slice(0, 19);
        let creadas = 0; const sinEmpleado = new Set();
        for (const f of dias) {
          const dia = (await db.ref('rh/checadas/' + f).get()).val() || {};
          for (const empId of Object.keys(dia)) {
            const e = emps[empId]; if (!e) continue; const oid = map[e.num]; if (!oid) { sinEmpleado.add(e.num); continue; }
            const chs = Object.values(dia[empId]).filter((c) => !c.anulada).map((c) => c.ts).sort((a, z) => a - z);
            if (!chs.length || chs.length < 2) continue;
            const ext = 'rh19_' + empId + '_' + f;
            const ya = await odooCall('hr.attendance', 'search_count', [[['employee_id', '=', oid], ['check_in', '=', utc(chs[0])]]]);
            if (ya) continue;
            await odooCall('hr.attendance', 'create', [{employee_id: oid, check_in: utc(chs[0]), check_out: utc(chs[chs.length - 1])}]);
            creadas++; void ext;
          }
        }
        await db.ref('rh/cierres/' + sem + '/odoo').set({ts: Date.now(), por: u.nombre, creadas});
        res.status(200).json({ok: true, creadas, sinEmpleado: [...sinEmpleado]}); return;
      }
      res.status(200).json({ok: false, message: 'Acción desconocida.'});
    } catch (e) { console.error('rhOdoo', e); res.status(200).json({ok: false, message: 'Odoo: ' + (e.message || 'error')}); }
  }
);
