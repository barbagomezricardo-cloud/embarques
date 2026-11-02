/* =====================================================================
   NÚCLEO COMPARTIDO — Recursos Humanos 19 Hermanos (Pet Food)
   Datos (Firebase Realtime Database o modo demo), usuarios, licencia,
   cálculos de RH (LFT, turnos, retardos, horas extra, vacaciones,
   rotación, anomalías) y utilerías de pantalla.
   Lo usan: index.html (programa principal), checador.html (kiosco)
   y empleado.html (portal móvil del empleado).
   ===================================================================== */
(function (W) {
  'use strict';
  const CFG = W.RH_CONFIG || {};
  const FB_VER = '10.12.0';
  const DEMO = !CFG.FIREBASE || /[?&]demo=1/.test(W.location ? W.location.search : '');
  const ROOT = 'rh';

  /* ------------------------------------------------------------------ */
  /* Utilerías                                                           */
  /* ------------------------------------------------------------------ */
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => { const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) ? n : 0; };
  const nf0 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 });
  const nfm = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
  const fmt = (v, d) => { v = num(v); return d === 0 ? nf0.format(v) : nf1.format(v); };
  const money = v => nfm.format(num(v));
  const pad = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const hoyISO = () => iso(new Date(RH.now()));
  const parseISO = s => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
  const addDias = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
  const difDias = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 864e5);
  const addAnios = (s, n) => { const d = parseISO(s); const m = d.getMonth(); d.setFullYear(d.getFullYear() + n); if (d.getMonth() !== m) d.setDate(0); return iso(d); };
  const mesKey = s => String(s).slice(0, 7);
  const addMes = (k, n) => { const [y, m] = k.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };
  const finMes = k => { const [y, m] = k.split('-').map(Number); return iso(new Date(y, m, 0)); };
  const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const DIAS_L = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const mesLabel = k => { const [y, m] = String(k).split('-'); return MESES[(+m) - 1] + ' ' + String(y).slice(2); };
  const fDia = s => { if (!s) return '—'; const [y, m, d] = s.split('-'); return (+d) + ' ' + MESES[(+m) - 1] + ' ' + y; };
  const fDiaL = s => { if (!s) return '—'; const d = parseISO(s); return DIAS_L[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES_L[d.getMonth()]; };
  const fFecha = ts => { if (!ts) return '—'; const d = new Date(ts); return pad(d.getDate()) + '/' + MESES[d.getMonth()] + '/' + String(d.getFullYear()).slice(2) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const hm = ts => { const d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const toMin = t => { if (!t) return null; const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
  const minTxt = m => { m = Math.round(num(m)); const s = m < 0 ? '-' : ''; m = Math.abs(m); const h = Math.floor(m / 60), r = m % 60; return s + (h ? h + 'h' + (r ? ' ' + pad(r) : '') : r + 'm'); };
  const hTxt = m => fmt(num(m) / 60) + ' h';
  const keySafe = s => String(s || '').trim().toUpperCase().replace(/[.#$\[\]\/\s]+/g, '_').replace(/^_+|_+$/g, '');
  const vals = o => (o && typeof o === 'object') ? Object.keys(o).map(k => Object.assign({ _k: k }, o[k])) : [];
  let _lastId = 0;
  const newId = () => { let t = Date.now(); if (t <= _lastId) t = _lastId + 1; _lastId = t; return t.toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase(); };
  const clone = v => v == null ? v : JSON.parse(JSON.stringify(v));
  const debounce = (fn, ms) => { let t; return function () { const a = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); }; };
  const loadScript = src => new Promise((ok, ko) => { if ($('script[src="' + src + '"]')) return ok(); const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => ko(new Error('No se pudo cargar ' + src)); document.head.appendChild(s); });
  const normNom = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const rnd = n => { const a = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; let s = ''; const r = (W.crypto && crypto.getRandomValues) ? crypto.getRandomValues(new Uint8Array(n)) : Array.from({ length: n }, () => Math.random() * 256); for (let i = 0; i < n; i++) s += a[r[i] % a.length]; return s; };
  const nipNuevo = () => String(100000 + Math.floor(((W.crypto && crypto.getRandomValues) ? crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296 : Math.random()) * 900000));
  async function sha256(t) {
    if (W.crypto && crypto.subtle) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join(''); }
    let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return 'x' + (h >>> 0).toString(16);
  }
  const nipHash = (empId, nip) => sha256('rh19:' + empId + ':' + String(nip).trim());

  /* ------------------------------------------------------------------ */
  /* Roles                                                               */
  /* ------------------------------------------------------------------ */
  const ROLES = {
    master: { nombre: 'Master', desc: 'Todo el sistema, usuarios, configuración e IA' },
    rh: { nombre: 'Recursos Humanos', desc: 'Operación completa: plantilla, incidencias, prenómina' },
    director: { nombre: 'Dirección', desc: 'Tableros y autorización final (si el flujo la pide)' },
    jefe: { nombre: 'Jefe de área', desc: 'Su equipo: asistencias, autorizaciones y tiempo extra' },
    kiosco: { nombre: 'Checador (tablet)', desc: 'Solo registra entradas y salidas en el kiosco' },
    empleado: { nombre: 'Empleado', desc: 'Portal móvil: checar, vacaciones y permisos' }
  };

  /* ------------------------------------------------------------------ */
  /* Base de datos: interfaz única (igual que tus otras apps)            */
  /* ------------------------------------------------------------------ */
  function makeLocalDB() {
    const KEY = 'rh19h_demo_v1';
    let tree;
    try { tree = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { tree = {}; }
    const subs = new Set();
    let bc = null; try { bc = new BroadcastChannel('rh19h_demo'); } catch (e) { }
    const parts = p => String(p || '').split('/').filter(Boolean);
    function getAt(p) { let n = tree; for (const k of parts(p)) { if (n == null || typeof n !== 'object') return null; n = n[k]; } return n === undefined ? null : clone(n); }
    function setAt(p, v) {
      const ks = parts(p); if (!ks.length) { tree = v || {}; return; }
      let n = tree; for (let i = 0; i < ks.length - 1; i++) { if (n[ks[i]] == null || typeof n[ks[i]] !== 'object') n[ks[i]] = {}; n = n[ks[i]]; }
      const last = ks[ks.length - 1];
      if (v === null || v === undefined) delete n[last]; else n[last] = clone(v);
    }
    let pt = null;
    function persist() { clearTimeout(pt); pt = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(tree)); } catch (e) { console.warn('demo storage', e); } }, 150); }
    function notify(paths, remote) {
      subs.forEach(s => { if (paths.some(p => p === '' || s.path === '' || p.startsWith(s.path + '/') || s.path.startsWith(p + '/') || p === s.path)) { try { s.cb(getAt(s.path)); } catch (e) { console.error(e); } } });
      if (!remote && bc) try { setTimeout(() => bc.postMessage({ paths }), 200); } catch (e) { }
    }
    if (bc) bc.onmessage = ev => { try { tree = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { } notify(ev.data.paths || [''], true); };
    const norm = p => parts(p).join('/');
    return {
      on(path, cb) { const s = { path: norm(path), cb }; subs.add(s); setTimeout(() => cb(getAt(s.path)), 0); return () => subs.delete(s); },
      onDesde(path, desdeKey, cb) { return this.on(path, v => { if (!v) return cb(null); const o = {}; Object.keys(v).filter(k => k >= desdeKey).forEach(k => o[k] = v[k]); cb(o); }); },
      async get(path) { return getAt(norm(path)); },
      async set(path, v) { setAt(norm(path), v); persist(); notify([norm(path)]); },
      async update(obj) { const ps = []; Object.keys(obj).forEach(p => { setAt(norm(p), obj[p]); ps.push(norm(p)); }); persist(); notify(ps); },
      async push(path, v) { const k = newId(); await this.set(norm(path) + '/' + k, v); return k; },
      async remove(path) { await this.set(path, null); },
      key() { return newId(); },
      onConexion(cb) { cb(true); return () => { }; },
      _reset() { tree = {}; try { localStorage.removeItem(KEY); } catch (e) { } notify(['']); }
    };
  }

  function makeFirebaseDB(app) {
    const db = app.database();
    const R = p => db.ref(ROOT + (p ? '/' + String(p).replace(/^\/+/, '') : ''));
    db.ref('.info/serverTimeOffset').on('value', s => { RH._offset = s.val() || 0; });
    return {
      on(path, cb) { const r = R(path); const h = s => cb(s.val()); r.on('value', h, e => console.warn('permiso/lectura', path, e && e.code)); return () => r.off('value', h); },
      onDesde(path, desdeKey, cb) { const q = R(path).orderByKey().startAt(desdeKey); const h = s => cb(s.val()); q.on('value', h, e => console.warn('lectura', path, e && e.code)); return () => q.off('value', h); },
      async get(path) { const s = await R(path).get(); return s.val(); },
      set(path, v) { return R(path).set(v === undefined ? null : v); },
      update(obj) { const o = {}; Object.keys(obj).forEach(k => o[String(k).replace(/^\/+/, '')] = obj[k] === undefined ? null : obj[k]); return R('').update(o); },
      async push(path, v) { const r = R(path).push(); await r.set(v); return r.key; },
      remove(path) { return R(path).remove(); },
      key() { return R('x').push().key; },
      onConexion(cb) { const r = db.ref('.info/connected'); const h = s => cb(!!s.val()); r.on('value', h); return () => r.off('value', h); }
    };
  }

  /* ------------------------------------------------------------------ */
  /* Usuarios (Firebase Authentication con usuario + contraseña)         */
  /*   Personal administrativo: usuario + contraseña                     */
  /*   Empleados: número de empleado + NIP de 6 dígitos (usuario e<num>) */
  /* ------------------------------------------------------------------ */
  const userEmail = u => String(u || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '') + '@rh19h.app';
  const userEmpleado = n => 'e' + String(n).trim().replace(/[^0-9a-z]/gi, '').toLowerCase();

  function makeLocalAuth(DB) {
    const SK = 'rh19h_demo_sesion_' + (W.location ? W.location.pathname.split('/').pop() : '');
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
        if (us[uid].activo === false) throw new Error('Tu usuario está desactivado. Consulta a Recursos Humanos.');
        try { sessionStorage.setItem(SK, JSON.stringify({ uid })); } catch (e) { }
        await load();
        if (!cur) cur = Object.assign({ uid }, us[uid]), cbs.forEach(cb => cb(cur));
      },
      async logout() { try { sessionStorage.removeItem(SK); } catch (e) { } cur = null; cbs.forEach(cb => cb(null)); },
      async crearUsuario(d) {
        const us = await DB.get('usuarios') || {};
        const ex = Object.keys(us).find(k => (us[k].usuario || '').toLowerCase() === d.usuario.toLowerCase());
        if (ex && !d.reemplazar) throw new Error('Ese usuario ya existe');
        const uid = ex || ('U' + newId());
        const perfil = { usuario: d.usuario.toLowerCase(), nombre: d.nombre, rol: d.rol, activo: true, creado: Date.now(), _demoPass: d.pass };
        if (d.empId) perfil.empId = d.empId; if (d.deptos) perfil.deptos = d.deptos;
        await DB.set('usuarios/' + uid, perfil);
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
          const perfil = { usuario: d.usuario.toLowerCase(), nombre: d.nombre, rol: d.rol, activo: true, creado: Date.now() };
          if (d.empId) perfil.empId = d.empId; if (d.deptos) perfil.deptos = d.deptos;
          await DB.set('usuarios/' + cred.user.uid, perfil);
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
  function licViva(l) { if (!l || l.activa !== true) return false; if (l.hasta && Date.now() >= Number(l.hasta)) return false; return true; }
  async function checkLicencia(appKey) {
    const L = CFG.LICENCIA || {}; if (DEMO || !RH.app) return { ok: true };
    try {
      const snap = await Promise.race([RH.app.database().ref('licencia').get(), new Promise((_, ko) => setTimeout(() => ko(new Error('timeout')), 9000))]);
      const l = snap.val();
      if (!l) return { ok: false, msg: 'La licencia aún no está encendida. Enciéndela desde tu Panel de Licencia.' };
      if (!licViva(l)) return { ok: false, msg: (l.activa === true ? 'La licencia venció el ' + fFecha(Number(l.hasta)) + '.' : 'Este sistema está desactivado temporalmente.') };
      const id = L.apps && L.apps[appKey];
      const a = id && l.apps && l.apps[id];
      if (a != null) { if (typeof a === 'object' ? !licViva(a) : a !== true) return { ok: false, msg: 'Esta aplicación está desactivada desde el panel de licencia.' }; }
      return { ok: true, lic: l };
    } catch (e) { return { ok: true, aviso: 'Sin verificación de licencia: ' + e.message }; }
  }
  function pantallaBloqueo(msg) {
    document.body.innerHTML = '<div style="max-width:460px;margin:70px auto;text-align:center;font-family:system-ui,Segoe UI,sans-serif;color:#281E12;padding:20px"><img src="img/logo-19h.png" alt="" style="width:110px"><h2 style="color:#DE0A14;margin:12px 0">Servicio no disponible</h2><p style="color:#5A4E42">' + esc(msg) + '</p></div>';
    document.body.style.background = '#FBF7F2';
  }

  /* ------------------------------------------------------------------ */
  /* Catálogos y valores por defecto                                     */
  /* ------------------------------------------------------------------ */
  /* Turnos: horario por día de la semana (0=domingo … 6=sábado); null = descanso */
  const TURNOS_DEF = {
    ADM: { nombre: 'Administrativo', dias: { 1: ['08:00', '17:00'], 2: ['08:00', '17:00'], 3: ['08:00', '17:00'], 4: ['08:00', '17:00'], 5: ['08:00', '17:00'], 6: ['08:00', '14:00'] }, comida: 60 },
    T1: { nombre: 'Planta 1er turno', dias: { 1: ['07:00', '15:00'], 2: ['07:00', '15:00'], 3: ['07:00', '15:00'], 4: ['07:00', '15:00'], 5: ['07:00', '15:00'], 6: ['07:00', '13:00'] }, comida: 30 },
    T2: { nombre: 'Planta 2º turno', dias: { 1: ['15:00', '23:00'], 2: ['15:00', '23:00'], 3: ['15:00', '23:00'], 4: ['15:00', '23:00'], 5: ['15:00', '23:00'], 6: ['13:00', '19:00'] }, comida: 30 },
    T3: { nombre: 'Planta 3er turno (nocturno)', dias: { 1: ['23:00', '07:00'], 2: ['23:00', '07:00'], 3: ['23:00', '07:00'], 4: ['23:00', '07:00'], 5: ['23:00', '07:00'] }, comida: 30 },
    MIC: { nombre: 'Micros (madrugada)', dias: { 1: ['05:00', '14:00'], 2: ['05:00', '14:00'], 3: ['05:00', '14:00'], 4: ['05:00', '14:00'], 5: ['05:00', '14:00'], 6: ['05:00', '10:00'] }, comida: 30 },
    VIG: { nombre: 'Vigilancia 12 h', dias: { 0: ['07:00', '19:00'], 1: ['07:00', '19:00'], 3: ['07:00', '19:00'], 5: ['07:00', '19:00'] }, comida: 0 },
    RUTA: { nombre: 'Ruta / choferes (sin horario fijo)', dias: { 1: ['07:00', '16:00'], 2: ['07:00', '16:00'], 3: ['07:00', '16:00'], 4: ['07:00', '16:00'], 5: ['07:00', '16:00'], 6: ['07:00', '13:00'] }, comida: 60, libre: true }
  };
  /* Departamentos tal como vienen en tu control de vacaciones 2026 */
  const DEPTOS_DEF = ['ADMINISTRACION', 'CALIDAD', 'BASCULA', 'LIMPIEZA', 'COCINA', 'JARDINERIA', 'VENTAS', 'VIGILANCIA', 'SEGURIDAD INDUSTRIAL Y PATRIMONIAL', 'CHOFERES', 'ADMINISTRACION DE PRODUCCION', 'CONTROLES', 'AUXILIAR DE CONTROLES', 'EXTRUSION', 'AUXILIAR DE EXTRUSION', 'ACEITES', 'CALDERAS', 'ENVASADO', 'AUXILIAR DE ENVASADO', 'PERSONAL GENERAL', 'MUESTRAS Y ETIQUETAS', 'ENCARGADO DE CARGADORES', 'CARGADORES', 'MICROS', 'ALMACEN'];
  /* Tipos de incidencia (permiso / ausencia justificada). justifica: no cuenta como falta; goce: se paga; bono: conserva el bono */
  const TIPOS_DEF = {
    VAC: { nombre: 'Vacaciones', unidad: 'dias', goce: true, bono: true, grupo: 'VAC', color: 'blu' },
    PCG: { nombre: 'Permiso con goce de sueldo', unidad: 'dias', goce: true, bono: true, grupo: 'PERM', color: 'grn' },
    PSG: { nombre: 'Permiso sin goce de sueldo', unidad: 'dias', goce: false, bono: false, grupo: 'PERM', color: 'amb' },
    PHR: { nombre: 'Permiso por horas', unidad: 'horas', goce: true, bono: true, grupo: 'PERM', color: 'grn' },
    CMD: { nombre: 'Cita médica', unidad: 'horas', goce: true, bono: true, grupo: 'PERM', color: 'grn', evid: true },
    INC: { nombre: 'Incapacidad IMSS', unidad: 'dias', goce: false, bono: true, grupo: 'INC', color: 'blu', evid: true, folio: true },
    LPA: { nombre: 'Licencia de paternidad', unidad: 'dias', goce: true, bono: true, grupo: 'PERM', color: 'grn', evid: true },
    LUT: { nombre: 'Licencia por luto', unidad: 'dias', goce: true, bono: true, grupo: 'PERM', color: 'grn' },
    FJ: { nombre: 'Falta justificada', unidad: 'dias', goce: false, bono: false, grupo: 'PERM', color: 'amb' },
    COM: { nombre: 'Comisión / capacitación externa', unidad: 'dias', goce: true, bono: true, grupo: 'PERM', color: 'grn' },
    SUS: { nombre: 'Suspensión disciplinaria', unidad: 'dias', goce: false, bono: false, grupo: 'INC', color: 'red' },
    FI: { nombre: 'Falta injustificada (confirmada)', unidad: 'dias', goce: false, bono: false, grupo: 'INC', color: 'red', noJustifica: true }
  };
  const BAJA_TIPOS = ['Renuncia voluntaria', 'Abandono de empleo', 'Rescisión (causa justificada)', 'Despido', 'Término de contrato', 'No aprobó periodo de prueba', 'Jubilación / pensión', 'Fallecimiento'];
  const BAJA_VOLUNTARIA = ['Renuncia voluntaria', 'Abandono de empleo'];
  const BAJA_MOTIVOS = ['Mejor salario / otro empleo', 'Horario / turno', 'Distancia / transporte', 'Ambiente laboral / jefe', 'Carga de trabajo', 'Motivos personales o familiares', 'Salud', 'Estudios', 'Faltas / impuntualidad', 'Desempeño', 'Indisciplina', 'Fin de proyecto o temporada', 'Otro'];
  const PARAM_DEF = {
    toleranciaMin: 10,           // minutos de gracia en la entrada
    semanaInicio: 4,             // nómina semanal de jueves a miércoles (0=dom … 6=sáb)
    heBloque: 30,                // las horas extra se pagan por bloques de 30 min
    heMinimo: 30,                // menos de esto no cuenta como tiempo extra
    heRequiereAut: true,         // solo se paga el tiempo extra autorizado
    retardosPorFalta: 0,         // 0 = no aplica; p. ej. 3 retardos = 1 falta (si tu reglamento lo dice)
    bonoActivo: true, bonoRetardosMax: 1, bonoRetardoMaxMin: 15, // pierde bono con faltas, con más de N retardos o un retardo mayor a X min
    vacAnticipacion: 7,          // días de anticipación sugeridos para pedir vacaciones
    vacTopeAusentesPct: 25,      // aviso si se ausenta más de este % de un departamento a la vez
    vacPermitirAdelantadas: true,
    antiDuplicadoMin: 3,         // ignora la misma persona checando dos veces en menos de N min
    fotoKiosco: true,
    geocerca: { lat: 20.6597, lng: -103.3496, radio: 250 }, // ⚠️ cambia a las coordenadas de la planta (Configuración)
    fechaCorte: '',              // fecha del saldo inicial de vacaciones (de tu Excel)
    inicioOperacion: ''          // antes de esta fecha no se calculan faltas ni retardos
  };
  const FLUJOS_DEF = { VAC: ['jefe', 'rh'], PERM: ['jefe', 'rh'], INC: ['rh'], HE: ['jefe', 'rh'] };

  /* Días de descanso obligatorio — LFT art. 74 */
  function feriadosLFT(y) {
    const nLunes = (m, n) => { const d = new Date(y, m, 1); while (d.getDay() !== 1) d.setDate(d.getDate() + 1); d.setDate(d.getDate() + 7 * (n - 1)); return iso(d); };
    const o = {};
    o[y + '-01-01'] = 'Año Nuevo';
    o[nLunes(1, 1)] = 'Día de la Constitución';
    o[nLunes(2, 3)] = 'Natalicio de Benito Juárez';
    o[y + '-05-01'] = 'Día del Trabajo';
    o[y + '-09-16'] = 'Independencia';
    o[nLunes(10, 3)] = 'Revolución Mexicana';
    if ((y - 2024) % 6 === 0) o[y + '-10-01'] = 'Transmisión del Poder Ejecutivo';
    o[y + '-12-25'] = 'Navidad';
    return o;
  }
  /* Vacaciones — LFT art. 76 (reforma "vacaciones dignas" 2023) */
  function diasLFT(anios) {
    if (anios < 1) return 0;
    if (anios <= 5) return 10 + 2 * anios;          // 12,14,16,18,20
    return 22 + 2 * Math.floor((anios - 6) / 5);     // 6-10:22, 11-15:24, 16-20:26, 21-25:28, 26-30:30 …
  }
  const antig = (ingreso, f) => ingreso ? Math.max(0, difDias(ingreso, f || hoyISO()) / 365.25) : 0;

  /* ------------------------------------------------------------------ */
  /* Motor de cálculo                                                    */
  /* ------------------------------------------------------------------ */
  const RH = W.RH = {
    CFG, DEMO, ROLES, TURNOS_DEF, DEPTOS_DEF, TIPOS_DEF, BAJA_TIPOS, BAJA_MOTIVOS, BAJA_VOLUNTARIA, PARAM_DEF, FLUJOS_DEF,
    DB: null, AUTH: null, app: null, _offset: 0,
    $, $$, esc, num, fmt, money, pad, iso, hoyISO, parseISO, addDias, difDias, addAnios, mesKey, addMes, finMes, MESES, MESES_L, DIAS, DIAS_L, mesLabel, fDia, fDiaL, fFecha, hm, toMin, minTxt, hTxt,
    keySafe, vals, newId, clone, debounce, loadScript, normNom, rnd, nipNuevo, sha256, nipHash, userEmail, userEmpleado,
    feriadosLFT, diasLFT, antig, licViva, checkLicencia
  };
  RH.now = () => Date.now() + (RH._offset || 0);

  /* Configuración efectiva (lo guardado + valores por defecto) */
  RH.conf = function (c) {
    c = c || {};
    return {
      turnos: Object.assign({}, TURNOS_DEF, c.turnos || {}),
      deptos: (c.deptos && c.deptos.length) ? c.deptos : DEPTOS_DEF,
      plazas: c.plazas || {},
      tipos: Object.assign({}, TIPOS_DEF, c.tipos || {}),
      p: Object.assign({}, PARAM_DEF, c.param || {}, { geocerca: Object.assign({}, PARAM_DEF.geocerca, (c.param && c.param.geocerca) || {}) }),
      flujos: Object.assign({}, FLUJOS_DEF, c.flujos || {}),
      feriadosExtra: c.feriadosExtra || {},
      feriadosQuitar: c.feriadosQuitar || {},
      empresa: c.empresa || CFG.EMPRESA || ''
    };
  };
  RH.esFeriado = function (s, C) {
    const y = +s.slice(0, 4); const f = feriadosLFT(y);
    if (C && C.feriadosQuitar && C.feriadosQuitar[s]) return null;
    return (C && C.feriadosExtra && C.feriadosExtra[s]) || f[s] || null;
  };
  RH.horario = function (emp, s, C) {
    const t = C.turnos[emp.turno] || C.turnos.ADM;
    const dw = parseISO(s).getDay();
    const h = t.dias && t.dias[dw];
    if (!h || !h[0]) return null;
    const e = toMin(h[0]); let sa = toMin(h[1]);
    const noct = sa <= e; if (noct) sa += 1440;
    return { e, s: sa, ent: h[0], sal: h[1], noct, comida: num(t.comida), libre: !!t.libre };
  };
  /* Fecha laboral de una checada: en turno nocturno, lo checado de madrugada pertenece a la jornada del día anterior */
  RH.fechaLaboral = function (emp, ts, C) {
    const d = new Date(ts); const s = iso(d); const m = d.getHours() * 60 + d.getMinutes();
    const ayer = addDias(s, -1); const hA = RH.horario(emp, ayer, C);
    if (hA && hA.noct && m <= (hA.s - 1440) + 240) return ayer;
    return s;
  };
  /* Semana de nómina que contiene la fecha */
  RH.semana = function (s, C) {
    const ini = (C && C.p.semanaInicio != null) ? C.p.semanaInicio : 4;
    const d = parseISO(s); const back = (d.getDay() - ini + 7) % 7;
    const a = addDias(s, -back); const b = addDias(a, 6);
    return { ini: a, fin: b, key: a, dias: Array.from({ length: 7 }, (_, i) => addDias(a, i)), label: fDia(a) + ' – ' + fDia(b) };
  };

  /* Índices que usan los cálculos: solicitudes aprobadas por empleado y fecha, tiempo extra autorizado por fecha */
  RH.indices = function (D) {
    const solIdx = {}, heIdx = {}, pendIdx = {};
    Object.keys(D.solicitudes || {}).forEach(empId => {
      Object.keys(D.solicitudes[empId] || {}).forEach(id => {
        const s = D.solicitudes[empId][id]; if (!s || !s.desde) return;
        const tgt = s.estado === 'aprobada' ? solIdx : (s.estado === 'pendiente' ? pendIdx : null); if (!tgt) return;
        const hasta = s.hasta || s.desde; let f = s.desde, n = 0;
        while (f <= hasta && n < 400) { (tgt[empId] = tgt[empId] || {})[f] = Object.assign({ _id: id }, s); f = addDias(f, 1); n++; }
      });
    });
    Object.keys(D.he || {}).forEach(empId => {
      Object.keys(D.he[empId] || {}).forEach(id => {
        const h = D.he[empId][id]; if (!h || h.estado !== 'aprobada') return;
        const o = (heIdx[empId] = heIdx[empId] || {}); o[h.fecha] = (o[h.fecha] || 0) + num(h.min);
      });
    });
    return { solIdx, heIdx, pendIdx };
  };

  /* Un día de un empleado */
  RH.calcDia = function (emp, s, D, X) {
    const C = D.C, P = C.p, hoy = D.hoy || hoyISO();
    const r = { fecha: s, estado: 'ok', chs: [], retardo: 0, heMin: 0, hePag: 0, heAut: 0, trabMin: 0, salAnt: 0, flags: [] };
    if (emp.ingreso && s < emp.ingreso) { r.estado = 'na'; return r; }
    if (P.inicioOperacion && s < P.inicioOperacion) { r.estado = 'na'; return r; }
    if (emp.estatus === 'baja' && emp.baja && emp.baja.fecha && s > emp.baja.fecha) { r.estado = 'na'; return r; }
    const h = RH.horario(emp, s, C); r.h = h;
    r.fer = RH.esFeriado(s, C);
    const raw = (D.checadas && D.checadas[s] && D.checadas[s][emp._k]) || {};
    r.chs = Object.keys(raw).map(k => Object.assign({ _k: k }, raw[k])).filter(c => !c.anulada).sort((a, b) => a.ts - b.ts);
    const sol = X.solIdx[emp._k] && X.solIdx[emp._k][s]; r.sol = sol || null;
    const pend = X.pendIdx[emp._k] && X.pendIdx[emp._k][s]; r.pend = pend || null;
    const tipo = sol && C.tipos[sol.tipo];
    const mins = r.chs.map(c => { const d = new Date(c.ts); let m = d.getHours() * 60 + d.getMinutes(); if (iso(d) > s) m += 1440; return m; });
    r.ent = mins.length ? mins[0] : null; r.sal = mins.length > 1 ? mins[mins.length - 1] : null;
    if (r.ent != null && r.sal != null) r.trabMin = Math.max(0, r.sal - r.ent - ((r.sal - r.ent) > 360 && h ? h.comida : 0));
    const redondea = m => m >= P.heMinimo ? Math.floor(m / P.heBloque) * P.heBloque : 0;
    if (sol && tipo && tipo.unidad === 'dias' && !tipo.noJustifica) { r.estado = 'inc'; if (r.chs.length) r.flags.push('checó estando en ' + tipo.nombre.toLowerCase()); return r; }
    if (sol && tipo && tipo.noJustifica) { r.estado = 'falta'; r.confirmada = true; return r; }
    if (!h || r.fer) {
      if (r.chs.length) { r.estado = r.fer && h ? 'festlab' : 'desclab'; r.heMin = r.sal != null ? redondea(r.trabMin) : 0; if (parseISO(s).getDay() === 0) r.domingo = true; }
      else r.estado = r.fer && h ? 'festivo' : 'descanso';
    } else if (!r.chs.length) {
      if (s < hoy) r.estado = 'falta';
      else if (s === hoy) { const ahora = new Date(RH.now()); const m = ahora.getHours() * 60 + ahora.getMinutes(); r.estado = m > h.e + P.toleranciaMin ? 'sinchecar' : 'porllegar'; }
      else r.estado = 'futuro';
    } else {
      const ret = r.ent - h.e;
      if (!h.libre && ret > P.toleranciaMin) { r.retardo = ret; r.estado = 'retardo'; }
      if (r.sal == null) { if (s < hoy) r.flags.push('sin salida'); }
      else {
        if (!h.libre && r.sal < h.s - 5) r.salAnt = h.s - r.sal;
        r.heMin = redondea(Math.max(0, r.sal - h.s));
        if (parseISO(s).getDay() === 0) r.domingo = true;
      }
      if (sol && tipo && tipo.unidad === 'horas') { r.justHoras = true; if (r.estado === 'retardo') r.estado = 'ok'; r.salAnt = 0; }
    }
    const aut = (X.heIdx[emp._k] && X.heIdx[emp._k][s]) || 0; r.heAut = aut;
    r.hePag = P.heRequiereAut ? Math.min(r.heMin, aut) : r.heMin;
    if (r.heMin > 0 && r.heMin > aut && P.heRequiereAut) r.flags.push('tiempo extra sin autorizar');
    return r;
  };

  /* Una semana de nómina de un empleado: días + totales para prenómina */
  RH.calcSemana = function (emp, sem, D, X) {
    const P = D.C.p;
    const dias = sem.dias.map(s => RH.calcDia(emp, s, D, X));
    const t = { trab: 0, faltas: 0, retardos: 0, minRet: 0, heMin: 0, hePag: 0, heSinAut: 0, dobles: 0, triples: 0, domingos: 0, festLab: 0, vac: 0, inc: 0, psg: 0, cg: 0, sinSalida: 0, bono: true, motivosBono: [] };
    dias.forEach(r => {
      if (['ok', 'retardo', 'desclab', 'festlab'].includes(r.estado)) t.trab++;
      if (r.estado === 'falta') t.faltas++;
      if (r.estado === 'retardo') { t.retardos++; t.minRet += r.retardo; }
      if (r.estado === 'festlab') t.festLab++;
      if (r.domingo) t.domingos++;
      if (r.flags.includes('sin salida')) t.sinSalida++;
      t.heMin += r.heMin; t.hePag += r.hePag; t.heSinAut += Math.max(0, r.heMin - r.heAut);
      if (r.estado === 'inc' && r.sol) {
        const tp = D.C.tipos[r.sol.tipo] || {};
        if (r.sol.tipo === 'VAC') t.vac++; else if (r.sol.tipo === 'INC') t.inc++; else if (!tp.goce) t.psg++; else t.cg++;
        if (!tp.bono) { t.bono = false; t.motivosBono.push(tp.nombre + ' ' + fDia(r.fecha)); }
      }
    });
    if (P.retardosPorFalta > 0) t.faltasPorRetardo = Math.floor(t.retardos / P.retardosPorFalta);
    t.dobles = Math.min(t.hePag, 540); t.triples = Math.max(0, t.hePag - 540); // LFT art. 67-68: 9 h dobles a la semana, el excedente triple
    if (P.bonoActivo) {
      if (t.faltas) { t.bono = false; t.motivosBono.push(t.faltas + ' falta(s)'); }
      if (t.retardos > P.bonoRetardosMax) { t.bono = false; t.motivosBono.push(t.retardos + ' retardos'); }
      if (dias.some(r => r.retardo > P.bonoRetardoMaxMin)) { t.bono = false; t.motivosBono.push('retardo > ' + P.bonoRetardoMaxMin + ' min'); }
    } else t.bono = null;
    return { emp, dias, t };
  };

  /* Días que descuenta una solicitud de vacaciones: solo días laborables del turno, sin feriados */
  RH.diasHabiles = function (emp, desde, hasta, C) {
    let n = 0, f = desde, g = 0; const lista = [];
    while (f <= hasta && g < 400) { if (RH.horario(emp, f, C) && !RH.esFeriado(f, C)) { n++; lista.push(f); } f = addDias(f, 1); g++; }
    return { n, lista };
  };
  RH.regreso = function (emp, hasta, C) { let f = addDias(hasta, 1), g = 0; while (g < 30 && (!RH.horario(emp, f, C) || RH.esFeriado(f, C))) { f = addDias(f, 1); g++; } return f; };

  /* Saldo de vacaciones por "libro": saldo inicial (de tu Excel) + aniversarios − disfrutadas ± ajustes */
  RH.vacSaldo = function (emp, D, hasta) {
    const C = D.C; hasta = hasta || D.hoy || hoyISO();
    const corte = emp.corte || C.p.fechaCorte || '';
    const ini = num(emp.saldoIni);
    const lotes = [];
    if (corte) lotes.push({ fecha: corte, dias: ini, concepto: 'Saldo inicial al ' + fDia(corte), n: null });
    const abonos = [];
    for (let n = 1; n <= 60; n++) {
      const f = addAnios(emp.ingreso, n); if (f > hasta) break;
      if (corte && f <= corte) continue;
      const d = diasLFT(n); abonos.push({ n, fecha: f, dias: d }); lotes.push({ fecha: f, dias: d, concepto: n + 'º aniversario', n });
    }
    const sols = vals((D.solicitudes || {})[emp._k]).filter(s => s.tipo === 'VAC');
    const cuenta = s => !corte || s.desde > corte;
    const aprob = sols.filter(s => s.estado === 'aprobada' && cuenta(s));
    const disfrutadas = aprob.filter(s => s.desde <= hasta).reduce((a, s) => a + num(s.dias), 0);
    const programadas = aprob.filter(s => s.desde > hasta).reduce((a, s) => a + num(s.dias), 0);
    const pendientes = sols.filter(s => s.estado === 'pendiente').reduce((a, s) => a + num(s.dias), 0);
    const ajs = vals((D.ajustesVac || {})[emp._k]);
    const ajustes = ajs.reduce((a, x) => a + num(x.dias), 0);
    const ganados = abonos.reduce((a, x) => a + x.dias, 0);
    const saldo = (corte ? ini : 0) + ganados - disfrutadas - programadas + ajustes;
    // Vencimiento (FIFO): LFT art. 81 — se deben otorgar dentro de los 6 meses siguientes al aniversario
    let consumo = disfrutadas + programadas + Math.max(0, -ajustes);
    const vivos = lotes.map(l => { const usa = Math.min(Math.max(0, l.dias), consumo); consumo -= usa; return Object.assign({}, l, { resta: Math.max(0, l.dias) - usa, limite: addDias(l.fecha, 182) }); }).filter(l => l.resta > 0);
    const fueraPlazo = vivos.filter(l => l.limite < hasta && l.n).reduce((a, l) => a + l.resta, 0);
    const porVencer = vivos.filter(l => l.limite >= hasta && difDias(hasta, l.limite) <= 45 && l.n).reduce((a, l) => a + l.resta, 0);
    let nAn = 1; while (addAnios(emp.ingreso, nAn) <= hasta) nAn++;
    const proximo = emp.ingreso ? { n: nAn, fecha: addAnios(emp.ingreso, nAn), dias: diasLFT(nAn) } : null;
    const anios = antig(emp.ingreso, hasta);
    return { corte, ini, abonos, ganados, disfrutadas, programadas, pendientes, ajustes, ajs, saldo, disponible: saldo - pendientes, proximo, anios, actuales: diasLFT(Math.floor(anios)), fueraPlazo, porVencer, sols, lotes: vivos };
  };

  /* Plantilla a una fecha y rotación (bajas / plantilla promedio × 100) */
  RH.activoEn = (e, s) => e.ingreso && e.ingreso <= s && !(e.estatus === 'baja' && e.baja && e.baja.fecha && e.baja.fecha <= s);
  RH.rotacion = function (emps, meses, filtro) {
    const lista = emps.filter(e => !filtro || filtro(e));
    const hoy = hoyISO();
    const serie = meses.map(k => {
      const a = k + '-01', b = finMes(k) < hoy ? finMes(k) : hoy;
      const ini = lista.filter(e => RH.activoEn(e, addDias(a, -1))).length;
      const fin = lista.filter(e => RH.activoEn(e, b)).length;
      const bajas = lista.filter(e => e.estatus === 'baja' && e.baja && e.baja.fecha && e.baja.fecha >= a && e.baja.fecha <= b);
      const altas = lista.filter(e => e.ingreso >= a && e.ingreso <= b).length;
      const prom = (ini + fin) / 2;
      const vol = bajas.filter(e => BAJA_VOLUNTARIA.includes(e.baja.tipo)).length;
      const temp = bajas.filter(e => difDias(e.ingreso, e.baja.fecha) < 90).length;
      return { k, ini, fin, prom, altas, bajas: bajas.length, vol, invol: bajas.length - vol, temp, idx: prom ? bajas.length / prom * 100 : 0, lista: bajas };
    });
    const tb = serie.reduce((a, x) => a + x.bajas, 0), pp = serie.reduce((a, x) => a + x.prom, 0) / (serie.length || 1);
    return { serie, totalBajas: tb, promPlantilla: pp, anual: pp ? tb / pp * 100 * (12 / (serie.length || 12)) : 0, vol: serie.reduce((a, x) => a + x.vol, 0), temp: serie.reduce((a, x) => a + x.temp, 0), altas: serie.reduce((a, x) => a + x.altas, 0) };
  };

  /* Flujo de autorización */
  RH.grupoTipo = (tipo, C) => tipo === 'HE' ? 'HE' : ((C.tipos[tipo] && C.tipos[tipo].grupo) || 'PERM');
  RH.pasosPara = (tipo, C) => (C.flujos[RH.grupoTipo(tipo, C)] || ['rh']).map(rol => ({ rol, estado: 'pend' }));
  RH.esJefeDe = (u, emp) => u && u.rol === 'jefe' && Array.isArray(u.deptos) && emp && u.deptos.includes(emp.depto);
  RH.puedePaso = function (u, paso, emp) {
    if (!u || !paso) return false;
    if (u.rol === 'master') return true;
    if (paso.rol === 'jefe') return RH.esJefeDe(u, emp) || u.rol === 'rh';
    if (paso.rol === 'director') return u.rol === 'director';
    if (paso.rol === 'rh') return u.rol === 'rh';
    return false;
  };
  RH.pasoActual = s => (s.pasos || []).findIndex(p => p.estado === 'pend');
  /* Marca automáticamente los pasos que el propio capturista puede autorizar (RH captura = queda aprobada) */
  RH.autoPasos = function (pasos, u, emp) {
    const out = pasos.map(p => Object.assign({}, p));
    for (const p of out) { if (p.estado === 'pend' && RH.puedePaso(u, p, emp) && u.rol !== 'empleado') { p.estado = 'ok'; p.por = u.nombre; p.ts = RH.now(); p.auto = true; } else break; }
    return out;
  };

  /* Detector de anomalías (reglas locales; la IA del master trabaja sobre esto) */
  RH.anomalias = function (D, X, emps) {
    const C = D.C, hoy = D.hoy || hoyISO(), out = [];
    const desde = addDias(hoy, -30);
    const dias30 = []; for (let f = desde; f < hoy; f = addDias(f, 1)) dias30.push(f);
    emps.filter(e => e.estatus !== 'baja').forEach(e => {
      let faltas = [], sinSal = 0, heSin = 0, ret = 0, lunes = 0; const horas = {};
      dias30.forEach(f => {
        const r = RH.calcDia(e, f, D, X);
        if (r.estado === 'falta') { faltas.push(f); const dw = parseISO(f).getDay(); if (dw === 1 || dw === C.p.semanaInicio) lunes++; }
        if (r.flags.includes('sin salida')) sinSal++;
        if (r.flags.includes('tiempo extra sin autorizar')) heSin += r.heMin - r.heAut;
        if (r.estado === 'retardo') ret++;
        r.chs.forEach(c => { if (c.src === 'manual') return; const k = hm(c.ts); horas[k] = (horas[k] || 0) + 1; });
      });
      if (faltas.length >= 4) out.push({ nivel: 'alta', tipo: 'Faltas', empId: e._k, texto: faltas.length + ' faltas en 30 días (LFT art. 47-X: más de 3 faltas sin permiso en 30 días es causal de rescisión). Revisar y documentar.' });
      else if (faltas.length >= 2) out.push({ nivel: 'media', tipo: 'Faltas', empId: e._k, texto: faltas.length + ' faltas en 30 días' + (lunes >= 2 ? ', ' + lunes + ' en inicio de semana' : '') });
      if (sinSal >= 3) out.push({ nivel: 'media', tipo: 'Checadas incompletas', empId: e._k, texto: sinSal + ' días sin checar salida en 30 días' });
      if (heSin >= 120) out.push({ nivel: 'media', tipo: 'Tiempo extra', empId: e._k, texto: minTxt(heSin) + ' de tiempo extra sin autorización previa' });
      if (ret >= 4) out.push({ nivel: 'baja', tipo: 'Puntualidad', empId: e._k, texto: ret + ' retardos en 30 días' });
      const rep = Object.keys(horas).filter(k => horas[k] >= 5);
      if (rep.length) out.push({ nivel: 'media', tipo: 'Checada repetida', empId: e._k, texto: 'Checó ' + horas[rep[0]] + ' veces exactamente a las ' + rep[0] + ' (posible checada por otra persona o captura a mano)' });
      const v = RH.vacSaldo(e, D);
      if (v.saldo < 0) out.push({ nivel: 'media', tipo: 'Vacaciones', empId: e._k, texto: 'Saldo negativo de ' + fmt(v.saldo) + ' días (vacaciones adelantadas)' });
      if (v.fueraPlazo > 0) out.push({ nivel: 'media', tipo: 'Vacaciones', empId: e._k, texto: fmt(v.fueraPlazo) + ' días con más de 6 meses de su aniversario sin otorgar (LFT art. 81)' });
      else if (v.porVencer > 0) out.push({ nivel: 'baja', tipo: 'Vacaciones', empId: e._k, texto: fmt(v.porVencer) + ' días deben programarse en los próximos 45 días' });
      const r7 = dias30.slice(-7).map(f => RH.calcDia(e, f, D, X));
      if (r7.length === 7 && r7.filter(r => r.estado === 'falta').length >= 3 && !r7.some(r => r.chs.length)) out.push({ nivel: 'alta', tipo: 'Posible abandono', empId: e._k, texto: 'Sin checadas ni incidencias en la última semana' });
    });
    // Ausencia simultánea por departamento (próximos 30 días)
    const porDep = {}; emps.filter(e => e.estatus !== 'baja').forEach(e => { (porDep[e.depto] = porDep[e.depto] || []).push(e); });
    Object.keys(porDep).forEach(dep => {
      const L = porDep[dep]; if (L.length < 3) return;
      for (let i = 0; i < 30; i++) {
        const f = addDias(hoy, i); const aus = L.filter(e => (X.solIdx[e._k] && X.solIdx[e._k][f]) || (X.pendIdx[e._k] && X.pendIdx[e._k][f])).length;
        if (aus / L.length * 100 > C.p.vacTopeAusentesPct) { out.push({ nivel: 'media', tipo: 'Cobertura', depto: dep, texto: dep + ': ' + aus + ' de ' + L.length + ' personas ausentes el ' + fDia(f) }); break; }
      }
    });
    // Correcciones manuales
    const man = {}; Object.keys(D.checadas || {}).filter(f => f >= desde).forEach(f => Object.keys(D.checadas[f] || {}).forEach(id => Object.values(D.checadas[f][id] || {}).forEach(c => { if (c.src === 'manual') man[c.por || '?'] = (man[c.por || '?'] || 0) + 1; })));
    Object.keys(man).filter(k => man[k] >= 15).forEach(k => out.push({ nivel: 'baja', tipo: 'Correcciones manuales', texto: k + ' capturó ' + man[k] + ' checadas a mano en 30 días' }));
    const ord = { alta: 0, media: 1, baja: 2 };
    return out.sort((a, b) => ord[a.nivel] - ord[b.nivel]);
  };

  /* Empata un nombre del reloj checador / Excel con la plantilla */
  RH.buscarEmpleado = function (txt, emps) {
    const t = String(txt || '').trim(); if (!t) return null;
    const porNum = emps.find(e => String(e.num) === t || String(e.num) === t.replace(/^0+/, '')); if (porNum) return porNum;
    const n = normNom(t); const exact = emps.find(e => normNom(e.nombre) === n); if (exact) return exact;
    const tk = n.split(' ').filter(x => x.length > 1);
    if (tk.length < 2) return null;
    const cands = emps.filter(e => { const en = normNom(e.nombre).split(' '); return tk.every(x => en.includes(x)); });
    if (cands.length === 1) return cands[0];
    const cands2 = emps.map(e => { const en = normNom(e.nombre).split(' '); const hit = tk.filter(x => en.includes(x)).length; return { e, s: hit / Math.max(tk.length, en.length) }; }).filter(x => x.s >= 0.6).sort((a, b) => b.s - a.s);
    if (cands2.length && (cands2.length === 1 || cands2[0].s > cands2[1].s)) return cands2[0].e;
    return null;
  };
  RH.distancia = function (a, b) { const R = 6371000, r = x => x * Math.PI / 180; const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng); const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };

  /* Registrar una checada (kiosco, celular, reloj o manual) */
  RH.checar = async function (emp, D, extra) {
    const C = D.C, ts = (extra && extra.ts) || RH.now();
    const f = RH.fechaLaboral(emp, ts, C);
    const prev = Object.values((D.checadas && D.checadas[f] && D.checadas[f][emp._k]) || {}).filter(c => !c.anulada).sort((a, b) => a.ts - b.ts);
    const last = prev[prev.length - 1];
    if (last && Math.abs(ts - last.ts) < C.p.antiDuplicadoMin * 60000 && (!extra || extra.src !== 'reloj')) return { dup: true, tipo: prev.length % 2 ? 'Entrada' : 'Salida', ts: last.ts, fecha: f };
    const tipo = prev.length % 2 === 0 ? 'Entrada' : 'Salida';
    const rec = Object.assign({ ts, src: 'kiosco' }, extra || {}); delete rec.ts_; rec.ts = ts;
    Object.keys(rec).forEach(k => rec[k] === undefined && delete rec[k]);
    await RH.DB.set('checadas/' + f + '/' + emp._k + '/' + RH.DB.key(), rec);
    return { tipo, ts, fecha: f };
  };

  /* Bitácora */
  RH.log = function (accion, detalle) { const u = (RH.AUTH && RH.AUTH.user) || {}; return RH.DB.push('bitacora', { ts: RH.now(), por: u.nombre || 'Sistema', rol: u.rol || '', accion, detalle: detalle || '' }).catch(() => { }); };

  /* ------------------------------------------------------------------ */
  /* Arranque                                                            */
  /* ------------------------------------------------------------------ */
  RH.start = async function (opts) {
    opts = opts || {};
    if (DEMO) {
      RH.DB = makeLocalDB();
      RH.AUTH = makeLocalAuth(RH.DB);
      await seedDemo();
    } else {
      const base = 'https://www.gstatic.com/firebasejs/' + FB_VER + '/';
      try { await loadScript(base + 'firebase-app-compat.js'); } catch (e) { pantallaBloqueo('No hay conexión a internet o no se pudo cargar Firebase. Revisa tu conexión y recarga la página.'); throw e; }
      await Promise.all(['firebase-database-compat.js', 'firebase-auth-compat.js', 'firebase-app-check-compat.js'].map(f => loadScript(base + f).catch(() => { })));
      RH.app = firebase.apps.find(a => a.name === '[DEFAULT]') || firebase.initializeApp(CFG.FIREBASE);
      if (CFG.APPCHECK_KEY && firebase.appCheck) { try { firebase.appCheck(RH.app).activate(new firebase.appCheck.ReCaptchaEnterpriseProvider(CFG.APPCHECK_KEY), true); } catch (e) { console.warn('appCheck', e); } }
      RH.DB = makeFirebaseDB(RH.app);
      RH.AUTH = makeFirebaseAuth(RH.app, RH.DB);
    }
    if (opts.appKey && !DEMO) {
      const r = await checkLicencia(opts.appKey);
      if (!r.ok) { pantallaBloqueo(r.msg); throw new Error('licencia'); }
      setInterval(() => checkLicencia(opts.appKey).then(x => { if (!x.ok) pantallaBloqueo(x.msg); }), 10 * 60 * 1000);
    }
    return RH;
  };

  /* Suscripción a los datos que usa cada pantalla. Las checadas se leen solo desde una fecha (por volumen). */
  RH.suscribir = function (nodos, desde, cb) {
    const D = { checadas: {}, hoy: hoyISO() }; const offs = [];
    const go = debounce(() => { D.C = RH.conf(D.config); D.hoy = hoyISO(); cb(D); }, 60);
    nodos.forEach(n => {
      if (n === 'checadas') offs.push(RH.DB.onDesde('checadas', desde, v => { D.checadas = v || {}; go(); }));
      else if (n.indexOf('/') > 0) { const [a, b] = n.split('/'); offs.push(RH.DB.on(n, v => { D[a] = D[a] || {}; D[a][b] = v || {}; go(); })); }
      else offs.push(RH.DB.on(n, v => { D[n] = v || (n === 'config' ? {} : {}); go(); }));
    });
    return () => offs.forEach(f => f());
  };

  /* Datos de ejemplo para el modo demo (nombres ficticios) */
  async function seedDemo() {
    const DB = RH.DB;
    const meta = await DB.get('meta');
    if (meta && meta.seed) return;
    const hoy = hoyISO();
    const NOMS = ['Ana Laura Méndez Ruiz', 'Jorge Iván Castro Lara', 'María Fernanda Ríos Peña', 'Luis Ángel Torres Vega', 'Diana Paola Núñez Gil', 'Héctor Manuel Ortiz Cano', 'Karla Itzel Fuentes Mora', 'José Alfredo Salas Ibarra', 'Brenda Yazmín León Soto', 'Ricardo Emilio Paz Durán', 'Sofía Alejandra Vela Ríos', 'Miguel Ángel Rosas Prado', 'Paola Guadalupe Cruz Silva', 'Fernando Iker Lugo Ávila', 'Daniela Itzel Bravo Meza', 'Óscar Daniel Medina Ruelas', 'Adriana Lucía Flores Zúñiga', 'Raúl Antonio Herrera Mena', 'Valeria Monserrat Gil Aceves', 'Eduardo Javier Pinto Ramos', 'Gabriela Ivonne Solís Lara', 'Carlos Alberto Mejía Cortés', 'Mariana Elizabeth Ruiz Tapia', 'Sergio Iván Montes Robles', 'Lorena Patricia Vidal Ochoa', 'Arturo Benjamín Leal Rocha', 'Itzel Abigail Navarro Pérez', 'Juan Pablo Esquivel Mora', 'Rocío Berenice Lara Islas', 'Ángel Gabriel Duarte Ponce', 'Nancy Araceli Villa Soto', 'Kevin Alexis Trujillo Bernal', 'Claudia Ivette Rangel Uribe', 'Emmanuel Isaac Barajas Toledo', 'Fátima Jazmín Aguirre Lomelí', 'Ulises Gerardo Cárdenas Valle', 'Ximena Renata Olmos Becerra', 'Alan Omar Quintero Sosa', 'Liliana Marisol Pacheco Vera', 'Iván Rodrigo Serrano Garza'];
    const DEPS = [['ADMINISTRACION', 'ADM', 'Auxiliar administrativo'], ['ADMINISTRACION', 'ADM', 'Asistente de ventas'], ['CALIDAD', 'T1', 'Analista de calidad'], ['CALIDAD', 'T2', 'Analista de calidad'], ['BASCULA', 'ADM', 'Basculista'], ['VENTAS', 'RUTA', 'Vendedor'], ['CHOFERES', 'RUTA', 'Chofer'], ['CHOFERES', 'RUTA', 'Chofer'], ['EXTRUSION', 'T1', 'Operador de extrusor'], ['EXTRUSION', 'T2', 'Operador de extrusor'], ['EXTRUSION', 'T3', 'Operador de extrusor'], ['ENVASADO', 'T1', 'Operador de envasado'], ['ENVASADO', 'T1', 'Operador de envasado'], ['ENVASADO', 'T2', 'Operador de envasado'], ['AUXILIAR DE ENVASADO', 'T1', 'Auxiliar de envasado'], ['AUXILIAR DE ENVASADO', 'T1', 'Auxiliar de envasado'], ['AUXILIAR DE ENVASADO', 'T2', 'Auxiliar de envasado'], ['CARGADORES', 'T1', 'Cargador'], ['CARGADORES', 'T1', 'Cargador'], ['CARGADORES', 'T1', 'Cargador'], ['CARGADORES', 'T2', 'Cargador'], ['MICROS', 'MIC', 'Operador de micros'], ['MICROS', 'MIC', 'Operador de micros'], ['CONTROLES', 'T1', 'Operador de controles'], ['CALDERAS', 'T1', 'Calderista'], ['VIGILANCIA', 'VIG', 'Vigilante'], ['LIMPIEZA', 'T1', 'Intendencia'], ['PERSONAL GENERAL', 'T1', 'Ayudante general'], ['PERSONAL GENERAL', 'T1', 'Ayudante general'], ['PERSONAL GENERAL', 'T2', 'Ayudante general']];
    const ingresos = ['2011-03-12', '2015-11-01', '2017-03-06', '2019-06-18', '2020-07-10', '2021-04-10', '2022-02-21', '2022-12-29', '2023-06-12', '2023-10-02', '2024-01-17', '2024-06-19', '2024-08-06', '2024-10-07', '2025-02-03', '2025-04-23', '2025-06-14', '2025-07-28', '2025-09-22', '2025-11-17', '2026-01-16', '2026-02-26', '2026-03-16', '2026-05-21', '2026-06-23', '2026-08-05', '2026-09-04', '2026-10-12'];
    let seed = 7; const R = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const up = {}, corte = addDias(hoy, -60);
    const emps = [];
    NOMS.forEach((n, i) => {
      const d = DEPS[i % DEPS.length]; const id = 'E' + (1001 + i);
      const ing = ingresos[i % ingresos.length];
      const e = { num: String(1001 + i), nombre: n.toUpperCase(), depto: d[0], puesto: d[2], turno: d[1], ingreso: ing, estatus: 'activo', checaMovil: d[1] === 'RUTA', enRuta: d[1] === 'RUTA', saldoIni: Math.max(0, Math.round(diasLFT(Math.floor(antig(ing, corte))) * R())), corte, qr: rnd(10) };
      if (i >= 34) { const fb = addDias(hoy, -Math.floor(R() * 300) - 5); if (fb > ing) { e.estatus = 'baja'; e.baja = { fecha: fb, tipo: BAJA_TIPOS[Math.floor(R() * 4)], motivo: BAJA_MOTIVOS[Math.floor(R() * 7)], recontratable: R() > 0.4, ts: Date.now() }; } }
      up['empleados/' + id] = e; up['gafetes/' + e.qr] = id; emps.push(Object.assign({ _k: id }, e));
    });
    // Bajas históricas adicionales para el índice de rotación
    for (let i = 0; i < 22; i++) {
      const id = 'B' + (2001 + i); const ing = addDias(hoy, -Math.floor(R() * 700) - 40); const fb = addDias(ing, Math.floor(R() * Math.min(600, difDias(ing, hoy) - 1)) + 1);
      const d = DEPS[(i * 7) % DEPS.length];
      up['empleados/' + id] = { num: String(2001 + i), nombre: ('Ex colaborador ejemplo ' + (i + 1)).toUpperCase(), depto: d[0], puesto: d[2], turno: d[1], ingreso: ing, estatus: 'baja', baja: { fecha: fb, tipo: BAJA_TIPOS[Math.floor(R() * 5)], motivo: BAJA_MOTIVOS[Math.floor(R() * 10)], recontratable: R() > 0.5 }, saldoIni: 0, corte };
    }
    const C = RH.conf({});
    // Checadas simuladas de las últimas 5 semanas
    const ini = addDias(hoy, -35);
    emps.filter(e => e.estatus === 'activo').forEach((e, idx) => {
      for (let f = e.ingreso > ini ? e.ingreso : ini; f <= hoy; f = addDias(f, 1)) {
        const h = RH.horario(e, f, C); if (!h || RH.esFeriado(f, C)) continue;
        const r = R(); if (r < 0.035 + (idx % 11 === 0 ? 0.12 : 0)) continue; // faltas
        const d0 = parseISO(f).getTime();
        const late = r > 0.9 ? Math.floor(R() * 35) + 11 : Math.floor(R() * 14) - 9;
        const tIn = d0 + (h.e + late) * 60000;
        if (f === hoy && tIn > Date.now()) continue;
        const k1 = 'C' + f.replace(/-/g, '') + idx + 'a';
        up['checadas/' + f + '/' + e._k + '/' + k1] = { ts: tIn, src: e.checaMovil ? 'movil' : 'kiosco' };
        const extra = R() > 0.82 ? 60 + Math.floor(R() * 150) : Math.floor(R() * 12);
        const tOut = d0 + (h.s + extra) * 60000;
        if (tOut < Date.now() && R() > 0.03) up['checadas/' + f + '/' + e._k + '/' + k1.slice(0, -1) + 'b'] = { ts: tOut, src: e.checaMovil ? 'movil' : 'kiosco' };
        if (extra >= 60 && R() > 0.45) up['he/' + e._k + '/H' + k1] = { fecha: f, min: Math.floor(extra / 30) * 30, motivo: 'Pedido urgente / cierre de turno', forma: R() > 0.8 ? 'banco' : 'pago', estado: 'aprobada', pasos: [{ rol: 'jefe', estado: 'ok', por: 'Jefe de producción (demo)' }, { rol: 'rh', estado: 'ok', por: 'RH (demo)' }], ts: tOut };
      }
    });
    // Solicitudes de ejemplo
    const act = emps.filter(e => e.estatus === 'activo');
    const sol = (e, tipo, desde, hasta, estado, extra) => { const dh = RH.diasHabiles(e, desde, hasta, C); const p = RH.pasosPara(tipo, C).map((x, i) => estado === 'aprobada' ? Object.assign(x, { estado: 'ok', por: i ? 'RH (demo)' : 'Jefe (demo)', ts: Date.now() }) : (i === 0 && estado === 'pendiente2' ? Object.assign(x, { estado: 'ok', por: 'Jefe (demo)', ts: Date.now() }) : x)); up['solicitudes/' + e._k + '/S' + newId()] = Object.assign({ tipo, desde, hasta: hasta || desde, dias: tipo === 'VAC' ? dh.n : dh.n, estado: estado === 'pendiente2' ? 'pendiente' : estado, pasos: p, ts: Date.now() - 86400000, por: e.nombre, motivo: '' }, extra || {}); };
    sol(act[2], 'VAC', addDias(hoy, 9), addDias(hoy, 14), 'pendiente', { cubre: act[3]._k });
    sol(act[12], 'VAC', addDias(hoy, 3), addDias(hoy, 5), 'pendiente2', { cubre: act[11]._k });
    sol(act[5], 'VAC', addDias(hoy, -12), addDias(hoy, -8), 'aprobada');
    sol(act[9], 'INC', addDias(hoy, -6), addDias(hoy, -2), 'aprobada', { folio: 'XX123456', ramo: 'Enfermedad general' });
    sol(act[15], 'PHR', addDias(hoy, 1), addDias(hoy, 1), 'pendiente', { horaDe: '11:00', horaA: '14:00', horas: 3, motivo: 'Trámite escolar', descontable: false, recompensado: true });
    sol(act[20], 'CMD', addDias(hoy, -3), addDias(hoy, -3), 'aprobada', { horaDe: '07:00', horaA: '10:00', horas: 3, motivo: 'Cita IMSS' });
    sol(act[7], 'VAC', addDias(hoy, 20), addDias(hoy, 26), 'aprobada');
    up['he/' + act[13]._k + '/HPEND1'] = { fecha: addDias(hoy, 1), min: 120, motivo: 'Producción extra Silver Kan 25 kg', forma: 'pago', estado: 'pendiente', pasos: RH.pasosPara('HE', C), ts: Date.now() };
    up['config'] = { param: { fechaCorte: corte, geocerca: PARAM_DEF.geocerca }, plazas: { ENVASADO: 4, 'AUXILIAR DE ENVASADO': 5, CARGADORES: 6, EXTRUSION: 3, MICROS: 3, CALIDAD: 2, ADMINISTRACION: 3, CHOFERES: 3 } };
    up['meta/seed'] = { ts: Date.now(), demo: true };
    await DB.update(up);
    const demoUsers = [['master', 'Ricardo Barba (Master)', 'master'], ['rh', 'Recursos Humanos', 'rh'], ['jefe', 'Jefe de Producción', 'jefe', ['EXTRUSION', 'ENVASADO', 'AUXILIAR DE ENVASADO', 'CARGADORES', 'MICROS', 'CONTROLES', 'CALDERAS', 'PERSONAL GENERAL']], ['director', 'Dirección General', 'director'], ['kiosco', 'Checador Planta', 'kiosco']];
    for (const [u, n, r, dep] of demoUsers) { try { await RH.AUTH.crearUsuario({ usuario: u, nombre: n, rol: r, pass: 'demo', deptos: dep }); } catch (e) { } }
    try { await RH.AUTH.crearUsuario({ usuario: userEmpleado('1013'), nombre: emps[12].nombre, rol: 'empleado', pass: '123456', empId: 'E1013' }); } catch (e) { }
    try { await RH.AUTH.crearUsuario({ usuario: userEmpleado('1006'), nombre: emps[5].nombre, rol: 'empleado', pass: '123456', empId: 'E1006' }); } catch (e) { }
    for (const e of emps.slice(0, 34)) { await DB.set('empleados/' + e._k + '/nipK', await nipHash(e._k, '123456')); }
    await DB.update({ 'meta/hayMaster': true, 'meta/demo': true });
  }
  RH.resetDemo = function () { if (DEMO && RH.DB._reset) { RH.DB._reset(); try { sessionStorage.clear(); } catch (e) { } location.reload(); } };

  /* Llama a tus Cloud Functions con el token del usuario */
  RH.fn = async function (nombre, body) {
    if (DEMO) throw new Error('En modo demo no hay Cloud Functions.');
    if (!CFG.FUNCTIONS_URL) throw new Error('Falta configurar FUNCTIONS_URL en config.js (ver guía de despliegue).');
    const tok = await RH.AUTH.token();
    let r; try { r = await fetch(CFG.FUNCTIONS_URL.replace(/\/$/, '') + '/' + nombre, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok }, body: JSON.stringify(body || {}) }); } catch (e) { throw new Error('No se pudo contactar la función "' + nombre + '". ¿Ya se desplegó? (ver guía)'); }
    const j = await r.json().catch(() => ({ ok: false, message: 'Respuesta inválida (' + r.status + ')' }));
    if (!j.ok) throw new Error(j.message || 'Error');
    return j;
  };

  /* Exportar */
  RH.exportXlsx = async function (nombre, hojas) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
    const wb = XLSX.utils.book_new();
    hojas.forEach(h => { const ws = XLSX.utils.aoa_to_sheet(h.filas); ws['!cols'] = (h.filas[0] || []).map((c, i) => ({ wch: Math.max(10, Math.min(44, String(c).length + 4, i === 1 ? 40 : 18)) })); XLSX.utils.book_append_sheet(wb, ws, h.nombre.slice(0, 31)); });
    XLSX.writeFile(wb, nombre);
  };
  RH.descargar = function (nombre, texto, tipo) {
    const b = new Blob(['﻿' + texto], { type: tipo || 'text/csv;charset=utf-8' }); const a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = nombre; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  RH.csv = filas => filas.map(r => r.map(c => { c = c == null ? '' : String(c); return /[",\n;]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(',')).join('\r\n');
  RH.leerExcel = async function (file) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
    const buf = await file.arrayBuffer();
    return XLSX.read(buf, { type: 'array', cellDates: true });
  };
  RH.enIframe = (() => { try { return W.self !== W.top; } catch (e) { return true; } })();
  RH.imprimir = function (html) {
    let p = $('#print-area'); if (!p) { p = document.createElement('div'); p.id = 'print-area'; document.body.appendChild(p); }
    p.innerHTML = html; document.body.classList.add('printing');
    setTimeout(() => { W.print(); setTimeout(() => document.body.classList.remove('printing'), 400); }, 80);
  };

  /* ------------------------------------------------------------------ */
  /* Interfaz: avisos, ventanas modales, confirmaciones, firma, gráficas */
  /* ------------------------------------------------------------------ */
  RH.toast = function (msg, tipo) {
    let t = $('#inv-toast'); if (!t) { t = document.createElement('div'); t.id = 'inv-toast'; document.body.appendChild(t); }
    t.className = 'show ' + (tipo || ''); t.textContent = msg; clearTimeout(t._h); t._h = setTimeout(() => t.className = '', 3400);
  };
  RH.modal = function (titulo, html, botones, opts) {
    return new Promise(res => {
      const ov = document.createElement('div'); ov.className = 'modal-ov';
      ov.innerHTML = '<div class="modal ' + ((opts && opts.ancho) ? 'ancho' : '') + '"><div class="modal-h"><b>' + esc(titulo) + '</b><button class="x" data-r="__x" aria-label="Cerrar">✕</button></div><div class="modal-b">' + html + '</div><div class="modal-f"></div></div>';
      const f = $('.modal-f', ov);
      (botones || [{ t: 'Cerrar', v: null }]).forEach(b => { if (!b) return; const e = document.createElement('button'); e.className = 'btn ' + (b.c || ''); e.textContent = b.t; e.onclick = async () => { if (b.antes) { e.disabled = true; let ok; try { ok = await b.antes(ov); } finally { e.disabled = false; } if (ok === false) return; } close(b.v); }; f.appendChild(e); });
      function close(v) { ov.remove(); res({ v, el: ov }); }
      $('[data-r="__x"]', ov).onclick = () => close(null);
      document.body.appendChild(ov);
      const first = $('input:not([type=checkbox]),select,textarea', ov); if (first && !(opts && opts.sinFoco)) setTimeout(() => first.focus(), 50);
      if (opts && opts.onOpen) opts.onOpen(ov);
    });
  };
  RH.confirmar = async function (titulo, texto, si) { const r = await RH.modal(titulo, '<p>' + texto + '</p>', [{ t: 'Cancelar', v: false }, { t: si || 'Sí, continuar', v: true, c: 'pri' }]); return r.v === true; };
  RH.pedirTexto = async function (titulo, etiqueta, oblig) { let val = null; const r = await RH.modal(titulo, '<label>' + esc(etiqueta) + '<textarea id="pt-t"></textarea></label>', [{ t: 'Cancelar', v: 0 }, { t: 'Aceptar', v: 1, c: 'pri', antes: ov => { val = $('#pt-t', ov).value.trim(); if (oblig && !val) { RH.toast('Escribe el motivo', 'err'); return false; } } }]); return r.v ? val : null; };

  /* Firma con el dedo (canvas) → data URL pequeña */
  RH.padFirma = function (cont) {
    cont.innerHTML = '<canvas class="firma" width="560" height="170" aria-label="Firma"></canvas><div class="row" style="margin-top:6px"><span class="muted small">Firma con el dedo o el mouse</span><span class="sp"></span><button class="btn sm ghost" type="button">Borrar</button></div>';
    const cv = $('canvas', cont), cx = cv.getContext('2d'); let dib = false, usado = false, lp = null;
    cx.lineWidth = 2.6; cx.lineCap = 'round'; cx.lineJoin = 'round'; cx.strokeStyle = '#16226b';
    const pos = ev => { const r = cv.getBoundingClientRect(); const p = ev.touches ? ev.touches[0] : ev; return { x: (p.clientX - r.left) * cv.width / r.width, y: (p.clientY - r.top) * cv.height / r.height }; };
    const down = ev => { ev.preventDefault(); dib = true; lp = pos(ev); };
    const move = ev => { if (!dib) return; ev.preventDefault(); const p = pos(ev); cx.beginPath(); cx.moveTo(lp.x, lp.y); cx.lineTo(p.x, p.y); cx.stroke(); lp = p; usado = true; };
    const up = () => { dib = false; };
    cv.addEventListener('mousedown', down); cv.addEventListener('mousemove', move); W.addEventListener('mouseup', up);
    cv.addEventListener('touchstart', down, { passive: false }); cv.addEventListener('touchmove', move, { passive: false }); cv.addEventListener('touchend', up);
    $('button', cont).onclick = () => { cx.clearRect(0, 0, cv.width, cv.height); usado = false; };
    return { vacia: () => !usado, dato: () => usado ? cv.toDataURL('image/png') : '' };
  };

  /* Gráficas SVG ligeras */
  RH.barras = function (datos, o) {
    o = o || {}; const W_ = 640, H = o.alto || 200, pl = 34, pb = 26, pt = 14, pr = 8;
    const max = Math.max(o.max || 0, ...datos.map(d => (d.v || 0) + (d.v2 || 0)), 1);
    const nice = (() => { const p = Math.pow(10, Math.floor(Math.log10(max))); const m = max / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; })();
    const bw = (W_ - pl - pr) / datos.length; const y = v => pt + (H - pt - pb) * (1 - v / nice);
    let s = `<svg viewBox="0 0 ${W_} ${H}" role="img" aria-label="${esc(o.titulo || 'gráfica')}">`;
    for (let i = 0; i <= 4; i++) { const v = nice * i / 4, yy = y(v); s += `<line x1="${pl}" x2="${W_ - pr}" y1="${yy}" y2="${yy}" stroke="var(--line)" stroke-width="1"/><text x="${pl - 6}" y="${yy + 4}" text-anchor="end" font-size="10" fill="var(--muted)">${fmt(v, o.dec ? 1 : 0)}${o.suf || ''}</text>`; }
    datos.forEach((d, i) => {
      const x = pl + i * bw + bw * 0.18, w = bw * 0.64;
      const h1 = (H - pt - pb) * (d.v || 0) / nice, h2 = (H - pt - pb) * (d.v2 || 0) / nice;
      s += `<rect x="${x}" y="${y(d.v || 0)}" width="${w}" height="${Math.max(0, h1)}" rx="3" fill="${d.c || o.color || 'var(--acc)'}"><title>${esc(d.l)}: ${fmt(d.v, o.dec ? 1 : 0)}${o.suf || ''}</title></rect>`;
      if (d.v2) s += `<rect x="${x}" y="${y((d.v || 0) + d.v2)}" width="${w}" height="${Math.max(0, h2)}" rx="3" fill="${o.color2 || 'var(--blu)'}"><title>${esc(d.l)}: ${fmt(d.v2)}</title></rect>`;
      if (o.etiquetas !== false && (d.v || d.v2)) s += `<text x="${x + w / 2}" y="${y((d.v || 0) + (d.v2 || 0)) - 4}" text-anchor="middle" font-size="10" font-weight="700" fill="var(--txt)" font-family="Archivo,sans-serif">${fmt((d.v || 0) + (d.v2 || 0), o.dec ? 1 : 0)}${o.suf || ''}</text>`;
      s += `<text x="${x + w / 2}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--muted)">${esc(d.l)}</text>`;
    });
    if (o.meta != null) { const yy = y(o.meta); s += `<line x1="${pl}" x2="${W_ - pr}" y1="${yy}" y2="${yy}" stroke="var(--red)" stroke-dasharray="5 4" stroke-width="1.5"/><text x="${W_ - pr}" y="${yy - 4}" text-anchor="end" font-size="10" fill="var(--red)">meta ${fmt(o.meta, 1)}${o.suf || ''}</text>`; }
    return s + '</svg>';
  };
  RH.dona = function (partes, o) {
    o = o || {}; const tot = partes.reduce((a, p) => a + p.v, 0) || 1; let a0 = -Math.PI / 2; const R_ = 52, r = 34, cx = 60, cy = 60;
    let s = `<svg viewBox="0 0 120 120" width="${o.tam || 120}" height="${o.tam || 120}" role="img" aria-label="${esc(o.titulo || '')}">`;
    partes.forEach(p => { if (!p.v) return; const a1 = a0 + 2 * Math.PI * p.v / tot; const L = a1 - a0 > Math.PI ? 1 : 0; const P = (rr, a) => [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
      const [x1, y1] = P(R_, a0), [x2, y2] = P(R_, a1 - 0.0001), [x3, y3] = P(r, a1 - 0.0001), [x4, y4] = P(r, a0);
      s += `<path d="M${x1} ${y1}A${R_} ${R_} 0 ${L} 1 ${x2} ${y2}L${x3} ${y3}A${r} ${r} 0 ${L} 0 ${x4} ${y4}Z" fill="${p.c}"><title>${esc(p.l)}: ${p.v}</title></path>`; a0 = a1; });
    s += `<text x="60" y="58" text-anchor="middle" font-size="20" font-weight="800" fill="var(--txt)">${esc(o.centro != null ? o.centro : tot)}</text><text x="60" y="74" text-anchor="middle" font-size="9" fill="var(--muted)">${esc(o.sub || '')}</text></svg>`;
    return s;
  };

  /* Pantalla de inicio de sesión reutilizable */
  RH.pantallaLogin = function (cont, opts) {
    opts = opts || {};
    cont.innerHTML = `
    <div class="login">
      <div class="login-card">
        <div class="login-logos"><img src="img/logo-19h.png" alt="Los 19 Hermanos"><img src="img/logo-petfood.png" alt="División Pet Food"></div>
        <h1>${esc(opts.titulo || 'Recursos Humanos')}</h1>
        <p class="muted">${esc(CFG.EMPRESA || '')}</p>
        ${DEMO ? '<div class="demo-badge">' + (opts.demoTxt || 'MODO DEMO · usuarios: master, rh, jefe, director · contraseña: demo') + '</div>' : ''}
        <label>${esc(opts.etqUsuario || 'Usuario')}<input id="lg-u" autocomplete="username" autocapitalize="none" ${opts.numerico ? 'inputmode="numeric"' : ''} value="${esc(opts.sugerido || '')}"></label>
        <label>${esc(opts.etqPass || 'Contraseña')}<input id="lg-p" type="password" ${opts.numerico ? 'inputmode="numeric" maxlength="6"' : ''} autocomplete="current-password"></label>
        <button class="btn pri big" id="lg-b">Entrar</button>
        <div id="lg-e" class="err"></div>
        <a href="#" id="lg-m" class="muted small" style="display:none">Primer uso: crear usuario master</a>
      </div>
    </div>`;
    const go = async () => { const e = $('#lg-e'), b = $('#lg-b'); e.textContent = ''; b.disabled = true; try { let u = $('#lg-u').value; if (opts.numerico) u = userEmpleado(u); await RH.AUTH.login(u, $('#lg-p').value); } catch (x) { if ($('#lg-e')) $('#lg-e').textContent = x.message; } if ($('#lg-b')) $('#lg-b').disabled = false; };
    $('#lg-b').onclick = go; $('#lg-p').onkeydown = ev => { if (ev.key === 'Enter') go(); };
    if (!DEMO && opts.permitirMaster) {
      RH.DB.get('meta/hayMaster').then(v => { if (!v) $('#lg-m').style.display = 'block'; }).catch(() => { $('#lg-m').style.display = 'block'; });
      $('#lg-m').onclick = async ev => {
        ev.preventDefault();
        await RH.modal('Crear usuario master', '<p class="muted">Solo funciona la primera vez (cuando aún no existe ningún master).</p><label>Nombre<input id="bm-n" value="Lic. Ricardo Barba Gómez"></label><label>Usuario<input id="bm-u" value="ricardo" autocapitalize="none"></label><label>Contraseña (mín. 6)<input id="bm-p" type="password"></label>', [{ t: 'Cancelar', v: 0 }, { t: 'Crear master', v: 1, c: 'pri', antes: async ov => { try { await RH.AUTH.crearMaster({ nombre: $('#bm-n', ov).value.trim(), usuario: $('#bm-u', ov).value.trim(), pass: $('#bm-p', ov).value }); RH.toast('Master creado ✔', 'ok'); } catch (x) { RH.toast(x.message, 'err'); return false; } } }]);
      };
    }
  };
})(window);
