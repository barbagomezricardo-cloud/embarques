

/* ================================================================
   RECURSOS HUMANOS 19H — funciones del sistema de RH
   (se agregan a las de Silver Kan e Inventarios; las demás siguen igual)
   - rhAsk:   IA solo para el usuario master de RH
   - rhAdmin: restablecer contraseña/NIP y alta masiva de accesos de empleados
   - rhOdoo:  puente con Odoo (servidor a servidor, sin problemas de CORS)
   Todas revisan tu licencia (licencia/activa, hasta y licencia/apps/rh)
   Secretos opcionales para Odoo: ODOO_URL, ODOO_DB, ODOO_USER, ODOO_API_KEY
   ================================================================ */
const RH_MONTHLY_CAP = 300;            // preguntas de IA al mes para RH (red de seguridad)
const RH_MAX_CONTEXT_CHARS = 150000;
async function rhUsuario(req) {
  const h = req.get('authorization') || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!tok) return null;
  const dec = await admin.auth().verifyIdToken(tok).catch(() => null);
  if (!dec) return null;
  const p = (await db.ref('rh/usuarios/' + dec.uid).get()).val();
  if (!p || p.activo !== true) return null;
  return Object.assign({uid: dec.uid}, p);
}

exports.rhAsk = onRequest(
  {secrets: [ANTHROPIC_API_KEY], region: 'us-central1', cpu: 1, memory: '512MiB', timeoutSeconds: 120},
  async (req, res) => {
    if (invCors(req, res)) return;
    try {
      if (!(await invLicenciaOk('rh'))) { res.status(200).json({ok: false, message: 'Licencia desactivada.'}); return; }
      const u = await rhUsuario(req);
      if (!u || u.rol !== 'master') { res.status(200).json({ok: false, message: 'La IA solo está disponible para el usuario master.'}); return; }
      const body = req.body || {};
      const question = String(body.question || '').slice(0, 1500).trim();
      if (!question) { res.status(400).json({ok: false, message: 'Falta la pregunta.'}); return; }
      const cRef = db.ref('rh_ia_uso/' + monthKey() + '/count');
      const used = Number((await cRef.get()).val()) || 0;
      if (used >= RH_MONTHLY_CAP) { res.status(200).json({ok: false, message: 'Se llegó al tope mensual de preguntas de IA de RH.'}); return; }
      await cRef.transaction((v) => (v || 0) + 1);
      const model = MODEL_MAP[body.model] || MODEL_MAP.haiku;
      let ctx = JSON.stringify(body.context || {});
      if (ctx.length > RH_MAX_CONTEXT_CHARS) ctx = ctx.slice(0, RH_MAX_CONTEXT_CHARS);
      const system =
        'Eres el analista de Recursos Humanos de la planta de alimento para mascotas de Leche 19 Diecinueve Hermanos (División Pet Food), en México. ' +
        'Hablas con el gerente (usuario master). Usa SOLO los datos del bloque JSON: plantilla por departamento, asistencias de las últimas 4 semanas ' +
        '(faltas, retardos, tiempo extra pagable y sin autorizar, vacaciones, incapacidades, bono), saldos de vacaciones, rotación de 12 meses con tipo y motivo de baja, ' +
        'anomalías detectadas y la bitácora reciente. Nunca inventes cifras ni nombres. ' +
        'Busca patrones: ausentismo por departamento o por día de la semana, faltas recurrentes (LFT art. 47-X: más de 3 faltas en 30 días), tiempo extra sin autorización o concentrado en pocas personas, ' +
        'vacaciones fuera de plazo (LFT art. 81), rotación temprana (menos de 90 días) y sus motivos, correcciones manuales de checadas. ' +
        'Cita la Ley Federal del Trabajo solo cuando aplique y aclara que no sustituye la opinión de un abogado laboral. ' +
        'Responde en español de México, en tono ejecutivo y propositivo (sugiere, no ordenes), con cifras concretas, de preferencia en viñetas cortas, y la acción sugerida. Si faltan datos, dilo.\n\nContexto (JSON):\n' + ctx;
      const msgs = (Array.isArray(body.history) ? body.history : []).filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content).slice(-6).map((m) => ({role: m.role, content: String(m.content).slice(0, 4000)}));
      msgs.push({role: 'user', content: question});
      while (msgs.length && msgs[0].role !== 'user') msgs.shift();
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {'content-type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY.value(), 'anthropic-version': '2023-06-01'},
        body: JSON.stringify({model, max_tokens: 1500, system, messages: msgs})
      });
      if (!r.ok) { console.error('rhAsk anthropic', r.status, await r.text().catch(() => '')); res.status(200).json({ok: false, message: 'Hubo un problema consultando la IA.'}); return; }
      const data = await r.json();
      const answer = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
      res.status(200).json({ok: !!answer, answer, message: answer ? '' : 'La IA no devolvió respuesta.'});
    } catch (e) { console.error('rhAsk', e); res.status(200).json({ok: false, message: 'Error inesperado.'}); }
  }
);

