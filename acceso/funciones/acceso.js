/* =====================================================================
   embAdmin · administración de usuarios de Programador y Cargadores
   ---------------------------------------------------------------------
   Lo llama el programador (Área master) con el token de Firebase de
   quien está conectado; solo responde si ese usuario es master y activo.
   Con la llave maestra (CLI_MAESTRO, la misma de la app de Clientes)
   acepta además dos acciones de instalación, que corre instalar.sh:
     migrar  → crea las cuentas a partir de las contraseñas viejas de
               /config (cada una queda «debe cambiar») y la cuenta master.
     cerrar  → borra las contraseñas viejas de /config.
   Las contraseñas se guardan en Firebase Authentication con el prefijo
   «emb19h:» (igual que acceso-19h.js); nunca en la base de datos.
   ===================================================================== */
const {onRequest} = require('firebase-functions/v2/https');
const {defineSecret} = require('firebase-functions/params');
const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();
const db = admin.database();
const CLI_MAESTRO = defineSecret('CLI_MAESTRO');

const DOMINIO = '@emb19h.app';
const PRE = 'emb19h:';
const ROLES = ['master', 'su', 'cons', 'basc'];
const ROLES_GER = ['master', 'su', 'visor'];
const ROLES_INV = ['master', 'jefe', 'compras', 'almacenista', 'produccion'];
const ROLES_RH = ['master', 'rh', 'director', 'jefe'];
/* Ola 3: el mismo usuario entra a Inventarios y RH. Su rol ahí vive en inv/usuarios/{uid} y rh/usuarios/{uid} */
async function rolSistema(sis, uid, p, rol) {
  const ok = sis === 'inv' ? ROLES_INV : ROLES_RH;
  const ref = db.ref(sis + '/usuarios/' + uid);
  if (!ok.includes(rol)) { const a = (await ref.once('value')).val(); if (a && a.acceso) await ref.update({activo: false}); return null; }
  await ref.update({usuario: p.key, nombre: p.nombre, rol, activo: p.activo !== false, acceso: true, creado: Date.now()});
  return rol;
}
const ORIGENES = ['https://barbagomezricardo-cloud.github.io', 'http://localhost:8090', 'http://localhost:8092', 'null'];   // 'null' = Panel de Licencia abierto como archivo local (igual exige token de master)
const VIEJOS = ['pwd', 'masterPwd', 'pwdBascula', 'staffUsers', 'bascUsers', 'users'];

