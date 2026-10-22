/* ================================================================
   App Clientes — MODO DEMOSTRACIÓN
   Corre la misma lógica de cli-core.js dentro del navegador, sobre una
   base de datos de prueba guardada en este equipo (localStorage).
   Todos los datos son ficticios. Sirve para probar el flujo completo
   (cliente → vendedor → Administración → Cargadores → facturación)
   sin tocar Firebase. Se activa con ?demo=1 en la dirección.
   ================================================================ */
(function (W) {
  'use strict';
  var KEY = 'cliDemoDB_v1';
  function load() { try { var s = localStorage.getItem(KEY); if (s) return JSON.parse(s); } catch (e) {} return null; }
  function save(t) { try { localStorage.setItem(KEY, JSON.stringify(t)); } catch (e) {} }
  function parts(p) { return String(p || '').split('/').filter(Boolean); }
  function getIn(t, p) { var a = parts(p), o = t; for (var i = 0; i < a.length; i++) { if (o == null || typeof o !== 'object') return null; o = o[a[i]]; } return o === undefined ? null : JSON.parse(JSON.stringify(o)); }
  function setIn(t, p, v) {
    var a = parts(p); if (!a.length) return;
    var o = t; for (var i = 0; i < a.length - 1; i++) { if (o[a[i]] == null || typeof o[a[i]] !== 'object') o[a[i]] = {}; o = o[a[i]]; }
    if (v === null || v === undefined) delete o[a[a.length - 1]]; else o[a[a.length - 1]] = JSON.parse(JSON.stringify(v));
  }
  function memDB(tree, persist) {
    return {
      tree: tree,
      get: function (p) { return getIn(tree, p); },
      set: function (p, v) { setIn(tree, p, v); persist && persist(tree); },
      update: function (base, o) { Object.keys(o).forEach(function (k) { setIn(tree, base + '/' + k, o[k]); }); persist && persist(tree); },
      remove: function (p) { setIn(tree, p, null); persist && persist(tree); }
    };
  }
  function demoHash(pin, salt) { var h = 0, s = salt + ':' + pin; for (var i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; } return 'd' + (h >>> 0).toString(16); }

  function semilla() {
    var t = Date.now(); var d = new Date(); var m = d.getMonth() + 1; var mPrev = ((m + 10) % 12) + 1, mPrev2 = ((m + 9) % 12) + 1;
    function pm(a, b, c) { var o = {}; o[mPrev2] = a; o[mPrev] = b; o[m] = c; return o; }
    var rows = [
      { n: 'ABARROTES LA ESTRELLA (DEMO)', avg: 640, mix: 6.2, mixp: 6.2, desc: 1.75, crecio: true, premOk: true, boost: 0.5, evalSac: 700, antSac: 600, premEval: 40, vitSac: 380, baseCrec: 700, vitPB: 18, vitPM: 18, ult: m, tot: 6100,
        pm: { 'SILVER KAN 18% 25 KGS': pm(260, 300, 170), 'KAN KAN 25KG': pm(200, 230, 120), 'SILVER KAN PREMIUM + 22% 25 KG': pm(25, 30, 12), 'SILVER CAT 15 KGS': pm(10, 12, 6), 'MI BOOB 20 KGS': pm(100, 128, 72) } },
      { n: 'FORRAJERA EL MEZQUITE (DEMO)', avg: 180, mix: 2.1, mixp: 2.1, desc: 0, crecio: false, premOk: false, boost: 0, evalSac: 170, antSac: 190, premEval: 3, vitSac: 60, baseCrec: 170, vitPB: 2, vitPM: 2, ult: m, tot: 1700,
        pm: { 'KAN KAN 25KG': pm(120, 110, 40), 'PET FOOD 20 KG (R)': pm(60, 60, 20) } }
    ];
    var tree = {
      licencia: { activa: true },
      skan: {
        _index: { vendors: ['VENDEDORDEMO'], updatedStr: 'demostración' },
        VENDEDORDEMO: { v: 'VENDEDOR DEMO', mesEval: mPrev, mesAnt: mPrev2, mesCurso: m, mesVitrina: m, vitLabel: '', evalPeriod: 'MES', evalLabel: '', lastMonth: m,
          prem: { base: 3, u1: 5, e1: 0.5, u2: 7.5, e2: 1.0 }, updated: t - 86400000, updatedStr: 'ayer', rows: rows }
      },
      cli: {
        config: { mostrarPrecios: true, ivaPet: 16, ivaPec: 0, waAdmin: '3330000000', avisoGeneral: '' },
        precios: {
          prod: { '04MAS001': 'SILVER KAN PREMIUM + 22% DE 25KG', '04MAS0019': 'SILVER KAN PREMIUM 20 KGS', '04MAS003': 'SILVER KAN 18% 25 KGS', '04MAS004': 'SILVER KAN CACHORRO 20 KGS', '04MAS006': 'SILVER CAT 15 KGS', '04MAS0020': 'KAN KAN 25 KG', '04MAS009': 'KAN KAN 20 KGS', '04MAS008': 'MI BOOB 20 KGS', '04MAS010': 'PET FOOD 20 KG (R)' },
          lists: { DEMO1: { name: 'LISTA DEMO 1', iva: true, items: { '04MAS001': 480, '04MAS0019': 420, '04MAS003': 340, '04MAS004': 350, '04MAS006': 330, '04MAS0020': 320, '04MAS009': 260, '04MAS008': 250, '04MAS010': 215 } } },
          actualizado: t, nCatalogo: 2
        },
        catalogo: {
          ABARROTESLAESTRELLADEMO: { n: 'ABARROTES LA ESTRELLA (DEMO)', l: ['DEMO1'], t: '3311112222', v: 'VENDEDOR DEMO', z: 'ZONA DEMO', cr: 'Libre' },
          FORRAJERAELMEZQUITEDEMO: { n: 'FORRAJERA EL MEZQUITE (DEMO)', l: ['DEMO1'], t: '', v: 'VENDEDOR DEMO', z: 'ZONA DEMO', cr: 'Libre' }
        },
        fletes: {
          params: { diesel: 27, kmAnual: 81500, anios: 5 }, vehiculos: {},
          rutas: { DEMOARANDAST: { destino: 'Arandas (demo)', vehiculo: 'TORTON', km: 160, casetas: 122, cobrado: 0 }, DEMOARANDASR: { destino: 'Arandas (demo)', vehiculo: 'TRAILER', km: 160, casetas: 500, cobrado: 0 } }
        },
        clientes: { ABARROTESLAESTRELLADEMO: { skanName: 'ABARROTES LA ESTRELLA (DEMO)', vk: 'VENDEDORDEMO', catKey: 'ABARROTESLAESTRELLADEMO', listaRecoge: 'DEMO1', rutas: ['DEMOARANDAST', 'DEMOARANDASR'], precios: 'auto' } },
        staff: {},
        vendTel: { VENDEDORDEMO: '3331234567' }
      }
    };
    [['DEMO', 'Vendedor Demo', 'vendedor', 'VENDEDORDEMO'], ['ADMINISTRACION', 'Administración Demo', 'admin', ''], ['PROGRAMACION', 'Programación Demo', 'programacion', ''], ['GERENCIA', 'Gerencia Demo', 'gerencia', '']].forEach(function (x) {
      tree.cli.staff[x[0]] = { nombre: x[1], rol: x[2], vk: x[3], salt: 's' + x[0], pinHash: demoHash('123456', 's' + x[0]), pinVer: 1, activo: true, tel: '3330000000' };
    });
    return tree;
  }

  var tree = load() || semilla();
  if (!tree.config) tree.config = { pwd: 'admin123', masterPwd: 'master-2026' };   // contraseñas de ejemplo del programador
  save(tree);
  var db = memDB(tree, save);
  var core = W.CliCore.create({ db: db, hashPin: demoHash, notifyPush: function () { return Promise.resolve(); } });

  function b64(o) { return btoa(unescape(encodeURIComponent(JSON.stringify(o)))); }
  function unb64(s) { try { return JSON.parse(decodeURIComponent(escape(atob(s)))); } catch (e) { return null; } }
  function fresh() { var t = load(); if (t) { Object.keys(tree).forEach(function (k) { delete tree[k]; }); Object.assign(tree, t); } }

  // Misma firma que la llamada real a la función en la nube.
  function api(modo, accion, datos, auth) {
    fresh();
    return new Promise(function (res) { setTimeout(res, 180); }).then(function () {
      if (modo === 'cliente') { if (!auth || !auth.uid) throw { status: 401, error: 'Inicia sesión de nuevo.', code: 'sin_sesion' }; return core.cliente({ uid: auth.uid, tel: auth.tel }, accion, datos); }
      if (modo === 'login') return core.staffLogin(datos.usuario, datos.pin).then(function (ses) { return { token: b64(ses), yo: ses }; });
      if (modo === 'loginProg') return core.progLogin(datos.pwd).then(function (ses) { return { token: b64(ses), yo: ses }; });
      if (modo === 'staff') { var ses = unb64(auth && auth.sesion); if (!ses) throw { status: 401, error: 'Tu sesión terminó.', code: 'sin_sesion' }; return core.staff(ses, accion, datos); }
      if (modo === 'maestro') { if (accion === 'estado') return { reglasCerradas: true, licenciaClientes: true, licenciaPersonal: true }; return core.maestro(accion, datos); }
      throw { status: 400, error: 'Solicitud no válida' };
    }).catch(function (e) { if (e && e.publico) throw { status: e.status, error: e.publico, code: e.code }; throw e; });
  }
  // Simula que Cargadores finaliza la unidad de ese pedido/remisión (lo que en real hace el disparador).
  function simularCargador(remision, lotes) {
    fresh();
    var id = 'EMB' + Date.now();
    var hora = new Date().toTimeString().slice(0, 5);
    var emb = { id: id, pedido: remision, cliente: 'demo', despachado: true, horaSalida: hora, finCarga: hora, fechaCarga: new Date().toISOString().slice(0, 10), tipo: 'TORTON', eco: 'ECO-12', lotes: lotes || [{ prod: 'SILVER KAN 18% 25 KGS', lote: 'L' + Math.floor(Math.random() * 90000 + 10000), sacos: 20 }] };
    db.set('embarques/' + id, emb);
    return core.onEmbarque(null, emb);
  }
  // Simula que ventas publica una facturación nueva que ya incluye el pedido.
  function simularFacturacion(sacosExtra) {
    fresh();
    var p = db.get('skan/VENDEDORDEMO'); var m = new Date().getMonth() + 1;
    var r = p.rows[0]; var k = Object.keys(r.pm)[0]; r.pm[k][m] = (r.pm[k][m] || 0) + (sacosExtra || 100); r.vitSac = (r.vitSac || 0) + (sacosExtra || 100);
    p.updated = Date.now(); p.updatedStr = 'hace un momento';
    db.set('skan/VENDEDORDEMO', p);
  }
  function reiniciar() { try { localStorage.removeItem(KEY); } catch (e) {} var t = semilla(); Object.keys(tree).forEach(function (k) { delete tree[k]; }); Object.assign(tree, t); save(tree); }

  W.CliDemo = { api: api, simularCargador: simularCargador, simularFacturacion: simularFacturacion, reiniciar: reiniciar, memDB: memDB, demoHash: demoHash };
})(typeof window !== 'undefined' ? window : this);
