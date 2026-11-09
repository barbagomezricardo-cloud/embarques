/* =====================================================================
   ACCESO 19H · inicio de sesión seguro de Programador y Cargadores
   ---------------------------------------------------------------------
   - Cada persona entra con SU usuario y SU contraseña (Firebase
     Authentication). Las contraseñas ya NO se guardan en la base de
     datos ni en el código: solo Google las conoce, cifradas.
   - Si el master marcó la cuenta como «debe cambiar» (alta nueva,
     contraseña restablecida o contraseña que estuvo expuesta), al entrar
     se pide una nueva y no se puede usar la app hasta registrarla.
   - El master crea, restablece, da de baja y cambia roles desde el
     programador (⚙ Configuración → Área master). Eso pasa por la función
     embAdmin de Firebase, que revisa que quien lo pide sea master.
   Perfil de cada cuenta en  acceso/usuarios/{uid}:
     { key, nombre, prog: 'master'|'su'|'cons'|'basc'|null, carg: true|null,
       activo: true|false, debeCambiar: true|false }
   ===================================================================== */
(function (W) {
  'use strict';
  var D = W.document;
  var CFG_DEF = {
    apiKey: 'AIzaSyBYa3yZxWML-rwxKwuXp_gTyOTkisUKe8w', authDomain: 'embarques-mascotas.firebaseapp.com',
    databaseURL: 'https://embarques-mascotas-default-rtdb.firebaseio.com', projectId: 'embarques-mascotas',
    appId: '1:860212111367:web:6a020f94ef6a468af922a2'
  };
  var FN = 'https://us-central1-embarques-mascotas.cloudfunctions.net/embAdmin';
  var DOMINIO = '@emb19h.app';
  var PRE = 'emb19h:';            // se antepone siempre: así un PIN corto cumple el mínimo de Google
  var SDK = 'https://www.gstatic.com/firebasejs/10.12.0/';
  var ROLES_PROG = { master: 'Master', su: 'Superusuario', cons: 'Consulta (solo ver)', basc: 'Báscula' };
  var ROLES_GER = { master: 'Master', su: 'Super-usuario', visor: 'Visor' };
  var ROLES_INV = { master: 'Master', jefe: 'Jefe de inventarios', compras: 'Compras', almacenista: 'Almacenista', produccion: 'Producción' };
  var ROLES_RH = { master: 'Master', rh: 'Recursos Humanos', director: 'Dirección', jefe: 'Jefe de área' };

  var S = { app: null, auth: null, db: null, listo: null, perfil: null, uid: null, vig: null, tok: '', tokT: 0, ac: null };
  var _ses = {}; _ses.p = new Promise(function (r) { _ses.r = r; });

  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function clave(t) {
    return String(t || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30);
  }
  function correo(key) { return clave(key) + DOMINIO; }
  function script(src) {
    return new Promise(function (ok, mal) {
      var s = D.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { mal(new Error('Sin internet')); }; D.head.appendChild(s);
    });
  }

  /* ---------- arranque: un solo app de Firebase con Auth + Database (+ App Check) ---------- */
  function iniciar(op) {
    if (S.listo) return S.listo;
    op = op || {};
    var cfg = (op.firebase && op.firebase.databaseURL) ? op.firebase : CFG_DEF;
    if (!cfg.apiKey) cfg = Object.assign({}, CFG_DEF, cfg);
    S.listo = (W.firebase ? Promise.resolve() : script(SDK + 'firebase-app-compat.js')).then(function () {
      var p = [];
      if (!W.firebase.auth) p.push(script(SDK + 'firebase-auth-compat.js'));
      if (!W.firebase.database) p.push(script(SDK + 'firebase-database-compat.js'));
      if (op.recaptcha && !W.firebase.appCheck) p.push(script(SDK + 'firebase-app-check-compat.js').catch(function () {}));
      return Promise.all(p);
    }).then(function () {
      S.app = W.firebase.initializeApp(cfg, 'acc19h');
      if (op.recaptcha && W.firebase.appCheck) {
        try { W.firebase.appCheck(S.app).activate(new W.firebase.appCheck.ReCaptchaEnterpriseProvider(op.recaptcha), true); } catch (e) { console.warn('appCheck', e); }
      }
      S.auth = W.firebase.auth(S.app);
      S.db = W.firebase.database(S.app);
      return S.app;
    }).catch(function (e) { S.listo = null; throw e; });
    return S.listo;
  }

  function leer(ruta) { return S.db.ref(ruta).once('value').then(function (s) { return s.val(); }); }

  function permitido(p, app) {
    if (!p || p.activo !== true) return false;
    if (app === 'prog') return !!ROLES_PROG[p.prog];
    if (app === 'carg') return p.carg === true;
    if (app === 'ger') return !!ROLES_GER[p.ger];                                   // Ventas y Maestra
    if (app === 'vend') return !!p.vend || !!ROLES_GER[p.ger];                      // App Vendedor
    if (app === 'basc') return p.prog === 'master' || p.prog === 'su' || p.prog === 'basc' || p.cb === true;   // Cuadre de báscula
    return true;
  }

  /* Lista de nombres para elegir al entrar (no trae contraseñas ni roles) */
  function directorio(app) {
    return iniciar().then(function () { return leer('acceso/directorio'); }).then(function (o) {
      var L = [];
      Object.keys(o || {}).forEach(function (k) { var x = o[k] || {}; if (!app || (x.a && x.a[app])) L.push({ key: k, nombre: x.n || k }); });
      return L.sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); });
    });
  }

  function esNip(p) { return !!p && !p.prog && !p.ger; }   // cb/carg/vend: NIP   // cargadores y vendedores: NIP de 6 números
  function cargarPerfil(uid) { return leer('acceso/usuarios/' + uid).then(function (p) { S.perfil = p; S.uid = uid; return p; }); }

  function msgError(e) {
    var c = (e && e.code) || '';
    if (/wrong-password|invalid-credential|user-not-found|invalid-login/.test(c)) return 'Usuario o contraseña incorrectos.';
    if (/too-many-requests/.test(c)) return 'Demasiados intentos. Espera unos minutos.';
    if (/network/.test(c)) return 'Sin conexión a internet.';
    if (/user-disabled/.test(c)) return 'Tu usuario está dado de baja.';
    return (e && e.message) || 'No se pudo entrar.';
  }

  /* Entra; si la cuenta debe cambiar su contraseña, la pide antes de devolver el perfil */
  function entrar(key, pass, app, op) {
    op = op || {};
    if (!key || !pass) return Promise.reject(new Error('Escribe tu usuario y tu contraseña.'));
    return iniciar().then(function () {
      return S.auth.signInWithEmailAndPassword(correo(key), PRE + pass).catch(function (e) { throw new Error(msgError(e)); });
    }).then(function (cred) { return cargarPerfil(cred.user.uid); }).then(function (p) {
      if (!permitido(p, app)) { return S.auth.signOut().then(function () { throw new Error(p && p.activo === false ? 'Tu usuario está dado de baja.' : 'Tu usuario no tiene acceso a esta app.'); }); }
      S.db.ref('acceso/usuarios/' + S.uid + '/ultimoAcceso').set(Date.now()).catch(function () {});
      if (p.debeCambiar) return pedirCambio({ nip: esNip(p), anterior: pass, nombre: p.nombre }).then(function () { return S.perfil; });
      return p;
    });
  }

  /* Al abrir la app: devuelve el perfil si ya había sesión válida en este equipo */
  function sesionActual(app, op) {
    op = op || {};
    return iniciar().then(function () {
      return new Promise(function (ok) { var off = S.auth.onAuthStateChanged(function (u) { off(); ok(u); }); });
    }).then(function (u) {
      if (!u) return null;
      return cargarPerfil(u.uid).then(function (p) {
        if (!permitido(p, app)) return null;   // la sesión es compartida entre apps: no se cierra, solo se pide otro usuario
        if (p.debeCambiar) return pedirCambio({ nip: esNip(p), nombre: p.nombre }).then(function () { return S.perfil; });
        return p;
      }).catch(function () { return null; });
    });
  }

  /* Avisa si el master te da de baja o te cambia el rol mientras usas la app */
  function vigilar(cb) {
    if (!S.uid) return;
    if (S.vig) S.vig.off();
    S.vig = S.db.ref('acceso/usuarios/' + S.uid);
    S.vig.on('value', function (s) { var p = s.val(); var antes = S.perfil; S.perfil = p; cb(p, antes); }, function () {});
  }

  function salir() {
    if (S.vig) { try { S.vig.off(); } catch (e) {} S.vig = null; }
    S.perfil = null; S.uid = null;
    return S.auth ? S.auth.signOut() : Promise.resolve();
  }

  function validar(nueva, op) {
    nueva = String(nueva || '');
    if (op.nip) { if (!/^\d{6}$/.test(nueva)) return 'El NIP debe ser de 6 números.'; }
    else {
      if (nueva.length < 8) return 'Mínimo 8 caracteres.';
      if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(nueva) || !/\d/.test(nueva)) return 'Usa letras y números.';
    }
    if (/^(\d)\1+$/.test(nueva) || /^(012345|123456|234567|345678|456789|987654|654321)/.test(nueva)) return 'Es muy fácil de adivinar.';
    if (op.anterior && nueva === op.anterior) return 'Debe ser distinta a la anterior.';
    return '';
  }

  function cambiar(nueva, op) {
    op = op || {};
    var e = validar(nueva, op); if (e) return Promise.reject(new Error(e));
    var u = S.auth && S.auth.currentUser; if (!u) return Promise.reject(new Error('Sin sesión.'));
    return u.updatePassword(PRE + nueva).catch(function (er) {
      if (/requires-recent-login/.test(er.code || '')) throw new Error('Por seguridad, sal y vuelve a entrar para cambiarla.');
      throw new Error(msgError(er));
    }).then(function () {
      return S.db.ref('acceso/usuarios/' + u.uid + '/debeCambiar').set(false).catch(function () {});
    }).then(function () { if (S.perfil) S.perfil.debeCambiar = false; });
  }

  /* ---------- ventanas (estilo propio, sirve en las dos apps) ---------- */
  var CSS = '.acc19-ov{position:fixed;inset:0;background:rgba(10,14,20,.78);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;font-family:inherit}' +
    '.acc19-bx{background:#fff;color:#1d1a17;border-radius:14px;max-width:380px;width:100%;padding:20px;box-shadow:0 20px 50px rgba(0,0,0,.4)}' +
    '.acc19-bx h3{margin:0 0 6px;font-size:18px;color:#C8102E}.acc19-bx p{margin:0 0 12px;font-size:13.5px;color:#5a4e42;line-height:1.4}' +
    '.acc19-bx input,.acc19-bx select{width:100%;box-sizing:border-box;font-size:16px;padding:11px;border:1px solid #d9cfc4;border-radius:9px;margin-bottom:8px;background:#fff;color:#1d1a17}' +
    '.acc19-bx button{width:100%;padding:12px;border:0;border-radius:9px;background:#C8102E;color:#fff;font-weight:800;font-size:15px;cursor:pointer}' +
    '.acc19-bx button:disabled{opacity:.6}.acc19-e{color:#C8102E;font-size:13px;min-height:1.2em;margin-bottom:6px}' +
    '.acc19-t{width:100%;border-collapse:collapse;font-size:12.5px}.acc19-t td,.acc19-t th{padding:6px 5px;border-bottom:1px solid rgba(127,127,127,.25);text-align:left;vertical-align:middle}' +
    '.acc19-t button,.acc19-f button{padding:5px 9px;border-radius:7px;border:1px solid currentColor;background:transparent;color:inherit;cursor:pointer;font-size:12px;margin:1px}' +
    '.acc19-f{display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin:8px 0}.acc19-f input,.acc19-f select{padding:7px;border-radius:7px;border:1px solid rgba(127,127,127,.5);background:transparent;color:inherit}' +
    '.acc19-chip{display:inline-block;padding:1px 7px;border-radius:9px;font-size:11px;font-weight:700;background:rgba(200,16,46,.15);color:#C8102E}';
  function css() { if (D.getElementById('acc19-css')) return; var s = D.createElement('style'); s.id = 'acc19-css'; s.textContent = CSS; D.head.appendChild(s); }

  function pedirCambio(op) {
    op = op || {}; css();
    return new Promise(function (ok) {
      var ov = D.createElement('div'); ov.className = 'acc19-ov';
      var tipo = op.nip ? 'NIP' : 'contraseña';
      ov.innerHTML = '<div class="acc19-bx"><h3>🔑 Crea tu ' + tipo + ' nueva</h3>' +
        '<p>' + (op.nombre ? '<b>' + esc(op.nombre) + '</b>, ' : '') + (op.cancelar ? 'escribe tu nueva ' + tipo + '. ' : 'por seguridad necesitas registrar tu propi' + (op.nip ? 'o NIP' : 'a contraseña') + '. ') + 'Solo tú la sabrás; si la olvidas, el master te la restablece.<br>' +
        (op.nip ? '<b>6 números</b>, que no sean seguidos ni repetidos.' : '<b>Mínimo 8 caracteres</b>, con letras y números.') + '</p>' +
        '<input type="password" id="acc19-n1" ' + (op.nip ? 'inputmode="numeric" maxlength="6" ' : '') + 'placeholder="' + (op.nip ? 'NIP nuevo' : 'Contraseña nueva') + '" autocomplete="new-password">' +
        '<input type="password" id="acc19-n2" ' + (op.nip ? 'inputmode="numeric" maxlength="6" ' : '') + 'placeholder="Repítela" autocomplete="new-password">' +
        '<div class="acc19-e" id="acc19-e"></div><button id="acc19-ok">' + (op.cancelar ? 'Guardar' : 'Guardar y entrar') + '</button>' +
        (op.cancelar ? '<button id="acc19-no" style="margin-top:8px;background:transparent;color:#5a4e42;border:1px solid #d9cfc4">Cancelar</button>' : '') + '</div>';
      D.body.appendChild(ov);
      var b = ov.querySelector('#acc19-ok'), er = ov.querySelector('#acc19-e');
      var go = function () {
        var a = ov.querySelector('#acc19-n1').value, c = ov.querySelector('#acc19-n2').value;
        if (a !== c) { er.textContent = 'No coinciden.'; return; }
        b.disabled = true; er.textContent = '';
        cambiar(a, op).then(function () { ov.remove(); ok(true); }).catch(function (e) { b.disabled = false; er.textContent = e.message; });
      };
      if (op.cancelar) ov.querySelector('#acc19-no').onclick = function () { ov.remove(); ok(false); };
      b.onclick = go; ov.querySelector('#acc19-n2').onkeydown = function (e) { if (e.key === 'Enter') go(); };
      setTimeout(function () { ov.querySelector('#acc19-n1').focus(); }, 60);
    });
  }

  /* ---------- funciones del master (pasan por embAdmin) ---------- */
  function admin(accion, datos) {
    var u = S.auth && S.auth.currentUser; if (!u) return Promise.reject(new Error('Sin sesión.'));
    return u.getIdToken().then(function (t) {
      return fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, body: JSON.stringify({ accion: accion, datos: datos || {} }) });
    }).then(function (r) { return r.json().catch(function () { return { ok: false, message: 'Respuesta inválida (' + r.status + ')' }; }); })
      .then(function (j) { if (!j.ok) throw new Error(j.message || 'No se pudo.'); return j; });
  }
  function token() {
    var u = S.auth && S.auth.currentUser; if (!u) return Promise.resolve('');
    if (S.tok && Date.now() - S.tokT < 40 * 60000) return Promise.resolve(S.tok);
    return u.getIdToken(true).then(function (t) { S.tok = t; S.tokT = Date.now(); return t; });
  }
  function tokenGuardado() { return S.tok; }   // síncrono: el último token (se renueva cada 40 min con token())
  function appCheckToken() {
    try { if (!S.ac && W.firebase && W.firebase.appCheck) S.ac = W.firebase.appCheck(S.app); } catch (e) { S.ac = null; }
    return S.ac ? S.ac.getToken().then(function (x) { return x && x.token; }).catch(function () { return ''; }) : Promise.resolve('');
  }
  function esperarSesion() { return _ses.p; }
  function sesionLista(p) { token().then(function () { _ses.r(p); }); }

  /* Pantalla de acceso para Ventas, Maestra, Vendedor y Cuadre de báscula:
     cubre la app hasta que la persona entra (o ya tenía sesión en este equipo). */
  function puerta(op) {
    op = op || {}; css();
    var ov = D.createElement('div'); ov.className = 'acc19-ov'; ov.style.background = 'rgba(245,240,235,.98)';
    ov.innerHTML = '<div class="acc19-bx"><h3>' + esc(op.titulo || 'Entrar') + '</h3><p id="acc19-ph">Verificando sesión…</p>' +
      '<select id="acc19-u" autocomplete="username"><option value="">Cargando…</option></select>' +
      '<input type="password" id="acc19-p" ' + (op.nip ? 'inputmode="numeric" ' : '') + 'placeholder="' + (op.nip ? 'NIP' : 'Contraseña') + '" autocomplete="current-password">' +
      '<div class="acc19-e" id="acc19-pe"></div><button id="acc19-pb">Entrar</button></div>';
    var montar = function () { (D.body || D.documentElement).appendChild(ov); };
    if (D.body) montar(); else D.addEventListener('DOMContentLoaded', montar);
    var q = function (x) { return ov.querySelector(x); };
    return iniciar({ recaptcha: op.recaptcha }).then(function () { return sesionActual(op.app, { nip: op.nip }); }).then(function (p) {
      if (p) { ov.remove(); sesionLista(p); return p; }
      q('#acc19-ph').textContent = 'Elige tu nombre y escribe tu ' + (op.nip ? 'NIP' : 'contraseña') + '.';
      var LSK = 'acc19_ult_' + op.app;
      directorio(op.app).then(function (L) {
        var ult = ''; try { ult = localStorage.getItem(LSK) || ''; } catch (e) {}
        q('#acc19-u').innerHTML = '<option value="">— Elige tu nombre —</option>' + L.map(function (u) { return '<option value="' + esc(u.key) + '"' + (u.key === ult ? ' selected' : '') + '>' + esc(u.nombre) + '</option>'; }).join('');
      }).catch(function () { q('#acc19-u').innerHTML = '<option value="">Sin internet</option>'; });
      return new Promise(function (ok) {
        var go = function () {
          var k = q('#acc19-u').value, pw = q('#acc19-p').value, b = q('#acc19-pb');
          if (!k || !pw) { q('#acc19-pe').textContent = 'Elige tu nombre y escribe tu ' + (op.nip ? 'NIP' : 'contraseña') + '.'; return; }
          b.disabled = true; q('#acc19-pe').textContent = '';
          entrar(k, pw, op.app, { nip: op.nip }).then(function (p) {
            try { localStorage.setItem(LSK, k); } catch (e) {}
            ov.remove(); sesionLista(p); ok(p);
          }).catch(function (e) { b.disabled = false; q('#acc19-pe').textContent = e.message; });
        };
        q('#acc19-pb').onclick = go; q('#acc19-p').onkeydown = function (e) { if (e.key === 'Enter') go(); };
      });
    }).catch(function () { q('#acc19-ph').textContent = 'Sin conexión a internet. Revisa y vuelve a cargar la página.'; throw new Error('sin internet'); });
  }

  function temporal(nip) {
    var a = new Uint32Array(2); W.crypto.getRandomValues(a);
    if (nip) { var n = String(100000 + (a[0] % 900000)); return /^(\d)\1+$/.test(n) ? temporal(true) : n; }
    var L = 'abcdefghjkmnpqrstuvwxyz', N = '23456789', s = '';
    for (var i = 0; i < 6; i++) s += L[(a[0] >>> (i * 4)) % L.length];
    return s + N[a[1] % N.length] + N[(a[1] >>> 8) % N.length];
  }

  /* Panel de usuarios del master, ORGANIZADO POR PROGRAMA.
     Cada programa es un desplegable con quién tiene acceso y con qué rol; abajo, «Personas» para
     dar de alta, restablecer contraseña y dar de baja. cont = elemento donde se dibuja */
  var PROGRAMAS = [
    { k: 'prog', t: '🚚 Programador de embarques', roles: ROLES_PROG },
    { k: 'carg', t: '📦 Cargadores', bool: 'Cargador' },
    { k: 'cb', t: '⚖️ Cuadre de báscula', bool: 'Acceso', nota: 'También entran master, superusuario y báscula del Programador.' },
    { k: 'ger', t: '📊 Ventas y Maestra', roles: ROLES_GER, nota: 'Master y super-usuario también entran al Centro de Mando.' },
    { k: 'vend', t: '🧑‍💼 App del vendedor', clave: true, nota: 'La clave es la cartera que ve (ej. ARMANDO, ADMINISTRACION).' },
    { k: 'inv', t: '🏭 Inventarios', roles: ROLES_INV },
    { k: 'rh', t: '👥 Recursos Humanos', roles: ROLES_RH }
  ];
  function panel(cont) {
    css();
    if (!S.perfil || S.perfil.prog !== 'master') { cont.innerHTML = '<p class="hint">Solo el master administra usuarios.</p>'; return; }
    var abiertos = {}; cont.querySelectorAll('details[data-k]').forEach(function (d) { if (d.open) abiertos[d.getAttribute('data-k')] = 1; });
    cont.innerHTML = '<p class="hint" style="margin-top:0">Cargando usuarios…</p>';
    Promise.all([leer('acceso/usuarios'), admin('roles', {}).then(function (j) { return j.roles || {}; }).catch(function () { return {}; })]).then(function (res) {
      var o = res[0] || {}, RS = res[1];
      var L = Object.keys(o).map(function (uid) { var u = Object.assign({ uid: uid }, o[uid]); u.inv = (RS[uid] || {}).inv || null; u.rh = (RS[uid] || {}).rh || null; return u; })
        .sort(function (a, b) { return String(a.nombre).localeCompare(String(b.nombre), 'es'); });
      var activos = L.filter(function (u) { return u.activo !== false; });
      var val = function (u, P) { return P.bool ? (u[P.k] === true) : (u[P.k] || null); };
      var etiqueta = function (P, v) { return P.bool ? P.bool : (P.clave ? v : (P.roles[v] || v)); };
      var opR = function (T, v) { return Object.keys(T).map(function (k) { return '<option value="' + k + '"' + (v === k ? ' selected' : '') + '>' + T[k] + '</option>'; }).join(''); };
      var h = '<p class="hint" style="margin-top:0">Abre un programa para ver <b>quién entra y con qué rol</b>. Cada persona usa el mismo usuario y contraseña en todos sus programas. Nadie (ni tú) puede ver contraseñas: si alguien la olvida, búscalo en <b>Personas</b> y toca Restablecer.</p>';
      PROGRAMAS.forEach(function (P) {
        var con = activos.filter(function (u) { return !!val(u, P); });
        h += '<details data-k="' + P.k + '" style="border:1px solid rgba(127,127,127,.3);border-radius:10px;margin:8px 0"' + (abiertos[P.k] ? ' open' : '') + '>' +
          '<summary style="cursor:pointer;padding:10px 12px;font-weight:800">' + P.t + ' <span style="font-weight:500;opacity:.7">· ' + con.length + ' persona' + (con.length === 1 ? '' : 's') + '</span></summary><div style="padding:0 12px 12px">' +
          (P.nota ? '<p class="hint" style="margin:0 0 6px">' + P.nota + '</p>' : '') + '<table class="acc19-t">';
        con.forEach(function (u) {
          var v = val(u, P), yo = u.uid === S.uid;
          var ctrl = P.roles ? '<select data-a="rol"' + (yo ? ' disabled' : '') + '>' + opR(P.roles, v) + '</select>'
            : P.clave ? '<input data-a="rol" style="width:150px" value="' + esc(v) + '"' + (yo ? ' disabled' : '') + '>' : esc(P.bool);
          h += '<tr data-uid="' + esc(u.uid) + '" data-k="' + P.k + '"><td><b>' + esc(u.nombre) + '</b> <span style="opacity:.6">' + esc(u.key) + '</span>' + (u.debeCambiar ? ' <span class="acc19-chip">debe cambiar</span>' : '') + '</td><td>' + ctrl + '</td><td style="white-space:nowrap;text-align:right">' +
            (yo ? '<span style="opacity:.6">tú</span>' : (P.bool ? '' : '<button data-a="guardar">Guardar</button>') + '<button data-a="quitar">Quitar</button>') + '</td></tr>';
        });
        if (!con.length) h += '<tr><td class="hint">Nadie todavía.</td></tr>';
        var sin = activos.filter(function (u) { return !val(u, P); });
        h += '</table><div class="acc19-f" data-k="' + P.k + '"><select data-a="quien"><option value="">＋ Dar acceso a…</option>' + sin.map(function (u) { return '<option value="' + esc(u.uid) + '">' + esc(u.nombre) + '</option>'; }).join('') + '</select>' +
          (P.roles ? '<select data-a="nrol">' + opR(P.roles, '') + '</select>' : P.clave ? '<input data-a="nrol" placeholder="clave, ej. ARMANDO" style="width:150px">' : '') +
          '<button data-a="dar">Dar acceso</button></div></div></details>';
      });
      // Personas: alta, contraseña, baja
      h += '<details data-k="personas" style="border:1px solid rgba(127,127,127,.3);border-radius:10px;margin:8px 0"' + (abiertos.personas ? ' open' : '') + '><summary style="cursor:pointer;padding:10px 12px;font-weight:800">🪪 Personas (alta, contraseña y baja) <span style="font-weight:500;opacity:.7">· ' + activos.length + ' activas</span></summary><div style="padding:0 12px 12px"><table class="acc19-t"><tr><th>Nombre / usuario</th><th>Programas</th><th>Estado</th><th></th></tr>';
      L.forEach(function (u) {
        var yo = u.uid === S.uid;
        var progs = PROGRAMAS.filter(function (P) { return !!val(u, P); }).map(function (P) { return P.t.replace(/^\S+\s/, '') + ' (' + esc(etiqueta(P, val(u, P))) + ')'; }).join(' · ') || '<span style="opacity:.6">ninguno</span>';
        h += '<tr data-uid="' + esc(u.uid) + '"' + (u.activo === false ? ' style="opacity:.5"' : '') + '><td><b>' + esc(u.nombre) + '</b><br><span style="opacity:.7">usuario: ' + esc(u.key) + '</span></td><td style="font-size:12px">' + progs + '</td><td>' +
          (u.activo === false ? 'Baja' : (u.debeCambiar ? '<span class="acc19-chip">Debe cambiar</span>' : 'Activo')) + '</td><td style="white-space:nowrap">' +
          (yo ? '<span style="opacity:.6">tú</span>' : '<button data-a="reset">Restablecer</button><button data-a="' + (u.activo === false ? 'alta' : 'baja') + '">' + (u.activo === false ? 'Reactivar' : 'Dar de baja') + '</button>') + '</td></tr>';
      });
      h += '</table><div class="acc19-f"><input id="acc19-nn" placeholder="Nombre completo de la persona nueva" style="min-width:220px">' +
        '<select id="acc19-np">' + PROGRAMAS.map(function (P) { return '<option value="' + P.k + '">' + P.t + '</option>'; }).join('') + '</select>' +
        '<span id="acc19-nrw"></span><button id="acc19-add">＋ Crear persona</button></div></div></details><div id="acc19-msg" class="hint" style="margin-top:8px"></div>';
      cont.innerHTML = h;

      var msg = function (t) { cont.querySelector('#acc19-msg').innerHTML = t; };
      var P_ = function (k) { return PROGRAMAS.filter(function (P) { return P.k === k; })[0]; };
      var nipDe = function (d) { return !d.prog && !d.ger && !d.inv && !d.rh; };
      var entrega = function (nombre, key, tmp, nip) {
        msg('✅ <b>' + esc(nombre) + '</b> · usuario <b>' + esc(key) + '</b> · ' + (nip ? 'NIP' : 'contraseña') + ' temporal <b style="font-size:15px;letter-spacing:1px">' + esc(tmp) + '</b><br>Dásela en persona. Al entrar le pedirá crear la suya. No se vuelve a mostrar.');
      };
      var dato = function (P, v) { var d = {}; d[P.k] = P.bool ? (v ? true : false) : (v || null); if (P.clave && d[P.k]) d[P.k] = String(d[P.k]).trim().toUpperCase(); return d; };
      var correr = function (b, p, ok) { b.disabled = true; p.then(ok || function () { panel(cont); }).catch(function (e) { msg('⚠️ ' + esc(e.message)); b.disabled = false; }); };
      // por programa
      cont.querySelectorAll('tr[data-k] button').forEach(function (b) {
        b.onclick = function () {
          var tr = b.closest('tr'), P = P_(tr.getAttribute('data-k')), uid = tr.getAttribute('data-uid'), a = b.getAttribute('data-a');
          var u = L.filter(function (x) { return x.uid === uid; })[0];
          if (a === 'quitar' && !confirm('¿Quitar a ' + u.nombre + ' de ' + P.t.replace(/^\S+\s/, '') + '?')) return;
          var v = a === 'quitar' ? null : (tr.querySelector('[data-a="rol"]') || {}).value;
          correr(b, admin('actualizar', Object.assign({ uid: uid }, dato(P, v))));
        };
      });
      cont.querySelectorAll('.acc19-f[data-k] button').forEach(function (b) {
        b.onclick = function () {
          var f = b.closest('.acc19-f'), P = P_(f.getAttribute('data-k')), uid = f.querySelector('[data-a="quien"]').value;
          if (!uid) { msg('Elige a la persona.'); return; }
          var v = P.bool ? true : (f.querySelector('[data-a="nrol"]') || {}).value;
          if (!v) { msg('Escribe la clave.'); return; }
          correr(b, admin('actualizar', Object.assign({ uid: uid }, dato(P, v))));
        };
      });
      // personas
      cont.querySelectorAll('tr[data-uid]:not([data-k]) button').forEach(function (b) {
        b.onclick = function () {
          var uid = b.closest('tr').getAttribute('data-uid'), u = L.filter(function (x) { return x.uid === uid; })[0], a = b.getAttribute('data-a');
          if (a === 'reset') {
            if (!confirm('¿Restablecer la contraseña de ' + u.nombre + '? La actual deja de servir.')) return;
            var nip = nipDe(u), tmp = temporal(nip);
            correr(b, admin('restablecer', { uid: uid, temporal: tmp }), function () { b.disabled = false; entrega(u.nombre, u.key, tmp, nip); });
          } else {
            if (a === 'baja' && !confirm('¿Dar de baja a ' + u.nombre + '? Ya no podrá entrar a ningún programa.')) return;
            correr(b, admin('actualizar', { uid: uid, activo: a === 'alta' }));
          }
        };
      });
      var rolNuevo = function () {
        var P = P_(cont.querySelector('#acc19-np').value), w = cont.querySelector('#acc19-nrw');
        w.innerHTML = P.roles ? '<select id="acc19-nr">' + opR(P.roles, '') + '</select>' : P.clave ? '<input id="acc19-nr" placeholder="clave, ej. ARMANDO" style="width:150px">' : '';
      };
      cont.querySelector('#acc19-np').onchange = rolNuevo; rolNuevo();
      cont.querySelector('#acc19-add').onclick = function () {
        var n = cont.querySelector('#acc19-nn').value.trim(), P = P_(cont.querySelector('#acc19-np').value), r = cont.querySelector('#acc19-nr');
        if (!n) { msg('Escribe el nombre.'); return; }
        var d = dato(P, P.bool ? true : (r && r.value));
        if (!d[P.k]) { msg('Escribe la clave.'); return; }
        var nip = nipDe(d), tmp = temporal(nip), bt = this;
        correr(bt, admin('crear', Object.assign({ nombre: n, temporal: tmp }, d)), function (j) {
          panel(cont); setTimeout(function () { var m = cont.querySelector('#acc19-msg'); if (m) entrega(n, j.key, tmp, nip); }, 500);
        });
      };
    }).catch(function (e) { cont.innerHTML = '<p class="hint">No se pudieron leer los usuarios: ' + esc(e.message) + '</p>'; });
  }

  W.Acceso19H = {
    iniciar: iniciar, app: function () { return S.app; }, db: function () { return S.db; },
    directorio: directorio, entrar: entrar, sesionActual: sesionActual, salir: salir, vigilar: vigilar,
    cambiar: cambiar, pedirCambio: pedirCambio, admin: admin, token: token, panel: panel,
    puerta: puerta, esperarSesion: esperarSesion, ROLES_INV: ROLES_INV, ROLES_RH: ROLES_RH, tokenGuardado: tokenGuardado, appCheckToken: appCheckToken, ROLES_GER: ROLES_GER,
    perfil: function () { return S.perfil; }, clave: clave, ROLES_PROG: ROLES_PROG
  };
})(window);