function clave(t) {
  return String(t || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30);
}
function falla(msg) { const e = new Error(msg); e.publico = true; return e; }
function igualSeguro(a, b) {
  a = String(a || ''); b = String(b || '');
  if (!a || a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function arr(x) { return Array.isArray(x) ? x.filter(Boolean) : (x && typeof x === 'object' ? Object.values(x).filter(Boolean) : []); }

async function licenciaOk() {
  const l = (await db.ref('licencia').once('value')).val() || {};
  return l.activa === true && (!l.hasta || Date.now() < Number(l.hasta));
}

async function claveLibre(base) {
  let k = clave(base) || 'usuario', n = 1;
  const dir = (await db.ref('acceso/directorio').once('value')).val() || {};
  while (dir[k]) { n++; k = clave(base).slice(0, 27) + '_' + n; }
  return k;
}

async function publicarDirectorio(uid, p) {
  if (!p || p.activo === false || (!p.prog && !p.carg && !p.ger && !p.vend && !p.cb)) { await db.ref('acceso/directorio/' + p.key).remove(); return; }
  const a = {}; if (p.prog) a.prog = true; if (p.carg) a.carg = true; if (p.ger) a.ger = true; if (p.vend || p.ger) a.vend = true;
  if (p.cb || ['master', 'su', 'basc'].includes(p.prog)) a.basc = true;   // Cuadre de báscula
  await db.ref('acceso/directorio/' + p.key).set({n: p.nombre, a});
}

function validarTemporal(t, nip) {
  t = String(t || '');
  if (nip ? !/^\d{6}$/.test(t) : t.length < 6) throw falla(nip ? 'La temporal debe ser de 6 números.' : 'La temporal debe tener 6 caracteres o más.');
  return t;
}

function limpiaVend(v) { v = String(v || '').trim().toUpperCase().replace(/[.#$\[\]\/]/g, '').slice(0, 40); return v || null; }
async function crearCuenta({nombre, key, prog, carg, ger, vend, cb, pass, debeCambiar, por, otros}) {
  nombre = String(nombre || '').trim().slice(0, 60);
  if (!nombre) throw falla('Falta el nombre.');
  prog = ROLES.includes(prog) ? prog : null; carg = carg === true; ger = ROLES_GER.includes(ger) ? ger : null; vend = limpiaVend(vend);
  cb = cb === true;
  if (!prog && !carg && !ger && !vend && !cb && !otros) throw falla('Elige al menos un acceso.');
  key = key ? clave(key) : await claveLibre(nombre);
  const email = key + DOMINIO;
  let user = null;
  try { user = await admin.auth().getUserByEmail(email); } catch (e) { if (e.code !== 'auth/user-not-found') throw e; }
  if (user) await admin.auth().updateUser(user.uid, {password: PRE + pass, disabled: false, displayName: nombre});
  else user = await admin.auth().createUser({email, password: PRE + pass, displayName: nombre});
  const p = {key, nombre, prog, carg: carg || null, ger, vend, cb: cb || null, activo: true, debeCambiar: debeCambiar !== false, creado: Date.now(), por: por || 'sistema'};
  await db.ref('acceso/usuarios/' + user.uid).set(p);
  await publicarDirectorio(user.uid, p);
  return {uid: user.uid, key};
}

async function bitacora(por, que) {
  await db.ref('acceso/bitacora').push({ts: Date.now(), por, que});
}

/* ---------- instalación (llave maestra) ---------- */
async function migrar(d) {
  const c = (await db.ref('config').once('value')).val() || {};
  const hechos = [], omitidos = [];
  const m = d.master || {};
  if (!m.usuario || String(m.pass || '').length < 8) throw falla('Falta el usuario master o su contraseña (mínimo 8).');
  const rm = await crearCuenta({nombre: m.nombre || 'Ricardo Barba (master)', key: m.usuario, prog: 'master', carg: false, pass: m.pass, debeCambiar: false, por: 'instalación'});
  hechos.push({nombre: m.nombre || 'master', usuario: rm.key, rol: 'master'});
  const intentar = async (nombre, prog, carg, pass) => {
    pass = String(pass || '');
    if (!pass) { omitidos.push(nombre + ' (sin contraseña)'); return; }
    const k = clave(nombre);
    if ((await db.ref('acceso/directorio/' + k).once('value')).exists()) { omitidos.push(nombre + ' (ya tenía cuenta: ' + k + ')'); return; }
    try {
      const r = await crearCuenta({nombre, prog, carg, pass, debeCambiar: true, por: 'migración'});
      hechos.push({nombre, usuario: r.key, rol: prog || 'cargador'});
    } catch (e) { omitidos.push(nombre + ' (' + e.message + ')'); }
  };
  if (c.pwd) await intentar('Superusuario general', 'su', false, c.pwd);
  for (const u of arr(c.staffUsers)) await intentar(u.name, u.rol === 'cons' ? 'cons' : 'su', false, u.pwd);
  for (const u of arr(c.bascUsers)) await intentar(u.name, 'basc', false, u.pwd);
  if (c.pwdBascula) await intentar('Báscula compartida', 'basc', false, c.pwdBascula);
  for (const u of arr(c.users)) await intentar(u.name, null, true, u.pin);
  await bitacora('instalación', 'Migración de ' + hechos.length + ' cuentas');
  return {hechos, omitidos};
}

/* Ola 2: el master también entra a Ventas/Maestra; una cuenta por vendedor publicado (NIP temporal) */
function nipAzar() { let n; do { n = String(100000 + require('crypto').randomInt(900000)); } while (/^(\d)\1+$/.test(n)); return n; }
async function ola2() {
  const us = (await db.ref('acceso/usuarios').once('value')).val() || {};
  const masters = Object.keys(us).filter((u) => us[u].prog === 'master');
  for (const uid of masters) { await db.ref('acceso/usuarios/' + uid).update({ger: 'master', carg: true}); await publicarDirectorio(uid, Object.assign({}, us[uid], {ger: 'master', carg: true})); }   // un solo usuario master para todas las apps
  const idx = (await db.ref('skan/_index').once('value')).val() || {};
  const vs = arr(idx.vendors).map(String);
  const yaVend = new Set(Object.values(us).map((u) => u.vend).filter(Boolean));
  const hechos = [], omitidos = [];
  for (const v of vs) {
    const clave_ = limpiaVend(v);
    if (!clave_ || yaVend.has(clave_)) { omitidos.push(v + ' (ya tenía cuenta)'); continue; }
    const nombre = v.charAt(0) + v.slice(1).toLowerCase();
    if ((await db.ref('acceso/directorio/' + clave(nombre)).once('value')).exists()) { omitidos.push(v + ' (ya existe ' + clave(nombre) + ')'); continue; }
    const tmp = nipAzar();
    try { const r = await crearCuenta({nombre, vend: clave_, pass: tmp, debeCambiar: true, por: 'ola 2'}); hechos.push({nombre, usuario: r.key, vend: clave_, nip: tmp}); }
    catch (e) { omitidos.push(v + ' (' + e.message + ')'); }
  }
  await bitacora('instalación', 'Ola 2: ' + hechos.length + ' vendedores');
  return {masters: masters.length, hechos, omitidos};
}

async function ola3() {
  const us = (await db.ref('acceso/usuarios').once('value')).val() || {};
  const hechos = [];
  for (const uid of Object.keys(us).filter((u) => us[u].prog === 'master' && us[u].activo !== false)) {
    await rolSistema('inv', uid, us[uid], 'master'); await rolSistema('rh', uid, us[uid], 'master');
    hechos.push(us[uid].nombre);
  }
  await bitacora('instalación', 'Ola 3: master vinculado a Inventarios y RH');
  return {hechos};
}
/* Para el panel: roles de Inventarios y RH de cada usuario de Acceso */
async function rolesSistemas() {
  const [i, r] = await Promise.all([db.ref('inv/usuarios').once('value'), db.ref('rh/usuarios').once('value')]);
  const out = {}; const I = i.val() || {}, R = r.val() || {};
  Object.keys(I).forEach((u) => { if (I[u].acceso && I[u].activo !== false) (out[u] = out[u] || {}).inv = I[u].rol; });
  Object.keys(R).forEach((u) => { if (R[u].acceso && R[u].activo !== false) (out[u] = out[u] || {}).rh = R[u].rol; });
  return {roles: out};
}

async function cerrar() {
  const up = {}; VIEJOS.forEach((k) => { up['config/' + k] = null; });
  await db.ref().update(up);
  await bitacora('instalación', 'Contraseñas viejas borradas de /config');
  return {borrados: VIEJOS};
}

/* ---------- master desde la app ---------- */
async function quien(req) {
  const m = /^Bearer (.+)$/.exec(req.get('authorization') || '');
  if (!m) return null;
  let dec; try { dec = await admin.auth().verifyIdToken(m[1], true); } catch (e) { return null; }
  const p = (await db.ref('acceso/usuarios/' + dec.uid).once('value')).val();
  return p && p.activo === true ? Object.assign({uid: dec.uid}, p) : null;
}

async function accionMaster(yo, accion, d) {
  if (accion === 'roles') return rolesSistemas();
  if (accion === 'crear') {
    const otros = ROLES_INV.includes(d.inv) || ROLES_RH.includes(d.rh);
    const nip = !ROLES.includes(d.prog) && !ROLES_GER.includes(d.ger) && !otros;   // cargadores, vendedores y cuadre: NIP
    const r = await crearCuenta({nombre: d.nombre, prog: d.prog, carg: d.carg === true, ger: d.ger, vend: d.vend, cb: d.cb === true, otros, pass: validarTemporal(d.temporal, nip), debeCambiar: true, por: yo.nombre});
    const pc = {key: r.key, nombre: d.nombre};
    if (d.inv) await rolSistema('inv', r.uid, pc, d.inv);
    if (d.rh) await rolSistema('rh', r.uid, pc, d.rh);
    await bitacora(yo.nombre, 'Creó a ' + d.nombre + ' (' + r.key + ')');
    return r;
  }
  const uid = String(d.uid || '');
  if (!uid) throw falla('Falta el usuario.');
  if (uid === yo.uid) throw falla('No puedes cambiar tu propia cuenta desde aquí.');
  const ref = db.ref('acceso/usuarios/' + uid);
  const p = (await ref.once('value')).val();
  if (!p) throw falla('Ese usuario no existe.');
  if (accion === 'restablecer') {
    const t = validarTemporal(d.temporal, false);   // mínimo 6 (NIP o contraseña, según la persona)
    await admin.auth().updateUser(uid, {password: PRE + t});
    await admin.auth().revokeRefreshTokens(uid);
    await ref.update({debeCambiar: true, restablecido: Date.now()});
    await bitacora(yo.nombre, 'Restableció la contraseña de ' + p.nombre);
    return {};
  }
  if (accion === 'actualizar') {
    const n = {};
    if ('prog' in d) n.prog = ROLES.includes(d.prog) ? d.prog : null;
    if ('carg' in d) n.carg = d.carg === true ? true : null;
    if ('ger' in d) n.ger = ROLES_GER.includes(d.ger) ? d.ger : null;
    if ('vend' in d) n.vend = limpiaVend(d.vend);
    if ('cb' in d) n.cb = d.cb === true ? true : null;
    if ('inv' in d) await rolSistema('inv', uid, Object.assign({}, p, n), d.inv);
    if ('rh' in d) await rolSistema('rh', uid, Object.assign({}, p, n), d.rh);
    if ('activo' in n) { for (const sis of ['inv', 'rh']) { const r = db.ref(sis + '/usuarios/' + uid); const a = (await r.once('value')).val(); if (a && a.acceso) await r.update({activo: n.activo}); } }
    if ('activo' in d) n.activo = d.activo === true;
    const q = Object.assign({}, p, n);
    // (sin acceso a ningún programa simplemente no entra a nada; no se bloquea el cambio)
    await ref.update(n);
    await admin.auth().updateUser(uid, {disabled: q.activo === false});
    if ('activo' in n || 'prog' in n || 'ger' in n || 'vend' in n || 'cb' in n) await admin.auth().revokeRefreshTokens(uid);
    await publicarDirectorio(uid, q);
    await bitacora(yo.nombre, 'Actualizó a ' + p.nombre + ': ' + JSON.stringify(n));
    return {};
  }
  throw falla('Acción desconocida.');
}

exports.embAdmin = onRequest(
  {region: 'us-central1', cpu: 1, memory: '256MiB', secrets: [CLI_MAESTRO]},
  async (req, res) => {
    const o = req.get('origin') || '';
    if (ORIGENES.includes(o)) { res.set('Access-Control-Allow-Origin', o); res.set('Vary', 'Origin'); }
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Cli-Maestro');
    res.set('Access-Control-Allow-Methods', 'POST');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ok: false, message: 'Solo POST'}); return; }
    const {accion, datos} = req.body || {};
    try {
      const llave = req.get('x-cli-maestro');
      if (llave) {
        if (!igualSeguro(llave, CLI_MAESTRO.value())) { await new Promise((r) => setTimeout(r, 1200)); res.status(401).json({ok: false, message: 'Llave maestra incorrecta.'}); return; }
        if (accion === 'migrar') { res.json(Object.assign({ok: true}, await migrar(datos || {}))); return; }
        if (accion === 'directorio') {   // rehace la lista de nombres para entrar (con el acceso a Cuadre de báscula)
          const us = (await db.ref('acceso/usuarios').once('value')).val() || {};
          for (const uid of Object.keys(us)) await publicarDirectorio(uid, us[uid]);
          res.json({ok: true, cuentas: Object.keys(us).length}); return;
        }
        if (accion === 'ola3') { res.json(Object.assign({ok: true}, await ola3())); return; }
        if (accion === 'ola2') { res.json(Object.assign({ok: true}, await ola2())); return; }
        if (accion === 'cerrar') { res.json(Object.assign({ok: true}, await cerrar())); return; }
        if (accion === 'estado') {
          const us = (await db.ref('acceso/usuarios').once('value')).val() || {};
          const c = (await db.ref('config').once('value')).val() || {};
          res.json({ok: true, cuentas: Object.keys(us).length, pendientesDeCambio: Object.values(us).filter((u) => u.debeCambiar && u.activo).map((u) => u.nombre), contrasenasViejasEnConfig: VIEJOS.filter((k) => c[k] != null)});
          return;
        }
        res.status(400).json({ok: false, message: 'Acción desconocida.'}); return;
      }
      if (!(await licenciaOk())) { res.json({ok: false, message: 'Licencia desactivada.'}); return; }
      const yo = await quien(req);
      if (!yo || yo.prog !== 'master') { res.status(403).json({ok: false, message: 'Solo el master puede hacer esto.'}); return; }
      res.json(Object.assign({ok: true}, await accionMaster(yo, accion, datos || {})));
    } catch (e) {
      if (e.publico) { res.status(400).json({ok: false, message: e.message}); return; }
      console.error('embAdmin', e);
      res.status(500).json({ok: false, message: 'Error inesperado.'});
    }
  }
);
