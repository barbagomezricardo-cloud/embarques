/* ================================================================
   App Clientes 19 Hermanos — LÓGICA CENTRAL (compartida)
   ----------------------------------------------------------------
   Este mismo archivo lo usan:
     · La función en la nube (clientes/funciones/clientes.js) — es la
       que de verdad manda: valida, guarda y decide qué ve cada quien.
     · El modo demostración (?demo=1) de la app de clientes y del
       panel del personal, para probar todo el flujo sin tocar datos.
   Toda la información de clientes vive en el nodo /cli de Firebase,
   que NO es legible ni escribible desde fuera: solo esta lógica,
   corriendo en la función, entra ahí.
   ================================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CliCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- utilidades ---------- */
  function keyp(s) { return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function digits(s) { return String(s || '').replace(/\D/g, ''); }
  function tel10(s) { var d = digits(s); return d.length > 10 ? d.slice(-10) : d; }
  function normRem(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^0+/, ''); }
  function remNum(s) { var m = String(s || '').match(/(\d{3,})\s*$/); return m ? m[1].replace(/^0+/, '') : ''; }
  function clip(s, n) { s = String(s == null ? '' : s).trim(); return s.length > n ? s.slice(0, n) : s; }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : (d || 0); }
  function err(code, msg, status) { var e = new Error(msg || code); e.code = code; e.status = status || 400; e.publico = msg || code; return e; }
  function dayKey(t) { var d = new Date(t); return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2); }
  function mxDate(t) { // fecha/hora de México (UTC-6, sin horario de verano desde 2022)
    var d = new Date(t - 6 * 3600 * 1000);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), hh: d.getUTCHours(), mi: d.getUTCMinutes() };
  }
  function similar(a, b) { // parecido de nombres 0..1 (tokens en común)
    var ta = keyTokens(a), tb = keyTokens(b); if (!ta.length || !tb.length) return 0;
    var hit = 0; ta.forEach(function (t) { if (tb.indexOf(t) >= 0) hit++; });
    return hit / Math.max(ta.length, tb.length);
  }
  var STOP = ['SA', 'DE', 'CV', 'S', 'A', 'C', 'V', 'RL', 'SRL', 'SPR', 'LA', 'EL', 'LOS', 'LAS', 'Y', 'DEL'];
  function keyTokens(s) {
    return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ')
      .split(/\s+/).filter(function (t) { return t && STOP.indexOf(t) < 0; });
  }

  /* ---------- producto ---------- */
  var PREMIUM_RE = /PREMIUM/i, GATO_RE = /SILVER\s*CAT\s*15/i;
  function prodKg(nombre) { var m = String(nombre || '').match(/(\d+(?:\.\d+)?)\s*K(?:G|GS|ILOS)?\b/i); return m ? Number(m[1]) : 25; }
  function esPetFood(code) { return /^04MAS/i.test(String(code || '')); }
  function esPremium(nombre) { var n = String(nombre || '').toUpperCase().replace(/KAT/g, 'CAT'); return PREMIUM_RE.test(n) || GATO_RE.test(n); }
  function sacosPorTon(kg) { return Math.round(1000 / (kg || 25)); }   // 25→40 · 20→50 · 15→67 · 5→200 (misma regla del Excel)

  /* ---------- fletes (modelo del Excel "PARA IMPLEMENTAR", corregido) ---------- */
  var VEHICULOS_BASE = {
    NISSAN:  { nombre: 'Nissan',  ton: 1,  rend: 8,   mantKm: 10000, mantCosto: 4000, valor: 280000,  seguro: 18,     ayudante: 300,  margen: 0.082 },
    ISUZU:   { nombre: 'Isuzu',   ton: 5,  rend: 4.5, mantKm: 15000, mantCosto: 3500, valor: 600000,  seguro: 28,     ayudante: 529,  margen: 0.06625 },
    TORTON:  { nombre: 'Tortón',  ton: 15, rend: 3,   mantKm: 15000, mantCosto: 4000, valor: 2100000, seguro: 273.3,  ayudante: 1800, margen: 0.13 },
    TRAILER: { nombre: 'Tráiler', ton: 30, rend: 2,   mantKm: 15000, mantCosto: 8000, valor: 2220000, seguro: 275.38, ayudante: 3600, margen: 0.16 }
  };
  var PARAMS_BASE = { diesel: 27, kmAnual: 81500, anios: 5 };
  function calcFlete(ruta, fl) {
    fl = fl || {}; var P = Object.assign({}, PARAMS_BASE, fl.params || {});
    var vk = String(ruta.vehiculo || 'TORTON').toUpperCase();
    var V = Object.assign({}, VEHICULOS_BASE[vk] || VEHICULOS_BASE.TORTON, (fl.vehiculos || {})[vk] || {});
    var o = function (k) { return (ruta[k] !== undefined && ruta[k] !== '' && ruta[k] !== null) ? num(ruta[k]) : num(V[k]); };
    var km = num(ruta.km), diesel = (ruta.diesel !== undefined && ruta.diesel !== '' && ruta.diesel !== null) ? num(ruta.diesel) : num(P.diesel);
    var rend = o('rend'), ton = o('ton') || 1;
    var mant = km / (o('mantKm') || 1) * o('mantCosto');
    var dep = o('valor') / ((num(P.kmAnual) || 81500) * (num(P.anios) || 5)) * km;
    var seguro = o('seguro'), ayud = o('ayudante');
    var comb = rend > 0 ? km / rend * diesel : 0;
    var transp = mant + dep + seguro + comb + ayud;
    var margen = transp * o('margen');
    var casetas = num(ruta.casetas);
    var total = transp + casetas + margen;
    var porTon = total / ton;
    return {
      vehiculo: vk, vehiculoNombre: V.nombre || vk, ton: ton, km: km,
      mant: mant, dep: dep, seguro: seguro, combustible: comb, ayudante: ayud, transporte: transp, margen: margen, casetas: casetas,
      total: total, porTon: porTon,
      saco25: porTon / 40, saco20: porTon / 50, saco15: porTon / 67, saco5: porTon / 200,
      porSaco: function (kg) { return porTon / sacosPorTon(kg); },
      cobrado: num(ruta.cobrado), diferencia: num(ruta.cobrado) ? (total - num(ruta.cobrado)) : null
    };
  }

  /* ---------- niveles (mismo programa 04MAS de vendedor.html) ---------- */
  var TIERS_BASE = [["DIAMANTE_PLUS", 15000, 2.0, 0.75, 0.75, 2], ["DIAMANTE", 9000, 2.0, 0.25, 0.25, 2], ["PLATINO", 5000, 1.75, 0.5, 0.25, 3], ["ORO", 3000, 1.5, 0.5, 0.5, 6], ["PLATA", 1000, 1.25, 0.75, 0.5, 10], ["BRONCE", 600, 1.0, 0.75, 0.75, 20], ["COBRE", 200, 0.75, 0.75, 1.0, 30], ["INICIAL", 0, 0, 0, 0, 999]];
  var TIER_ORDER = ["DIAMANTE_PLUS", "DIAMANTE", "PLATINO", "ORO", "PLATA", "BRONCE", "COBRE", "INICIAL"];
  function tiersDeConfig(cfgRaw) {
    var cfg = null;
    try { cfg = cfgRaw && cfgRaw.tierCfg04mas_v6 ? JSON.parse(cfgRaw.tierCfg04mas_v6) : null; } catch (e) { cfg = null; }
    if (!cfg) return TIERS_BASE;
    var t = TIER_ORDER.map(function (k) { var c = cfg[k]; if (!c) return null; return [k, num(c.min), num(c.fijo), num(c.kc), num(c.kp), num(c.uc) || 999]; }).filter(Boolean);
    return t.length ? t : TIERS_BASE;
  }

  /* ---------- estados del pedido ---------- */
  var ESTADOS = ['enviado', 'confirmado', 'fincado', 'liberado', 'facturado', 'rechazado', 'cancelado'];
  var ABIERTOS = { enviado: 1, confirmado: 1, fincado: 1, liberado: 1 };

  /* ================================================================ */
  function create(deps) {
    var db = deps.db;                       // {get(path), set(path,v), update(path,obj), remove(path)}
    var now = deps.now || function () { return Date.now(); };
    var newId = deps.newId || function () { return now().toString(36) + Math.random().toString(36).slice(2, 8); };
    var notifyPush = deps.notifyPush || function () { return Promise.resolve(); };
    var hashPin = deps.hashPin;             // async (pin, salt) => hash
    var randomSalt = deps.randomSalt || function () { return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); };

    function P(p) { return 'cli/' + p; }
    function g(p) { return Promise.resolve(db.get(P(p))); }
    function s(p, v) { return Promise.resolve(db.set(P(p), v)); }
    function u(p, o) { return Promise.resolve(db.update(P(p), o)); }

    function audit(quien, accion, det) {
      var id = newId();
      return s('audit/' + id, { ts: now(), quien: quien || '', accion: accion, det: det || null }).catch(function () {});
    }
    function rateLimit(who, tipo, max) {
      var k = 'rl/' + keyp(who) + '/' + dayKey(now()) + '/' + tipo;
      return g(k).then(function (n) { n = num(n); if (n >= max) throw err('limite', 'Llegaste al límite diario de esta acción. Intenta mañana o llama a tu vendedor.', 429); return s(k, n + 1); });
    }
    function getConfig() { return g('config').then(function (c) { return Object.assign({ mostrarPrecios: false, ivaPet: 16, ivaPec: 0, waAdmin: '', avisoGeneral: '' }, c || {}); }); }

    function notificar(uid, titulo, cuerpo, datos) {
      var id = newId();
      var n = { ts: now(), titulo: titulo, cuerpo: cuerpo, datos: datos || null, leida: false };
      return s('notifs/' + uid + '/' + id, n).then(function () {
        return g('usuarios/' + uid + '/tokens').then(function (tk) {
          var toks = Object.keys(tk || {}).map(function (k) { return tk[k] && tk[k].t; }).filter(Boolean);
          if (!toks.length) return;
          return Promise.resolve(notifyPush(toks, titulo, cuerpo, datos)).catch(function () {});
        });
      });
    }

    /* ---------- datos de ventas publicados (/skan) ---------- */
    function leerSkanVendor(vk) { return Promise.resolve(db.get('skan/' + vk)); }
    function filaCliente(vk, nombre) {
      return leerSkanVendor(vk).then(function (p) {
        if (!p || !p.rows) return null;
        var kn = keyp(nombre);
        var row = null; for (var i = 0; i < p.rows.length; i++) { if (keyp(p.rows[i].n) === kn) { row = p.rows[i]; break; } }
        if (!row) return null;
        var meta = { v: p.v, mesEval: p.mesEval || 0, mesAnt: p.mesAnt || 0, mesCurso: p.mesCurso || 0, mesVitrina: p.mesVitrina || 0, vitLabel: p.vitLabel || '', lastMonth: p.lastMonth || 0,
          corte: p.corte || null, evalPeriod: p.evalPeriod || 'TRIM', evalLabel: p.evalLabel || '', updated: p.updated || 0, updatedStr: p.updatedStr || '', prem: p.prem || null, cobre: p.cobre || null, q: p.q || null };
        var r = Object.assign({}, row);
        delete r.nvCand; delete r.nvRitmo; delete r.nvProm6; delete r.nvFrio; delete r.nvDias; delete r.e;   // internos de venta
        if (r.esp) r.esp = { pct: r.esp.pct, hasta: r.esp.hasta || '' };                                       // sin el motivo interno
        return { meta: meta, row: r };
      });
    }
    function buscarEnSkan(q, limite) {
      var kq = keyp(q); var out = [];
      return Promise.resolve(db.get('skan/_index')).then(function (idx) {
        var vs = (idx && idx.vendors) || [];
        return Promise.all(vs.map(function (vk) {
          return leerSkanVendor(vk).then(function (p) {
            (p && p.rows || []).forEach(function (r) {
              var sc = kq && keyp(r.n).indexOf(kq) >= 0 ? 1 : similar(q, r.n);
              if (sc >= 0.5) out.push({ n: r.n, vk: vk, v: p.v || vk, avg: Math.round(r.avg || 0), sc: sc });
            });
          }).catch(function () {});
        }));
      }).then(function () { out.sort(function (a, b) { return b.sc - a.sc || b.avg - a.avg; }); return out.slice(0, limite || 15); });
    }

    /* ---------- precios para un cliente ---------- */
    function preciosCliente(cliCfg, cfg) {
      var vis = (cliCfg && cliCfg.precios) || 'auto';
      var mostrar = vis === 'mostrar' ? true : (vis === 'ocultar' ? false : !!cfg.mostrarPrecios);
      return Promise.all([g('precios'), g('fletes'), cliCfg && cliCfg.catKey ? g('catalogo/' + cliCfg.catKey) : Promise.resolve(null)]).then(function (a) {
        var pr = a[0] || {}, fl = a[1] || {}, cat = a[2];
        var lists = pr.lists || {}, prod = pr.prod || {};
        var lid = (cliCfg && cliCfg.listaRecoge) || (cat && cat.l && cat.l[0]) || '';
        var L = lists[lid];
        var Le = cliCfg && cliCfg.listaEntrega ? lists[cliCfg.listaEntrega] : null;
        var codes;
        if (L && L.items) codes = Object.keys(L.items).filter(function (c) { return num(L.items[c]) > 0 && c !== 'SER001'; });
        else codes = Object.keys(prod).filter(esPetFood);
        if (!codes.length) codes = ['04MAS001', '04MAS0019', '04MAS003', '04MAS004', '04MAS006', '04MAS0020', '04MAS009', '04MAS008', '04MAS010'];
        var rutas = ((cliCfg && cliCfg.rutas) || []).map(function (rid) { var r = (fl.rutas || {})[rid]; return r ? Object.assign({ id: rid }, r) : null; }).filter(Boolean);
        var productos = codes.map(function (c) {
          var nombre = prod[c] || c, kg = prodKg(nombre), pet = esPetFood(c);
          var o = { code: c, nombre: nombre, kg: kg, petfood: pet, premium: pet && esPremium(nombre) };
          if (mostrar && L) {
            var ivaPct = L.iva ? (pet ? num(cfg.ivaPet, 16) : num(cfg.ivaPec, 0)) : 0;
            var base = num(L.items[c]);
            var esc = [{ id: 'recoge', tipo: 'recoge', label: 'Recoges en planta', precio: r2(base), conIva: r2(base * (1 + ivaPct / 100)) }];
            if (Le && num((Le.items || {})[c]) > 0) {
              var pe = num(Le.items[c]); var ivaE = Le.iva ? ivaPct || (pet ? num(cfg.ivaPet, 16) : 0) : 0;
              esc.push({ id: 'lista-entrega', tipo: 'entrega', label: 'Entregado en tu negocio', precio: r2(pe), conIva: r2(pe * (1 + ivaE / 100)), flete: r2(pe - base) });
            } else {
              rutas.forEach(function (rt) {
                var f = calcFlete(rt, fl); var fs = f.porSaco(kg);
                esc.push({ id: 'ruta-' + rt.id, tipo: 'entrega', label: 'Entregado en ' + f.vehiculoNombre + (rt.destino ? ' · ' + rt.destino : ''), flete: r2(fs), precio: r2(base + fs), conIva: r2((base + fs) * (1 + ivaPct / 100)), cap: Math.round(f.ton * sacosPorTon(kg)) });
              });
            }
            o.ivaPct = ivaPct; o.desglosaIva = !!L.iva; o.escenarios = esc;
          }
          return o;
        });
        productos.sort(function (a, b) { return (b.petfood - a.petfood) || (b.premium - a.premium) || a.nombre.localeCompare(b.nombre); });
        return { mostrar: !!(mostrar && L), lista: L ? (L.name || lid) : '', productos: productos,
          entregas: rutas.map(function (rt) { var f = calcFlete(rt, fl); return { id: 'ruta-' + rt.id, label: f.vehiculoNombre + (rt.destino ? ' · ' + rt.destino : ''), ton: f.ton }; }) };
      });
    }
    function r2(n) { return Math.round(n * 100) / 100; }

    /* ---------- facturación detectada ---------- */
    // El avance del cliente solo cambia cuando ventas publica la facturación de Odoo. Al confirmar
    // se guarda cuánto llevaba en ese mes; cuando el reporte publicado ya trae esos sacos de más,
    // el pedido se marca "facturado" solo.
    function sumaMes(row, m) { var s = 0, pm = row && row.pm || {}; Object.keys(pm).forEach(function (p) { s += num((pm[p] || {})[m]); }); return s; }
    function revisarFacturados(peds, fila) {
      if (!fila) return Promise.resolve(peds);
      var cambios = [];
      peds.forEach(function (p) {
        if (p.estado !== 'liberado' || !p.snap) return;
        if (!(fila.meta.updated > (p.liberacion && p.liberacion.ts || 0))) return;
        var m = p.snap.mes, ahora = sumaMes(fila.row, m);
        var sacos = p.items.reduce(function (a, it) { return a + (it.petfood ? num(it.piezas) : 0); }, 0);
        if (sacos > 0 && ahora - num(p.snap.sacosMes) >= sacos * 0.9) {
          cambios.push(cambiarEstado(p, 'facturado', 'sistema', 'Facturación publicada por ventas', {}).then(function (np) { Object.assign(p, np); }));
        }
      });
      return Promise.all(cambios).then(function () { return peds; });
    }

    /* ---------- pedidos ---------- */
    function cambiarEstado(p, estado, quien, nota, extra) {
      var t = now();
      var hist = (p.hist || []).concat([{ e: estado, ts: t, por: quien, nota: clip(nota, 300) }]);
      var upd = Object.assign({ estado: estado, hist: hist, actualizado: t }, extra || {});
      var multi = {};
      Object.keys(upd).forEach(function (k) { multi['pedidos/' + p.id + '/' + k] = upd[k]; });
      multi['ix/abiertos/' + p.id] = ABIERTOS[estado] ? estado : null;
      return Promise.resolve(db.update('cli', multi)).then(function () {
        var np = Object.assign({}, p, upd);
        var msg = mensajeEstado(np);
        return (msg ? notificar(p.uid, msg.t, msg.c, { pedido: p.id, estado: estado }) : Promise.resolve()).then(function () { return np; });
      });
    }
    function mensajeEstado(p) {
      var folio = p.folio || p.id;
      switch (p.estado) {
        case 'confirmado': return { t: 'Pedido ' + folio + ' confirmado', c: 'Tu vendedor confirmó tu pedido. Ventas lo está registrando.' };
        case 'fincado': return { t: 'Pedido ' + folio + ' registrado', c: 'Quedó registrado con la remisión ' + (p.remision || '') + ' y pasa a programación de carga.' };
        case 'liberado': return { t: p.modalidad === 'recoge' ? 'Tu pedido ' + folio + ' está cargado' : 'Tu pedido ' + folio + ' va en camino', c: 'Salió a las ' + ((p.liberacion && p.liberacion.hora) || '') + '. Está en proceso de facturación; al facturarse se suma a tu avance del mes.' };
        case 'facturado': return { t: 'Pedido ' + folio + ' facturado', c: 'Ya se sumó a tu avance del mes y cuenta para tus descuentos.' };
        case 'rechazado': return { t: 'Pedido ' + folio + ' no procedió', c: p.motivo ? ('Motivo: ' + p.motivo) : 'Tu vendedor se pondrá en contacto contigo.' };
        default: return null;
      }
    }
    function folioNuevo() {
      var d = mxDate(now());
      var pref = 'PP' + String(d.y).slice(-2) + ('0' + d.m).slice(-2);
      var k = 'seq/' + pref;
      return g(k).then(function (n) { n = num(n) + 1; return s(k, n).then(function () { return pref + '-' + ('000' + n).slice(-4); }); });
    }
    function pedidoPublico(p, mostrarPrecios) {
      var o = { id: p.id, folio: p.folio, estado: p.estado, creado: p.creado, actualizado: p.actualizado, modalidad: p.modalidad, entregaLabel: p.entregaLabel || '',
        nota: p.nota || '', items: (p.items || []).map(function (it) { var x = { code: it.code, nombre: it.nombre, piezas: it.piezas, kg: it.kg }; if (mostrarPrecios && it.precio) { x.precio = it.precio; x.conIva = it.conIva; } return x; }),
        remision: p.remision || '', motivo: p.motivo || '', ajustado: !!p.ajustado,
        liberacion: p.liberacion ? { ts: p.liberacion.ts, fecha: p.liberacion.fecha, hora: p.liberacion.hora, lotes: p.liberacion.lotes || [], unidad: p.liberacion.unidad || '' } : null,
        hist: (p.hist || []).map(function (h) { return { e: h.e, ts: h.ts }; }) };
      if (mostrarPrecios && p.totales) o.totales = p.totales;
      return o;
    }
    function pedidosDeUid(uid) {
      return g('ix/uidPed/' + uid).then(function (ix) {
        var ids = Object.keys(ix || {}).sort(function (a, b) { return num(ix[b]) - num(ix[a]); }).slice(0, 40);
        return Promise.all(ids.map(function (id) { return g('pedidos/' + id); }));
      }).then(function (a) { return a.filter(Boolean); });
    }

    /* =================== API DEL CLIENTE =================== */
    // ident = {uid, tel} ya verificado (token de Firebase Auth por SMS)
    function cliente(ident, accion, body) {
      body = body || {};
      if (!ident || !ident.uid) return Promise.reject(err('sin_sesion', 'Inicia sesión de nuevo.', 401));
      var uid = ident.uid;
      return g('usuarios/' + uid).then(function (us) {
        switch (accion) {
          case 'yo': return accYo(uid, us, body);
          case 'registrar': return accRegistrar(ident, us, body);
          case 'ping': return accPing(uid, us, body);
          case 'prepedido': return accPrepedido(uid, us, body);
          case 'cancelar': return accCancelar(uid, us, body);
          case 'mensaje': return accMensaje(uid, us, body);
          case 'leerNotifs': return accLeerNotifs(uid, body);
          case 'eliminarCuenta': return accEliminar(uid, us);
          default: throw err('accion', 'Acción no válida');
        }
      });
    }
    function exigeActivo(us) {
      if (!us) throw err('sin_registro', 'Completa tu registro.', 403);
      if (us.estado !== 'activo') throw err('no_activo', us.estado === 'pendiente' ? 'Tu registro está en revisión. Te avisamos en cuanto quede activo.' : 'Tu acceso no está activo. Comunícate con tu vendedor.', 403);
    }
    function accYo(uid, us, body) {
      if (!us) return { estado: 'sin_registro' };
      var base = { estado: us.estado, usuario: { nombre: us.nombre, razonSocial: us.razonSocial, numCliente: us.numCliente || '', tel: us.tel, telContacto: us.telContacto || '', negocio: us.negocio || null, alta: us.alta, motivo: us.estado === 'rechazado' || us.estado === 'suspendido' ? (us.motivo || '') : '' } };
      return Promise.all([g('notifs/' + uid), getConfig()]).then(function (a) {
        var nt = a[0] || {}, cfg = a[1];
        base.notifs = Object.keys(nt).map(function (k) { return Object.assign({ id: k }, nt[k]); }).sort(function (x, y) { return y.ts - x.ts; }).slice(0, 30);
        base.aviso = cfg.avisoGeneral || '';
        if (us.estado !== 'activo') return base;
        var filaP = (us.vk ? filaCliente(us.vk, us.skanName) : Promise.resolve(null)).then(function (f) {
          if (f || !us.sinCartera) return f;
          return Promise.resolve(db.get('skan/_index')).then(function (idx) {
            var vs = (idx && idx.vendors) || [];
            return vs.reduce(function (p, vk) { return p.then(function (hit) { return hit || filaCliente(vk, us.skanName).then(function (x) { return x ? { f: x, vk: vk } : null; }); }); }, Promise.resolve(null));
          }).then(function (hit) {
            if (!hit) return null;
            var mm = {}; mm['usuarios/' + uid + '/vk'] = hit.vk; mm['usuarios/' + uid + '/sinCartera'] = null; mm['usuarios/' + uid + '/vendedorNombre'] = hit.f.meta.v || ''; mm['clientes/' + us.clienteKey + '/vk'] = hit.vk;
            us.vk = hit.vk;
            return Promise.resolve(db.update('cli', mm)).then(function () { return hit.f; });
          });
        });
        return Promise.all([
          g('clientes/' + us.clienteKey),
          filaP,
          Promise.resolve(db.get('skan/_config')),
          pedidosDeUid(uid),
          g('ix/uidMsg/' + uid),
          us.vk ? g('vendTel/' + us.vk) : Promise.resolve('')
        ]).then(function (b) {
          var cc = b[0] || {}, fila = b[1], tiers = tiersDeConfig(b[2]);
          return revisarFacturados(b[3], fila).then(function (peds) {
            return preciosCliente(cc, cfg).then(function (pr) {
              var msgIds = Object.keys(b[4] || {}).sort().reverse().slice(0, 20);
              return Promise.all(msgIds.map(function (id) { return g('mensajes/' + id); })).then(function (msgs) {
                base.cliente = { nombre: us.skanName, vendedor: fila ? fila.meta.v : (us.vendedorNombre || ''), vendedorTel: b[5] || '' };
                base.avance = fila; base.tiers = tiers;
                base.precios = pr;
                base.pedidos = peds.sort(function (x, y) { return y.creado - x.creado; }).map(function (p) { return pedidoPublico(p, pr.mostrar); });
                base.mensajes = msgs.filter(Boolean).map(function (m) { return { id: m.id, ts: m.ts, texto: m.texto, respuesta: m.respuesta || '', respTs: m.respTs || 0 }; });
                base.waVentas = cfg.waAdmin || '';
                return g('notifs/' + uid).then(function (nt2) {
                  nt2 = nt2 || {};
                  base.notifs = Object.keys(nt2).map(function (k) { return Object.assign({ id: k }, nt2[k]); }).sort(function (x, y) { return y.ts - x.ts; }).slice(0, 30);
                  return base;
                });
              });
            });
          });
        });
      });
    }
    function accRegistrar(ident, us, b) {
      if (us && us.estado === 'activo') throw err('ya_activo', 'Tu cuenta ya está activa. Para cambiar datos llama a tu vendedor.');
      var nombre = clip(b.nombre, 90), rs = clip(b.razonSocial, 120), numCli = clip(b.numCliente, 30), telC = clip(digits(b.telContacto), 15);
      if (nombre.length < 5 || nombre.split(/\s+/).length < 2) throw err('datos', 'Escribe tu nombre completo (nombre y apellido).');
      if (rs.length < 3) throw err('datos', 'Escribe la razón social de tu negocio.');
      var ng = b.negocio || {};
      var lat = num(ng.lat, NaN), lng = num(ng.lng, NaN);
      var tieneUbic = isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
      var dir = clip(ng.dir, 200);
      if (!tieneUbic && dir.length < 8) throw err('datos', 'Marca la ubicación de tu negocio o escribe su dirección.');
      var negocio = { nombre: clip(ng.nombre, 90), dir: dir, ref: clip(ng.ref, 160), lat: tieneUbic ? Math.round(lat * 1e6) / 1e6 : null, lng: tieneUbic ? Math.round(lng * 1e6) / 1e6 : null, modo: ['gps', 'mapa', 'manual'].indexOf(ng.modo) >= 0 ? ng.modo : 'manual', precision: num(ng.precision) ? Math.round(num(ng.precision)) : null };
      return rateLimit(ident.uid, 'registro', 8).then(function () {
        var t = now(); var tel = tel10(ident.tel);
        var reg = { uid: ident.uid, tel: tel, telContacto: telC, nombre: nombre, razonSocial: rs, numCliente: numCli, negocio: negocio, estado: 'pendiente', alta: (us && us.alta) || t, actualizado: t, plataforma: clip(b.plataforma, 20) };
        return sugerencias(reg).then(function (sug) {
          reg.sugerencias = sug;
          var m = {}; m['usuarios/' + ident.uid] = reg; m['ix/pendientes/' + ident.uid] = t; m['ix/tel/' + tel] = ident.uid;
          return Promise.resolve(db.update('cli', m)).then(function () { return audit(ident.uid, 'registro', { rs: rs }); }).then(function () { return { ok: true, estado: 'pendiente' }; });
        });
      });
    }
    function sugerencias(reg) {
      var out = []; var t10 = reg.tel, t10c = tel10(reg.telContacto);
      return g('catalogo').then(function (cat) {
        Object.keys(cat || {}).forEach(function (k) {
          var c = cat[k]; var ct = tel10(c.t);
          var sc = 0, why = [];
          if (ct && (ct === t10 || ct === t10c)) { sc += 1; why.push('mismo teléfono'); }
          var s1 = Math.max(similar(reg.razonSocial, c.n), similar(reg.nombre, c.n));
          if (s1 >= 0.5) { sc += s1; why.push('nombre parecido'); }
          if (sc >= 0.5) out.push({ catKey: k, n: c.n, v: c.v || '', sc: Math.round(sc * 100) / 100, por: why.join(' y ') });
        });
        out.sort(function (a, b) { return b.sc - a.sc; });
        return out.slice(0, 5);
      }).catch(function () { return []; });
    }
    function accPing(uid, us, b) {
      if (!us) return { ok: true };
      var m = {}; var t = now();
      m['usuarios/' + uid + '/ultimaConexion'] = t;
      m['usuarios/' + uid + '/plataforma'] = clip(b.plataforma, 20);
      m['usuarios/' + uid + '/version'] = clip(b.version, 20);
      if (b.token && typeof b.token === 'string' && b.token.length < 400) m['usuarios/' + uid + '/tokens/' + keyp(b.token).slice(-24)] = { t: b.token, ts: t, p: clip(b.plataforma, 20) };
      return Promise.resolve(db.update('cli', m)).then(function () { return { ok: true }; });
    }
    function accPrepedido(uid, us, b) {
      exigeActivo(us);
      var items = Array.isArray(b.items) ? b.items : [];
      return rateLimit(uid, 'pedido', 15).then(function () {
        return Promise.all([g('clientes/' + us.clienteKey), getConfig(), pedidosDeUid(uid), filaCliente(us.vk, us.skanName)]);
      }).then(function (a) {
        var cc = a[0] || {}, cfg = a[1], previos = a[2], fila = a[3];
        var abiertos = previos.filter(function (p) { return p.estado === 'enviado'; }).length;
        if (abiertos >= 5) throw err('limite', 'Tienes 5 prepedidos esperando confirmación. Espera a que tu vendedor los confirme.');
        return preciosCliente(cc, cfg).then(function (pr) {
          var porCode = {}; pr.productos.forEach(function (p) { porCode[p.code] = p; });
          var limpio = []; var vistos = {};
          items.forEach(function (it) {
            var p = porCode[it && it.code]; var q = Math.floor(num(it && it.piezas));
            if (!p || q <= 0 || vistos[p.code]) return; if (q > 3000) throw err('datos', 'Cantidad demasiado grande para ' + p.nombre + '. Para pedidos mayores llama a tu vendedor.');
            vistos[p.code] = 1; limpio.push({ code: p.code, nombre: p.nombre, kg: p.kg, piezas: q, petfood: p.petfood, premium: p.premium });
          });
          if (!limpio.length) throw err('datos', 'Agrega al menos un producto.');
          if (limpio.length > 25) throw err('datos', 'Demasiados renglones.');
          var modalidad = b.modalidad === 'entrega' ? 'entrega' : 'recoge';
          var escId = modalidad === 'recoge' ? 'recoge' : clip(b.escenario, 40);
          var entregaLabel = modalidad === 'recoge' ? 'Recoge en planta' : 'Entrega en su negocio';
          var totales = null;
          if (pr.mostrar) {
            var sub = 0, tot = 0, okEsc = true;
            limpio.forEach(function (it) {
              var e = (porCode[it.code].escenarios || []).filter(function (x) { return x.id === escId; })[0] || (modalidad === 'recoge' ? porCode[it.code].escenarios[0] : null);
              if (!e) { okEsc = false; return; }
              it.precio = e.precio; it.conIva = e.conIva; sub += e.precio * it.piezas; tot += e.conIva * it.piezas;
              if (modalidad === 'entrega') entregaLabel = e.label;
            });
            if (okEsc) totales = { subtotal: r2(sub), total: r2(tot), iva: r2(tot - sub), escenario: escId };
            else limpio.forEach(function (it) { delete it.precio; delete it.conIva; });
          } else if (modalidad === 'entrega') {
            var ent = (pr.entregas || []).filter(function (x) { return x.id === escId; })[0]; if (ent) entregaLabel = 'Entrega · ' + ent.label;
          }
          return folioNuevo().then(function (folio) {
            var t = now(), id = newId(), d = mxDate(t);
            var ped = { id: id, folio: folio, uid: uid, clienteKey: us.clienteKey, skanName: us.skanName, razonSocial: us.razonSocial, contacto: us.nombre, tel: us.tel, telContacto: us.telContacto || '',
              vk: us.vk, vendedorNombre: fila ? fila.meta.v : (us.vendedorNombre || ''), modalidad: modalidad, entregaLabel: entregaLabel, negocio: us.negocio || null,
              items: limpio, totales: totales, nota: clip(b.nota, 400), estado: 'enviado', creado: t, actualizado: t,
              snap: { mes: d.m, sacosMes: fila ? sumaMes(fila.row, d.m) : 0 },
              hist: [{ e: 'enviado', ts: t, por: 'cliente', nota: '' }] };
            var m = {};
            m['pedidos/' + id] = ped; m['ix/uidPed/' + uid + '/' + id] = t; if (us.vk) m['ix/vendPed/' + us.vk + '/' + id] = t; m['ix/abiertos/' + id] = 'enviado';
            return Promise.resolve(db.update('cli', m)).then(function () { return audit(uid, 'prepedido', { id: id, folio: folio }); }).then(function () { return { ok: true, pedido: pedidoPublico(ped, pr.mostrar) }; });
          });
        });
      });
    }
    function accCancelar(uid, us, b) {
      exigeActivo(us);
      return g('pedidos/' + clip(b.id, 40)).then(function (p) {
        if (!p || p.uid !== uid) throw err('no_existe', 'No encontramos ese pedido.', 404);
        if (p.estado !== 'enviado') throw err('estado', 'Ese pedido ya fue confirmado; para cambiarlo llama a tu vendedor.');
        return cambiarEstado(p, 'cancelado', 'cliente', clip(b.motivo, 200), {}).then(function () { return { ok: true }; });
      });
    }
    function accMensaje(uid, us, b) {
      if (!us) throw err('sin_registro', 'Completa tu registro.', 403);
      var texto = clip(b.texto, 1500); if (texto.length < 3) throw err('datos', 'Escribe tu mensaje.');
      return rateLimit(uid, 'mensaje', 10).then(function () {
        var t = now(), id = newId();
        var msg = { id: id, uid: uid, ts: t, texto: texto, tema: clip(b.tema, 40), cliente: us.skanName || us.razonSocial, contacto: us.nombre, tel: us.tel, vk: us.vk || '', leido: false };
        var m = {}; m['mensajes/' + id] = msg; m['ix/uidMsg/' + uid + '/' + id] = t; m['ix/msgSinLeer/' + id] = t;
        return Promise.resolve(db.update('cli', m)).then(function () { return { ok: true }; });
      });
    }
    // Baja de la cuenta (requisito de App Store): se borran los datos personales y el acceso.
    // Los pedidos quedan como registro comercial de la empresa, sin el teléfono de acceso.
    function accEliminar(uid, us) {
      var m = {};
      m['usuarios/' + uid] = null; m['notifs/' + uid] = null; m['ix/pendientes/' + uid] = null; m['ix/uidMsg/' + uid] = null;
      if (us && us.tel) m['ix/tel/' + us.tel] = null;
      if (us && us.clienteKey) m['ix/clienteUid/' + us.clienteKey + '/' + uid] = null;
      return Promise.resolve(db.update('cli', m)).then(function () { return audit(uid, 'bajaCuenta', { rs: us && us.razonSocial }); }).then(function () { return { ok: true, borrarAuth: true }; });
    }
    function accLeerNotifs(uid, b) {
      return g('notifs/' + uid).then(function (nt) {
        var m = {}; Object.keys(nt || {}).forEach(function (k) { if (!nt[k].leida) m['notifs/' + uid + '/' + k + '/leida'] = true; });
        return Object.keys(m).length ? Promise.resolve(db.update('cli', m)) : null;
      }).then(function () { return { ok: true }; });
    }

    /* =================== API DEL PERSONAL =================== */
    var ROLES = { vendedor: 'Vendedor', admin: 'Administración (asistentes de venta)', programacion: 'Programación (superusuario)', gerencia: 'Gerencia' };
    function staffLogin(usuario, pin) {
      var k = keyp(usuario);
      if (!k || !/^\d{6,8}$/.test(String(pin || ''))) return Promise.reject(err('credenciales', 'Usuario o PIN incorrectos.', 401));
      return g('staff/' + k).then(function (st) {
        var t = now();
        if (!st || st.activo === false) throw err('credenciales', 'Usuario o PIN incorrectos.', 401);
        if (num(st.lockUntil) > t) throw err('bloqueado', 'Demasiados intentos. Espera 15 minutos.', 429);
        return Promise.resolve(hashPin(String(pin), st.salt)).then(function (h) {
          if (h !== st.pinHash) {
            var f = num(st.fails) + 1; var m = { fails: f };
            if (f >= 5) { m.fails = 0; m.lockUntil = t + 15 * 60 * 1000; }
            return u('staff/' + k, m).then(function () { throw err('credenciales', 'Usuario o PIN incorrectos.', 401); });
          }
          return u('staff/' + k, { fails: 0, lockUntil: 0, ultimoAcceso: t }).then(function () {
            return { u: k, nombre: st.nombre, rol: st.rol, vk: st.vk || '', v: st.pinVer || 1 };
          });
        });
      });
    }
    // El programador de embarques entra con SU contraseña de superusuario o master (la misma de la app).
    // El servidor la compara contra /config, así que cambiarla ahí cierra estas sesiones.
    function progLogin(pwd) {
      pwd = String(pwd || '');
      var rk = 'rl/PROGLOGIN/' + dayKey(now()) + '/fallos';
      return Promise.all([Promise.resolve(db.get('config')), g(rk)]).then(function (a) {
        var c = a[0] || {}, fallos = num(a[1]);
        if (fallos >= 30) throw err('bloqueado', 'Demasiados intentos hoy. Intenta mañana.', 429);
        var rol = (c.masterPwd && pwd === String(c.masterPwd)) ? 'progmaster' : ((c.pwd && pwd === String(c.pwd)) ? 'programacion' : '');
        if (!rol || pwd.length < 4) return s(rk, fallos + 1).then(function () { throw err('credenciales', 'Contraseña incorrecta.', 401); });
        return Promise.resolve(hashPin(pwd, 'prog')).then(function (h) {
          return { u: 'PROGRAMADOR', nombre: rol === 'progmaster' ? 'Programación · master' : 'Programación · superusuario', rol: rol, vk: '', prog: true, ph: h };
        });
      });
    }
    function sesionProg(ses) {
      return Promise.resolve(db.get('config')).then(function (c) {
        c = c || {}; var pw = ses.rol === 'progmaster' ? c.masterPwd : c.pwd;
        if (!pw) throw err('sin_sesion', 'Tu sesión terminó. Vuelve a entrar.', 401);
        return Promise.resolve(hashPin(String(pw), 'prog')).then(function (h) {
          if (h !== ses.ph) throw err('sin_sesion', 'La contraseña del programador cambió. Vuelve a entrar.', 401);
          return { nombre: ses.nombre, rol: ses.rol, vk: '', activo: true, pinVer: ses.v || 1 };
        });
      });
    }
    // ses = {u, rol, vk, v} ya verificada por la firma; aquí se revisa que el usuario siga activo
    function staff(ses, accion, body) {
      body = body || {};
      return (ses.prog ? sesionProg(ses) : g('staff/' + ses.u)).then(function (st) {
        if (!st || st.activo === false || (st.pinVer || 1) !== (ses.v || 1)) throw err('sin_sesion', 'Tu sesión terminó. Vuelve a entrar con tu PIN.', 401);
        var S = { u: ses.u, nombre: st.nombre, rol: st.rol, vk: st.vk || '' };
        var puede = function () { var r = Array.prototype.slice.call(arguments); if (r.indexOf(S.rol) < 0) throw err('permiso', 'Tu usuario no tiene permiso para esto.', 403); };
        switch (accion) {
          case 'bandeja': return stBandeja(S, body);
          case 'pedido': return stPedido(S, body);
          case 'confirmar': puede('vendedor', 'admin', 'gerencia'); return stConfirmar(S, body);
          case 'rechazar': puede('vendedor', 'admin', 'gerencia'); return stRechazar(S, body);
          case 'fincar': puede('admin', 'gerencia'); return stFincar(S, body);
          case 'editarRemision': puede('admin', 'gerencia'); return stEditarRemision(S, body);
          case 'liberarManual': puede('admin', 'gerencia', 'programacion', 'progmaster'); return stLiberarManual(S, body);
          case 'facturado': puede('admin', 'gerencia'); return stFacturado(S, body);
          case 'registros': return stRegistros(S, body);
          case 'buscarClientes': puede('admin', 'gerencia', 'vendedor'); return stBuscar(S, body);
          case 'vincular': puede('admin', 'gerencia'); return stVincular(S, body);
          case 'listaClientes': puede('admin', 'gerencia'); return stListaClientes(S, body);
          case 'estadoUsuario': puede('admin', 'gerencia'); return stEstadoUsuario(S, body);
          case 'mensajes': puede('gerencia'); return stMensajes(S, body);
          case 'responder': puede('gerencia'); return stResponder(S, body);
          // Fletes y precios: el superusuario de programación (rol programacion) solo edita km, casetas,
          // diésel y ayudante, y agrega clientes/rutas nuevos. Todo lo demás: master del programador o gerencia.
          case 'fletes': puede('programacion', 'progmaster', 'gerencia', 'admin'); return stFletes(S, body);
          case 'guardarFletes': puede('programacion', 'progmaster', 'gerencia'); return stGuardarFletes(S, body);
          case 'importarPrecios': puede('progmaster', 'gerencia'); return stImportarPrecios(S, body);
          case 'guardarClienteCfg': puede('progmaster', 'gerencia'); return stGuardarClienteCfg(S, body);
          case 'guardarConfig': puede('progmaster', 'gerencia'); return stGuardarConfig(S, body);
          case 'vistaPrecios': puede('programacion', 'progmaster', 'gerencia', 'admin'); return stVistaPrecios(S, body);
          default: throw err('accion', 'Acción no válida');
        }
      });
    }
    function verPedido(S, p) {
      if (!p) return false;
      if (S.rol === 'vendedor') return p.vk === S.vk;
      return true;
    }
    function stBandeja(S, b) {
      var cargar;
      if (S.rol === 'vendedor') {
        cargar = g('ix/vendPed/' + S.vk).then(function (ix) {
          var ids = Object.keys(ix || {}).sort(function (a, c) { return num(ix[c]) - num(ix[a]); }).slice(0, 80);
          return Promise.all(ids.map(function (id) { return g('pedidos/' + id); }));
        });
      } else {
        cargar = Promise.all([g('ix/abiertos'), g('ix/recientes')]).then(function (a) {
          var ids = Object.keys(a[0] || {});
          var rec = a[1] || {}; Object.keys(rec).sort(function (x, y) { return rec[y] - rec[x]; }).slice(0, 60).forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); });
          return Promise.all(ids.map(function (id) { return g('pedidos/' + id); }));
        });
      }
      return Promise.all([cargar, g('ix/pendientes'), S.rol === 'gerencia' ? g('ix/msgSinLeer') : Promise.resolve(null), getConfig()]).then(function (a) {
        var peds = a[0].filter(Boolean).sort(function (x, y) { return y.creado - x.creado; });
        var pend = a[1] || {};
        var cont = { enviado: 0, confirmado: 0, fincado: 0, liberado: 0 };
        peds.forEach(function (p) { if (cont[p.estado] != null) cont[p.estado]++; });
        return { yo: S, roles: ROLES, pedidos: peds.map(function (p) { var x = Object.assign({}, p); delete x.snap; return x; }), cont: cont, pendientesRegistro: Object.keys(pend).length, mensajesSinLeer: Object.keys(a[2] || {}).length, waAdmin: a[3].waAdmin || '', ts: now() };
      });
    }
    function cargaPedido(S, id) {
      return g('pedidos/' + clip(id, 40)).then(function (p) { if (!verPedido(S, p)) throw err('no_existe', 'Pedido no encontrado.', 404); return p; });
    }
    function stPedido(S, b) { return cargaPedido(S, b.id); }
    function stConfirmar(S, b) {
      return cargaPedido(S, b.id).then(function (p) {
        if (p.estado !== 'enviado') throw err('estado', 'Este pedido ya no está por confirmar (' + p.estado + ').');
        var extra = { confirmadoPor: S.nombre, confirmadoTs: now() };
        if (Array.isArray(b.items)) { // el vendedor ajusta cantidades acordadas por teléfono
          var porCode = {}; p.items.forEach(function (it) { porCode[it.code] = it; });
          var nuevos = []; var cambio = false;
          b.items.forEach(function (it) { var o = porCode[it.code]; var q = Math.floor(num(it.piezas)); if (!o) return; if (q !== o.piezas) cambio = true; if (q > 0) nuevos.push(Object.assign({}, o, { piezas: q })); });
          if (!nuevos.length) throw err('datos', 'El pedido no puede quedar vacío; si no procede, recházalo.');
          if (cambio || nuevos.length !== p.items.length) {
            extra.items = nuevos; extra.ajustado = true; extra.itemsOriginal = p.items;
            if (p.totales) { var sub = 0, tot = 0; nuevos.forEach(function (it) { sub += num(it.precio) * it.piezas; tot += num(it.conIva) * it.piezas; }); extra.totales = Object.assign({}, p.totales, { subtotal: r2(sub), total: r2(tot), iva: r2(tot - sub) }); }
          }
        }
        if (b.notaInterna) extra.notaVendedor = clip(b.notaInterna, 400);
        var m = {}; m['ix/recientes/' + p.id] = now();
        return Promise.resolve(db.update('cli', m)).then(function () { return cambiarEstado(p, 'confirmado', S.nombre, b.nota || 'Validado por teléfono', extra); })
          .then(function (np) { return audit(S.u, 'confirmar', { id: p.id }).then(function () { return { ok: true, pedido: np }; }); });
      });
    }
    function stRechazar(S, b) {
      var motivo = clip(b.motivo, 300); if (motivo.length < 3) return Promise.reject(err('datos', 'Escribe el motivo.'));
      return cargaPedido(S, b.id).then(function (p) {
        if (!ABIERTOS[p.estado] || p.estado === 'liberado') throw err('estado', 'Este pedido ya no se puede rechazar.');
        if (S.rol === 'vendedor' && p.estado !== 'enviado') throw err('estado', 'Ya fue confirmado: pide a Administración que lo cancele.');
        return cambiarEstado(p, 'rechazado', S.nombre, motivo, { motivo: motivo }).then(function () {
          var m = {}; if (p.remision) m['ix/remision/' + normRem(p.remision)] = null; m['ix/recientes/' + p.id] = now();
          return Promise.resolve(db.update('cli', m));
        }).then(function () { return audit(S.u, 'rechazar', { id: p.id, motivo: motivo }); }).then(function () { return { ok: true }; });
      });
    }
    function stFincar(S, b) {
      var rem = clip(b.remision, 40); if (normRem(rem).length < 2) return Promise.reject(err('datos', 'Escribe el número de pedido o remisión de Odoo.'));
      return cargaPedido(S, b.id).then(function (p) {
        if (p.estado !== 'confirmado') throw err('estado', p.estado === 'enviado' ? 'Primero lo debe confirmar el vendedor.' : 'Este pedido ya está ' + p.estado + '.');
        return g('ix/remision/' + normRem(rem)).then(function (otro) {
          if (otro && otro !== p.id) throw err('duplicado', 'Esa remisión ya está ligada a otro prepedido.');
          var m = {}; m['ix/remision/' + normRem(rem)] = p.id; var rn = remNum(rem); if (rn && rn !== normRem(rem)) m['ix/remNum/' + rn] = p.id; m['ix/recientes/' + p.id] = now();
          return Promise.resolve(db.update('cli', m));
        }).then(function () { return cambiarEstado(p, 'fincado', S.nombre, 'Fincado en Odoo · ' + rem, { remision: rem, fincadoPor: S.nombre, fincadoTs: now(), notaAdmin: clip(b.nota, 300) }); })
          .then(function (np) { return audit(S.u, 'fincar', { id: p.id, remision: rem }).then(function () { return { ok: true, pedido: np }; }); });
      });
    }
    function stEditarRemision(S, b) {
      var rem = clip(b.remision, 40), motivo = clip(b.motivo, 200);
      if (normRem(rem).length < 2) return Promise.reject(err('datos', 'Escribe el número correcto.'));
      if (motivo.length < 3) return Promise.reject(err('datos', 'Escribe por qué cambió el número.'));
      return cargaPedido(S, b.id).then(function (p) {
        if (['fincado', 'liberado', 'facturado'].indexOf(p.estado) < 0) throw err('estado', 'Solo se edita la remisión de pedidos ya fincados.');
        return g('ix/remision/' + normRem(rem)).then(function (otro) {
          if (otro && otro !== p.id) throw err('duplicado', 'Esa remisión ya está ligada a otro prepedido.');
          var t = now(); var m = {};
          if (p.remision) { m['ix/remision/' + normRem(p.remision)] = null; var on = remNum(p.remision); if (on) m['ix/remNum/' + on] = null; }
          m['ix/remision/' + normRem(rem)] = p.id; var rn = remNum(rem); if (rn && rn !== normRem(rem)) m['ix/remNum/' + rn] = p.id;
          m['pedidos/' + p.id + '/remision'] = rem;
          m['pedidos/' + p.id + '/remHist'] = (p.remHist || []).concat([{ de: p.remision || '', a: rem, por: S.nombre, ts: t, motivo: motivo }]);
          m['pedidos/' + p.id + '/actualizado'] = t;
          return Promise.resolve(db.update('cli', m));
        }).then(function () { return audit(S.u, 'editarRemision', { id: p.id, de: p.remision, a: rem }); }).then(function () { return { ok: true }; });
      });
    }
    function liberar(p, datos, quien) {
      return cambiarEstado(p, 'liberado', quien, datos.nota || 'Liberado por Cargadores', { liberacion: datos }).then(function (np) {
        var m = {}; m['ix/recientes/' + p.id] = now(); return Promise.resolve(db.update('cli', m)).then(function () { return np; });
      });
    }
    function stLiberarManual(S, b) {
      return cargaPedido(S, b.id).then(function (p) {
        if (p.estado !== 'fincado') throw err('estado', 'Solo se libera un pedido fincado.');
        var t = now(), d = mxDate(t);
        var hora = /^\d{1,2}:\d{2}$/.test(String(b.hora || '')) ? b.hora : (('0' + d.hh).slice(-2) + ':' + ('0' + d.mi).slice(-2));
        var lotes = Array.isArray(b.lotes) ? b.lotes.slice(0, 40).map(function (l) { return { prod: clip(l.prod, 80), lote: clip(l.lote, 40), sacos: Math.floor(num(l.sacos)) }; }) : [];
        return liberar(p, { ts: t, fecha: d.y + '-' + ('0' + d.m).slice(-2) + '-' + ('0' + d.d).slice(-2), hora: hora, lotes: lotes, unidad: clip(b.unidad, 40), origen: 'manual', nota: 'Liberado manualmente por ' + S.nombre }, S.nombre);
      }).then(function () { return { ok: true }; });
    }
    function stFacturado(S, b) {
      return cargaPedido(S, b.id).then(function (p) {
        if (p.estado !== 'liberado') throw err('estado', 'Solo se marca facturado un pedido liberado.');
        return cambiarEstado(p, 'facturado', S.nombre, 'Factura ' + clip(b.factura, 40), { factura: clip(b.factura, 40) });
      }).then(function () { return { ok: true }; });
    }
    // Llamado por el disparador de /embarques: cuando Cargadores finaliza (libera) una unidad.
    function onEmbarque(antes, despues) {
      if (!despues || !despues.despachado || despues.cancelado) return Promise.resolve(null);
      if (antes && antes.despachado) return Promise.resolve(null);
      var ped = despues.pedido; if (!ped) return Promise.resolve(null);
      var pedidos = String(ped).split(/[,;/]|\s+y\s+/i).map(function (x) { return x.trim(); }).filter(Boolean);
      return Promise.all(pedidos.map(function (pp) {
        return g('ix/remision/' + normRem(pp)).then(function (id) {
          if (id) return id; var rn = remNum(pp); return rn ? g('ix/remNum/' + rn).then(function (x) { return x || g('ix/remision/' + rn); }) : null;
        }).then(function (id) {
          if (!id) return null;
          return g('pedidos/' + id).then(function (p) {
            if (!p || p.estado !== 'fincado') return null;
            var lotes = (Array.isArray(despues.lotes) ? despues.lotes : Object.keys(despues.lotes || {}).map(function (k) { return despues.lotes[k]; }))
              .map(function (l) { return { prod: clip(l.prod || l.cod || '', 80), lote: clip(l.lote, 40), sacos: Math.floor(num(l.sacos)) }; });
            return liberar(p, { ts: now(), fecha: despues.fechaCarga || '', hora: despues.horaSalida || despues.finCarga || '', lotes: lotes, unidad: [despues.tipo, despues.eco].filter(Boolean).join(' '), origen: 'cargadores', embarque: despues.id || '' }, 'Cargadores').then(function () { return id; });
          });
        });
      }));
    }
    function stRegistros(S, b) {
      return Promise.all([g('ix/pendientes'), b.todos ? g('usuarios') : Promise.resolve(null)]).then(function (a) {
        var pend = Object.keys(a[0] || {});
        var lista;
        if (a[1]) lista = Object.keys(a[1]).map(function (k) { return a[1][k]; });
        else return Promise.all(pend.map(function (uid) { return g('usuarios/' + uid); })).then(function (x) { return fin(x.filter(Boolean)); });
        return fin(lista);
        function fin(l) {
          if (S.rol === 'vendedor') l = l.filter(function (r) { return r.vk === S.vk; });   // el vendedor solo ve a sus clientes ya validados
          l = l.map(function (r) { var x = Object.assign({}, r); delete x.tokens; x.pushActivo = !!(r.tokens && Object.keys(r.tokens).length); return x; });
          l.sort(function (x, y) { return (x.estado === 'pendiente' ? 0 : 1) - (y.estado === 'pendiente' ? 0 : 1) || num(y.actualizado) - num(x.actualizado); });
          return { registros: l };
        }
      });
    }
    function stBuscar(S, b) {
      var q = clip(b.q, 60); if (q.length < 3) return Promise.resolve({ skan: [], catalogo: [] });
      return Promise.all([buscarEnSkan(q, 15), g('catalogo')]).then(function (a) {
        var cat = a[1] || {}; var kq = keyp(q); var c = [];
        Object.keys(cat).forEach(function (k) { var x = cat[k]; var sc = keyp(x.n).indexOf(kq) >= 0 ? 1 : similar(q, x.n); if (sc >= 0.5) c.push({ catKey: k, n: x.n, v: x.v || '', l: x.l || [], sc: sc }); });
        c.sort(function (x, y) { return y.sc - x.sc; });
        return S.rol === 'vendedor' ? { skan: a[0].filter(function (r) { return r.vk === S.vk; }), catalogo: [] } : { skan: a[0], catalogo: c.slice(0, 15) };
      });
    }
    // Activar SIN cartera publicada (cliente del catálogo de Odoo o cliente nuevo): solo gerencia (master).
    // Administración únicamente vincula clientes que ya están en la cartera publicada de un vendedor.
    function stVincularSinCartera(S, b) {
      if (S.rol !== 'gerencia') return Promise.reject(err('permiso', 'Solo el master puede activar clientes que no están en una cartera.', 403));
      var uid = clip(b.uid, 128), vk = keyp(b.vk), t = now();
      return Promise.all([g('usuarios/' + uid), b.catKey ? g('catalogo/' + keyp(b.catKey)) : Promise.resolve(null), Promise.resolve(db.get('skan/_index')), vk ? leerSkanVendor(vk) : Promise.resolve(null)]).then(function (a) {
        var us = a[0]; if (!us) throw err('no_existe', 'Registro no encontrado.', 404);
        var cat = a[1]; if (b.catKey && !cat) throw err('datos', 'Ese cliente no está en el catálogo.');
        var vs = (a[2] && a[2].vendors) || []; if (vk && vs.indexOf(vk) < 0) throw err('datos', 'Ese vendedor no existe.');
        var nombre = clip((cat && cat.n) || b.nombre || us.razonSocial, 160);
        if (nombre.length < 3) throw err('datos', 'Escribe el nombre del cliente.');
        var ck = keyp(nombre); var m = {};
        m['usuarios/' + uid + '/estado'] = 'activo'; m['usuarios/' + uid + '/clienteKey'] = ck; m['usuarios/' + uid + '/skanName'] = nombre;
        m['usuarios/' + uid + '/vk'] = vk || ''; m['usuarios/' + uid + '/vendedorNombre'] = (a[3] && a[3].v) || ''; m['usuarios/' + uid + '/sinCartera'] = true;
        m['usuarios/' + uid + '/validadoPor'] = S.nombre; m['usuarios/' + uid + '/validadoTs'] = t; m['usuarios/' + uid + '/motivo'] = null;
        m['ix/pendientes/' + uid] = null; m['ix/clienteUid/' + ck + '/' + uid] = t;
        return g('clientes/' + ck).then(function (cc) {
          m['clientes/' + ck + '/skanName'] = nombre; m['clientes/' + ck + '/vk'] = vk || '';
          if (cat) m['clientes/' + ck + '/catKey'] = keyp(b.catKey);
          return Promise.resolve(db.update('cli', m));
        }).then(function () { return notificar(uid, '¡Tu cuenta está activa!', 'Ya puedes hacer prepedidos. Tu avance aparecerá cuando se publique tu primera compra.', { tipo: 'activa' }); })
          .then(function () { return audit(S.u, 'vincularSinCartera', { uid: uid, cliente: nombre, catalogo: !!cat }); }).then(function () { return { ok: true }; });
      });
    }
    function stListaClientes(S, b) {
      return Promise.all([Promise.resolve(db.get('skan/_index')), S.rol === 'gerencia' ? g('catalogo') : Promise.resolve(null)]).then(function (a) {
        var vs = (a[0] && a[0].vendors) || []; var sk = [], nombres = {};
        return Promise.all(vs.map(function (vk) { return leerSkanVendor(vk).then(function (p) { (p && p.rows || []).forEach(function (r) { nombres[keyp(r.n)] = 1; sk.push({ n: r.n, vk: vk, v: p.v || vk, avg: Math.round(r.avg || 0) }); }); return { vk: vk, v: (p && p.v) || vk }; }).catch(function () { return { vk: vk, v: vk }; }); }))
          .then(function (vend) {
            sk.sort(function (x, y) { return x.n.localeCompare(y.n); });
            var cat = []; var c = a[1] || {};
            Object.keys(c).forEach(function (k) { if (!nombres[keyp(c[k].n)]) cat.push({ catKey: k, n: c[k].n, v: c[k].v || '' }); });
            cat.sort(function (x, y) { return x.n.localeCompare(y.n); });
            return { cartera: sk, catalogo: cat, vendedores: vend };
          });
      });
    }
    function stVincular(S, b) {
      if (b.modo === 'catalogo' || b.modo === 'nuevo') return stVincularSinCartera(S, b);
      var uid = clip(b.uid, 128), nombre = clip(b.skanName, 160), vk = keyp(b.vk);
      if (!uid || !nombre || !vk) return Promise.reject(err('datos', 'Elige el cliente del sistema de ventas.'));
      return Promise.all([g('usuarios/' + uid), filaCliente(vk, nombre)]).then(function (a) {
        var us = a[0]; if (!us) throw err('no_existe', 'Registro no encontrado.', 404);
        if (!a[1]) throw err('datos', 'Ese cliente no aparece en la cartera publicada de ese vendedor.');
        var ck = keyp(nombre), t = now();
        var m = {};
        m['usuarios/' + uid + '/estado'] = 'activo'; m['usuarios/' + uid + '/clienteKey'] = ck; m['usuarios/' + uid + '/skanName'] = a[1].row.n;
        m['usuarios/' + uid + '/vk'] = vk; m['usuarios/' + uid + '/sinCartera'] = null; m['usuarios/' + uid + '/vendedorNombre'] = a[1].meta.v || ''; m['usuarios/' + uid + '/validadoPor'] = S.nombre; m['usuarios/' + uid + '/validadoTs'] = t; m['usuarios/' + uid + '/motivo'] = null;
        m['ix/pendientes/' + uid] = null; m['ix/clienteUid/' + ck + '/' + uid] = t;
        return g('clientes/' + ck).then(function (cc) {
          cc = cc || {};
          m['clientes/' + ck + '/skanName'] = a[1].row.n; m['clientes/' + ck + '/vk'] = vk;
          if (b.catKey) m['clientes/' + ck + '/catKey'] = keyp(b.catKey);
          else if (!cc.catKey && us.sugerencias && us.sugerencias[0] && us.sugerencias[0].sc >= 1) m['clientes/' + ck + '/catKey'] = us.sugerencias[0].catKey;
          return Promise.resolve(db.update('cli', m));
        }).then(function () { return notificar(uid, '¡Tu cuenta está activa!', 'Ya puedes ver tu avance, tu histórico y hacer prepedidos.', { tipo: 'activa' }); })
          .then(function () { return audit(S.u, 'vincular', { uid: uid, cliente: nombre }); }).then(function () { return { ok: true }; });
      });
    }
    function stEstadoUsuario(S, b) {
      var uid = clip(b.uid, 128), est = b.estado;
      if (['activo', 'suspendido', 'rechazado'].indexOf(est) < 0) return Promise.reject(err('datos', 'Estado no válido.'));
      return g('usuarios/' + uid).then(function (us) {
        if (!us) throw err('no_existe', 'Registro no encontrado.', 404);
        if (est === 'activo' && !us.clienteKey) throw err('datos', 'Primero vincúlalo con su cliente.');
        var m = {}; m['usuarios/' + uid + '/estado'] = est; m['usuarios/' + uid + '/motivo'] = clip(b.motivo, 200); m['ix/pendientes/' + uid] = null;
        return Promise.resolve(db.update('cli', m)).then(function () {
          if (est === 'rechazado') return notificar(uid, 'No pudimos validar tu registro', b.motivo ? String(b.motivo) : 'Comunícate con tu vendedor.', { tipo: 'rechazo' });
        }).then(function () { return audit(S.u, 'estadoUsuario', { uid: uid, est: est }); }).then(function () { return { ok: true }; });
      });
    }
    function stMensajes(S, b) {
      return g('mensajes').then(function (all) {
        var l = Object.keys(all || {}).map(function (k) { return all[k]; }).sort(function (x, y) { return y.ts - x.ts; }).slice(0, 200);
        return { mensajes: l };
      });
    }
    function stResponder(S, b) {
      var id = clip(b.id, 40), texto = clip(b.texto, 1500);
      return g('mensajes/' + id).then(function (msg) {
        if (!msg) throw err('no_existe', 'Mensaje no encontrado.', 404);
        var m = {}; var t = now();
        m['mensajes/' + id + '/leido'] = true; m['ix/msgSinLeer/' + id] = null;
        if (texto) { m['mensajes/' + id + '/respuesta'] = texto; m['mensajes/' + id + '/respTs'] = t; m['mensajes/' + id + '/respPor'] = S.nombre; }
        return Promise.resolve(db.update('cli', m)).then(function () { return texto ? notificar(msg.uid, 'Gerencia respondió tu mensaje', texto.slice(0, 140), { tipo: 'mensaje' }) : null; });
      }).then(function () { return { ok: true }; });
    }
    function stFletes(S, b) {
      return Promise.all([g('fletes'), g('precios'), g('clientes'), getConfig(), g('ix/clienteUid')]).then(function (a) {
        var pr = a[1] || {};
        return { fletes: a[0] || { params: PARAMS_BASE, vehiculos: {}, rutas: {} }, vehiculosBase: VEHICULOS_BASE, paramsBase: PARAMS_BASE,
          precios: { prod: pr.prod || {}, lists: pr.lists || {}, actualizado: pr.actualizado || 0, nCatalogo: pr.nCatalogo || 0 },
          clientes: a[2] || {}, config: a[3], conApp: Object.keys(a[4] || {}) };
      });
    }
    function limpiarRuta(r, k) {
      var o = { destino: clip(r.destino, 80), vehiculo: VEHICULOS_BASE[String(r.vehiculo || '').toUpperCase()] ? String(r.vehiculo).toUpperCase() : 'TORTON', km: num(r.km), casetas: num(r.casetas), cobrado: num(r.cobrado), notas: clip(r.notas, 160) };
      ['rend', 'diesel', 'seguro', 'ayudante', 'margen', 'ton', 'valor', 'mantKm', 'mantCosto'].forEach(function (x) { if (r[x] !== undefined && r[x] !== '' && r[x] !== null) o[x] = num(r[x]); });
      return o;
    }
    var CAMPOS_SU = ['km', 'casetas', 'diesel', 'ayudante'];
    function stGuardarFletes(S, b) {
      if (S.rol === 'programacion') return stGuardarFletesSU(S, b);
      var f = b.fletes || {};
      var out = { params: {}, vehiculos: {}, rutas: {} };
      ['diesel', 'kmAnual', 'anios'].forEach(function (k) { if (f.params && f.params[k] !== undefined) out.params[k] = num(f.params[k], PARAMS_BASE[k]); });
      Object.keys(VEHICULOS_BASE).forEach(function (vk) { var v = (f.vehiculos || {})[vk]; if (!v) return; var o = {}; ['ton', 'rend', 'mantKm', 'mantCosto', 'valor', 'seguro', 'ayudante', 'margen'].forEach(function (k) { if (v[k] !== undefined && v[k] !== '') o[k] = num(v[k]); }); out.vehiculos[vk] = o; });
      var rutas = f.rutas || {}; var n = 0;
      Object.keys(rutas).forEach(function (id) {
        if (++n > 600) return; var r = rutas[id]; var k = keyp(id).slice(0, 40) || newId();
        out.rutas[k] = limpiarRuta(r, k);
      });
      return s('fletes', out).then(function () { return audit(S.u, 'guardarFletes', { rutas: Object.keys(out.rutas).length }); }).then(function () { return { ok: true }; });
    }
    // Superusuario: parte de lo guardado y solo acepta km, casetas, diésel y ayudante de las rutas
    // existentes, el precio del diésel general y rutas (clientes) nuevas. No borra ni toca costos de unidades.
    function stGuardarFletesSU(S, b) {
      var f = b.fletes || {};
      return g('fletes').then(function (prev) {
        prev = prev || { params: {}, vehiculos: {}, rutas: {} };
        var out = { params: Object.assign({}, prev.params || {}), vehiculos: prev.vehiculos || {}, rutas: Object.assign({}, prev.rutas || {}) };
        if (f.params && f.params.diesel !== undefined && f.params.diesel !== '') out.params.diesel = num(f.params.diesel, PARAMS_BASE.diesel);
        var cambios = 0, nuevas = 0;
        Object.keys(f.rutas || {}).forEach(function (id) {
          var r = f.rutas[id] || {}, k = keyp(id).slice(0, 40); if (!k) return;
          if (out.rutas[k]) {
            var o = Object.assign({}, out.rutas[k]);
            CAMPOS_SU.forEach(function (x) { if (r[x] === undefined) return; if (r[x] === '' || r[x] === null) { if (x === 'km' || x === 'casetas') o[x] = 0; else delete o[x]; } else o[x] = num(r[x]); });
            if (JSON.stringify(o) !== JSON.stringify(out.rutas[k])) cambios++;
            out.rutas[k] = o;
          } else if (Object.keys(out.rutas).length < 600) {
            var n = { destino: clip(r.destino, 80), vehiculo: VEHICULOS_BASE[String(r.vehiculo || '').toUpperCase()] ? String(r.vehiculo).toUpperCase() : 'TORTON', km: num(r.km), casetas: num(r.casetas), cobrado: 0, notas: clip(r.notas, 160), altaPor: S.nombre };
            CAMPOS_SU.forEach(function (x) { if (x !== 'km' && x !== 'casetas' && r[x] !== undefined && r[x] !== '' && r[x] !== null) n[x] = num(r[x]); });
            if (!n.destino) return;
            out.rutas[k] = n; nuevas++;
          }
        });
        return s('fletes', out).then(function () { return audit(S.u, 'guardarFletesSU', { cambios: cambios, nuevas: nuevas, diesel: out.params.diesel }); })
          .then(function () { return { ok: true, cambios: cambios, nuevas: nuevas }; });
      });
    }
    function stImportarPrecios(S, b) {
      var D = b.data || {}; var lists = {}, prod = {}, cat = {};
      Object.keys(D.prod || {}).slice(0, 400).forEach(function (c) { prod[String(c).toUpperCase()] = clip(D.prod[c], 120); });
      (D.lists || []).slice(0, 80).forEach(function (l) {
        var it = {}; (l.items || []).forEach(function (x) { if (Array.isArray(x) && x[0]) it[String(x[0]).toUpperCase()] = num(x[1]); });
        lists[keyp(l.id) || newId()] = { name: clip(l.name, 60), iva: !!l.iva, tax: clip(l.tax, 30), items: it };
      });
      (D.clients || []).slice(0, 5000).forEach(function (c) {
        var k = keyp(c.n).slice(0, 120); if (!k) return;
        cat[k] = { n: clip(c.n, 160), l: (c.l || []).map(keyp).slice(0, 20), t: clip(c.t, 20), v: clip(c.v, 80), z: clip(c.z, 60), cr: clip(c.cr, 20) };
      });
      if (!Object.keys(lists).length) return Promise.reject(err('datos', 'El archivo no trae listas de precios.'));
      var t = now();
      return Promise.all([s('precios', { prod: prod, lists: lists, actualizado: t, nCatalogo: Object.keys(cat).length, por: S.nombre }), s('catalogo', cat)])
        .then(function () { return audit(S.u, 'importarPrecios', { listas: Object.keys(lists).length, clientes: Object.keys(cat).length }); })
        .then(function () { return { ok: true, listas: Object.keys(lists).length, clientes: Object.keys(cat).length, productos: Object.keys(prod).length }; });
    }
    function stGuardarClienteCfg(S, b) {
      var ck = keyp(b.clienteKey); if (!ck) return Promise.reject(err('datos', 'Cliente no válido.'));
      var c = b.cfg || {};
      var o = { listaRecoge: keyp(c.listaRecoge), listaEntrega: keyp(c.listaEntrega), rutas: (Array.isArray(c.rutas) ? c.rutas : []).map(function (x) { return keyp(x).slice(0, 40); }).filter(Boolean).slice(0, 8),
        precios: ['auto', 'mostrar', 'ocultar'].indexOf(c.precios) >= 0 ? c.precios : 'auto', catKey: keyp(c.catKey), notas: clip(c.notas, 200) };
      return g('clientes/' + ck).then(function (prev) { return s('clientes/' + ck, Object.assign({}, prev || {}, o)); })
        .then(function () { return audit(S.u, 'clienteCfg', { ck: ck }); }).then(function () { return { ok: true }; });
    }
    function stGuardarConfig(S, b) {
      var c = b.config || {}; var o = {};
      if ('mostrarPrecios' in c) o.mostrarPrecios = !!c.mostrarPrecios;
      if ('ivaPet' in c) o.ivaPet = num(c.ivaPet, 16);
      if ('ivaPec' in c) o.ivaPec = num(c.ivaPec, 0);
      if ('waAdmin' in c) o.waAdmin = clip(digits(c.waAdmin), 15);
      if ('avisoGeneral' in c) o.avisoGeneral = clip(c.avisoGeneral, 300);
      return u('config', o).then(function () { return audit(S.u, 'config', o); }).then(function () { return { ok: true }; });
    }
    function stVistaPrecios(S, b) { // lo que vería ese cliente, para que programación lo revise
      var ck = keyp(b.clienteKey);
      return Promise.all([g('clientes/' + ck), getConfig()]).then(function (a) { return preciosCliente(a[0] || {}, a[1]); });
    }

    /* ---------- administración de accesos (solo con la llave maestra) ---------- */
    function maestro(accion, b) {
      b = b || {};
      if (accion === 'listarStaff') return Promise.resolve().then(function () {
        return Promise.all([g('staff'), g('vendTel'), getConfig()]).then(function (a) {
          var l = Object.keys(a[0] || {}).map(function (k) { var x = a[0][k]; return { u: k, nombre: x.nombre, rol: x.rol, vk: x.vk || '', activo: x.activo !== false, tel: x.tel || '', ultimoAcceso: x.ultimoAcceso || 0 }; });
          return { staff: l, roles: ROLES, config: a[2] };
        });
      });
      if (accion === 'guardarStaff') {
        var k = keyp(b.usuario); if (!k) return Promise.reject(err('datos', 'Escribe el usuario.'));
        if (!ROLES[b.rol]) return Promise.reject(err('datos', 'Rol no válido.'));
        if (b.rol === 'vendedor' && !keyp(b.vk)) return Promise.reject(err('datos', 'Al vendedor elígele su cartera.'));
        return g('staff/' + k).then(function (prev) {
          prev = prev || {};
          var o = Object.assign({}, prev, { nombre: clip(b.nombre || b.usuario, 80), rol: b.rol, vk: keyp(b.vk), tel: clip(digits(b.tel), 15), activo: b.activo !== false });
          var pr;
          if (b.pin) {
            if (!/^\d{6,8}$/.test(String(b.pin))) return Promise.reject(err('datos', 'El PIN debe ser de 6 a 8 dígitos.'));
            o.salt = randomSalt(); o.pinVer = num(prev.pinVer) + 1;
            pr = Promise.resolve(hashPin(String(b.pin), o.salt)).then(function (h) { o.pinHash = h; });
          } else { if (!prev.pinHash) return Promise.reject(err('datos', 'Asigna un PIN.')); pr = Promise.resolve(); }
          return pr.then(function () {
            var m = {}; m['staff/' + k] = o; if (o.rol === 'vendedor' && o.vk) m['vendTel/' + o.vk] = o.tel || null;
            return Promise.resolve(db.update('cli', m));
          }).then(function () { return audit('MAESTRO', 'guardarStaff', { u: k, rol: b.rol }); }).then(function () { return { ok: true }; });
        });
      }
      if (accion === 'vendedores') return Promise.resolve(db.get('skan/_index')).then(function (idx) { return { vendors: (idx && idx.vendors) || [] }; });
      if (accion === 'guardarConfig') return stGuardarConfig({ u: 'MAESTRO' }, b);
      return Promise.reject(err('accion', 'Acción no válida'));
    }

    return { cliente: cliente, staff: staff, staffLogin: staffLogin, progLogin: progLogin, maestro: maestro, onEmbarque: onEmbarque, preciosCliente: preciosCliente };
  }

  return {
    create: create, keyp: keyp, calcFlete: calcFlete, VEHICULOS_BASE: VEHICULOS_BASE, PARAMS_BASE: PARAMS_BASE, TIERS_BASE: TIERS_BASE,
    prodKg: prodKg, esPremium: esPremium, esPetFood: esPetFood, sacosPorTon: sacosPorTon, normRem: normRem, tiersDeConfig: tiersDeConfig
  };
});
