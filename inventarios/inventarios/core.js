/* =====================================================================
   NÚCLEO COMPARTIDO — Inventarios Pet Food 19 Hermanos
   Datos (Firebase Realtime Database o modo demo), usuarios, licencia,
   cálculos (silos, físico, compras, proyección) y utilerías de pantalla.
   Lo usan: index.html (programa principal), almacen.html y produccion.html
   ===================================================================== */
(function (W) {
  'use strict';
  const CFG = W.INV_CONFIG || {};
  const FB_VER = '10.12.0';
  const DEMO = !CFG.FIREBASE; /* producción: sin modo demo */
  const ROOT = 'inv';

  /* ------------------------------------------------------------------ */
  /* Utilerías                                                           */
  /* ------------------------------------------------------------------ */
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => { const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) ? n : 0; };
  const nf0 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
  const nf2 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 });
  const nfm = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
  const fmt = (v, d) => { v = num(v); return (d === 0 || Math.abs(v) >= 1000) ? nf0.format(v) : nf2.format(v); };
  const money = v => nfm.format(num(v));
  const pad = n => String(n).padStart(2, '0');
  const hoyISO = (d) => { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const mesKey = (d) => { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };
  const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const mesLabel = k => { const [y, m] = String(k).split('-'); return MESES[(+m) - 1] + ' ' + String(y).slice(2); };
  const addMes = (k, n) => { const [y, m] = k.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return mesKey(d); };
  const fFecha = ts => { if (!ts) return '—'; const d = new Date(ts); return pad(d.getDate()) + '/' + MESES[d.getMonth()] + '/' + String(d.getFullYear()).slice(2) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const fDia = iso => { if (!iso) return '—'; const [y, m, d] = iso.split('-'); return (+d) + ' ' + MESES[(+m) - 1] + ' ' + y; };
  const keySafe = s => String(s || '').trim().toUpperCase().replace(/[.#$\[\]\/\s]+/g, '_').replace(/^_+|_+$/g, '');
  const vals = o => (o && typeof o === 'object') ? Object.keys(o).map(k => Object.assign({ _k: k }, o[k])) : [];
  let _lastId = 0;
  const newId = () => { let t = Date.now(); if (t <= _lastId) t = _lastId + 1; _lastId = t; return t.toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase(); };
  const clone = v => v == null ? v : JSON.parse(JSON.stringify(v));
  const debounce = (fn, ms) => { let t; return function () { const a = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); }; };
  const loadScript = src => new Promise((ok, ko) => { if ($('script[src="' + src + '"]')) return ok(); const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => ko(new Error('No se pudo cargar ' + src)); document.head.appendChild(s); });

  /* ------------------------------------------------------------------ */
  /* Familias y roles                                                    */
  /* ------------------------------------------------------------------ */
  const FAMILIAS = ['EMPAQUE', 'MACROINGREDIENTES', 'MICROINGREDIENTES', 'GRASAS Y DIGESTAS', 'CRIBAS', 'OTROS INSUMOS'];
  const FAM_ICO = { 'EMPAQUE': '📦', 'MACROINGREDIENTES': '🌾', 'MICROINGREDIENTES': '🧪', 'GRASAS Y DIGESTAS': '🛢️', 'CRIBAS': '⚙️', 'OTROS INSUMOS': '🧰' };
  const ROLES = {
    master: { nombre: 'Master', desc: 'Todo el sistema, usuarios e IA' },
    jefe: { nombre: 'Jefe de inventarios', desc: 'Operación completa del programa principal' },
    compras: { nombre: 'Compras', desc: 'Solo proyecciones y alertas de compra' },
    almacenista: { nombre: 'Almacenista', desc: 'App de tablet: conteo, silos y entregas' },
    produccion: { nombre: 'Producción', desc: 'App de solicitudes de empaque e insumos' }
  };

  /* ------------------------------------------------------------------ */
  /* Base de datos: interfaz única                                       */
  /*   DB.on(path, cb) → off()     DB.get(path)   DB.set(path, v)         */
  /*   DB.update({ 'a/b': v, ... }) (multi-ruta)   DB.push(path, v) → key */
  /*   DB.tx(path, fn)  (suma/resta segura)        DB.remove(path)        */
  /* ------------------------------------------------------------------ */
  function makeLocalDB() {
    const KEY = 'inv19h_demo_v1';
    let tree;
    try { tree = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { tree = {}; }
    const subs = new Set();
    let bc = null; try { bc = new BroadcastChannel('inv19h_demo'); } catch (e) { }
    const parts = p => String(p || '').split('/').filter(Boolean);
    function getAt(p) { let n = tree; for (const k of parts(p)) { if (n == null || typeof n !== 'object') return null; n = n[k]; } return n === undefined ? null : clone(n); }
    function setAt(p, v) {
      const ks = parts(p); if (!ks.length) { tree = v || {}; return; }
      let n = tree; for (let i = 0; i < ks.length - 1; i++) { if (n[ks[i]] == null || typeof n[ks[i]] !== 'object') n[ks[i]] = {}; n = n[ks[i]]; }
      const last = ks[ks.length - 1];
      if (v === null || v === undefined) delete n[last]; else n[last] = clone(v);
    }
    function persist() { try { localStorage.setItem(KEY, JSON.stringify(tree)); } catch (e) { console.warn('demo storage', e); } }
    function notify(paths, remote) {
      subs.forEach(s => { if (paths.some(p => p === '' || s.path === '' || p.startsWith(s.path + '/') || s.path.startsWith(p + '/') || p === s.path)) { try { s.cb(getAt(s.path)); } catch (e) { console.error(e); } } });
      if (!remote && bc) try { bc.postMessage({ paths }); } catch (e) { }
    }
    if (bc) bc.onmessage = ev => { try { tree = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { } notify(ev.data.paths || [''], true); };
    const norm = p => parts(p).join('/');
    return {
      on(path, cb) { const s = { path: norm(path), cb }; subs.add(s); setTimeout(() => cb(getAt(s.path)), 0); return () => subs.delete(s); },
      onLast(path, n, cb) { return this.on(path, v => { if (!v) return cb(null); const ks = Object.keys(v).sort().slice(-n); const o = {}; ks.forEach(k => o[k] = v[k]); cb(o); }); },
      async get(path) { return getAt(norm(path)); },
      async set(path, v) { setAt(norm(path), v); persist(); notify([norm(path)]); },
      async update(obj) { const ps = []; Object.keys(obj).forEach(p => { setAt(norm(p), obj[p]); ps.push(norm(p)); }); persist(); notify(ps); },
      async push(path, v) { const k = newId(); await this.set(norm(path) + '/' + k, v); return k; },
      async remove(path) { await this.set(path, null); },
      async tx(path, fn) { const cur = getAt(norm(path)); const nv = fn(cur); if (nv !== undefined) { setAt(norm(path), nv); persist(); notify([norm(path)]); } return nv; },
      key() { return newId(); },
      _reset() { tree = {}; persist(); notify(['']); }
    };
  }

  function makeFirebaseDB(app) {
    const db = app.database();
    const R = p => db.ref(ROOT + (p ? '/' + String(p).replace(/^\/+/, '') : ''));
    return {
      on(path, cb) { const r = R(path); const h = s => cb(s.val()); r.on('value', h, e => console.warn('permiso/lectura', path, e && e.code)); return () => r.off('value', h); },
      onLast(path, n, cb) { const q = R(path).orderByKey().limitToLast(n); const h = s => cb(s.val()); q.on('value', h, e => console.warn('lectura', path, e && e.code)); return () => q.off('value', h); },
      async get(path) { const s = await R(path).get(); return s.val(); },
      set(path, v) { return R(path).set(v === undefined ? null : v); },
      update(obj) { const o = {}; Object.keys(obj).forEach(k => o[String(k).replace(/^\/+/, '')] = obj[k] === undefined ? null : obj[k]); return R('').update(o); },
      async push(path, v) { const r = R(path).push(); await r.set(v); return r.key; },
      remove(path) { return R(path).remove(); },
      async tx(path, fn) { const res = await R(path).transaction(cur => { const nv = fn(cur); return nv === undefined ? cur : nv; }); return res.snapshot.val(); },
      key() { return R('x').push().key; }
    };
  }

  /* ------------------------------------------------------------------ */
  /* Usuarios (Firebase Authentication con usuario + contraseña)         */
  /* ------------------------------------------------------------------ */
  const userEmail = u => String(u || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '') + '@inv19h.app';

  function makeLocalAuth(DB) {
    const SK = 'inv19h_demo_sesion';
    const cbs = new Set();
    let cur = null;
    async function load() {
      let u = null; try { u = JSON.parse(sessionStorage.getItem(SK)); } catch (e) { }
      if (u) { const p = await DB.get('usuarios/' + u.uid); cur = (p && p.activo !== false) ? Object.assign({ uid: u.uid }, p) : null; } else cur = null;
      cbs.forEach(cb => cb(cur));
    }
    return {
      onChange(cb) { cbs.add(cb); load(); return () => cbs.delete(cb); },
      async login(usuario, pass) {
        const us = await DB.get('usuarios') || {};
        const uid = Object.keys(us).find(k => (us[k].usuario || '').toLowerCase() === String(usuario).trim().toLowerCase());
        if (!uid || us[uid]._demoPass !== pass) throw new Error('Usuario o contraseña incorrectos');
        if (us[uid].activo === false) throw new Error('Tu usuario está desactivado. Consulta al master.');
        sessionStorage.setItem(SK, JSON.stringify({ uid })); await load();
      },
      async logout() { sessionStorage.removeItem(SK); await load(); },
      async crearUsuario(d) {
        const us = await DB.get('usuarios') || {};
        if (Object.values(us).some(x => (x.usuario || '').toLowerCase() === d.usuario.toLowerCase())) throw new Error('Ese usuario ya existe');
        const uid = 'U' + newId();
        await DB.set('usuarios/' + uid, { usuario: d.usuario.toLowerCase(), nombre: d.nombre, rol: d.rol, activo: true, creado: Date.now(), _demoPass: d.pass });
        return uid;
      },
      async crearMaster(d) { const uid = await this.crearUsuario(Object.assign({}, d, { rol: 'master' })); await DB.set('meta/hayMaster', true); return uid; },
      async cambiarPass(nueva) { if (!cur) throw new Error('Sin sesión'); await DB.set('usuarios/' + cur.uid + '/_demoPass', nueva); },
      async token() { return 'demo'; },
      get user() { return cur; }
    };
  }

  function makeFirebaseAuth(app, DB) {
    const auth = app.auth();
    const cbs = new Set();
    let cur = null, perfilOff = null, ready = false, last = null, creando = false;
    const emit = v => { last = v; cbs.forEach(cb => cb(v)); };
    auth.onAuthStateChanged(u => {
      ready = true;
      if (perfilOff) { perfilOff(); perfilOff = null; }
      if (!u) { cur = null; emit(null); return; }
      perfilOff = DB.on('usuarios/' + u.uid, p => {
        if (!p && creando) return;
        if (!p || p.activo === false) { cur = null; emit(p && p.activo === false ? { bloqueado: true } : { sinPerfil: true }); return; }
        cur = Object.assign({ uid: u.uid }, p); emit(cur);
      });
    });
    const errMsg = e => {
      const c = (e && e.code) || '';
      if (/invalid-credential|wrong-password|user-not-found|invalid-email|invalid-login/.test(c)) return 'Usuario o contraseña incorrectos';
      if (/too-many-requests/.test(c)) return 'Demasiados intentos. Espera unos minutos.';
      if (/network/.test(c)) return 'Sin conexión a internet';
      if (/email-already-in-use/.test(c)) return 'Ese usuario ya existe';
      if (/weak-password/.test(c)) return 'La contraseña debe tener al menos 6 caracteres';
      if (/operation-not-allowed/.test(c)) return 'Falta activar "Correo/contraseña" en Firebase Authentication';
      return (e && e.message) || 'Error';
    };
    return {
      onChange(cb) { cbs.add(cb); if (ready) setTimeout(() => cb(last), 0); return () => cbs.delete(cb); },
      async login(usuario, pass) { try { await auth.signInWithEmailAndPassword(userEmail(usuario), pass); } catch (e) { throw new Error(errMsg(e)); } },
      async logout() { await auth.signOut(); },
      async crearUsuario(d) {
        const sec = firebase.initializeApp(CFG.FIREBASE, 'sec' + Date.now());
        try {
          const cred = await sec.auth().createUserWithEmailAndPassword(userEmail(d.usuario), d.pass);
          await DB.set('usuarios/' + cred.user.uid, { usuario: d.usuario.toLowerCase(), nombre: d.nombre, rol: d.rol, activo: true, creado: Date.now() });
          await sec.auth().signOut();
          return cred.user.uid;
        } catch (e) { throw new Error(errMsg(e)); } finally { sec.delete().catch(() => { }); }
      },
      async crearMaster(d) {
        let cred; creando = true;
        try { cred = await auth.createUserWithEmailAndPassword(userEmail(d.usuario), d.pass); } catch (e) { creando = false; throw new Error(errMsg(e)); }
        try {
          await DB.set('usuarios/' + cred.user.uid, { usuario: d.usuario.toLowerCase(), nombre: d.nombre, rol: 'master', activo: true, creado: Date.now() });
          await DB.set('meta/hayMaster', true);
        } catch (e) { creando = false; await cred.user.delete().catch(() => { }); throw new Error('Ya existe un usuario master. Pide al master que te dé de alta.'); }
        creando = false;
        return cred.user.uid;
      },
      async cambiarPass(nueva) { try { await auth.currentUser.updatePassword(nueva); } catch (e) { if (/requires-recent-login/.test(e.code)) throw new Error('Por seguridad cierra sesión, vuelve a entrar y repite el cambio.'); throw new Error(errMsg(e)); } },
      async token() { return auth.currentUser ? auth.currentUser.getIdToken() : ''; },
      get user() { return cur; }
    };
  }

  /* ------------------------------------------------------------------ */
  /* Licencia (tu Panel de Licencia en embarques-mascotas)               */
  /* ------------------------------------------------------------------ */
  /* Misma estructura que tu Panel de Licencia:
     licencia = { activa, hasta (ms), apps: { <id>: { activa, hasta } } }
     Vive en la base de inventarios; las reglas de Firebase también la exigen. */
  function licViva(l) { if (!l || l.activa !== true) return false; if (l.hasta && Date.now() >= Number(l.hasta)) return false; return true; }
  async function checkLicencia(appKey) {
    const L = CFG.LICENCIA || {}; if (DEMO || !INV.app) return { ok: true };
    try {
      const snap = await Promise.race([INV.app.database().ref('licencia').get(), new Promise((_, ko) => setTimeout(() => ko(new Error('timeout')), 9000))]);
      const l = snap.val();
      if (!l) return { ok: false, msg: 'La licencia aún no está encendida. Enciéndela desde tu Panel de Licencia.' };
      if (!licViva(l)) return { ok: false, msg: (l.activa === true ? 'La licencia venció el ' + fFecha(Number(l.hasta)) + '.' : 'Este sistema está desactivado temporalmente.') };
      const id = L.apps && L.apps[appKey];
      const a = id && l.apps && l.apps[id];
      if (a) { if (typeof a === 'object' ? !licViva(a) : a !== true) return { ok: false, msg: 'Esta aplicación está desactivada desde el panel de licencia.' }; }
      return { ok: true, lic: l };
    } catch (e) { return { ok: true, aviso: 'Sin verificación de licencia: ' + e.message }; }
  }
  function pantallaBloqueo(msg) {
    document.body.innerHTML = '<div style="max-width:460px;margin:70px auto;text-align:center;font-family:system-ui,Segoe UI,sans-serif;color:#e8eef7;padding:20px"><div style="font-size:46px">🔒</div><h2 style="color:#E8A020;margin:12px 0">Servicio no disponible</h2><p style="color:#94a3b8">' + esc(msg) + '</p></div>';
    document.body.style.background = '#0b1622';
  }

  /* ------------------------------------------------------------------ */
  /* Arranque                                                            */
  /* ------------------------------------------------------------------ */
  const INV = W.INV = {
    CFG, DEMO, FAMILIAS, FAM_ICO, ROLES, DB: null, AUTH: null, app: null,
    $, $$, esc, num, fmt, money, pad, hoyISO, mesKey, mesLabel, addMes, MESES, MESES_L, fFecha, fDia, keySafe, vals, newId, clone, debounce, loadScript, userEmail
  };

  INV.checkLicencia = checkLicencia;
  INV.start = async function (opts) {
    opts = opts || {};
    if (DEMO) {
      INV.DB = makeLocalDB();
      INV.AUTH = makeLocalAuth(INV.DB);
      await seedDemo();
    } else {
      const base = 'https://www.gstatic.com/firebasejs/' + FB_VER + '/';
      try { await loadScript(base + 'firebase-app-compat.js'); } catch (e) { pantallaBloqueo('No hay conexión a internet o no se pudo cargar Firebase. Revisa tu conexión y recarga la página.'); throw e; }
      await Promise.all(['firebase-database-compat.js', 'firebase-auth-compat.js', 'firebase-app-check-compat.js'].concat(opts.messaging ? ['firebase-messaging-compat.js'] : []).map(f => loadScript(base + f).catch(() => { })));
      INV.app = firebase.apps.find(a => a.name === '[DEFAULT]') || firebase.initializeApp(CFG.FIREBASE);
      /* App Check (reCAPTCHA Enterprise) — igual que tus otras apps */
      if (CFG.APPCHECK_KEY && firebase.appCheck) { try { firebase.appCheck(INV.app).activate(new firebase.appCheck.RecaptchaEnterpriseProvider(CFG.APPCHECK_KEY), true); } catch (e) { console.warn('appCheck', e); } }
      INV.DB = makeFirebaseDB(INV.app);
      INV.AUTH = makeFirebaseAuth(INV.app, INV.DB);
    }
    if (opts.appKey && !DEMO) {
      const r = await checkLicencia(opts.appKey);
      if (!r.ok) { pantallaBloqueo(r.msg); throw new Error('licencia'); }
      if (r.aviso) console.info(r.aviso);
      setInterval(() => checkLicencia(opts.appKey).then(x => { if (!x.ok) pantallaBloqueo(x.msg); }), 10 * 60 * 1000);
    }
    return INV;
  };

  async function seedDemo() {
    const DB = INV.DB;
    const meta = await DB.get('meta');
    if (meta && meta.seed) return;
    try { await cargarSemilla(true); } catch (e) { console.warn('Demo sin datos de carga inicial', e); }
    const demoUsers = [['master', 'Ricardo Barba (Master)', 'master'], ['jefe', 'Jefe de Inventarios', 'jefe'], ['compras', 'Compras', 'compras'], ['almacen', 'Almacenista', 'almacenista'], ['produccion', 'Supervisor de Producción', 'produccion']];
    for (const [u, n, r] of demoUsers) { try { await INV.AUTH.crearUsuario({ usuario: u, nombre: n, rol: r, pass: 'demo' }); } catch (e) { } }
    await DB.update({ 'meta/hayMaster': true, 'meta/demo': true });
  }

  /* Carga el catálogo y los saldos iniciales que vienen de tus Excel (seed.js) */
  /* La carga inicial NO se publica en GitHub (trae existencias y costos):
     en línea se elige el archivo carga-inicial.json; en demo usa seed.js */
  function pedirArchivoSemilla() {
    return new Promise((ok, ko) => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,.js';
      inp.onchange = async () => { const f = inp.files[0]; if (!f) return ko(new Error('Sin archivo')); try { let t = await f.text(); t = t.replace(/^[\s\S]*?window\.SEED\s*=\s*/, '').replace(/;\s*$/, ''); ok(JSON.parse(t)); } catch (e) { ko(new Error('El archivo no es una carga inicial válida')); } };
      inp.click();
    });
  }
  async function cargarSemilla(conSaldos) {
    if (!W.SEED) { if (DEMO) await loadScript('seed.js'); else W.SEED = await pedirArchivoSemilla(); }
    const S = W.SEED, DB = INV.DB, up = {};
    Object.keys(S.catalogo).forEach(k => up['catalogo/' + k] = S.catalogo[k]);
    Object.keys(S.silos).forEach(k => up['silos/' + k] = S.silos[k]);
    Object.keys(S.densidades).forEach(k => up['densidades/' + k] = S.densidades[k]);
    if (conSaldos) {
      Object.keys(S.fisico).forEach(k => up['fisico/' + k] = S.fisico[k]);
      Object.keys(S.pt).forEach(k => up['pt/' + k] = S.pt[k]);
      Object.keys(S.silosLect).forEach(k => up['silosLect/' + k] = S.silosLect[k]);
      Object.keys(S.llegadas).forEach(k => up['llegadas/' + k] = Object.assign({}, S.llegadas[k], { ts: Date.now() }));
      up['odoo'] = S.odoo;
    }
    up['meta/seed'] = { ts: Date.now(), conSaldos: !!conSaldos };
    up['config/recordatorio'] = { hora: '08:00', activo: true, dias: [1, 2, 3, 4, 5, 6] };
    await DB.update(up);
    const k = await DB.push('movimientos', { tipo: 'sistema', ts: Date.now(), fecha: hoyISO(), nota: 'Carga inicial del catálogo' + (conSaldos ? ' y saldos desde los archivos de Excel' : ''), por: (INV.AUTH && INV.AUTH.user && INV.AUTH.user.nombre) || 'Sistema' });
    return k;
  }
  INV.cargarSemilla = cargarSemilla;

  /* ------------------------------------------------------------------ */
  /* Cálculos de negocio                                                 */
  /* ------------------------------------------------------------------ */

  /* Silos — misma fórmula de tu "Dashboard 24 Silos SCADA":
     altura total = cilindro + cono; volumen por metro = volumen total / altura total
     altura con producto = altura total − vacío medido con láser
     contenido (ton) = volumen por metro × altura con producto × densidad
     capacidad (ton) = (vol. cilindro + vol. cono) × densidad                */
  INV.calcSilo = function (s, lect, densOverride) {
    const alto = num(s.alto) + num(s.cono);
    const volTot = num(s.volTotal) || (num(s.volCil) + num(s.volCono));
    const dens = densOverride != null ? num(densOverride) : num(s.densidad);
    const vacio = lect && lect.vacio != null && lect.vacio !== '' ? num(lect.vacio) : null;
    const capacidad = (num(s.volCil) + num(s.volCono) || volTot) * dens;
    if (vacio == null || !alto) return { alto, capacidad, contenido: null, pct: null, caben: null, dens };
    const altDisp = Math.max(0, alto - vacio);
    const contenido = (volTot / alto) * altDisp * dens;
    return { alto, capacidad, contenido, pct: capacidad ? contenido / capacidad : null, caben: capacidad - contenido, dens, altDisp };
  };

  /* Toneladas en silos por artículo */
  INV.silosPorItem = function (silos, lects) {
    const r = {};
    vals(silos).forEach(s => { if (!s.itemId) return; const c = INV.calcSilo(s, lects && lects[s._k]); if (c.contenido == null) return; r[s.itemId] = (r[s.itemId] || 0) + c.contenido; });
    return r; // toneladas
  };

  /* Existencia física total = almacén (MDE / materias primas) + almacén de insumos PT */
  INV.fis = function (id, fisico, pt) {
    const m = num(fisico && fisico[id] && fisico[id].mde);
    const p = num(pt && pt[id] && pt[id].cant);
    return { mde: m, pt: p, total: m + p };
  };

  /* Tránsito fincado (OC ya colocadas) desde el mes actual */
  INV.transito = function (id, llegadas, opts) {
    const mk = mesKey(); let fin = 0, porComprar = 0;
    vals(llegadas).forEach(l => { if (l.itemId !== id || l.estado === 'recibido' || l.estado === 'cancelado') return; if (l.mes && l.mes < addMes(mk, -1)) return; if (l.estado === 'fincado') fin += num(l.cant); else if (l.estado === 'por_comprar') porComprar += num(l.cant); });
    return { fincado: fin, porComprar };
  };

  /* Alerta de compra — misma lógica de tu hoja "Costal-Bobina":
     stock de seguridad = consumo mensual × 30 %
     stock mínimo = consumo diario × lead time (días) + stock de seguridad
     status = SUFICIENTE si físico > stock mínimo, si no COLOCAR OC
     cantidad a pedir = stock mínimo − físico (se descuenta lo ya fincado)  */
  INV.alerta = function (it, f, tr) {
    const cons = num(it.consumo), ltd = num(it.lt) * 30, ssPct = it.ss == null ? 0.3 : num(it.ss);
    const consDia = cons / 30, ss = cons * ssPct, min = consDia * ltd + ss;
    const fis = f.total;
    const alcance = consDia > 0 ? fis / consDia : Infinity;
    let status = fis > min ? 'SUFICIENTE' : 'COLOCAR OC';
    const faltante = Math.max(0, min - fis);
    const sugerido = Math.max(0, min - fis - num(tr.fincado));
    if (status === 'COLOCAR OC' && sugerido <= 0 && tr.fincado > 0) status = 'CUBIERTO CON OC';
    /* Criticidad: CRÍTICO si se acaba antes de que pueda llegar un pedido nuevo
       (aun contando lo ya fincado); RIESGO si está por debajo del stock mínimo. */
    const alcanceTr = consDia > 0 ? (fis + num(tr.fincado)) / consDia : Infinity;
    let crit = 'SALUDABLE';
    if (consDia > 0) { if (alcanceTr < Math.max(ltd, 7)) crit = 'CRÍTICO'; else if (fis <= min) crit = 'RIESGO'; }
    const diasPedir = consDia > 0 ? Math.floor(alcance - ltd - (ss / (consDia || 1))) : Infinity;
    const fechaPedir = isFinite(diasPedir) ? new Date(Date.now() + diasPedir * 86400000) : null;
    return { cons, consDia, ltd, ss, min, fis, alcance, alcanceTr, status, faltante, sugerido, crit, diasPedir, fechaPedir };
  };

  /* Proyección mensual — misma mecánica de tu hoja "Proyección":
     stock fin de mes = stock anterior + lo que llega ese mes − consumo mensual
     (el mes en curso arranca del físico de hoy)                               */
  INV.proyeccion = function (it, f, llegadas, nMeses, incluirPorComprar) {
    const mk0 = mesKey(); const cons = num(it.consumo); const ss = cons * (it.ss == null ? 0.3 : num(it.ss));
    const arr = {}; vals(llegadas).forEach(l => { if (l.itemId !== it.id || l.estado === 'recibido' || l.estado === 'cancelado') return; if (l.estado === 'por_comprar' && !incluirPorComprar) return; const m = (l.mes && l.mes < mk0) ? mk0 : l.mes; arr[m] = arr[m] || { fin: 0, pc: 0, notas: [] }; if (l.estado === 'fincado') arr[m].fin += num(l.cant); else arr[m].pc += num(l.cant); arr[m].notas.push(l); });
    let stock = f.total; const out = []; let quiebre = null, bajoSS = null;
    for (let i = 0; i < (nMeses || 15); i++) {
      const m = addMes(mk0, i); const a = arr[m] || { fin: 0, pc: 0, notas: [] };
      stock = stock + a.fin + a.pc - cons;
      out.push({ mes: m, llega: a.fin + a.pc, fincado: a.fin, porComprar: a.pc, notas: a.notas, stock, bajoSS: stock < ss, negativo: stock < 0 });
      if (stock < 0 && !quiebre) quiebre = m;
      if (stock < ss && !bajoSS) bajoSS = m;
    }
    let pedirAntes = null;
    if (bajoSS && cons > 0) { const [y, mm] = bajoSS.split('-').map(Number); const d = new Date(y, mm - 1, 1); d.setDate(d.getDate() - Math.round(num(it.lt) * 30)); pedirAntes = d; }
    return { meses: out, quiebre, bajoSS, pedirAntes, ss };
  };

  /* Lee un reporte de existencias de Odoo (xlsx/csv) → { CODIGO: {c,n,q,costo,u} } */
  INV.leerOdoo = async function (file) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    let h = -1;
    for (let i = 0; i < Math.min(rows.length, 15); i++) { const r = (rows[i] || []).map(x => String(x || '').toLowerCase()); if (r.some(x => x.includes('cantidad')) && r.some(x => x.includes('nombre') || x.includes('producto') || x.includes('artículo') || x.includes('articulo'))) { h = i; break; } }
    if (h < 0) throw new Error('No encontré las columnas "Nombre/Producto" y "Cantidad" en el archivo.');
    const hd = rows[h].map(x => String(x || '').toLowerCase());
    const find = (...ws_) => hd.findIndex(x => ws_.some(w => x.includes(w)));
    const cN = find('nombre en pantalla', 'producto', 'nombre', 'artículo', 'articulo');
    let cQ = find('a la mano'); if (cQ < 0) cQ = find('cantidad disponible', 'cantidad');
    const cC = find('costo'), cU = find('unidad');
    const items = {}; let n = 0;
    for (let i = h + 1; i < rows.length; i++) {
      const r = rows[i]; if (!r || !r[cN]) continue;
      const m = String(r[cN]).match(/\[([^\]]+)\]\s*(.*)/); if (!m) continue;
      const code = m[1].trim(), k = keySafe(code);
      const q = num(r[cQ]);
      if (items[k]) items[k].q += q; else items[k] = { c: code, n: m[2].trim(), q, costo: cC >= 0 ? num(r[cC]) : 0, u: cU >= 0 ? (r[cU] || '') : '' };
      n++;
    }
    if (!n) throw new Error('El archivo no tiene renglones con código entre corchetes, p. ej. [02SAC001].');
    return { items, n, hoja: wb.SheetNames[0] };
  };

  INV.exportXlsx = async function (nombre, hojas) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
    const wb = XLSX.utils.book_new();
    hojas.forEach(h => { const ws = XLSX.utils.aoa_to_sheet(h.filas); ws['!cols'] = (h.filas[0] || []).map((_, i) => ({ wch: i === 1 ? 42 : 14 })); XLSX.utils.book_append_sheet(wb, ws, h.nombre.slice(0, 31)); });
    XLSX.writeFile(wb, nombre);
  };

  /* Movimientos de inventario (operaciones atómicas usadas por jefe/almacenista) */
  INV.mov = async function (data) {
    const u = INV.AUTH.user || {};
    return INV.DB.push('movimientos', Object.assign({ ts: Date.now(), fecha: hoyISO(), por: u.nombre || '', porUid: u.uid || '' }, data));
  };
  INV.sumar = function (path, delta) { return INV.DB.tx(path, cur => Math.round((num(cur) + num(delta)) * 1000) / 1000); };

  /* Llama a tus Cloud Functions con el token del usuario */
  INV.fn = async function (nombre, body) {
    if (!CFG.FUNCTIONS_URL) throw new Error('Falta configurar FUNCTIONS_URL en config.js (ver guía de despliegue).');
    const tok = await INV.AUTH.token();
    let r; try { r = await fetch(CFG.FUNCTIONS_URL.replace(/\/$/, '') + '/' + nombre, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok }, body: JSON.stringify(body || {}) }); } catch (e) { throw new Error('No se pudo contactar la función "' + nombre + '". ¿Ya se desplegó? (ver guía)'); }
    const j = await r.json().catch(() => ({ ok: false, message: 'Respuesta inválida (' + r.status + ')' }));
    if (!j.ok) throw new Error(j.message || 'Error');
    return j;
  };

  /* ------------------------------------------------------------------ */
  /* Interfaz: avisos, ventanas modales, confirmaciones                  */
  /* ------------------------------------------------------------------ */
  INV.toast = function (msg, tipo) {
    let t = $('#inv-toast'); if (!t) { t = document.createElement('div'); t.id = 'inv-toast'; document.body.appendChild(t); }
    t.className = 'show ' + (tipo || ''); t.textContent = msg; clearTimeout(t._h); t._h = setTimeout(() => t.className = '', 3200);
  };
  INV.modal = function (titulo, html, botones, opts) {
    return new Promise(res => {
      const ov = document.createElement('div'); ov.className = 'modal-ov';
      ov.innerHTML = '<div class="modal ' + ((opts && opts.ancho) ? 'ancho' : '') + '"><div class="modal-h"><b>' + esc(titulo) + '</b><button class="x" data-r="__x">✕</button></div><div class="modal-b">' + html + '</div><div class="modal-f"></div></div>';
      const f = $('.modal-f', ov);
      (botones || [{ t: 'Cerrar', v: null }]).forEach(b => { const e = document.createElement('button'); e.className = 'btn ' + (b.c || ''); e.textContent = b.t; e.onclick = async () => { if (b.antes) { const ok = await b.antes(ov); if (ok === false) return; } close(b.v); }; f.appendChild(e); });
      function close(v) { ov.remove(); res({ v, el: ov }); }
      $('[data-r="__x"]', ov).onclick = () => close(null);
      document.body.appendChild(ov);
      const first = $('input,select,textarea', ov); if (first) setTimeout(() => first.focus(), 50);
      if (opts && opts.onOpen) opts.onOpen(ov);
    });
  };
  INV.confirmar = async function (titulo, texto, si) { const r = await INV.modal(titulo, '<p>' + texto + '</p>', [{ t: 'Cancelar', v: false }, { t: si || 'Sí, continuar', v: true, c: 'pri' }]); return r.v === true; };

  /* Pantalla de inicio de sesión reutilizable */
  INV.pantallaLogin = function (cont, opts) {
    opts = opts || {};
    cont.innerHTML = `
    <div class="login">
      <div class="login-card">
        <div class="login-logo">${opts.icono || '📦'}</div>
        <h1>${esc(opts.titulo || 'Inventarios Pet Food')}</h1>
        <p class="muted">${esc(CFG.EMPRESA || '')}</p>
        ${DEMO ? '<div class="demo-badge">MODO DEMO · usuarios: master, jefe, compras, almacen, produccion · contraseña: demo</div>' : ''}
        <label>Usuario<input id="lg-u" autocomplete="username" autocapitalize="none" value="${esc(opts.sugerido || '')}"></label>
        <label>Contraseña<input id="lg-p" type="password" autocomplete="current-password"></label>
        <button class="btn pri big" id="lg-b">Entrar</button>
        <div id="lg-e" class="err"></div>
        <a href="#" id="lg-m" class="muted small" style="display:none">Primer uso: crear usuario master</a>
      </div>
    </div>`;
    const go = async () => { const e = $('#lg-e'), b = $('#lg-b'); e.textContent = ''; b.disabled = true; try { await INV.AUTH.login($('#lg-u').value, $('#lg-p').value); } catch (x) { if ($('#lg-e')) $('#lg-e').textContent = x.message; } if (b) b.disabled = false; };
    $('#lg-b').onclick = go; $('#lg-p').onkeydown = ev => { if (ev.key === 'Enter') go(); };
    if (!DEMO && opts.permitirMaster) {
      INV.DB.get('meta/hayMaster').then(v => { if (!v) $('#lg-m').style.display = 'block'; }).catch(() => { $('#lg-m').style.display = 'block'; });
      $('#lg-m').onclick = async ev => {
        ev.preventDefault();
        const r = await INV.modal('Crear usuario master', '<p class="muted">Solo funciona la primera vez (cuando aún no existe ningún master).</p><label>Nombre<input id="bm-n" value="Lic. Ricardo Barba Gómez"></label><label>Usuario<input id="bm-u" value="ricardo" autocapitalize="none"></label><label>Contraseña (mín. 6)<input id="bm-p" type="password"></label>', [{ t: 'Cancelar', v: 0 }, { t: 'Crear master', v: 1, c: 'pri', antes: async ov => { try { await INV.AUTH.crearMaster({ nombre: $('#bm-n', ov).value.trim(), usuario: $('#bm-u', ov).value.trim(), pass: $('#bm-p', ov).value }); INV.toast('Master creado ✔', 'ok'); } catch (x) { INV.toast(x.message, 'err'); return false; } } }]);
        return r;
      };
    }
  };

  /* Etiqueta de artículo */
  /* Motivos de calidad para silos (editable desde Configuración → config/calidadSilo) */
  INV.CALIDAD_SILO = ['OK', 'CONTAMINADO', 'CUARENTENA', 'PEGADO', 'HUMEDAD ALTA', 'PLAGA / INFESTACIÓN', 'MEZCLA DE PRODUCTO', 'FUERA DE ESPECIFICACIÓN', 'RANCIDEZ / OLOR', 'PENDIENTE DE ANÁLISIS', 'OTRO'];
  INV.calidades = cfg => { const l = cfg && Array.isArray(cfg.calidadSilo) && cfg.calidadSilo.filter(Boolean); return (l && l.length) ? l : INV.CALIDAD_SILO; };
  /* Qué artículos aparecen en cada app (se decide en Catálogo) */
  INV.esContable = it => it && it.activo !== false && it.contar !== false;
  INV.esSolicitable = it => it && it.activo !== false && (it.solicitar != null ? !!it.solicitar : ['EMPAQUE', 'OTROS INSUMOS', 'CRIBAS'].includes(it.familia));
  /* Entregas a producción: almacén entrega → producción confirma → jefe acepta */
  INV.estadoEntrega = e => { const s = e && e.estado; return s === 'por_validar' ? 'por_recibir' : s; };
  INV.ENTREGA_TXT = { por_recibir: 'Por confirmar producción', recibida: 'Recibida · por aceptar', validada: 'Aceptada', rechazada: 'Rechazada', cancelada: 'Cancelada' };
  INV.ENTREGA_CLS = { por_recibir: 'b-amb', recibida: 'b-blu', validada: 'b-grn', rechazada: 'b-red', cancelada: 'b-gry' };
  /* Silos ligados a un artículo y kg calculados a partir del vacío láser */
  INV.silosDe = (silos, itemId) => vals(silos).filter(s => s.itemId === itemId).sort((a, b) => (a.orden || 0) - (b.orden || 0));
  INV.kgSilo = (s, vacio) => { const c = INV.calcSilo(s, { vacio }); return c.contenido == null ? null : Math.round(c.contenido * 1000); };
  INV.ESTATUS_COMPRA = { cotizando: 'Cotizando', oc: 'OC colocada', transito: 'En tránsito', detenido: 'Detenido' };

  INV.itemLabel = it => it ? ((it.codigo ? '[' + it.codigo + '] ' : '') + it.nombre) : '—';
  INV.critClass = c => c === 'CRÍTICO' ? 'b-red' : c === 'RIESGO' ? 'b-amb' : 'b-grn';
  INV.statusClass = s => s === 'COLOCAR OC' ? 'b-red' : s === 'CUBIERTO CON OC' ? 'b-blu' : 'b-grn';

})(window);
