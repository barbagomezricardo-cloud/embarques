/* ================================================================
   Panel «Clientes» para el personal — se incrusta en tus apps:
     vendedor.html (vendedores y la cuenta ADMINISTRACIÓN),
     ventas.html y maestra.html (gerencia),
     programador.html (pestaña Fletes y precios).
   Cada persona entra con su usuario + PIN (los das de alta tú con la
   llave maestra). Lo que ve y puede hacer lo decide su rol en el
   servidor, no la app donde se abre.
   Uso:  <script src="clientes/config.js"></script>
         <script src="clientes/cli-staff.js" defer></script>
   ================================================================ */
(function (W, D) {
  'use strict';
  if (W.CliStaff) return;
  var CFG = W.CLI_CFG || {};
  var SCRIPT = D.currentScript;
  var BASE = SCRIPT ? SCRIPT.src.replace(/[^/]*$/, '') : 'clientes/';
  var QS = new URLSearchParams(location.search);
  var DEMO = QS.get('clidemo') === '1' || QS.get('demo') === '1';
  // En programador.html el módulo usa la MISMA contraseña de superusuario/master de esa app.
  var MODO_PROG = !!(SCRIPT && SCRIPT.dataset.modo === 'programador');
  var LS_SES = 'cliStaffSes' + (MODO_PROG ? 'Prog' : '') + (DEMO ? 'Demo' : '');
  var S = { ses: null, yo: null, bandeja: null, tab: 'pedidos', filtro: null, abierto: false, ultimoConteo: -1, fletes: null, montajes: [], maestra: '' };
  var VEH = ['NISSAN', 'ISUZU', 'TORTON', 'TRAILER'];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n, d) { return (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function money(n) { return '$' + fmt(n, 2); }
  function fh(ts) { if (!ts) return '—'; var d = new Date(ts); return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }); }
  function hace(ts) { if (!ts) return 'nunca'; var m = Math.round((Date.now() - ts) / 60000); if (m < 60) return 'hace ' + m + ' min'; var h = Math.round(m / 60); if (h < 48) return 'hace ' + h + ' h'; return 'hace ' + Math.round(h / 24) + ' días'; }
  function lsg(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lss(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function $(s, c) { return (c || D).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || D).querySelectorAll(s)); }
  function keyp(s) { return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function wa(tel, txt) { var d = String(tel || '').replace(/\D/g, ''); if (d.length === 10) d = '52' + d; return 'https://wa.me/' + d + '?text=' + encodeURIComponent(txt || ''); }
  function cargar(url) { return new Promise(function (ok, ko) { if (D.querySelector('script[src="' + url + '"]')) return ok(); var s = D.createElement('script'); s.src = url; s.onload = ok; s.onerror = function () { ko(new Error('No cargó ' + url)); }; D.head.appendChild(s); }); }
  function toast(t, malo) { $$('.clis-toast').forEach(function (x) { x.remove(); }); var e = D.createElement('div'); e.className = 'clis-toast' + (malo ? ' malo' : ''); e.textContent = t; D.body.appendChild(e); setTimeout(function () { e.remove(); }, 3600); }

  /* ---------- estilos (todo con prefijo clis-, no toca la app anfitriona) ---------- */
  function estilos() {
    if ($('#clis-css')) return;
    var c = D.createElement('style'); c.id = 'clis-css';
    c.textContent = [
      '.clis{--r:#DE0A14;--ro:#A80810;--rs:#FDE8E9;--t:#281E12;--t2:#5A4E42;--t3:#8C8178;--p:#FBF7F2;--b:#fff;--l:#EADFD3;--l2:#F3ECE4;--ok:#1D7A45;--oks:#E3F3EA;--w:#A35F00;--ws:#FCF0DC;--i:#1F4E8C;--is:#E6EEF9;font:14px/1.45 "Public Sans",system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--t);text-align:left}',
      '.clis.oscuro{--t:#F1E9DF;--t2:#CABdb0;--t3:#998d81;--p:#14100c;--b:#1f1913;--l:#3a3027;--l2:#2a221a;--rs:#3b1214;--oks:#16301f;--ok:#5cc98a;--ws:#33270f;--w:#f0b357;--is:#172438;--i:#8fb4ea}',
      '.clis *{box-sizing:border-box}',
      '.clis-fab{position:fixed;left:14px;bottom:14px;z-index:99990;border:0;border-radius:999px;background:#DE0A14;color:#fff;font:800 14px "Archivo","Public Sans",system-ui,sans-serif;padding:11px 16px 11px 12px;display:flex;gap:8px;align-items:center;box-shadow:0 8px 24px rgba(168,8,16,.35);cursor:pointer}',
      '.clis-fab img{width:26px;height:26px;border-radius:50%;background:#fff}',
      '.clis-fab b{background:#fff;color:#DE0A14;border-radius:99px;min-width:22px;height:22px;display:inline-grid;place-items:center;font-size:12px;padding:0 6px}',
      '.clis-fab b[hidden]{display:none}','body.gated .clis-fab,body.locked .clis-fab{display:none}',
      '.clis-velo{position:fixed;inset:0;z-index:99991;background:rgba(20,14,8,.45);display:flex;justify-content:flex-end}',
      '.clis-panel{width:min(980px,100%);height:100%;background:var(--p);display:flex;flex-direction:column;box-shadow:-10px 0 40px rgba(0,0,0,.25)}',
      '.clis-cab{background:var(--r);color:#fff;padding:12px 14px;display:flex;align-items:center;gap:10px}',
      '.clis-cab img{width:38px;height:38px;border-radius:50%;background:#fff;padding:2px}',
      '.clis-cab .t{flex:1;min-width:0}.clis-cab .t b{display:block;font:900 16px "Archivo",system-ui,sans-serif;text-transform:uppercase;letter-spacing:.02em}.clis-cab .t span{font-size:12px;opacity:.9}',
      '.clis-x{border:0;background:rgba(255,255,255,.16);color:#fff;border-radius:10px;width:38px;height:38px;font-size:20px;cursor:pointer}',
      '.clis-tabs{display:flex;gap:4px;padding:8px 10px 0;background:var(--b);border-bottom:1px solid var(--l);overflow-x:auto}',
      '.clis-tabs button{border:0;background:none;padding:9px 12px;font:700 13.5px inherit;font-family:inherit;color:var(--t2);border-bottom:3px solid transparent;cursor:pointer;white-space:nowrap}',
      '.clis-tabs button[aria-selected=true]{color:var(--r);border-bottom-color:var(--r)}',
      '.clis-tabs .n{background:var(--r);color:#fff;border-radius:99px;padding:0 6px;font-size:11px;margin-left:4px}',
      '.clis-cuerpo{flex:1;overflow:auto;padding:14px;display:grid;gap:12px;align-content:start}',
      '.clis-card{background:var(--b);border:1px solid var(--l);border-radius:14px;padding:14px;display:grid;gap:8px}',
      '.clis h3{margin:0;font:800 16px "Archivo",system-ui,sans-serif}',
      '.clis h4{margin:0;font:800 14px "Archivo",system-ui,sans-serif}',
      '.clis-mut{color:var(--t2)}.clis-mini{font-size:12px;color:var(--t3)}',
      '.clis-entre{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}',
      '.clis-fila{display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
      '.clis-btn{border:0;border-radius:10px;padding:9px 13px;font:800 13.5px inherit;font-family:inherit;background:var(--r);color:#fff;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:6px;min-height:38px}',
      '.clis-btn.sec{background:var(--b);color:var(--t);border:1.5px solid var(--l)}',
      '.clis-btn.ok{background:var(--ok)}.clis-btn.wa{background:#1FA855}.clis-btn.ghost{background:none;color:var(--r);padding:6px 8px}',
      '.clis-btn[disabled]{opacity:.5;pointer-events:none}',
      '.clis input,.clis select,.clis textarea{font:inherit;color:var(--t);background:var(--b);border:1.5px solid var(--l);border-radius:9px;padding:8px 10px;min-height:38px;max-width:100%}',
      '.clis textarea{width:100%;min-height:64px}','.clis input:disabled,.clis select:disabled{opacity:.5;background:transparent;border-style:dashed}',
      '.clis label.c{display:grid;gap:4px;font-size:12.5px;font-weight:700;color:var(--t2)}',
      '.clis-chips{display:flex;gap:6px;flex-wrap:wrap}',
      '.clis-chips button{border:1.5px solid var(--l);background:var(--b);border-radius:99px;padding:6px 11px;font:700 12.5px inherit;font-family:inherit;color:var(--t2);cursor:pointer}',
      '.clis-chips button[aria-pressed=true]{background:var(--t);color:var(--p);border-color:var(--t)}',
      '.clis-chips button b{margin-left:4px}',
      '.clis-badge{font:800 11px "Archivo",system-ui,sans-serif;text-transform:uppercase;letter-spacing:.04em;padding:3px 8px;border-radius:99px;white-space:nowrap}',
      '.clis-b-enviado{background:var(--ws);color:var(--w)}.clis-b-confirmado{background:var(--is);color:var(--i)}.clis-b-fincado{background:var(--oks);color:var(--ok)}.clis-b-liberado{background:var(--rs);color:var(--r)}.clis-b-facturado{background:var(--oks);color:var(--ok)}.clis-b-rechazado,.clis-b-cancelado{background:var(--l2);color:var(--t3)}',
      '.clis-b-pendiente{background:var(--ws);color:var(--w)}.clis-b-activo{background:var(--oks);color:var(--ok)}.clis-b-suspendido,.clis-b-rechazadoU{background:var(--l2);color:var(--t3)}',
      '.clis-items{border-top:1px dashed var(--l);padding-top:6px;display:grid;gap:3px}',
      '.clis-items input{width:76px;min-height:32px;padding:4px 6px;text-align:right}',
      '.clis-sello{display:inline-flex;align-items:center;gap:6px;background:var(--oks);color:var(--ok);border:2px solid var(--ok);border-radius:10px;padding:5px 10px;font:900 13px "Archivo",system-ui,sans-serif}',
      '.clis-aviso{border-radius:10px;padding:9px 11px;font-size:13px}.clis-aviso.w{background:var(--ws);color:var(--w)}.clis-aviso.i{background:var(--is);color:var(--i)}.clis-aviso.o{background:var(--oks);color:var(--ok)}.clis-aviso.r{background:var(--rs);color:var(--r)}',
      '.clis-tabla{width:100%;border-collapse:collapse;font-size:12.5px}',
      '.clis-tabla th{position:sticky;top:0;background:var(--b);text-align:right;color:var(--t3);font-size:11px;padding:6px;border-bottom:1px solid var(--l);white-space:nowrap}',
      '.clis-tabla td{padding:4px 6px;border-bottom:1px solid var(--l2);text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}',
      '.clis-tabla th:first-child,.clis-tabla td:first-child{text-align:left}',
      '.clis-tabla input,.clis-tabla select{min-height:30px;padding:3px 6px;width:84px;text-align:right}','.clis-tabla select{width:100px;text-align:left}','.clis-tabla input[data-k=valor]{width:100px}',
      '.clis-tabla td.d input{width:170px;text-align:left}',
      '.clis-tabla tr.mal td{background:var(--rs)}',
      '.clis-scroll{overflow:auto;max-height:62vh;border:1px solid var(--l);border-radius:10px}',
      '.clis-sw{display:flex;align-items:center;gap:10px;cursor:pointer;font-weight:700}',
      '.clis-sw input{width:46px;height:26px;appearance:none;-webkit-appearance:none;background:var(--l);border-radius:99px;position:relative;cursor:pointer;border:0;min-height:0;padding:0;transition:background .2s}',
      '.clis-sw input::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:left .2s;box-shadow:0 1px 3px rgba(0,0,0,.3)}',
      '.clis-sw input:checked{background:var(--ok)}.clis-sw input:checked::after{left:23px}',
      '.clis-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99999;background:#281E12;color:#FBF7F2;padding:10px 16px;border-radius:10px;font:600 14px system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.3);max-width:90vw}',
      '.clis-toast.malo{background:#A80810}',
      '.clis-login{max-width:380px;margin:30px auto;display:grid;gap:12px;text-align:center}',
      '.clis-login img{width:96px;margin:0 auto}',
      '.clis-grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}',
      '.clis-linea{display:flex;gap:3px}.clis-linea i{flex:1;height:5px;border-radius:9px;background:var(--l)}.clis-linea i.on{background:var(--r)}.clis-linea i.fin{background:var(--ok)}',
      '.clis-inline{border-radius:14px;overflow:hidden;border:1px solid var(--l)}',
      '.clis-inline .clis-cuerpo{overflow:visible}',
      '.clis table{min-width:0!important}','.clis label{text-transform:none!important;letter-spacing:normal!important}','.clis-inline.oscuro{--p:transparent;--b:rgba(255,255,255,.035);--l:rgba(255,255,255,.12);--l2:rgba(255,255,255,.06)}','.clis-inline.oscuro .clis-tabla th{background:#121a26}',
      '.clis :focus-visible{outline:3px solid #F7B3B6;outline-offset:2px}',
      '@media (max-width:640px){.clis-fab span{display:none}.clis-cuerpo{padding:10px}}'
    ].join('\n');
    D.head.appendChild(c);
    if (!$('link[href*="family=Archivo"]')) { var l = D.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Archivo:wght@700;800;900&family=Public+Sans:wght@400;600;700&display=swap'; D.head.appendChild(l); }
  }
  function oscuroHost() {
    try { var bg = getComputedStyle(D.body).backgroundColor; var m = bg.match(/\d+/g); if (!m || (m.length > 3 && Number(m[3]) === 0)) return W.matchMedia && W.matchMedia('(prefers-color-scheme: dark)').matches; var L = (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; return L < 0.45; } catch (e) { return false; }
  }

  /* ---------- conexión ---------- */
  function api(modo, accion, datos) {
    var ses = S.ses && S.ses.token;
    if (DEMO) return W.CliDemo.api(modo, accion, datos || {}, { sesion: ses }).catch(manejaErr);
    var h = { 'Content-Type': 'application/json' };
    if (modo === 'staff') h['X-Cli-Sesion'] = ses || '';
    if (modo === 'maestro') h['X-Cli-Maestro'] = S.maestra || '';
    return fetch(CFG.api, { method: 'POST', headers: h, body: JSON.stringify({ modo: modo, accion: accion, datos: datos || {} }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw { status: r.status, error: j.error || 'Error', code: j.code }; return j; }); },
        function () { throw { status: 0, error: 'Sin conexión con el servidor.' }; })
      .catch(manejaErr);
  }
  function manejaErr(e) {
    if (e && e.status === 401 && e.code === 'sin_sesion') { S.ses = null; lss(LS_SES, null); pintar(); }
    throw e;
  }
  function listo() { return DEMO ? cargar(BASE + 'cli-core.js').then(function () { return cargar(BASE + 'cli-demo.js'); }) : Promise.resolve(); }

  /* ---------- sesión ---------- */
  function cargarSesion() { try { var s = JSON.parse(lsg(LS_SES) || 'null'); if (s && (!s.exp || s.exp > Date.now())) S.ses = s; } catch (e) {} }
  function usuarioSugerido() { var h = (location.hash || '').match(/[#&]v=([^&]+)/); return h ? decodeURIComponent(h[1]) : (W.CLI_STAFF_USUARIO || ''); }
  function guardaSesion(r) { S.ses = { token: r.token, yo: r.yo, exp: r.exp || 0 }; lss(LS_SES, JSON.stringify(S.ses)); S.filtro = null; S.bandeja = null; S.ultimoConteo = -1; }
  function formLogin(cont, alEntrar) {
    if (MODO_PROG) {
      cont.innerHTML = '<div class="clis-login"><img src="' + BASE + 'img/logo-petfood.png" alt=""><h3>Fletes y clientes</h3><p class="clis-mut" style="margin:0">Escribe tu contraseña de superusuario o master del programador.</p>' +
        '<input id="clis-p" type="password" placeholder="Contraseña" autocomplete="current-password"><div class="clis-mini" id="clis-e" style="color:var(--r);min-height:1em"></div><button class="clis-btn" id="clis-in">Entrar</button></div>';
      var goP = function () { var b = $('#clis-in', cont); b.disabled = true; api('loginProg', '', { pwd: $('#clis-p', cont).value }).then(function (r) { guardaSesion(r); alEntrar(); }).catch(function (e) { b.disabled = false; $('#clis-e', cont).textContent = e.error || 'No se pudo entrar.'; }); };
      $('#clis-in', cont).onclick = goP; $('#clis-p', cont).onkeydown = function (e) { if (e.key === 'Enter') goP(); };
      return;
    }
    cont.innerHTML = '<div class="clis-login"><img src="' + BASE + 'img/logo-petfood.png" alt="Los 19 Hermanos División Pet Food"><h3>Clientes · acceso del personal</h3><p class="clis-mut" style="margin:0">Entra con tu usuario y el PIN que te asignó la gerencia.</p>' +
      '<input id="clis-u" placeholder="Usuario" autocomplete="username" value="' + esc(lsg('cliStaffUlt') || usuarioSugerido()) + '">' +
      '<input id="clis-p" placeholder="PIN" inputmode="numeric" type="password" autocomplete="current-password" maxlength="8">' +
      '<div class="clis-mini" id="clis-e" style="color:var(--r);min-height:1em"></div><button class="clis-btn" id="clis-in">Entrar</button>' +
      (DEMO ? '<div class="clis-aviso i">Demostración: usuarios DEMO (vendedor), ADMINISTRACION, PROGRAMACION, GERENCIA · PIN 123456</div>' : '') + '</div>';
    var go = function () {
      var u = $('#clis-u', cont).value.trim(), p = $('#clis-p', cont).value.trim(); var b = $('#clis-in', cont); b.disabled = true;
      api('login', '', { usuario: u, pin: p }).then(function (r) { S.ses = { token: r.token, yo: r.yo, exp: r.exp || 0 }; lss(LS_SES, JSON.stringify(S.ses)); lss('cliStaffUlt', u); alEntrar(); })
        .catch(function (e) { b.disabled = false; $('#clis-e', cont).textContent = e.error || 'No se pudo entrar.'; });
    };
    $('#clis-in', cont).onclick = go; $('#clis-p', cont).onkeydown = function (e) { if (e.key === 'Enter') go(); };
  }

  /* ---------- botón flotante + bandeja ---------- */
  function fab() {
    if ($('.clis-fab')) return;
    var b = D.createElement('button'); b.className = 'clis clis-fab'; b.type = 'button'; b.setAttribute('aria-label', 'Pedidos y registros de clientes');
    b.innerHTML = '<img src="' + BASE + 'img/logo-petfood.png" alt=""><span>Clientes</span><b class="clis-n" hidden></b>';
    b.onclick = abrir; D.body.appendChild(b);
  }
  function pendientesDe(bd) {
    if (!bd) return 0; var r = bd.yo.rol, c = bd.cont || {};
    if (r === 'vendedor') return c.enviado || 0;
    if (r === 'admin') return (c.confirmado || 0) + (bd.pendientesRegistro || 0);
    if (r === 'gerencia') return (c.enviado || 0) + (c.confirmado || 0) + (bd.pendientesRegistro || 0) + (bd.mensajesSinLeer || 0);
    return 0;
  }
  function refrescarBandeja(silencio) {
    if (!S.ses) return Promise.resolve();
    return api('staff', 'bandeja', {}).then(function (bd) {
      S.bandeja = bd; S.yo = bd.yo;
      var n = pendientesDe(bd);
      var el = $('.clis-fab .clis-n'); if (el) { el.hidden = !n; el.textContent = n; }
      var cambio = n !== S.ultimoConteo;
      if (S.ultimoConteo >= 0 && n > S.ultimoConteo) avisar(bd);
      S.ultimoConteo = n;
      // Con el panel abierto solo se repinta si llegó algo nuevo y nadie está escribiendo.
      var escribiendo = D.activeElement && D.activeElement.closest && D.activeElement.closest('.clis-cuerpo') && /INPUT|TEXTAREA|SELECT/.test(D.activeElement.tagName);
      if (S.abierto && !silencio) pintar();
      else if (S.abierto && cambio && S.tab === 'pedidos' && !escribiendo) pintar();
    }).catch(function () {});
  }
  function avisar(bd) {
    var r = bd.yo.rol, msg = r === 'vendedor' ? 'Tienes un prepedido nuevo por confirmar' : (r === 'admin' ? 'Hay un pedido confirmado por fincar en Odoo' : 'Hay movimiento nuevo de clientes');
    toast('🔔 ' + msg);
    try { var a = new (W.AudioContext || W.webkitAudioContext)(); var o = a.createOscillator(); var g = a.createGain(); o.frequency.value = 880; g.gain.value = 0.08; o.connect(g); g.connect(a.destination); o.start(); setTimeout(function () { o.stop(); a.close(); }, 220); } catch (e) {}
    try { if ('Notification' in W && Notification.permission === 'granted' && D.hidden) new Notification('Los 19 Hermanos · Clientes', { body: msg, icon: BASE + 'img/icono-192.png' }); } catch (e) {}
  }

  /* ---------- panel ---------- */
  function abrir() {
    S.abierto = true;
    var v = D.createElement('div'); v.className = 'clis clis-velo' + (oscuroHost() ? ' oscuro' : ''); v.id = 'clis-velo';
    v.innerHTML = '<div class="clis-panel" role="dialog" aria-modal="true" aria-label="Clientes"><div class="clis-cab"><img src="' + BASE + 'img/logo-petfood.png" alt=""><div class="t"><b>Clientes</b><span id="clis-quien"></span></div><button class="clis-x" id="clis-salir" title="Cerrar sesión" style="width:auto;padding:0 10px;font:700 12.5px system-ui,sans-serif">Salir</button><button class="clis-x" id="clis-cerrar" aria-label="Cerrar">×</button></div><nav class="clis-tabs" id="clis-tabs" role="tablist"></nav><div class="clis-cuerpo" id="clis-cuerpo"></div></div>';
    v.onclick = function (e) { if (e.target === v) cerrar(); };
    D.body.appendChild(v);
    $('#clis-cerrar').onclick = cerrar;
    $('#clis-salir').onclick = function () { if (!confirm('¿Cerrar tu sesión del módulo Clientes en este equipo?')) return; S.ses = null; S.bandeja = null; S.filtro = null; S.tab = 'pedidos'; S.ultimoConteo = -1; lss(LS_SES, null); pintar(); };
    D.addEventListener('keydown', escTecla);
    try { if ('Notification' in W && Notification.permission === 'default') Notification.requestPermission(); } catch (e) {}
    pintar();
  }
  function escTecla(e) { if (e.key === 'Escape') cerrar(); }
  function cerrar() { S.abierto = false; var v = $('#clis-velo'); if (v) v.remove(); D.removeEventListener('keydown', escTecla); }
  function tabsDe(rol) {
    var t = [['pedidos', 'Pedidos'], ['registros', 'Registros']];
    if (rol === 'gerencia') t.push(['mensajes', 'Mensajes']);
    if (rol === 'programacion' || rol === 'gerencia') t.push(['fletes', 'Fletes y precios']);
    if (rol === 'programacion' || rol === 'progmaster') t = [['fletes', 'Fletes y precios'], ['pedidos', 'Pedidos']];
    t.push(['accesos', '🔑 Accesos']);
    return t;
  }
  function pintar() {
    var cuerpo = $('#clis-cuerpo'); if (!cuerpo) return;
    var tabs = $('#clis-tabs');
    if (!S.ses) { $('#clis-quien').textContent = 'Acceso del personal'; tabs.innerHTML = ''; formLogin(cuerpo, function () { S.filtro = null; S.bandeja = null; S.ultimoConteo = -1; refrescarBandeja(true).then(pintar); }); return; }
    var yo = S.ses.yo || {}; $('#clis-quien').textContent = (yo.nombre || yo.u) + ' · ' + ({ vendedor: 'Vendedor', admin: 'Administración', programacion: 'Superusuario', progmaster: 'Master', gerencia: 'Gerencia' }[yo.rol] || '');
    var T = tabsDe(yo.rol); if (!T.some(function (x) { return x[0] === S.tab; })) S.tab = T[0][0];
    var bd = S.bandeja || {};
    tabs.innerHTML = T.map(function (x) {
      var n = x[0] === 'pedidos' ? pendientesDe(Object.assign({}, bd, { pendientesRegistro: 0, mensajesSinLeer: 0 })) : x[0] === 'registros' ? (bd.pendientesRegistro || 0) : x[0] === 'mensajes' ? (bd.mensajesSinLeer || 0) : 0;
      return '<button role="tab" aria-selected="' + (S.tab === x[0]) + '" data-t="' + x[0] + '">' + x[1] + (n ? '<span class="n">' + n + '</span>' : '') + '</button>';
    }).join('');
    $$('button', tabs).forEach(function (b) { b.onclick = function () { S.tab = b.dataset.t; pintar(); }; });
    if (!S.bandeja) { cuerpo.innerHTML = '<div class="clis-mut">Cargando…</div>'; refrescarBandeja(true).then(pintarCuerpo); return; }
    pintarCuerpo();
  }
  function pintarCuerpo() {
    var c = $('#clis-cuerpo'); if (!c || !S.ses) return;
    var f = { pedidos: vPedidos, registros: vRegistros, mensajes: vMensajes, fletes: vFletes, accesos: vAccesos }[S.tab] || vPedidos;
    f(c);
  }

  /* ================= PEDIDOS ================= */
  var FILTROS = [['enviado', 'Por confirmar'], ['confirmado', 'Por fincar en Odoo'], ['fincado', 'Fincados · en carga'], ['liberado', 'Liberados · en facturación'], ['cerrados', 'Cerrados']];
  function vPedidos(c) {
    var bd = S.bandeja, rol = bd.yo.rol, peds = bd.pedidos || [];
    if (!S.filtro) S.filtro = rol === 'admin' ? 'confirmado' : (rol === 'programacion' ? 'fincado' : 'enviado');
    var cuenta = function (k) { return peds.filter(function (p) { return k === 'cerrados' ? ['facturado', 'rechazado', 'cancelado'].indexOf(p.estado) >= 0 : p.estado === k; }).length; };
    var h = '<div class="clis-entre"><div class="clis-chips" role="group" aria-label="Filtrar">' + FILTROS.map(function (x) { return '<button data-f="' + x[0] + '" aria-pressed="' + (S.filtro === x[0]) + '">' + x[1] + '<b>' + cuenta(x[0]) + '</b></button>'; }).join('') + '</div>' +
      '<button class="clis-btn sec" id="clis-act">Actualizar</button></div>';
    if (DEMO && rol !== 'vendedor') h += '<div class="clis-aviso i">Demostración: en «Fincados» puedes simular que Cargadores finaliza la unidad, y en «Liberados» que ventas publica la facturación.</div>';
    var lista = peds.filter(function (p) { return S.filtro === 'cerrados' ? ['facturado', 'rechazado', 'cancelado'].indexOf(p.estado) >= 0 : p.estado === S.filtro; });
    if (!lista.length) h += '<div class="clis-card clis-mut" style="text-align:center">Nada en esta sección.</div>';
    lista.forEach(function (p) { h += tarjetaPedido(p, rol); });
    c.innerHTML = h;
    $$('[data-f]', c).forEach(function (b) { b.onclick = function () { S.filtro = b.dataset.f; vPedidos(c); }; });
    $('#clis-act', c).onclick = function () { refrescarBandeja(true).then(function () { vPedidos(c); toast('Actualizado'); }); };
    enlazarPedidos(c);
  }
  function tarjetaPedido(p, rol) {
    var orden = ['enviado', 'confirmado', 'fincado', 'liberado', 'facturado']; var i = orden.indexOf(p.estado);
    var et = { enviado: 'Por confirmar', confirmado: 'Confirmado', fincado: 'Fincado en Odoo', liberado: 'Liberado', facturado: 'Facturado', rechazado: 'Rechazado', cancelado: 'Cancelado por cliente' }[p.estado];
    var editable = p.estado === 'enviado' && (rol === 'vendedor' || rol === 'admin' || rol === 'gerencia');
    var h = '<article class="clis-card" data-id="' + p.id + '"><div class="clis-entre"><div><h4>' + esc(p.folio) + ' · ' + esc(p.skanName || p.razonSocial) + '</h4><div class="clis-mini">' + fh(p.creado) + ' · ' + esc(p.contacto) + ' · ' + esc(p.vendedorNombre || '') + '</div></div><span class="clis-badge clis-b-' + p.estado + '">' + et + '</span></div>';
    if (i >= 0) h += '<div class="clis-linea">' + orden.map(function (x, k) { return '<i class="' + (k <= i ? (p.estado === 'facturado' ? 'fin' : 'on') : '') + '"></i>'; }).join('') + '</div>';
    h += '<div class="clis-fila clis-mini"><b style="color:var(--t)">' + esc(p.entregaLabel || (p.modalidad === 'recoge' ? 'Recoge en planta' : 'Entrega')) + '</b>' + (p.negocio && p.negocio.lat ? ' · <a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + p.negocio.lat + ',' + p.negocio.lng + '">ver ubicación</a>' : '') + (p.negocio && p.negocio.dir ? ' · ' + esc(p.negocio.dir) : '') + '</div>';
    h += '<div class="clis-items">' + p.items.map(function (it) {
      return '<div class="clis-entre"><span>' + (editable ? '<input type="number" min="0" data-q="' + esc(it.code) + '" value="' + it.piezas + '" aria-label="Sacos de ' + esc(it.nombre) + '"> × ' : fmt(it.piezas) + ' × ') + esc(it.nombre) + '</span>' + (it.conIva ? '<span class="clis-mini">' + money(it.conIva) + ' c/u</span>' : '') + '</div>';
    }).join('') + '<div class="clis-entre"><b>' + fmt(p.items.reduce(function (a, x) { return a + x.piezas; }, 0)) + ' sacos</b>' + (p.totales ? '<b>' + money(p.totales.total) + ' con IVA</b>' : '') + '</div></div>';
    if (p.ajustado) h += '<div class="clis-aviso w">Cantidades ajustadas al confirmar (original: ' + (p.itemsOriginal || []).map(function (x) { return x.piezas + ' ' + x.nombre; }).join(', ') + ').</div>';
    if (p.nota) h += '<div class="clis-aviso i"><b>Nota del cliente:</b> ' + esc(p.nota) + '</div>';
    if (p.notaVendedor) h += '<div class="clis-mini"><b>Nota del vendedor:</b> ' + esc(p.notaVendedor) + '</div>';
    if (p.confirmadoPor) h += '<div class="clis-mini">Confirmado por ' + esc(p.confirmadoPor) + ' · ' + fh(p.confirmadoTs) + '</div>';
    if (p.remision) h += '<div class="clis-fila"><span class="clis-sello">✓ Fincado en Odoo · ' + esc(p.remision) + '</span><span class="clis-mini">por ' + esc(p.fincadoPor || '') + ' · ' + fh(p.fincadoTs) + '</span>' + ((rol === 'admin' || rol === 'gerencia') && ['fincado', 'liberado', 'facturado'].indexOf(p.estado) >= 0 ? '<button class="clis-btn ghost" data-acc="remision">Editar número</button>' : '') + '</div>';
    if (p.remHist && p.remHist.length) h += '<div class="clis-mini">Cambios de número: ' + p.remHist.map(function (r) { return esc(r.de) + ' → ' + esc(r.a) + ' (' + esc(r.motivo) + ', ' + esc(r.por) + ')'; }).join('; ') + '</div>';
    if (p.liberacion) h += '<div class="clis-aviso o"><b>Liberado ' + esc((p.liberacion.fecha || '').split('-').reverse().join('/')) + ' ' + esc(p.liberacion.hora || '') + '</b>' + (p.liberacion.unidad ? ' · ' + esc(p.liberacion.unidad) : '') + ' · ' + (p.liberacion.origen === 'cargadores' ? 'por Cargadores' : 'manual') + '<br>' + (p.liberacion.lotes || []).map(function (l) { return esc(l.prod) + ' · lote ' + esc(l.lote) + ' · ' + l.sacos + ' sacos'; }).join('<br>') + '</div>';
    if (p.motivo) h += '<div class="clis-aviso r"><b>Motivo:</b> ' + esc(p.motivo) + '</div>';
    // contacto
    var tel = p.telContacto || p.tel;
    h += '<div class="clis-fila"><a class="clis-btn sec" href="tel:' + esc(tel) + '">📞 ' + esc(tel) + '</a><a class="clis-btn wa" target="_blank" rel="noopener" href="' + wa(tel, 'Hola ' + (p.contacto || '').split(' ')[0] + ', te llamo de Los 19 Hermanos por tu prepedido ' + p.folio + '.') + '">WhatsApp al cliente</a></div>';
    // acciones
    if (editable) h += '<input data-nota placeholder="Nota interna (opcional)" style="width:100%"><div class="clis-fila"><button class="clis-btn ok" data-acc="confirmar">✓ Ya lo validé por teléfono · Confirmar</button><button class="clis-btn sec" data-acc="rechazar">Rechazar</button></div>';
    if (p.estado === 'confirmado' && (rol === 'admin' || rol === 'gerencia')) h += '<div class="clis-fila"><input data-rem placeholder="No. de pedido / remisión en Odoo" style="flex:1;min-width:200px"><button class="clis-btn ok" data-acc="fincar">Ya lo fincamos en Odoo</button><button class="clis-btn sec" data-acc="rechazar">Cancelar</button></div><div class="clis-mini">Usa el mismo número que Programación capture en el embarque: con él la app reconoce la salida de Cargadores y avisa al cliente.</div>';
    if (p.estado === 'confirmado' && rol === 'vendedor') h += '<a class="clis-btn wa" target="_blank" rel="noopener" href="' + wa(S.bandeja.waAdmin, 'Confirmé el prepedido ' + p.folio + ' de ' + (p.skanName || '') + ' (' + p.items.map(function (x) { return x.piezas + ' ' + x.nombre; }).join(', ') + '). ¿Me ayudan a fincarlo en Odoo?') + '">Avisar a Administración por WhatsApp</a>';
    if (p.estado === 'fincado' && (rol === 'admin' || rol === 'gerencia' || rol === 'programacion')) h += '<div class="clis-fila"><span class="clis-mini" style="flex:1">Se libera solo cuando Cargadores finaliza la unidad con el pedido <b>' + esc(p.remision) + '</b>.</span><button class="clis-btn sec" data-acc="liberar">Liberar manualmente</button>' + (DEMO ? '<button class="clis-btn" data-acc="simCarga">Simular Cargadores</button>' : '') + '</div>';
    if (p.estado === 'liberado' && (rol === 'admin' || rol === 'gerencia')) h += '<div class="clis-fila"><span class="clis-mini" style="flex:1">Se marca facturado solo cuando ventas publica la facturación que lo incluye.</span><button class="clis-btn sec" data-acc="facturado">Marcar facturado</button>' + (DEMO ? '<button class="clis-btn" data-acc="simFact">Simular facturación</button>' : '') + '</div>';
    return h + '</article>';
  }
  function enlazarPedidos(c) {
    $$('[data-acc]', c).forEach(function (b) {
      b.onclick = function () {
        var card = b.closest('[data-id]'), id = card.dataset.id, acc = b.dataset.acc;
        var p = (S.bandeja.pedidos || []).filter(function (x) { return x.id === id; })[0];
        var hecho = function (t) { toast(t); return refrescarBandeja(true).then(pintarCuerpo); };
        var falla = function (e) { b.disabled = false; toast(e.error || 'No se pudo', true); };
        if (acc === 'confirmar') {
          var items = $$('[data-q]', card).map(function (i) { return { code: i.dataset.q, piezas: Number(i.value) || 0 }; });
          b.disabled = true; api('staff', 'confirmar', { id: id, items: items, notaInterna: ($('[data-nota]', card) || {}).value || '' }).then(function () { return hecho('Confirmado. Administración ya lo ve para fincarlo.'); }).catch(falla);
        } else if (acc === 'rechazar') {
          var m = prompt('Motivo (lo verá el cliente):'); if (!m) return;
          b.disabled = true; api('staff', 'rechazar', { id: id, motivo: m }).then(function () { return hecho('Prepedido rechazado'); }).catch(falla);
        } else if (acc === 'fincar') {
          var r = ($('[data-rem]', card).value || '').trim(); if (!r) { toast('Escribe el número de Odoo', true); return; }
          b.disabled = true; api('staff', 'fincar', { id: id, remision: r }).then(function () { return hecho('Fincado con ' + r); }).catch(falla);
        } else if (acc === 'remision') {
          var n = prompt('Número correcto de pedido / remisión en Odoo:', p.remision || ''); if (!n) return;
          var mo = prompt('¿Por qué cambió el número?'); if (!mo) return;
          api('staff', 'editarRemision', { id: id, remision: n, motivo: mo }).then(function () { return hecho('Número actualizado'); }).catch(falla);
        } else if (acc === 'liberar') {
          var hora = prompt('Hora de salida (HH:MM):', new Date().toTimeString().slice(0, 5)); if (!hora) return;
          var lotes = prompt('Lotes (opcional) — formato: producto|lote|sacos; separa con punto y coma', '') || '';
          var L = lotes.split(';').map(function (x) { var a = x.split('|'); return a.length >= 2 ? { prod: a[0].trim(), lote: (a[1] || '').trim(), sacos: Number(a[2]) || 0 } : null; }).filter(Boolean);
          api('staff', 'liberarManual', { id: id, hora: hora, lotes: L }).then(function () { return hecho('Liberado; el cliente recibió el aviso'); }).catch(falla);
        } else if (acc === 'facturado') {
          var fa = prompt('Número de factura (opcional):', '') || '';
          api('staff', 'facturado', { id: id, factura: fa }).then(function () { return hecho('Marcado facturado'); }).catch(falla);
        } else if (acc === 'simCarga') {
          W.CliDemo.simularCargador(p.remision).then(function () { return hecho('Cargadores finalizó la unidad (simulado)'); });
        } else if (acc === 'simFact') {
          W.CliDemo.simularFacturacion(p.items.reduce(function (a, x) { return a + x.piezas; }, 0));
          hecho('Ventas publicó la facturación (simulado). El estado cambia cuando el cliente abre su app.');
        }
      };
    });
  }

  /* ================= REGISTROS ================= */
  function vRegistros(c) {
    var rol = S.bandeja.yo.rol, puede = rol === 'admin' || rol === 'gerencia';
    c.innerHTML = '<div class="clis-entre"><div class="clis-chips"><button data-r="0" aria-pressed="' + !S.regTodos + '">Por validar</button><button data-r="1" aria-pressed="' + !!S.regTodos + '">Todos los clientes con app</button></div></div><div id="clis-regs" class="clis-mut">Cargando…</div>';
    $$('[data-r]', c).forEach(function (b) { b.onclick = function () { S.regTodos = b.dataset.r === '1'; vRegistros(c); }; });
    api('staff', 'registros', { todos: !!S.regTodos }).then(function (r) {
      var l = r.registros || []; var box = $('#clis-regs', c); box.className = ''; box.style.display = 'grid'; box.style.gap = '12px';
      if (!l.length) { box.innerHTML = '<div class="clis-card clis-mut" style="text-align:center">' + (S.regTodos ? 'Aún no hay clientes con la app.' : 'No hay registros por validar.') + '</div>'; return; }
      box.innerHTML = l.map(function (u) {
        var ng = u.negocio || {};
        var h = '<article class="clis-card" data-uid="' + esc(u.uid) + '"><div class="clis-entre"><div><h4>' + esc(u.razonSocial) + '</h4><div class="clis-mini">' + esc(u.nombre) + ' · ' + esc(u.tel) + (u.telContacto ? ' / ' + esc(u.telContacto) : '') + (u.numCliente ? ' · No. cliente ' + esc(u.numCliente) : '') + '</div></div><span class="clis-badge clis-b-' + (u.estado === 'rechazado' ? 'rechazadoU' : u.estado) + '">' + esc(u.estado) + '</span></div>';
        h += '<div class="clis-mini">' + esc(ng.nombre || '') + (ng.dir ? ' · ' + esc(ng.dir) : '') + (ng.lat ? ' · <a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + ng.lat + ',' + ng.lng + '">ubicación (' + esc(ng.modo) + (ng.precision ? ' ±' + ng.precision + ' m' : '') + ')</a>' : '') + '</div>';
        if (u.estado === 'activo') h += '<div class="clis-fila clis-mini"><b style="color:var(--t)">' + esc(u.skanName) + '</b> · ' + esc(u.vendedorNombre || '') + ' · App ' + (u.ultimaConexion && Date.now() - u.ultimaConexion < 30 * 864e5 ? '<b style="color:var(--ok)">activa</b>' : '<b style="color:var(--w)">sin uso reciente</b>') + ' (' + hace(u.ultimaConexion) + ', ' + esc(u.plataforma || '') + ')' + (u.pushActivo ? ' · avisos ✓' : '') + ' · validó ' + esc(u.validadoPor || '') + '</div>';
        if (u.estado === 'pendiente') {
          h += (u.sugerencias && u.sugerencias.length ? '<div class="clis-aviso i"><b>Posibles coincidencias en el catálogo:</b><br>' + u.sugerencias.map(function (s) { return esc(s.n) + ' <span class="clis-mini">(' + esc(s.por) + (s.v ? ', ' + esc(s.v) : '') + ')</span>'; }).join('<br>') + '</div>' : '<div class="clis-mini">Sin coincidencias automáticas: búscalo por nombre.</div>');
          if (puede) h += '<div class="clis-fila"><input data-bus placeholder="Buscar cliente en ventas…" value="' + esc((u.sugerencias && u.sugerencias[0] && u.sugerencias[0].n) || u.razonSocial) + '" style="flex:1;min-width:200px"><button class="clis-btn sec" data-a="buscar">Buscar</button><button class="clis-btn ghost" data-a="rechazar">Rechazar</button></div><div data-res></div>';
          else h += '<div class="clis-mini">Administración o gerencia lo vincula con su cliente.</div>';
        } else if (puede) {
          h += '<div class="clis-fila">' + (u.estado === 'activo' ? '<button class="clis-btn ghost" data-a="suspender">Suspender acceso</button>' : '<button class="clis-btn ghost" data-a="reactivar">Reactivar</button>') + '</div>';
        }
        return h + '</article>';
      }).join('');
      $$('[data-a]', box).forEach(function (b) {
        b.onclick = function () {
          var card = b.closest('[data-uid]'), uid = card.dataset.uid, a = b.dataset.a;
          if (a === 'buscar') {
            var q = $('[data-bus]', card).value; var res = $('[data-res]', card); res.innerHTML = '<span class="clis-mini">Buscando…</span>';
            api('staff', 'buscarClientes', { q: q }).then(function (r) {
              if (!r.skan.length) { res.innerHTML = '<div class="clis-mini">No aparece en las carteras publicadas. Prueba con otra parte del nombre.</div>'; return; }
              res.innerHTML = '<div style="display:grid;gap:6px">' + r.skan.map(function (s) {
                var cat = r.catalogo.filter(function (x) { return keyp(x.n) === keyp(s.n); })[0];
                return '<div class="clis-entre" style="border:1px solid var(--l);border-radius:10px;padding:8px"><div><b>' + esc(s.n) + '</b><div class="clis-mini">' + esc(s.v) + ' · ' + fmt(s.avg) + ' sacos/mes' + (cat ? ' · listas ' + esc(cat.l.join(', ')) : '') + '</div></div><button class="clis-btn ok" data-vin="' + esc(s.n) + '" data-vk="' + esc(s.vk) + '" data-cat="' + esc(cat ? cat.catKey : '') + '">Vincular y activar</button></div>';
              }).join('') + '</div>';
              $$('[data-vin]', res).forEach(function (x) {
                x.onclick = function () { x.disabled = true; api('staff', 'vincular', { uid: uid, skanName: x.dataset.vin, vk: x.dataset.vk, catKey: x.dataset.cat }).then(function () { toast('Cuenta activada; el cliente recibió el aviso'); refrescarBandeja(true); vRegistros(c); }).catch(function (e) { x.disabled = false; toast(e.error, true); }); };
              });
            }).catch(function (e) { res.innerHTML = '<span class="clis-mini">' + esc(e.error) + '</span>'; });
          } else {
            var est = a === 'rechazar' ? 'rechazado' : a === 'suspender' ? 'suspendido' : 'activo';
            var mo = est === 'activo' ? '' : prompt(est === 'rechazado' ? 'Motivo (lo verá la persona):' : 'Motivo de la suspensión:'); if (est !== 'activo' && !mo) return;
            api('staff', 'estadoUsuario', { uid: uid, estado: est, motivo: mo }).then(function () { toast('Listo'); refrescarBandeja(true); vRegistros(c); }).catch(function (e) { toast(e.error, true); });
          }
        };
      });
    }).catch(function (e) { $('#clis-regs', c).textContent = e.error; });
  }

  /* ================= MENSAJES (gerencia) ================= */
  function vMensajes(c) {
    c.innerHTML = '<div class="clis-mut">Cargando…</div>';
    api('staff', 'mensajes', {}).then(function (r) {
      var l = r.mensajes || [];
      c.innerHTML = '<h3>Mensajes para atención gerencial</h3>' + (l.length ? '' : '<div class="clis-card clis-mut">Sin mensajes.</div>') + l.map(function (m) {
        return '<article class="clis-card" data-mid="' + esc(m.id) + '"><div class="clis-entre"><div><h4>' + esc(m.cliente) + '</h4><div class="clis-mini">' + esc(m.contacto) + ' · ' + esc(m.tel) + ' · ' + fh(m.ts) + (m.tema ? ' · ' + esc(m.tema) : '') + '</div></div>' + (m.leido ? '' : '<span class="clis-badge clis-b-enviado">Nuevo</span>') + '</div><div>' + esc(m.texto) + '</div>' +
          (m.respuesta ? '<div class="clis-aviso i"><b>Respondiste:</b> ' + esc(m.respuesta) + ' <span class="clis-mini">(' + esc(m.respPor || '') + ', ' + fh(m.respTs) + ')</span></div>' : '<textarea data-resp placeholder="Respuesta (le llega al cliente en su app)"></textarea><div class="clis-fila"><button class="clis-btn" data-r="1">Responder</button><button class="clis-btn sec" data-r="0">Marcar leído sin responder</button><a class="clis-btn wa" target="_blank" rel="noopener" href="' + wa(m.tel, 'Hola ' + (m.contacto || '').split(' ')[0] + ', te escribo de la gerencia comercial de Los 19 Hermanos por tu mensaje.') + '">WhatsApp</a></div>') + '</article>';
      }).join('');
      $$('[data-r]', c).forEach(function (b) { b.onclick = function () { var card = b.closest('[data-mid]'); var t = b.dataset.r === '1' ? ($('[data-resp]', card).value || '').trim() : ''; if (b.dataset.r === '1' && !t) { toast('Escribe la respuesta', true); return; } api('staff', 'responder', { id: card.dataset.mid, texto: t }).then(function () { toast('Listo'); refrescarBandeja(true); vMensajes(c); }).catch(function (e) { toast(e.error, true); }); }; });
    }).catch(function (e) { c.textContent = e.error; });
  }

  /* ================= FLETES Y PRECIOS ================= */
  function vFletes(c) {
    c.innerHTML = '<div class="clis-mut">Cargando fletes…</div>';
    var rol = S.ses.yo.rol; var editar = rol === 'progmaster' || rol === 'gerencia';
    S.nivelFl = editar ? 'total' : (rol === 'programacion' ? 'su' : 'lectura');
    api('staff', 'fletes', {}).then(function (r) { S.fletes = r; pintaFletes(c, editar); }).catch(function (e) { c.textContent = e.error; });
  }
  function calc(ruta) { return W.CliCore ? W.CliCore.calcFlete(ruta, S.fletes.fletes) : null; }
  function pintaFletes(c, editar) {
    var F = S.fletes, fl = F.fletes = F.fletes || {}; fl.params = fl.params || {}; fl.vehiculos = fl.vehiculos || {}; fl.rutas = fl.rutas || {};
    var cfg = F.config || {}; var vb = F.vehiculosBase, pb = F.paramsBase;
    var su = S.nivelFl === 'su', dT = editar ? '' : ' disabled', dS = (editar || su) ? '' : ' disabled';
    var h = '';
    if (su) h += '<div class="clis-aviso i"><b>Superusuario:</b> puedes editar <b>km, casetas, diésel y salario del ayudante</b>, y <b>agregar clientes nuevos</b> (rutas). Los costos de las unidades, los márgenes, las listas de precios y lo que ve cada cliente los edita el master.</div>';
    else if (S.nivelFl === 'lectura') h += '<div class="clis-aviso i">Vista de consulta. Los fletes los edita Programación; precios y márgenes, el master.</div>';
    // 1 · interruptor
    h += '<section class="clis-card"><div class="clis-entre"><div><h3>Precios en la app del cliente</h3><div class="clis-mini">Si lo apagas, el cliente solo arma su pedido en productos y sacos. Puedes cambiarlo por cliente abajo.</div></div>' +
      '<label class="clis-sw"><input type="checkbox" id="clis-mp"' + (cfg.mostrarPrecios ? ' checked' : '') + (editar ? '' : ' disabled') + '> <span>' + (cfg.mostrarPrecios ? 'Mostrar precios con IVA y flete' : 'Solo productos y sacos') + '</span></label></div>' +
      '<div class="clis-grid2"><label class="c">IVA Pet Food (%)<input id="clis-ivp" type="number" step="0.01" value="' + (cfg.ivaPet != null ? cfg.ivaPet : 16) + '"' + (editar ? '' : ' disabled') + '></label><label class="c">IVA pecuario (%)<input id="clis-ivq" type="number" step="0.01" value="' + (cfg.ivaPec != null ? cfg.ivaPec : 0) + '"' + (editar ? '' : ' disabled') + '></label>' +
      '<label class="c">WhatsApp de Administración<input id="clis-wa" inputmode="tel" value="' + esc(cfg.waAdmin || '') + '"' + (editar ? '' : ' disabled') + ' placeholder="10 dígitos"></label><label class="c">Aviso para todos los clientes<input id="clis-av" value="' + esc(cfg.avisoGeneral || '') + '"' + (editar ? '' : ' disabled') + ' placeholder="Ej. 2 nov sin entregas"></label></div>' +
      (editar ? '<div><button class="clis-btn" id="clis-gcfg">Guardar ajustes</button></div>' : '') + '</section>';
    // 2 · parámetros y vehículos
    h += '<section class="clis-card"><div class="clis-entre"><h3>Costos por tipo de unidad</h3><div class="clis-fila"><label class="c" style="grid-auto-flow:column;align-items:center">Diésel $/lt <input id="clis-die" type="number" step="0.01" style="width:90px" value="' + (fl.params.diesel != null ? fl.params.diesel : pb.diesel) + '"' + dS + '></label><label class="c" style="grid-auto-flow:column;align-items:center">Km/año <input id="clis-kma" type="number" style="width:100px" value="' + (fl.params.kmAnual != null ? fl.params.kmAnual : pb.kmAnual) + '"' + dT + '></label><label class="c" style="grid-auto-flow:column;align-items:center">Años <input id="clis-ani" type="number" style="width:70px" value="' + (fl.params.anios != null ? fl.params.anios : pb.anios) + '"' + dT + '></label></div></div>' +
      '<div class="clis-scroll" style="max-height:none"><table class="clis-tabla"><thead><tr><th>Unidad</th><th>Toneladas</th><th>Km/lt</th><th>Mant. cada km</th><th>Mant. $</th><th>Valor unidad</th><th>Seguro/viaje</th><th>Ayudante</th><th>Margen %</th></tr></thead><tbody>' +
      VEH.map(function (k) { var v = Object.assign({}, vb[k], fl.vehiculos[k] || {}); return '<tr data-veh="' + k + '"><td><b>' + esc(vb[k].nombre) + '</b></td>' + ['ton', 'rend', 'mantKm', 'mantCosto', 'valor', 'seguro', 'ayudante'].map(function (x) { return '<td><input type="number" step="any" data-k="' + x + '" value="' + v[x] + '"' + dT + '></td>'; }).join('') + '<td><input type="number" step="any" data-k="margen" value="' + (Math.round(v.margen * 100000) / 1000) + '"' + dT + '></td></tr>'; }).join('') +
      '</tbody></table></div><div class="clis-mini">Igual que tu Excel: combustible = km ÷ rendimiento × diésel; mantenimiento = km ÷ cada km × costo; depreciación = valor ÷ (km/año × años) × km; margen sobre el costo de transporte. Por saco: tonelada ÷ 40 (25 kg), ÷ 50 (20 kg), ÷ 67 (15 kg).</div></section>';
    // 3 · rutas
    var ids = Object.keys(fl.rutas).sort(function (a, b) { return String(fl.rutas[a].destino).localeCompare(String(fl.rutas[b].destino)) || String(fl.rutas[a].vehiculo).localeCompare(String(fl.rutas[b].vehiculo)); });
    h += '<section class="clis-card"><div class="clis-entre"><div><h3>Rutas y fletes</h3><div class="clis-mini">' + ids.length + ' rutas. Los campos en blanco toman el valor de su tipo de unidad.</div></div><div class="clis-fila">' +
      (editar ? '<button class="clis-btn sec" id="clis-xls">Importar del Excel</button><input type="file" id="clis-xlsf" accept=".xlsx,.xls" hidden>' : '') +
      ((editar || su) ? '<button class="clis-btn sec" id="clis-add">+ Cliente / ruta</button><button class="clis-btn" id="clis-gfl">Guardar fletes</button>' : '') + '</div></div>' +
      '<input id="clis-fbus" placeholder="Filtrar rutas…" style="width:100%">' +
      '<div class="clis-scroll"><table class="clis-tabla" id="clis-trutas"><thead><tr><th>Cliente / destino</th><th>Unidad</th><th>Km</th><th>Casetas</th><th>Ayudante</th><th>Seguro</th><th>Diésel</th><th>Costo viaje</th><th>$/ton</th><th>$/saco 25</th><th>$/saco 20</th><th>$/saco 15</th><th>Cobrado hoy</th><th>Dif.</th><th></th></tr></thead><tbody>' +
      ids.map(function (id) { return filaRuta(id, fl.rutas[id], editar); }).join('') + '</tbody></table></div></section>';
    // 4 · listas de precios
    var pr = F.precios || {}; var nl = Object.keys(pr.lists || {}).length;
    h += '<section class="clis-card"><div class="clis-entre"><div><h3>Listas de precios</h3><div class="clis-mini">' + (nl ? nl + ' listas · ' + Object.keys(pr.prod || {}).length + ' productos · ' + (pr.nCatalogo || 0) + ' clientes en catálogo · cargadas ' + fh(pr.actualizado) : 'Aún no se cargan las listas.') + '</div></div>' +
      (editar ? '<div class="clis-fila"><button class="clis-btn sec" id="clis-lp">Cargar archivo de listas</button><input type="file" id="clis-lpf" accept=".html,.htm,.json" hidden></div>' : '') + '</div>' +
      '<div class="clis-mini">Acepta el archivo «Clientes y listas de precios 19H» (.html) o un .json con la misma estructura. Los datos se guardan en el servidor, no en GitHub.</div></section>';
    // 5 · clientes
    h += '<section class="clis-card"><h3>Precio y flete por cliente</h3><div class="clis-mini">Qué lista usa para «recoge en planta», si tiene una lista con flete incluido, qué rutas puede elegir para entrega y si ve precios.</div>' +
      '<div class="clis-fila"><input id="clis-cbus" placeholder="Buscar cliente de ventas…" style="flex:1;min-width:200px"><button class="clis-btn sec" id="clis-cbtn">Buscar</button></div><div id="clis-cres"></div><div id="clis-clis" style="display:grid;gap:10px"></div></section>';
    c.innerHTML = h;

    // eventos
    var mp = $('#clis-mp', c); if (mp) mp.onchange = function () { mp.nextElementSibling.textContent = mp.checked ? 'Mostrar precios con IVA y flete' : 'Solo productos y sacos'; };
    var gcfg = $('#clis-gcfg', c); if (gcfg) gcfg.onclick = function () {
      api('staff', 'guardarConfig', { config: { mostrarPrecios: mp.checked, ivaPet: $('#clis-ivp', c).value, ivaPec: $('#clis-ivq', c).value, waAdmin: $('#clis-wa', c).value, avisoGeneral: $('#clis-av', c).value } })
        .then(function () { F.config.mostrarPrecios = mp.checked; toast('Ajustes guardados'); }).catch(function (e) { toast(e.error, true); });
    };
    var recalc = function () { leerTabla(c); $$('#clis-trutas tbody tr', c).forEach(function (tr) { var r = fl.rutas[tr.dataset.id]; if (r) actualizaFila(tr, r); }); };
    $$('[data-veh] input, #clis-die, #clis-kma, #clis-ani', c).forEach(function (i) { i.oninput = recalc; });
    $$('#clis-trutas input, #clis-trutas select', c).forEach(function (i) { i.oninput = function () { var tr = i.closest('tr'); leerFila(tr); actualizaFila(tr, fl.rutas[tr.dataset.id]); }; });
    $$('[data-del]', c).forEach(function (b) { b.onclick = function () { var tr = b.closest('tr'); if (!confirm('¿Quitar esta ruta?')) return; delete fl.rutas[tr.dataset.id]; tr.remove(); }; });
    $('#clis-fbus', c).oninput = function () { var q = keyp(this.value); $$('#clis-trutas tbody tr', c).forEach(function (tr) { tr.style.display = !q || keyp(tr.dataset.n).indexOf(q) >= 0 ? '' : 'none'; }); };
    var add = $('#clis-add', c); if (add) add.onclick = function () { leerTabla(c); var id = 'R' + Date.now().toString(36).toUpperCase(); fl.rutas[id] = { destino: '', vehiculo: 'TORTON', km: '', casetas: '', _nuevo: true }; pintaFletes(c, editar); var f0 = $('#clis-trutas tr[data-id="' + id + '"] input[data-k=destino]', c); if (f0) { f0.scrollIntoView({ block: 'center' }); f0.focus(); } };
    var gfl = $('#clis-gfl', c); if (gfl) gfl.onclick = function () { leerTabla(c); gfl.disabled = true; var vac = Object.keys(fl.rutas).filter(function (k) { return fl.rutas[k]._nuevo && !String(fl.rutas[k].destino || '').trim(); }); if (vac.length) { gfl.disabled = false; toast('Escribe el nombre del cliente o destino de la ruta nueva', true); return; }
      api('staff', 'guardarFletes', { fletes: fl }).then(function (r) { gfl.disabled = false; toast(r && r.nuevas != null ? 'Guardado: ' + r.cambios + ' rutas actualizadas, ' + r.nuevas + ' nuevas' : 'Fletes guardados'); return api('staff', 'fletes', {}).then(function (r) { S.fletes = r; pintaFletes(c, editar); }); }).catch(function (e) { gfl.disabled = false; toast(e.error, true); }); };
    var xb = $('#clis-xls', c), xf = $('#clis-xlsf', c); if (xb) { xb.onclick = function () { xf.click(); }; xf.onchange = function () { if (xf.files[0]) importarExcel(xf.files[0], c, editar); }; }
    var lb = $('#clis-lp', c), lf = $('#clis-lpf', c); if (lb) { lb.onclick = function () { lf.click(); }; lf.onchange = function () { if (lf.files[0]) importarListas(lf.files[0], c, editar); }; }
    $('#clis-cbtn', c).onclick = function () {
      var q = $('#clis-cbus', c).value; var res = $('#clis-cres', c); res.innerHTML = '<span class="clis-mini">Buscando…</span>';
      api('staff', 'buscarClientes', { q: q }).then(function (r) { res.innerHTML = r.skan.map(function (s) { return '<button class="clis-btn sec" style="margin:4px 4px 0 0" data-ck="' + esc(keyp(s.n)) + '" data-n="' + esc(s.n) + '">' + esc(s.n) + '</button>'; }).join('') || '<span class="clis-mini">Sin resultados.</span>'; $$('[data-ck]', res).forEach(function (b) { b.onclick = function () { if (!F.clientes[b.dataset.ck]) F.clientes[b.dataset.ck] = { skanName: b.dataset.n }; pintaClientes(c, editar, b.dataset.ck); res.innerHTML = ''; }; }); });
    };
    pintaClientes(c, editar);
    if (W.CliCore) recalc(); else cargar(BASE + 'cli-core.js').then(function () { recalc(); pintaClientes(c, editar); });
  }
  // Qué campo puede tocar cada nivel: master todo; superusuario km, casetas, diésel y ayudante
  // (y nombre/unidad solo en rutas que él mismo está agregando).
  function filaRuta(id, r, editar) {
    var su = S.nivelFl === 'su';
    var puede = function (k) { if (editar) return true; if (!su) return false; if (['km', 'casetas', 'diesel', 'ayudante'].indexOf(k) >= 0) return true; return !!r._nuevo && (k === 'destino' || k === 'vehiculo'); };
    var dis = function (k) { return puede(k) ? '' : ' disabled'; };
    var inp = function (k, w) { return '<input type="number" step="any" data-k="' + k + '" value="' + (r[k] != null && r[k] !== '' ? r[k] : '') + '"' + dis(k) + (w ? ' style="width:' + w + 'px"' : '') + '>'; };
    return '<tr data-id="' + esc(id) + '" data-n="' + esc(r.destino + ' ' + r.vehiculo) + '"><td class="d"><input data-k="destino" placeholder="Cliente o destino" value="' + esc(r.destino || '') + '"' + dis('destino') + '></td><td><select data-k="vehiculo"' + dis('vehiculo') + '>' + VEH.map(function (v) { return '<option' + (v === r.vehiculo ? ' selected' : '') + '>' + v + '</option>'; }).join('') + '</select></td>' +
      '<td>' + inp('km', 70) + '</td><td>' + inp('casetas', 80) + '</td><td>' + inp('ayudante', 76) + '</td><td>' + inp('seguro', 70) + '</td><td>' + inp('diesel', 64) + '</td>' +
      '<td data-o="total"></td><td data-o="porTon"></td><td data-o="saco25"></td><td data-o="saco20"></td><td data-o="saco15"></td><td>' + inp('cobrado', 86) + '</td><td data-o="dif"></td><td>' + (editar ? '<button class="clis-btn ghost" data-del title="Quitar">×</button>' : '') + '</td></tr>';
  }
  function leerFila(tr) {
    var fl = S.fletes.fletes; var r = fl.rutas[tr.dataset.id] = fl.rutas[tr.dataset.id] || {};
    $$('[data-k]', tr).forEach(function (i) { var k = i.dataset.k; if (k === 'destino' || k === 'vehiculo') r[k] = i.value; else r[k] = i.value === '' ? '' : Number(i.value); });
    tr.dataset.n = (r.destino || '') + ' ' + (r.vehiculo || '');
  }
  function leerTabla(c) {
    var fl = S.fletes.fletes;
    fl.params = { diesel: Number($('#clis-die', c).value), kmAnual: Number($('#clis-kma', c).value), anios: Number($('#clis-ani', c).value) };
    $$('[data-veh]', c).forEach(function (tr) { var o = {}; $$('[data-k]', tr).forEach(function (i) { o[i.dataset.k] = i.dataset.k === 'margen' ? Number(i.value) / 100 : Number(i.value); }); fl.vehiculos[tr.dataset.veh] = o; });
    $$('#clis-trutas tbody tr', c).forEach(leerFila);
  }
  function actualizaFila(tr, r) {
    var f = calc(r); if (!f) return;
    var set = function (k, v) { var td = $('[data-o="' + k + '"]', tr); if (td) td.textContent = v; };
    set('total', money(f.total)); set('porTon', money(f.porTon)); set('saco25', money(f.saco25)); set('saco20', money(f.saco20)); set('saco15', money(f.saco15));
    set('dif', f.diferencia == null ? '' : (f.diferencia > 0 ? '−' : '+') + money(Math.abs(f.diferencia)));
    tr.classList.toggle('mal', f.diferencia != null && f.diferencia > 0);
    tr.title = f.diferencia != null && f.diferencia > 0 ? 'Lo cobrado hoy no cubre el costo calculado' : '';
  }
  function importarExcel(file, c, editar) {
    toast('Leyendo Excel…');
    cargar('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js').then(function () { return file.arrayBuffer(); }).then(function (buf) {
      var wb = W.XLSX.read(buf, { type: 'array', cellFormula: true }); var fl = S.fletes.fletes; var nuevas = 0, cobr = {};
      wb.SheetNames.forEach(function (sn) {
        var ws = wb.Sheets[sn]; var rg = W.XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
        var cel = function (r, col) { var x = ws[W.XLSX.utils.encode_cell({ r: r, c: col })]; return x || {}; };
        for (var r = rg.s.r; r <= rg.e.r; r++) {
          var dest = String(cel(r, 0).v || '').trim(), veh = keyp(cel(r, 1).v);
          if (veh === 'FLETEINTERNO' && dest) { cobr[keyp(dest)] = Number(cel(r, 2).v) || 0; continue; }
          if (VEH.indexOf(veh) < 0 || typeof cel(r, 9).v !== 'number') continue;
          var o = { destino: dest, vehiculo: veh, km: cel(r, 9).v, casetas: Number(cel(r, 8).v) || 0, rend: Number(cel(r, 2).v) || '', diesel: Number(cel(r, 3).v) || '', ton: Number(cel(r, 7).v) || '', seguro: Number(cel(r, 10).v) || '', ayudante: typeof cel(r, 11).v === 'number' ? cel(r, 11).v : '' };
          var fE = String(cel(r, 4).f || ''), fF = String(cel(r, 5).f || ''), fG = String(cel(r, 6).f || '');
          var mE = fE.match(/J\d+\s*\/\s*([\d.]+)\s*\*\s*([\d.]+)/); if (mE) { o.mantKm = Number(mE[1]); o.mantCosto = Number(mE[2]); }
          var mF = fF.match(/^\(?\s*([\d.]+)\s*\//); if (mF) o.valor = Number(mF[1]);
          var mG = fG.match(/N\d+\s*\*\s*([\d.]+)\s*\)?\s*(?:\/\s*([\d.]+))?/); if (mG) o.margen = Number(mG[1]) / (mG[2] ? Number(mG[2]) : 1);
          var base = Object.assign({}, S.fletes.vehiculosBase[veh], fl.vehiculos[veh] || {});
          ['rend', 'ton', 'seguro', 'ayudante', 'valor', 'mantKm', 'mantCosto', 'margen'].forEach(function (k) { if (o[k] !== '' && o[k] != null && Math.abs(Number(o[k]) - Number(base[k])) < 1e-9) delete o[k]; });
          if (o.diesel !== '' && Math.abs(o.diesel - (fl.params.diesel || 27)) < 1e-9) delete o.diesel;
          var id = (keyp(dest).slice(0, 30) || 'RUTA') + veh.slice(0, 2) + (r + 1);
          fl.rutas[id] = o; nuevas++;
        }
      });
      Object.keys(fl.rutas).forEach(function (id) { var r = fl.rutas[id]; var k = keyp(r.destino); if (cobr[k] && !r.cobrado) r.cobrado = cobr[k]; });
      toast(nuevas + ' rutas importadas. Revisa y da «Guardar fletes».');
      pintaFletes(c, editar);
    }).catch(function (e) { toast('No se pudo leer el Excel: ' + (e.message || e), true); });
  }
  function importarListas(file, c, editar) {
    file.text().then(function (t) {
      var data = null;
      if (/^\s*\{/.test(t)) data = JSON.parse(t);
      else { var m = t.match(/const\s+DATA\s*=\s*(\{[\s\S]*?\});\s*\n/); if (m) data = JSON.parse(m[1]); }
      if (!data || !data.lists) throw new Error('El archivo no trae listas de precios');
      if (!confirm('Se cargarán ' + data.lists.length + ' listas y ' + (data.clients || []).length + ' clientes del catálogo. Reemplaza la carga anterior. ¿Continuar?')) return;
      return api('staff', 'importarPrecios', { data: data }).then(function (r) { toast(r.listas + ' listas y ' + r.clientes + ' clientes cargados'); return api('staff', 'fletes', {}).then(function (x) { S.fletes = x; pintaFletes(c, editar); }); });
    }).catch(function (e) { toast(e.error || e.message || 'No se pudo cargar', true); });
  }
  function pintaClientes(c, editar, abrirCk) {
    var F = S.fletes, box = $('#clis-clis', c); if (!box) return;
    var lists = (F.precios && F.precios.lists) || {}, rutas = F.fletes.rutas || {};
    var cks = Object.keys(F.clientes || {}); (F.conApp || []).forEach(function (k) { if (cks.indexOf(k) < 0) cks.push(k); });
    if (!cks.length) { box.innerHTML = '<div class="clis-mini">Aún no hay clientes configurados. Al vincular a un cliente con la app aparecerá aquí; también puedes buscarlo arriba.</div>'; return; }
    var optL = function (sel) { return '<option value="">— ninguna —</option>' + Object.keys(lists).map(function (k) { return '<option value="' + esc(k) + '"' + (k === sel ? ' selected' : '') + '>' + esc(lists[k].name) + (lists[k].iva ? ' (+IVA)' : '') + '</option>'; }).join(''); };
    box.innerHTML = cks.map(function (ck) {
      var cc = F.clientes[ck] || {}; var app = (F.conApp || []).indexOf(ck) >= 0;
      return '<details class="clis-card" data-ck="' + esc(ck) + '"' + (ck === abrirCk ? ' open' : '') + '><summary style="cursor:pointer"><b>' + esc(cc.skanName || ck) + '</b> <span class="clis-mini">' + (app ? '· tiene la app' : '') + ' · precios: ' + ({ auto: 'según interruptor general', mostrar: 'siempre', ocultar: 'nunca' }[cc.precios || 'auto']) + ' · ' + ((cc.rutas || []).length) + ' rutas</span></summary>' +
        '<div class="clis-grid2" style="margin-top:8px"><label class="c">Lista «recoge en planta»<select data-c="listaRecoge"' + (editar ? '' : ' disabled') + '>' + optL(cc.listaRecoge) + '</select></label>' +
        '<label class="c">Lista con flete incluido (opcional)<select data-c="listaEntrega"' + (editar ? '' : ' disabled') + '>' + optL(cc.listaEntrega) + '</select></label>' +
        '<label class="c">¿Ve precios?<select data-c="precios"' + (editar ? '' : ' disabled') + '><option value="auto"' + (!cc.precios || cc.precios === 'auto' ? ' selected' : '') + '>Según interruptor general</option><option value="mostrar"' + (cc.precios === 'mostrar' ? ' selected' : '') + '>Sí, siempre</option><option value="ocultar"' + (cc.precios === 'ocultar' ? ' selected' : '') + '>No, solo productos y sacos</option></select></label></div>' +
        '<label class="c" style="margin-top:6px">Rutas de entrega que puede elegir (Ctrl/⌘ para varias)<select multiple size="6" data-c="rutas" style="width:100%"' + (editar ? '' : ' disabled') + '>' + Object.keys(rutas).sort(function (a, b) { return String(rutas[a].destino).localeCompare(String(rutas[b].destino)); }).map(function (id) { var f = calc(rutas[id]); return '<option value="' + esc(id) + '"' + ((cc.rutas || []).indexOf(id) >= 0 ? ' selected' : '') + '>' + esc(rutas[id].destino) + ' · ' + esc(rutas[id].vehiculo) + (f ? ' · ' + money(f.saco25) + '/saco 25' : '') + '</option>'; }).join('') + '</select></label>' +
        '<div class="clis-fila" style="margin-top:6px">' + (editar ? '<button class="clis-btn" data-g>Guardar</button>' : '') + '<button class="clis-btn sec" data-v>Ver como el cliente</button></div><div data-prev></div></details>';
    }).join('');
    $$('[data-g]', box).forEach(function (b) { b.onclick = function () {
      var d = b.closest('[data-ck]'); var cfg = { catKey: (F.clientes[d.dataset.ck] || {}).catKey || '' };
      $$('[data-c]', d).forEach(function (s) { cfg[s.dataset.c] = s.multiple ? $$('option', s).filter(function (o) { return o.selected; }).map(function (o) { return o.value; }) : s.value; });
      api('staff', 'guardarClienteCfg', { clienteKey: d.dataset.ck, cfg: cfg }).then(function () { F.clientes[d.dataset.ck] = Object.assign({}, F.clientes[d.dataset.ck] || {}, cfg); toast('Cliente guardado'); }).catch(function (e) { toast(e.error, true); });
    }; });
    $$('[data-v]', box).forEach(function (b) { b.onclick = function () {
      var d = b.closest('[data-ck]'); var pv = $('[data-prev]', d); pv.innerHTML = '<span class="clis-mini">Calculando…</span>';
      api('staff', 'vistaPrecios', { clienteKey: d.dataset.ck }).then(function (r) {
        if (!r.mostrar) { pv.innerHTML = '<div class="clis-aviso w">Este cliente ve solo productos y sacos (sin precios).</div><div class="clis-mini">' + r.productos.map(function (p) { return esc(p.nombre); }).join(' · ') + '</div>'; return; }
        var escs = []; r.productos.forEach(function (p) { (p.escenarios || []).forEach(function (e) { if (escs.indexOf(e.label) < 0) escs.push(e.label); }); });
        pv.innerHTML = '<div class="clis-scroll" style="margin-top:8px"><table class="clis-tabla"><thead><tr><th>Producto (lista ' + esc(r.lista) + ')</th>' + escs.map(function (e) { return '<th>' + esc(e) + '</th>'; }).join('') + '</tr></thead><tbody>' + r.productos.map(function (p) { return '<tr><td>' + esc(p.nombre) + '</td>' + escs.map(function (l) { var e = (p.escenarios || []).filter(function (x) { return x.label === l; })[0]; return '<td>' + (e ? money(e.conIva) + (p.desglosaIva ? '<div class="clis-mini">' + money(e.precio) + ' + IVA</div>' : '') : '—') + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
      }).catch(function (e) { pv.textContent = e.error; });
    }; });
  }

  /* ================= ACCESOS (llave maestra) ================= */
  function vAccesos(c) {
    if (!S.maestra) {
      c.innerHTML = '<div class="clis-login"><h3>Accesos del personal</h3><p class="clis-mut" style="margin:0">Solo con la llave maestra (la frase que guardaste en Firebase como CLI_MAESTRO). No se guarda en este equipo.</p><input id="clis-mk" type="password" placeholder="Llave maestra" autocomplete="off"><button class="clis-btn" id="clis-mkb">Abrir</button>' + (DEMO ? '<div class="clis-aviso i">Demostración: escribe cualquier texto.</div>' : '') + '</div>';
      $('#clis-mkb', c).onclick = function () { S.maestra = $('#clis-mk', c).value; vAccesos(c); };
      return;
    }
    c.innerHTML = '<div class="clis-mut">Cargando…</div>';
    Promise.all([api('maestro', 'listarStaff', {}), api('maestro', 'vendedores', {}), api('maestro', 'estado', {})]).then(function (a) {
      var st = a[0].staff, roles = a[0].roles, vs = a[1].vendors || [], es = a[2];
      var h = '<section class="clis-card"><h3>Estado de seguridad</h3>' +
        '<div class="clis-aviso ' + (es.reglasCerradas === false ? 'r' : 'o') + '">' + (es.reglasCerradas === false ? '⚠️ El nodo /cli está ABIERTO al público. Publica las reglas de seguridad (ver LEEME).' : '✓ Los datos de clientes están cerrados al público: solo el servidor entra.') + '</div>' +
        '<div class="clis-mini">Licencia app clientes: ' + (es.licenciaClientes ? 'encendida' : 'APAGADA') + ' · módulo del personal: ' + (es.licenciaPersonal ? 'encendido' : 'APAGADO') + ' (se controlan desde tu Panel de Licencia: clientes y clientes_personal).</div></section>';
      h += '<section class="clis-card"><h3>Personal con acceso</h3><div class="clis-scroll" style="max-height:none"><table class="clis-tabla"><thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Cartera</th><th>WhatsApp</th><th>Último acceso</th><th>Activo</th></tr></thead><tbody>' +
        st.map(function (u) { return '<tr><td><b>' + esc(u.u) + '</b></td><td style="text-align:left">' + esc(u.nombre) + '</td><td style="text-align:left">' + esc(roles[u.rol] || u.rol) + '</td><td style="text-align:left">' + esc(u.vk) + '</td><td>' + esc(u.tel) + '</td><td>' + hace(u.ultimoAcceso) + '</td><td>' + (u.activo ? '✓' : '—') + ' <button class="clis-btn ghost" data-ed="' + esc(u.u) + '">Editar</button></td></tr>'; }).join('') + '</tbody></table></div></section>';
      h += '<section class="clis-card" id="clis-fu"><h3>Alta o cambio</h3><div class="clis-grid2">' +
        '<label class="c">Usuario<input id="f-u" placeholder="Ej. ARMANDO o ADMINISTRACION"></label><label class="c">Nombre<input id="f-n"></label>' +
        '<label class="c">Rol<select id="f-r">' + Object.keys(roles).map(function (k) { return '<option value="' + k + '">' + esc(roles[k]) + '</option>'; }).join('') + '</select></label>' +
        '<label class="c">Cartera (solo vendedores)<select id="f-v"><option value="">—</option>' + vs.map(function (v) { return '<option>' + esc(v) + '</option>'; }).join('') + '</select></label>' +
        '<label class="c">PIN nuevo (6–8 dígitos)<input id="f-p" inputmode="numeric" maxlength="8" placeholder="Vacío = no cambia"></label><label class="c">WhatsApp (10 dígitos)<input id="f-t" inputmode="tel"></label>' +
        '<label class="clis-sw"><input type="checkbox" id="f-a" checked> Activo</label></div><div class="clis-fila"><button class="clis-btn" id="f-g">Guardar</button><span class="clis-mini">Cambiar el PIN cierra las sesiones abiertas de esa persona.</span></div></section>';
      c.innerHTML = h;
      $$('[data-ed]', c).forEach(function (b) { b.onclick = function () { var u = st.filter(function (x) { return x.u === b.dataset.ed; })[0]; $('#f-u', c).value = u.u; $('#f-n', c).value = u.nombre; $('#f-r', c).value = u.rol; $('#f-v', c).value = u.vk; $('#f-t', c).value = u.tel; $('#f-a', c).checked = u.activo; $('#f-p', c).value = ''; $('#clis-fu', c).scrollIntoView({ behavior: 'smooth' }); }; });
      $('#f-g', c).onclick = function () {
        api('maestro', 'guardarStaff', { usuario: $('#f-u', c).value, nombre: $('#f-n', c).value, rol: $('#f-r', c).value, vk: $('#f-v', c).value, pin: $('#f-p', c).value, tel: $('#f-t', c).value, activo: $('#f-a', c).checked })
          .then(function () { toast('Guardado'); vAccesos(c); }).catch(function (e) { toast(e.error, true); });
      };
    }).catch(function (e) { if (e.status === 401) S.maestra = ''; c.innerHTML = '<div class="clis-aviso r">' + esc(e.error) + '</div>'; setTimeout(function () { vAccesos(c); }, 1500); });
  }

  /* ---------- montaje en línea (pestaña de programador) ---------- */
  function montarFletes(elId) {
    var host = typeof elId === 'string' ? D.getElementById(elId) : elId; if (!host) return;
    if (S.montajes.indexOf(host) < 0) S.montajes.push(host);
    estilos();
    host.innerHTML = '<div class="clis clis-inline' + (oscuroHost() ? ' oscuro' : '') + '"><div class="clis-cuerpo" id="clis-inl" style="background:var(--p)"></div></div>';
    var c = $('#clis-inl', host);
    listo().then(function () {
      cargarSesion();
      var go = function () { var rol = S.ses && S.ses.yo && S.ses.yo.rol; if (['programacion', 'progmaster', 'gerencia', 'admin'].indexOf(rol) < 0) { c.innerHTML = '<div class="clis-aviso w">Tu usuario no tiene acceso a Fletes y precios. Entra con el usuario de Programación.</div><button class="clis-btn sec" id="clis-otro">Usar otro usuario</button>'; $('#clis-otro', c).onclick = function () { S.ses = null; lss(LS_SES, null); formLogin(c, go); }; return; } vFletes(c); };
      if (!S.ses) formLogin(c, function () { refrescarBandeja(true); go(); }); else go();
    });
  }

  /* ---------- arranque ---------- */
  function iniciar() {
    estilos(); cargarSesion();
    listo().then(function () {
      if (!(SCRIPT && SCRIPT.dataset.sinBoton === '1')) fab();
      refrescarBandeja(true);
      setInterval(function () { if (!D.hidden) refrescarBandeja(true); }, 45000);
      D.addEventListener('visibilitychange', function () { if (!D.hidden) refrescarBandeja(true); });
    }).catch(function (e) { console.warn('Clientes:', e); });
  }
  // Lo llama programador.html al entrar con su contraseña: abre la sesión del módulo sin pedirla otra vez.
  function loginProgramador(pwd) {
    if (!MODO_PROG || !pwd) return Promise.resolve();
    return listo().then(function () { return api('loginProg', '', { pwd: pwd }); }).then(function (r) {
      guardaSesion(r); refrescarBandeja(true);
      S.montajes.forEach(function (m) { if (D.body.contains(m)) montarFletes(m); });
    }).catch(function () {});
  }
  function salir() { S.ses = null; S.bandeja = null; S.filtro = null; S.fletes = null; lss(LS_SES, null); cerrar(); var n = $('.clis-fab .clis-n'); if (n) n.hidden = true; S.montajes.forEach(function (m) { if (D.body.contains(m)) montarFletes(m); }); }
  W.CliStaff = { abrir: function () { listo().then(abrir); }, mountFletes: montarFletes, refrescar: refrescarBandeja, loginProgramador: loginProgramador, salir: salir };
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})(window, document);