exports.rhAdmin = onRequest(
  {region: 'us-central1', cpu: 1, memory: '256MiB', timeoutSeconds: 300},
  async (req, res) => {
    if (invCors(req, res)) return;
    try {
      if (!(await invLicenciaOk('rh'))) { res.status(200).json({ok: false, message: 'Licencia desactivada.'}); return; }
      const u = await rhUsuario(req);
      if (!u || (u.rol !== 'master' && u.rol !== 'rh')) { res.status(200).json({ok: false, message: 'Solo master o RH pueden hacer esto.'}); return; }
      const b = req.body || {};
      if (b.accion === 'password') {
        if (!b.uid || String(b.pass || '').length < 6) { res.status(200).json({ok: false, message: 'Datos incompletos.'}); return; }
        const p = (await db.ref('rh/usuarios/' + b.uid).get()).val() || {};
        if (u.rol !== 'master' && p.rol !== 'empleado' && p.rol !== 'kiosco') { res.status(200).json({ok: false, message: 'Solo el master cambia contraseñas de personal administrativo.'}); return; }
        await admin.auth().updateUser(String(b.uid), {password: String(b.pass)});
        await db.ref('rh/bitacora').push({ts: Date.now(), por: u.nombre, rol: u.rol, accion: 'Restableció contraseña', detalle: p.usuario || b.uid});
        res.status(200).json({ok: true}); return;
      }
      if (b.accion === 'accesos') {
        // Alta masiva: usuario e<num>@rh19h.app, contraseña = NIP de 6 dígitos, perfil rol empleado
        const lista = Array.isArray(b.lista) ? b.lista.slice(0, 50) : [];
        const ok = [], fallas = [];
        for (const it of lista) {
          try {
            const num = String(it.num || '').replace(/[^0-9a-z]/gi, '').toLowerCase();
            if (!num || !/^\d{6}$/.test(String(it.pin)) || !it.empId) throw new Error('datos');
            const email = 'e' + num + '@rh19h.app';
            let user = await admin.auth().getUserByEmail(email).catch(() => null);
            if (user) await admin.auth().updateUser(user.uid, {password: String(it.pin), disabled: false});
            else user = await admin.auth().createUser({email, password: String(it.pin), displayName: String(it.nombre || '')});
            await db.ref('rh/usuarios/' + user.uid).set({usuario: 'e' + num, nombre: String(it.nombre || ''), rol: 'empleado', empId: String(it.empId), activo: true, creado: Date.now()});
            ok.push(it.empId);
          } catch (e) { fallas.push({empId: it.empId, error: e.message}); }
        }
        await db.ref('rh/bitacora').push({ts: Date.now(), por: u.nombre, rol: u.rol, accion: 'Alta de accesos', detalle: ok.length + ' empleados'});
        res.status(200).json({ok: true, ok_ids: ok, fallas}); return;
      }
      res.status(200).json({ok: false, message: 'Acción desconocida.'});
    } catch (e) { console.error('rhAdmin', e); res.status(200).json({ok: false, message: e.message || 'Error inesperado.'}); }
  }
);

