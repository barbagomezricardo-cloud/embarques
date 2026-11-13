/* =====================================================================
   BONOS 19H · Esquema de bonos por crecimiento, clientes nuevos y rendimiento
   ---------------------------------------------------------------------
   Pestaña «💵 Bonos» de ventas.html (solo super-usuario).
   Lee las ventas reales del reporte de Odoo que ya cargaste en el tablero
   (DATA.yoy: venta del año por cliente y la base del año anterior, ya
   asignadas al vendedor que hoy atiende a cada cliente) y calcula el pago
   exacto de cada persona en el mes, con centavos.
   - Vendedores (esquema general): $ por punto de crecimiento (2 decimales)
     + $ por saco adicional si el mes llega al umbral; ambos con tope.
   - Cartera en arranque (Dagoviet): nivel de sacos del mes.
   - Clientes nuevos (solo con 1.ª compra desde octubre 2026): 50% al mes 3 (si compró 2 de 3 meses) y 50% al mes 6.
   - Soporte: crecimiento de toda la división × factor por indicadores,
     + bono por cliente canalizado desde redes (en su primera compra).
   Los parámetros, indicadores y validaciones se guardan en este equipo
   (clave bonos04mas) y viajan a la nube con «Guardar configuración».
   ===================================================================== */
(function (W, D) {
  'use strict';
  var KEY = 'bonos04mas';
  var MES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  var DEF = {
    pp: 500, ps: 0.30, umbral: 10, tope: 30,
    dTiers: [[12000, 2500], [15000, 4500], [18000, 6500], [21000, 8000]],
    cTiers: [[600, 1500, 300], [1200, 3000, 600], [1800, 6000, 900]],
    sj: 250, sa: 150, st: 20, f3: 100, f2: 50, f1: 0,
    kpiJ: [['Embarques entregados en la fecha comprometida', 95], ['Embarques sin incidencia (faltantes, daños, error de surtido)', 98], ['Embarques con documentación completa el mismo día', 95]],
    kpiA: [['Pedidos capturados en Odoo en 24 h o menos', 95], ['Facturas sin error (sin cancelación ni nota de crédito)', 98], ['Mensajes de clientes y redes respondidos en 24 h o menos', 90]],
    nombres: { jefa: 'Jefa de Embarques', a1: 'Asistente de Ventas 1', a2: 'Asistente de Ventas 2' },
    esquema: {},      // VENDEDOR -> 'general' | 'arranque' | 'no'
    inicio: { y: 2026, m: 11 },
    nuevosDesde: { y: 2026, m: 10 },   // solo cuentan los clientes nuevos cuya 1.ª compra es de este mes en adelante (vendedores y soporte)
    meses: {}         // 'AAAA-MM' -> { kpi:{jefa:[..],a1:[..],a2:[..]}, nuevos:{cliente:{excl:bool, canal:''}} }
  };
  var S = null, SIM = {}, SIMD = {};
  var mesSel = 0;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function load() {
    var s = null; try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
    S = Object.assign(clone(DEF), s || {});
    S.nombres = Object.assign(clone(DEF.nombres), S.nombres || {});
    if (!S.meses) S.meses = {}; if (!S.esquema) S.esquema = {};
    S.nuevosDesde = Object.assign(clone(DEF.nuevosDesde), S.nuevosDesde || {});
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }
  function n(v) { var x = parseFloat(v); return isNaN(x) ? 0 : x; }
  function r2(x) { return Math.round((x + Number.EPSILON) * 100) / 100; }
  function $$(x) { return '$' + Number(x || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function ent(x) { return Math.round(x || 0).toLocaleString('es-MX'); }
  function pct(x) { return (x >= 0 ? '+' : '') + Number(x).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim(); }
  function defEsquema(v) { var k = norm(v); if (k.indexOf('DAGO') === 0) return 'arranque'; if (k === 'ARMANDO' || k.indexOf('VICTOR') === 0) return 'general'; return 'no'; }
  function esquemaDe(v) { return S.esquema[v] || defEsquema(v); }
  function mk(y, m) { return y + '-' + ('0' + m).slice(-2); }
  function mesState(key) {
    if (!S.meses[key]) S.meses[key] = { kpi: { jefa: ['', '', ''], a1: ['', '', ''], a2: ['', '', ''] }, nuevos: {} };
    var o = S.meses[key]; if (!o.kpi) o.kpi = { jefa: ['', '', ''], a1: ['', '', ''], a2: ['', '', ''] }; if (!o.nuevos) o.nuevos = {};
    return o;
  }

  /* ---------- reglas de pago ---------- */
  function pagoVendedor(base, venta, gSim) {
    // gSim: % simulado (o null para usar la venta real)
    var g = gSim != null ? gSim : (base > 0 ? r2((venta - base) / base * 100) : 0);
    var extra = gSim != null ? Math.round(base * gSim / 100) : Math.round(venta - base);
    var ventaUsada = gSim != null ? base + extra : venta;
    var gc = Math.min(Math.max(g, 0), S.tope);
    var esfuerzo = base > 0 ? r2(gc * S.pp) : 0;
    var topeSacos = Math.floor(base * S.tope / 100);
    var sacosPag = Math.max(0, Math.min(extra, topeSacos));
    var activa = base > 0 && g >= S.umbral;
    var volumen = activa ? r2(sacosPag * S.ps) : 0;
    return { g: g, extra: extra, venta: ventaUsada, esfuerzo: esfuerzo, volumen: volumen, sacosPag: sacosPag, activa: activa, topado: g > S.tope, total: r2(esfuerzo + volumen) };
  }
  function nivelArranque(venta) {
    var t = S.dTiers.slice().sort(function (a, b) { return a[0] - b[0]; }), lvl = -1;
    t.forEach(function (x, i) { if (venta >= x[0]) lvl = i; });
    return { lvl: lvl, bono: lvl < 0 ? 0 : t[lvl][1], sig: lvl < t.length - 1 ? t[lvl + 1] : null, tiers: t };
  }
  function tierCliente(sacos, idx) { // idx 1 = vendedor, 2 = soporte
    var t = S.cTiers.slice().sort(function (a, b) { return a[0] - b[0]; }), r = null;
    t.forEach(function (x, i) { if (sacos >= x[0]) r = { i: i, desde: x[0], monto: x[idx], nombre: ['Chico', 'Mediano', 'Grande'][i] || ('Nivel ' + (i + 1)) }; });
    return r;
  }
  function factor(nOk) { return (nOk >= 3 ? S.f3 : nOk === 2 ? S.f2 : S.f1) / 100; }
  function kpiCumple(vals, metas) {
    var ok = 0, datos = 0;
    for (var i = 0; i < metas.length; i++) { var v = vals[i]; if (v === '' || v == null) continue; datos++; if (n(v) >= metas[i][1]) ok++; }
    return { ok: datos === metas.length ? ok : Math.min(ok, 1), datos: datos, completo: datos === metas.length };
  }

  /* ---------- datos del tablero ---------- */
  function datos() {
    if (!W.DATA && typeof DATA === 'undefined') return null;
    var DT = (typeof DATA !== 'undefined') ? DATA : W.DATA; if (!DT) return null;
    try { if (!DT.yoy && typeof computeYoY === 'function') computeYoY(); } catch (e) { }
    return DT.yoy ? { DT: DT, Y: DT.yoy } : null;
  }
  function porVendedor(Y, m) {
    var o = {}, div = { venta: 0, base: 0 };
    Y.rows.forEach(function (r) {
      var v = r.vend || 'SIN DATOS'; if (!o[v]) o[v] = { venta: 0, base: 0, clientes: 0 };
      var cv = (r.curM && r.curM[m - 1]) || 0, bv = (r.priorM && r.priorM[m - 1]) || 0;
      o[v].venta += cv; o[v].base += bv; if (cv > 0) o[v].clientes++;
      div.venta += cv; div.base += bv;
    });
    return { v: o, div: div };
  }
  // Clientes nuevos que entran al esquema: 1.ª compra desde S.nuevosDesde (oct 2026). Los anteriores ya se pagaron con el esquema anterior.
  function nuevoEnVigor(Y, f) { var d = S.nuevosDesde || DEF.nuevosDesde; return Y.cy > d.y || (Y.cy === d.y && f >= d.m); }
  function nuevosFuera(Y) { return Y.rows.filter(function (r) { return r.nuevo && r.firstMes > 0 && !nuevoEnVigor(Y, r.firstMes); }).length; }
  /* Estado de cada cliente nuevo para el seguimiento:
     seg = en seguimiento · con = cerrado con pago · sin = cerrado sin pago · na = no aplica (antes del arranque) */
  function absM(y, m) { return y * 12 + (m - 1); }
  function lblAbs(a, cy) { var y = Math.floor(a / 12), m = a % 12 + 1; return MES[m] + (y !== cy ? ' ' + y : ''); }
  function estadoNuevo(c, Y, st0, maxAbs) {
    var d = S.nuevosDesde || DEF.nuevosDesde, p1 = c.start + 2, p2 = c.start + 5;
    if (c.na) return { k: 'na', t: 'No aplica: primera compra en ' + MES[c.f] + ' (antes de ' + MES[d.m] + ' ' + d.y + ')' };
    if (st0.excl) return { k: 'sin', t: 'No validado por gerencia' };
    if (!c.completo3 || p1 > maxAbs) return { k: 'seg', t: 'Se define en ' + lblAbs(p1, Y.cy) };
    if (c.compro < 2) return { k: 'sin', t: 'No cumplió: compró ' + c.compro + ' de 3 meses' };
    if (!c.tier) return { k: 'sin', t: 'No cumplió: promedio menor a ' + ent(S.cTiers[0][0]) + ' sacos' };
    var mitad = r2(c.tier.monto / 2), resto = r2(c.tier.monto - mitad);
    var t1 = '1.er pago ' + $$(mitad) + ' (' + lblAbs(p1, Y.cy) + ')' + (st0.pag1 ? ' ✔ pagado' : ' · por pagar');
    var p2Txt = lblAbs(p2, Y.cy);
    if (st0.pag2) return { k: 'con', t: 'Pagado completo: ' + $$(c.tier.monto), pagos: true };
    if (c.m6 != null && p2 <= maxAbs && c.m6 <= 0) return st0.pag1 ? { k: 'con', t: t1 + ' · 2.º pago no aplica (no compró en ' + p2Txt + ')', pagos: true } : { k: 'seg', t: t1 + ' · 2.º pago no aplica', pagos: true };
    return { k: 'seg', t: t1 + ' · 2.º pago ' + $$(resto) + ' (' + p2Txt + ')' + (c.m6 != null && c.m6 > 0 ? ' ✔ compró' : ''), pagos: true };
  }
  /* Cohorte de clientes nuevos: se registra cada cliente nuevo en vigor (año y mes de su 1.ª compra) y su
     venta mensual, en S.cohorte (viaja a la nube con «Guardar configuración»). Así, un cliente que empieza en
     octubre o noviembre sigue en seguimiento en el reporte del año siguiente —donde ya no sale como «nuevo»—
     y sus meses del año anterior se toman de la base del año anterior (priorM) o de lo guardado. */
  function nuevosDe(Y) {
    var maxAbs = absM(Y.cy, Math.max.apply(null, (Y.meses && Y.meses.length) ? Y.meses : [12]));
    var byN = {}; Y.rows.forEach(function (r) { byN[norm(r.nombre)] = r; });
    if (!S.cohorte) S.cohorte = {};
    var cambio = false, out = [];
    Y.rows.forEach(function (r) {
      if (!(r.nuevo && r.firstMes > 0)) return;
      if (!nuevoEnVigor(Y, r.firstMes)) {   // antes del arranque: solo para mostrarse como «No aplica»
        var c0 = r.curM || [], st = absM(Y.cy, r.firstMes);
        out.push({ na: true, nombre: r.nombre, vend: r.vend || 'SIN DATOS', y: Y.cy, f: r.firstMes, start: st, m1: c0[r.firstMes - 1] || 0, m2: null, m3: null, m6: null, compro: 0, prom: 0, tier: null, tierSop: null, completo3: false });
        return;
      }
      var k = norm(r.nombre), e = S.cohorte[k];
      if (!e || e.y > Y.cy || (e.y === Y.cy && e.f !== r.firstMes)) { S.cohorte[k] = { nombre: r.nombre, y: Y.cy, f: r.firstMes, vend: r.vend || '', m: {} }; cambio = true; }
    });
    Object.keys(S.cohorte).forEach(function (k) {
      var e = S.cohorte[k], start = absM(e.y, e.f), r = byN[k];
      if (start > maxAbs || start + 5 < absM(Y.cy - 1, 1)) return;   // de un año futuro, o ya cerrado hace más de un año
      if (r) {   // guarda la venta del año en curso (respaldo para el año siguiente)
        var a = (r.curM || []).map(function (x) { return Math.round(x || 0); });
        if (JSON.stringify((e.m || {})[Y.cy]) !== JSON.stringify(a)) { e.m = e.m || {}; e.m[Y.cy] = a; cambio = true; }
        if (r.vend && e.vend !== r.vend) { e.vend = r.vend; cambio = true; }
      }
      var val = function (ab) {
        if (ab > maxAbs) return null;
        var y = Math.floor(ab / 12), i = ab % 12;
        if (y === Y.cy) return r ? ((r.curM && r.curM[i]) || 0) : 0;
        if (y === Y.cy - 1 && r && r.priorM && r.priorM.some(function (x) { return x > 0; })) return r.priorM[i] || 0;
        return (e.m && e.m[y]) ? (e.m[y][i] || 0) : 0;
      };
      var m1 = val(start) || 0, m2 = val(start + 1), m3 = val(start + 2), m6 = val(start + 5);
      var compro = [m1, m2, m3].filter(function (x) { return x != null && x > 0; }).length;
      var prom = (m1 + (m2 || 0) + (m3 || 0)) / 3;
      out.push({ na: false, nombre: r ? r.nombre : e.nombre, vend: (r && r.vend) || e.vend || 'SIN DATOS', y: e.y, f: e.f, start: start, m1: m1, m2: m2, m3: m3, m6: m6, compro: compro, prom: prom, tier: tierCliente(prom, 1), tierSop: tierCliente(m1, 2), completo3: m3 != null });
    });
    if (cambio) save();
    return out.sort(function (a, b) { return b.start - a.start || b.prom - a.prom; });
  }

  /* ---------- cálculo completo del mes ---------- */
  function calcular(Y, m) {
    var key = mk(Y.cy, m), ms = mesState(key);
    var pv = porVendedor(Y, m), personas = [], parcial = (Y.partial || []).indexOf(m) >= 0;
    var nuevos = nuevosDe(Y);
    // vendedores
    Object.keys(pv.v).sort(function (a, b) { return pv.v[b].venta - pv.v[a].venta; }).forEach(function (v) {
      var esq = esquemaDe(v); if (esq === 'no') return;
      var d = pv.v[v], p = { nombre: v, rol: 'vendedor', esq: esq, base: d.base, venta: d.venta, conceptos: [] };
      if (esq === 'general') {
        var real = pagoVendedor(d.base, d.venta, null);
        var sim = SIM[v] != null ? pagoVendedor(d.base, d.venta, SIM[v]) : null;
        p.real = real; p.sim = sim; var u = sim || real;
        p.conceptos.push(['Crecimiento ' + pct(Math.min(Math.max(u.g, 0), S.tope)) + ' × ' + $$(S.pp) + ' por punto', u.esfuerzo]);
        p.conceptos.push([u.activa ? (ent(u.sacosPag) + ' sacos adicionales × ' + $$(S.ps)) : ('Pago por volumen: no llegó al ' + S.umbral + '%'), u.volumen]);
      } else {
        var vd = SIMD[v] != null ? SIMD[v] : d.venta, nv = nivelArranque(vd);
        p.arr = nv; p.ventaUsada = vd; p.simulado = SIMD[v] != null;
        p.conceptos.push([nv.lvl < 0 ? ('Cartera en arranque: ' + ent(vd) + ' sacos, sin nivel') : ('Cartera en arranque: nivel ' + (nv.lvl + 1) + ' (' + ent(vd) + ' sacos)'), nv.bono]);
      }
      // clientes nuevos del vendedor que pagan este mes
      nuevos.forEach(function (c) {
        if (c.na || c.vend !== v) return; var st = mesState(mk(c.y, c.f)).nuevos[c.nombre] || {}; if (st.excl) return; var hoy = absM(Y.cy, m);
        if (!c.tier || c.compro < 2) return;
        var mitad = r2(c.tier.monto / 2);
        if (c.start + 2 === hoy) p.conceptos.push(['Cliente nuevo ' + c.nombre + ' (' + c.tier.nombre + ', 1.er pago 50%)', mitad]);
        if (c.start + 5 === hoy && c.m6 > 0) p.conceptos.push(['Cliente nuevo ' + c.nombre + ' (' + c.tier.nombre + ', 2.º pago 50%)', r2(c.tier.monto - mitad)]);
      });
      p.total = r2(p.conceptos.reduce(function (a, x) { return a + x[1]; }, 0));
      personas.push(p);
    });
    // soporte
    var gdReal = pv.div.base > 0 ? r2((pv.div.venta - pv.div.base) / pv.div.base * 100) : 0;
    var gd = SIM.__div != null ? SIM.__div : gdReal, gdc = Math.min(Math.max(gd, 0), S.st);
    [['jefa', S.sj, S.kpiJ], ['a1', S.sa, S.kpiA], ['a2', S.sa, S.kpiA]].forEach(function (s) {
      var k = kpiCumple(ms.kpi[s[0]] || [], s[2]), f = factor(k.ok), base = r2(gdc * s[1]);
      var p = { nombre: S.nombres[s[0]], rol: 'soporte', id: s[0], kpi: k, factor: f, conceptos: [] };
      p.conceptos.push(['División ' + pct(gdc) + ' × ' + $$(s[1]) + ' = ' + $$(base) + ' × factor ' + Math.round(f * 100) + '% (' + k.ok + ' de 3' + (k.completo ? '' : ', faltan datos') + ')', r2(base * f)]);
      nuevos.forEach(function (c) {
        // el canalizado y la validación se guardan en el mes de la primera compra
        var st0 = (S.meses[mk(c.y, c.f)] || { nuevos: {} }).nuevos[c.nombre] || {};
        if (c.na || c.start !== absM(Y.cy, m) || st0.canal !== s[0] || st0.excl) return;
        if (c.tierSop) p.conceptos.push(['Canalizó a ' + c.nombre + ' (1.ª compra ' + ent(c.m1) + ' sacos)', c.tierSop.monto]);
      });
      p.total = r2(p.conceptos.reduce(function (a, x) { return a + x[1]; }, 0));
      personas.push(p);
    });
    return { key: key, ms: ms, pv: pv, personas: personas, nuevos: nuevos, gdReal: gdReal, gd: gd, parcial: parcial, total: r2(personas.reduce(function (a, p) { return a + p.total; }, 0)) };
  }

  /* ---------- estilos ---------- */
  function css() {
    if (D.getElementById('bn-css')) return;
    var st = D.createElement('style'); st.id = 'bn-css';
    st.textContent = [
      '#bn-root{width:100%;overflow-y:auto;padding:14px 16px 40px;display:grid;gap:14px;align-content:start;color:var(--tinta)}',
      '#bn-root *{box-sizing:border-box}',
      '.bn-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center}',
      '.bn-bar h2{margin:0;font:800 1.25rem var(--fd19);flex:1;min-width:200px}',
      '.bn-bar select,.bn-bar button,.bn-btn{font:700 .86rem var(--f19);padding:7px 12px;border-radius:9px;border:1px solid var(--linea);background:var(--blanco);color:var(--tinta);cursor:pointer}',
      '.bn-btn.pri{background:var(--rojo);border-color:var(--rojo);color:#fff}',
      '.bn-aviso{padding:9px 12px;border-radius:10px;background:var(--rojo-s);color:var(--tinta);font-size:.85rem;border:1px solid var(--linea)}',
      '.bn-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}',
      '.bn-k{background:var(--blanco);border:1px solid var(--linea);border-radius:12px;padding:12px 14px;display:grid;gap:2px;min-width:0}',
      '.bn-k span{font-size:.74rem;color:var(--tinta-3);text-transform:uppercase;letter-spacing:.05em;font-weight:700}',
      '.bn-k b{font:800 1.45rem var(--fd19);font-variant-numeric:tabular-nums}',
      '.bn-k.tot{background:var(--rojo);border-color:var(--rojo)} .bn-k.tot span,.bn-k.tot b{color:#fff}',
      '.bn-sec{background:var(--blanco);border:1px solid var(--linea);border-radius:14px;padding:14px;display:grid;gap:12px;min-width:0}',
      '.bn-sec h3{margin:0;font:800 1rem var(--fd19);display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
      '.bn-sec h3 small{font:600 .78rem var(--f19);color:var(--tinta-3)}',
      '.bn-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}',
      '.bn-card{border:1px solid var(--linea);border-radius:12px;padding:12px;display:grid;gap:9px;background:var(--papel);min-width:0}',
      '.bn-card .hd{display:flex;justify-content:space-between;gap:8px;align-items:baseline;flex-wrap:wrap}',
      '.bn-card .hd b{font:800 1.05rem var(--fd19)}',
      '.bn-card .pay{font:800 1.5rem var(--fd19);color:var(--rojo);font-variant-numeric:tabular-nums}',
      '.bn-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(105px,1fr));gap:8px}',
      '.bn-row div{display:grid;gap:1px;font-size:.78rem;color:var(--tinta-3)}',
      '.bn-row div b{font:800 1rem var(--fd19);color:var(--tinta);font-variant-numeric:tabular-nums}',
      '.bn-up{color:var(--td-up)!important} .bn-dn{color:var(--td-dn)!important}',
      '.bn-sim{display:grid;gap:6px;border-top:1px dashed var(--linea);padding-top:8px}',
      '.bn-sim label{font-size:.78rem;color:var(--tinta-2);display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
      '.bn-sim input[type=range]{flex:1;min-width:140px;accent-color:var(--rojo)}',
      '.bn-sim input[type=number]{width:92px;padding:5px 7px;border-radius:7px;border:1px solid var(--linea);font:700 .9rem var(--f19);font-variant-numeric:tabular-nums}',
      '.bn-tag{display:inline-block;padding:2px 9px;border-radius:999px;font:800 .7rem var(--f19);letter-spacing:.04em;text-transform:uppercase}',
      '.bn-tag.ok{background:rgba(23,133,64,.14);color:var(--td-up)} .bn-tag.no{background:var(--rojo-s);color:var(--td-dn)} .bn-tag.sim{background:#F0B35733;color:var(--tinta)}',
      '.bn-tbl{overflow-x:auto} .bn-tbl table{border-collapse:collapse;width:100%;font-size:.84rem;font-variant-numeric:tabular-nums}',
      '.bn-tbl th,.bn-tbl td{padding:7px 8px;border-bottom:1px solid var(--linea);text-align:left;vertical-align:middle}',
      '.bn-tbl th{font:800 .7rem var(--f19);text-transform:uppercase;letter-spacing:.05em;color:var(--tinta-3)}',
      '.bn-tbl td.r,.bn-tbl th.r{text-align:right}',
      '.bn-tbl input[type=number]{width:84px;padding:5px 6px;border-radius:7px;border:1px solid var(--linea);font:700 .86rem var(--f19)}',
      '.bn-tbl input[type=text]{min-width:200px;width:100%;padding:5px 6px;border-radius:7px;border:1px solid var(--linea);font:.86rem var(--f19)}',
      '.bn-tbl select{padding:5px 6px;border-radius:7px;border:1px solid var(--linea);font:.84rem var(--f19)}',
      '.bn-con{display:grid;gap:3px;font-size:.8rem}',
      '.bn-con div{display:flex;justify-content:space-between;gap:10px} .bn-con div span:last-child{font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.bn-par{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}',
      '.bn-par label{display:grid;gap:3px;font-size:.78rem;color:var(--tinta-2)}',
      '.bn-par input{padding:6px 8px;border-radius:8px;border:1px solid var(--linea);font:700 .9rem var(--f19)}',
      '.bn-nota{font-size:.78rem;color:var(--tinta-3)}',
      'details.bn-sec>summary{cursor:pointer;font:800 1rem var(--fd19);list-style:none} details.bn-sec>summary::-webkit-details-marker{display:none}',
      'details.bn-sec>summary::before{content:"▸ ";color:var(--rojo)} details.bn-sec[open]>summary::before{content:"▾ "}',
      '.bn-vacio{padding:30px 16px;text-align:center;color:var(--tinta-2);display:grid;gap:8px;justify-items:center}'
    ].join('\n');
    D.head.appendChild(st);
  }

  /* ---------- pintar ---------- */
  function render() {
    css(); if (!S) load();
    var root = D.getElementById('bn-root'); if (!root) return;
    var dd = datos();
    if (!dd) {
      root.innerHTML = '<div class="bn-vacio"><b style="font:800 1.2rem var(--fd19)">Carga el reporte de ventas de Odoo</b><span>Los bonos se calculan solos con las ventas reales del archivo que subes al tablero, comparadas contra el mismo mes del año anterior.</span></div>';
      return;
    }
    var Y = dd.Y, meses = (Y.meses || []).slice().sort(function (a, b) { return a - b; });
    if (!meses.length) { root.innerHTML = '<div class="bn-vacio">El reporte no trae meses con venta.</div>'; return; }
    if (meses.indexOf(mesSel) < 0) {
      var comp = (Y.complete || meses).slice().sort(function (a, b) { return a - b; });
      mesSel = comp.length ? comp[comp.length - 1] : meses[meses.length - 1];
    }
    var R = calcular(Y, mesSel), m = mesSel;
    var antes = (Y.cy < S.inicio.y) || (Y.cy === S.inicio.y && m < S.inicio.m);
    var h = [];
    h.push('<div class="bn-bar"><h2>💵 Bonos del mes · ' + MES[m] + ' ' + Y.cy + '</h2>' +
      '<label class="bn-nota">Mes a pagar <select id="bn-mes">' + meses.map(function (x) { return '<option value="' + x + '"' + (x === m ? ' selected' : '') + '>' + MES[x] + ' ' + Y.cy + '</option>'; }).join('') + '</select></label>' +
      '<button class="bn-btn" id="bn-real" type="button">↺ Quitar simulaciones</button>' +
      '<button class="bn-btn" id="bn-copy" type="button">📋 Copiar resumen</button>' +
      '<button class="bn-btn pri" id="bn-xls" type="button">⬇ Excel de pago</button></div>');
    var avisos = [];
    if (R.parcial) avisos.push('⚠ ' + MES[m] + ' todavía va incompleto en el reporte: estas cifras son preliminares. Paga con el reporte del mes cerrado.');
    if (antes) avisos.push('El esquema entra en vigor con la venta de ' + MES[S.inicio.m] + ' ' + S.inicio.y + '. Este mes sirve solo como referencia.');
    if (Object.keys(SIM).length || Object.keys(SIMD).length) avisos.push('Hay escenarios simulados activos (marcados como SIMULADO). Para pagar, usa «Quitar simulaciones».');
    avisos.push('Comparación contra ' + MES[m] + ' ' + Y.py + ' por cartera actual: la venta del año anterior de cada cliente cuenta para el vendedor que hoy lo atiende. Solo sacos de venta facturados, sin promociones ni bonificaciones.');
    h.push(avisos.map(function (a) { return '<div class="bn-aviso">' + esc(a) + '</div>'; }).join(''));
    // resumen
    var tv = 0, ts = 0; R.personas.forEach(function (p) { if (p.rol === 'vendedor') tv += p.total; else ts += p.total; });
    h.push('<div class="bn-kpis">' +
      '<div class="bn-k tot"><span>Total a pagar</span><b>' + $$(R.total) + '</b></div>' +
      '<div class="bn-k"><span>Vendedores</span><b>' + $$(tv) + '</b></div>' +
      '<div class="bn-k"><span>Soporte</span><b>' + $$(ts) + '</b></div>' +
      '<div class="bn-k"><span>Crecimiento división</span><b class="' + (R.gdReal >= 0 ? 'bn-up' : 'bn-dn') + '">' + pct(R.gdReal) + '</b></div>' +
      '<div class="bn-k"><span>Sacos división ' + Y.cy + ' / ' + Y.py + '</span><b>' + ent(R.pv.div.venta) + ' / ' + ent(R.pv.div.base) + '</b></div></div>');
    // vendedores
    h.push('<div class="bn-sec"><h3>Vendedores <small>Venta real del reporte; mueve la barra o escribe el % (de 0.1 en 0.1) para ver escenarios</small></h3><div class="bn-grid">');
    R.personas.filter(function (p) { return p.rol === 'vendedor'; }).forEach(function (p) {
      var c = '<div class="bn-card"><div class="hd"><b>' + esc(p.nombre) + '</b>';
      if (p.esq === 'general') {
        var u = p.sim || p.real;
        c += (p.sim ? '<span class="bn-tag sim">Simulado</span>' : (p.real.activa ? '<span class="bn-tag ok">Volumen activo</span>' : '<span class="bn-tag no">Sin volumen (&lt; ' + S.umbral + '%)</span>')) + '</div>';
        c += '<div class="pay">' + $$(p.total) + '</div>';
        c += '<div class="bn-row"><div>Base ' + Y.py + '<b>' + ent(p.base) + '</b></div><div>Venta ' + Y.cy + '<b>' + ent(u.venta) + '</b></div><div>Crecimiento<b class="' + (u.g >= 0 ? 'bn-up' : 'bn-dn') + '">' + pct(u.g) + '</b></div><div>Sacos adicionales<b>' + ent(u.extra) + '</b></div></div>';
        c += conceptos(p);
        if (u.topado) c += '<div class="bn-nota">Pasó el tope de +' + S.tope + '%: arriba de eso cobra su comisión normal.</div>';
        else if (!u.activa && p.base > 0) c += '<div class="bn-nota">Le faltan ' + ent(Math.ceil(p.base * S.umbral / 100) - u.extra) + ' sacos para el ' + S.umbral + '% y activar el pago por volumen.</div>';
        var gv = p.sim ? p.sim.g : p.real.g;
        c += '<div class="bn-sim"><label>Escenario <input type="range" min="-10" max="40" step="0.1" value="' + Math.max(-10, Math.min(40, gv)) + '" data-simr="' + esc(p.nombre) + '"><input type="number" step="0.1" value="' + gv.toFixed(2) + '" data-simn="' + esc(p.nombre) + '">%</label>' +
          (p.sim ? '<div class="bn-nota">Real: ' + pct(p.real.g) + ' → ' + $$(p.real.total + (p.total - p.sim.total)) + '. <a href="#" data-simx="' + esc(p.nombre) + '">Volver a real</a></div>' : '') + '</div>';
      } else {
        var nv = p.arr;
        c += (p.simulado ? '<span class="bn-tag sim">Simulado</span>' : '<span class="bn-tag ok">Cartera en arranque</span>') + '</div>';
        c += '<div class="pay">' + $$(p.total) + '</div>';
        c += '<div class="bn-row"><div>Venta del mes<b>' + ent(p.ventaUsada) + '</b></div><div>Nivel<b>' + (nv.lvl < 0 ? 'Sin nivel' : (nv.lvl + 1) + ' de ' + nv.tiers.length) + '</b></div><div>Base ' + Y.py + ' (referencia)<b>' + ent(p.base) + '</b></div></div>';
        c += conceptos(p);
        c += '<div class="bn-nota">' + (nv.sig ? 'Faltan ' + ent(nv.sig[0] - p.ventaUsada) + ' sacos para el siguiente nivel (' + $$(nv.sig[1]) + ').' : 'Nivel máximo.') + ' Pasa al esquema general al promediar ' + ent(nv.tiers[nv.tiers.length - 1][0]) + ' sacos 3 meses seguidos o al cumplir 12 meses comparables.</div>';
        c += '<div class="bn-sim"><label>Escenario (sacos) <input type="range" min="0" max="' + Math.max(30000, Math.round(p.ventaUsada * 1.3)) + '" step="100" value="' + Math.round(p.ventaUsada) + '" data-simdr="' + esc(p.nombre) + '"><input type="number" step="1" value="' + Math.round(p.ventaUsada) + '" data-simdn="' + esc(p.nombre) + '"></label>' +
          (p.simulado ? '<div class="bn-nota">Real: ' + ent(p.venta) + ' sacos. <a href="#" data-simdx="' + esc(p.nombre) + '">Volver a real</a></div>' : '') + '</div>';
      }
      h.push(c + '</div>');
    });
    h.push('</div></div>');
    // soporte
    h.push('<div class="bn-sec"><h3>Equipo de soporte <small>Crecimiento de toda la división × factor por indicadores</small></h3>');
    h.push('<div class="bn-sim" style="border:0;padding:0"><label>Crecimiento de la división ' + (SIM.__div != null ? '<span class="bn-tag sim">Simulado</span>' : '(real ' + pct(R.gdReal) + ')') + ' <input type="range" min="-10" max="30" step="0.1" value="' + Math.max(-10, Math.min(30, R.gd)) + '" data-simr="__div"><input type="number" step="0.1" value="' + R.gd.toFixed(2) + '" data-simn="__div">%' + (SIM.__div != null ? ' <a href="#" data-simx="__div">Volver a real</a>' : '') + '</label></div>');
    h.push('<div class="bn-tbl"><table><thead><tr><th>Indicador</th><th class="r">Meta</th><th class="r">' + esc(S.nombres.jefa) + '</th><th class="r">' + esc(S.nombres.a1) + '</th><th class="r">' + esc(S.nombres.a2) + '</th></tr></thead><tbody>');
    for (var i = 0; i < 3; i++) {
      h.push('<tr><td>' + esc(S.kpiJ[i][0]) + '</td><td class="r">≥ ' + S.kpiJ[i][1] + '%</td><td class="r">' + kin('jefa', i, R.ms) + '</td><td class="r bn-nota">—</td><td class="r bn-nota">—</td></tr>');
    }
    for (i = 0; i < 3; i++) {
      h.push('<tr><td>' + esc(S.kpiA[i][0]) + '</td><td class="r">≥ ' + S.kpiA[i][1] + '%</td><td class="r bn-nota">—</td><td class="r">' + kin('a1', i, R.ms) + '</td><td class="r">' + kin('a2', i, R.ms) + '</td></tr>');
    }
    h.push('</tbody></table></div><div class="bn-nota">Captura el resultado del mes (%) de cada indicador con lo que sale de Odoo y de la bitácora de redes. Sin datos completos, el factor es el de 1 o 0 indicadores.</div><div class="bn-grid">');
    R.personas.filter(function (p) { return p.rol === 'soporte'; }).forEach(function (p) {
      h.push('<div class="bn-card"><div class="hd"><b>' + esc(p.nombre) + '</b><span class="bn-tag ' + (p.kpi.ok >= 3 ? 'ok' : 'no') + '">' + p.kpi.ok + ' de 3 · factor ' + Math.round(p.factor * 100) + '%</span></div><div class="pay">' + $$(p.total) + '</div>' + conceptos(p) + '</div>');
    });
    h.push('</div></div>');
    // clientes nuevos: seguimiento con filtro (en seguimiento / cerrados con pago / cerrados sin pago / no aplica)
    var _nd = S.nuevosDesde || DEF.nuevosDesde, _maxM = absM(Y.cy, Math.max.apply(null, meses));
    var _L = R.nuevos.map(function (c) { var st0 = mesState(mk(c.y, c.f)).nuevos[c.nombre] || {}; return { c: c, st0: st0, e: estadoNuevo(c, Y, st0, _maxM) }; });
    var _cnt = { seg: 0, con: 0, sin: 0, na: 0 }; _L.forEach(function (x) { _cnt[x.e.k]++; });
    var _fl = S.filtroNuevos || 'seg';
    var _ET = { seg: ['🔎 En seguimiento', ''], con: ['✅ Cerrados con pago', 'ok'], sin: ['⛔ Cerrados sin pago', 'no'], na: ['No aplica (antes de ' + MES[_nd.m] + ')', 'no'] };
    h.push('<div class="bn-sec"><h3>Clientes nuevos · seguimiento de bono <small>Solo pagan los clientes con primera compra de ' + MES[_nd.m] + ' ' + _nd.y + ' en adelante. Gerencia valida cada alta y marca cada pago hecho.</small></h3>');
    h.push('<div class="bn-par" style="align-items:center"><label>Ver<select id="bn-fnuevos">' + ['seg', 'con', 'sin', 'na', 'todos'].map(function (k) { return '<option value="' + k + '"' + (_fl === k ? ' selected' : '') + '>' + (k === 'todos' ? 'Todos (' + _L.length + ')' : _ET[k][0] + ' (' + _cnt[k] + ')') + '</option>'; }).join('') + '</select></label>' +
      '<span class="bn-nota">En seguimiento <b>' + _cnt.seg + '</b> · Cerrados con pago <b>' + _cnt.con + '</b> · Cerrados sin pago <b>' + _cnt.sin + '</b> · No aplica <b>' + _cnt.na + '</b></span></div>');
    var _V = _L.filter(function (x) { return _fl === 'todos' || x.e.k === _fl; });
    if (!_V.length) h.push('<div class="bn-nota">No hay clientes en este apartado.</div>');
    else {
      h.push('<div class="bn-tbl"><table><thead><tr><th>Cliente</th><th>Vendedor</th><th>1.ª compra</th><th class="r">Mes 1</th><th class="r">Mes 2</th><th class="r">Mes 3</th><th class="r">Promedio</th><th>Tamaño</th><th>Estado y pago al vendedor</th><th>Canalizó (redes)</th><th>¿Cuenta?</th></tr></thead><tbody>');
      _V.forEach(function (x) {
        var c = x.c, st0 = x.st0, e = x.e, na = e.k === 'na';
        var pagos = e.pagos ? '<div style="margin-top:4px;display:flex;gap:10px;flex-wrap:wrap"><label class="bn-nota"><input type="checkbox" data-pag="1" data-cli="' + esc(c.nombre) + '" data-k="' + mk(c.y, c.f) + '"' + (st0.pag1 ? ' checked' : '') + '> 1.er pago hecho</label><label class="bn-nota"><input type="checkbox" data-pag="2" data-cli="' + esc(c.nombre) + '" data-k="' + mk(c.y, c.f) + '"' + (st0.pag2 ? ' checked' : '') + '> 2.º pago hecho</label></div>' : '';
        h.push('<tr' + (na || e.k === 'sin' ? ' style="opacity:.6"' : '') + '><td>' + esc(c.nombre) + '</td><td>' + esc(c.vend) + '</td><td>' + lblAbs(c.start, Y.cy) + '</td><td class="r">' + ent(c.m1) + '</td><td class="r">' + (c.m2 == null ? '—' : ent(c.m2)) + '</td><td class="r">' + (c.m3 == null ? '—' : ent(c.m3)) + '</td><td class="r">' + ent(c.prom) + '</td><td>' + (c.tier && !na ? c.tier.nombre : '—') + '</td>' +
          '<td><span class="bn-tag ' + _ET[e.k][1] + '">' + (e.k === 'seg' ? 'Seguimiento' : e.k === 'con' ? 'Cerrado con pago' : e.k === 'sin' ? 'Cerrado sin pago' : 'No aplica') + '</span><div class="bn-nota" style="margin-top:3px">' + e.t + '</div>' + pagos + '</td>' +
          (na ? '<td>—</td><td>—</td></tr>' :
          '<td><select data-canal="' + esc(c.nombre) + '" data-k="' + mk(c.y, c.f) + '"><option value="">—</option>' + ['jefa', 'a1', 'a2'].map(function (k) { return '<option value="' + k + '"' + (st0.canal === k ? ' selected' : '') + '>' + esc(S.nombres[k]) + '</option>'; }).join('') + '</select>' + (st0.canal && c.tierSop ? ' <span class="bn-nota">' + $$(c.tierSop.monto) + ' en ' + lblAbs(c.start, Y.cy) + '</span>' : '') + '</td>' +
          '<td><label class="bn-nota"><input type="checkbox" data-valid="' + esc(c.nombre) + '" data-k="' + mk(c.y, c.f) + '"' + (st0.excl ? '' : ' checked') + '> Validado</label></td></tr>'));
      });
      h.push('</tbody></table></div><div class="bn-nota">Pago al vendedor: 50% al tercer mes si compró en al menos 2 de sus primeros 3 meses, y 50% al sexto mes si sigue comprando. Marca cada pago cuando se haga: al marcar el último pasa a «Cerrados con pago». Quita «Validado» a un cliente que no cumpla la definición (compró en los últimos 12 meses, mismo RFC o transferido de otro vendedor) y pasa a «Cerrados sin pago».</div>');
    }
    h.push('</div>');
    // detalle de pago
    h.push('<div class="bn-sec"><h3>Detalle de pago · ' + MES[m] + ' ' + Y.cy + '</h3><div class="bn-tbl"><table><thead><tr><th>Persona</th><th>Concepto</th><th class="r">Importe</th></tr></thead><tbody>');
    R.personas.forEach(function (p) {
      p.conceptos.forEach(function (x, j) { h.push('<tr><td>' + (j === 0 ? '<b>' + esc(p.nombre) + '</b>' : '') + '</td><td>' + esc(x[0]) + '</td><td class="r">' + $$(x[1]) + '</td></tr>'); });
      h.push('<tr><td></td><td style="text-align:right"><b>Total ' + esc(p.nombre) + '</b></td><td class="r"><b>' + $$(p.total) + '</b></td></tr>');
    });
    h.push('<tr><td colspan="2" style="text-align:right"><b>TOTAL DEL MES</b></td><td class="r"><b style="color:var(--rojo)">' + $$(R.total) + '</b></td></tr></tbody></table></div><div class="bn-nota">El bono se suma a la comisión por saco que ya paga Odoo. Esquema de vigencia mensual: se revisa al cierre de cada mes.</div></div>');
    // parámetros
    h.push(parametrosHTML(Y));
    root.innerHTML = h.join('');
    W.__bnUltimo = { R: R, Y: Y, m: m };
  }
  function conceptos(p) {
    return '<div class="bn-con">' + p.conceptos.map(function (x) { return '<div><span>' + esc(x[0]) + '</span><span>' + $$(x[1]) + '</span></div>'; }).join('') + '</div>';
  }
  function kin(id, i, ms) {
    var v = (ms.kpi[id] || [])[i]; return '<input type="number" step="0.1" min="0" max="100" placeholder="%" data-kpi="' + id + '" data-i="' + i + '" value="' + (v === '' || v == null ? '' : v) + '">';
  }
  function parametrosHTML(Y) {
    var vend = {}; Y.rows.forEach(function (r) { vend[r.vend || 'SIN DATOS'] = 1; });
    var h = '<details class="bn-sec"><summary>Parámetros del esquema</summary>';
    h += '<div class="bn-nota">Cambia aquí los montos y metas si Dirección ajusta el esquema. Se guardan en este equipo; usa «Guardar configuración en la nube» para que los tome cualquier navegador.</div>';
    h += '<div class="bn-par">' + par('pp', '$ por punto de crecimiento', 50) + par('ps', '$ por saco adicional', 0.01) + par('umbral', 'Umbral para volumen (%)', 0.1) + par('tope', 'Tope vendedores (%)', 0.1) +
      par('sj', 'Jefa · $ por punto', 10) + par('sa', 'Asistente · $ por punto', 10) + par('st', 'Tope soporte (%)', 0.1) + par('f3', 'Factor 3 de 3 (%)', 5) + par('f2', 'Factor 2 de 3 (%)', 5) + par('f1', 'Factor 1 o 0 (%)', 5) + '</div>';
    h += '<div class="bn-grid"><div class="bn-tbl"><table><thead><tr><th>Arranque · desde (sacos)</th><th class="r">Bono</th></tr></thead><tbody>' + S.dTiers.map(function (t, i) { return '<tr><td><input type="number" step="100" data-dt="' + i + '" data-k="0" value="' + t[0] + '"></td><td class="r"><input type="number" step="100" data-dt="' + i + '" data-k="1" value="' + t[1] + '"></td></tr>'; }).join('') + '</tbody></table></div>';
    h += '<div class="bn-tbl"><table><thead><tr><th>Cliente nuevo · desde (sacos/mes)</th><th class="r">Vendedor</th><th class="r">Soporte</th></tr></thead><tbody>' + S.cTiers.map(function (t, i) { return '<tr><td><input type="number" step="50" data-ct="' + i + '" data-k="0" value="' + t[0] + '"></td><td class="r"><input type="number" step="100" data-ct="' + i + '" data-k="1" value="' + t[1] + '"></td><td class="r"><input type="number" step="50" data-ct="' + i + '" data-k="2" value="' + t[2] + '"></td></tr>'; }).join('') + '</tbody></table></div></div>';
    h += '<div class="bn-tbl"><table><thead><tr><th>Indicador de soporte</th><th class="r">Meta %</th></tr></thead><tbody>' +
      S.kpiJ.map(function (k, i) { return '<tr><td><input type="text" data-kj="' + i + '" data-k="0" value="' + esc(k[0]) + '"></td><td class="r"><input type="number" step="0.1" data-kj="' + i + '" data-k="1" value="' + k[1] + '"></td></tr>'; }).join('') +
      S.kpiA.map(function (k, i) { return '<tr><td><input type="text" data-ka="' + i + '" data-k="0" value="' + esc(k[0]) + '"></td><td class="r"><input type="number" step="0.1" data-ka="' + i + '" data-k="1" value="' + k[1] + '"></td></tr>'; }).join('') + '</tbody></table></div>';
    h += '<div class="bn-par">' + ['jefa', 'a1', 'a2'].map(function (k) { return '<label>Nombre<input type="text" data-nom="' + k + '" value="' + esc(S.nombres[k]) + '"></label>'; }).join('') +
      '<label>Vigente desde (mes)<input type="number" min="1" max="12" data-ini="m" value="' + S.inicio.m + '"></label><label>Vigente desde (año)<input type="number" data-ini="y" value="' + S.inicio.y + '"></label>' +
      '<label>Clientes nuevos desde (mes)<input type="number" min="1" max="12" data-nd="m" value="' + S.nuevosDesde.m + '"></label><label>Clientes nuevos desde (año)<input type="number" data-nd="y" value="' + S.nuevosDesde.y + '"></label></div>';
    h += '<div class="bn-tbl"><table><thead><tr><th>Vendedor en el reporte</th><th>Esquema</th></tr></thead><tbody>' + Object.keys(vend).sort().map(function (v) {
      var e = esquemaDe(v); return '<tr><td>' + esc(v) + '</td><td><select data-esq="' + esc(v) + '"><option value="general"' + (e === 'general' ? ' selected' : '') + '>General (crecimiento)</option><option value="arranque"' + (e === 'arranque' ? ' selected' : '') + '>Cartera en arranque</option><option value="no"' + (e === 'no' ? ' selected' : '') + '>Sin bono</option></select></td></tr>';
    }).join('') + '</tbody></table></div>';
    h += '<div><button class="bn-btn" type="button" id="bn-def">Restablecer parámetros autorizados</button></div></details>';
    return h;
  }
  function par(k, lbl, step) { return '<label>' + lbl + '<input type="number" step="' + step + '" data-par="' + k + '" value="' + S[k] + '"></label>'; }

  /* ---------- eventos ---------- */
  var tRender = null;
  function later() { clearTimeout(tRender); tRender = setTimeout(function () { var a = D.activeElement, sel = a && a.dataset ? Object.keys(a.dataset).map(function (k) { return '[data-' + k.replace(/[A-Z]/g, function (c) { return '-' + c.toLowerCase(); }) + '="' + a.dataset[k] + '"]'; }).join('') : ''; render(); if (sel) { try { var e = D.querySelector('#bn-root ' + sel); if (e) { e.focus(); if (e.type === 'number' || e.type === 'text') { var l = e.value.length; try { e.setSelectionRange(l, l); } catch (x) { } } } } catch (x) { } } }, 250); }
  function bind() {
    var root = D.getElementById('bn-root'); if (!root || root.__bn) return; root.__bn = 1;
    root.addEventListener('input', function (ev) {
      var t = ev.target, d = t.dataset;
      if (d.simr != null) { SIM[d.simr] = r2(n(t.value)); var nn = root.querySelector('[data-simn="' + d.simr + '"]'); if (nn) nn.value = n(t.value).toFixed(2); return later(); }
      if (d.simn != null) { if (t.value === '') return; SIM[d.simn] = r2(n(t.value)); return later(); }
      if (d.simdr != null) { SIMD[d.simdr] = Math.round(n(t.value)); var n2 = root.querySelector('[data-simdn="' + d.simdr + '"]'); if (n2) n2.value = Math.round(n(t.value)); return later(); }
      if (d.simdn != null) { if (t.value === '') return; SIMD[d.simdn] = Math.round(n(t.value)); return later(); }
      if (d.kpi != null) { var R = W.__bnUltimo; if (!R) return; var ms = mesState(R.R.key); ms.kpi[d.kpi][+d.i] = t.value === '' ? '' : n(t.value); save(); return later(); }
      if (d.par != null) { S[d.par] = n(t.value); save(); return later(); }
      if (d.dt != null) { S.dTiers[+d.dt][+d.k] = n(t.value); save(); return later(); }
      if (d.ct != null) { S.cTiers[+d.ct][+d.k] = n(t.value); save(); return later(); }
      if (d.kj != null) { S.kpiJ[+d.kj][+d.k] = +d.k ? n(t.value) : t.value; save(); return later(); }
      if (d.ka != null) { S.kpiA[+d.ka][+d.k] = +d.k ? n(t.value) : t.value; save(); return later(); }
      if (d.nom != null) { S.nombres[d.nom] = t.value; save(); return later(); }
      if (d.ini != null) { S.inicio[d.ini] = Math.round(n(t.value)); save(); return later(); }
      if (d.nd != null) { S.nuevosDesde[d.nd] = Math.round(n(t.value)); save(); return later(); }
    });
    root.addEventListener('change', function (ev) {
      var t = ev.target, d = t.dataset, R = W.__bnUltimo;
      if (t.id === 'bn-mes') { mesSel = +t.value; SIM = {}; SIMD = {}; return render(); }
      if (d.esq != null) { S.esquema[d.esq] = t.value; save(); return render(); }
      if (d.canal != null && R) { var ms = mesState(d.k); ms.nuevos[d.canal] = Object.assign(ms.nuevos[d.canal] || {}, { canal: t.value }); save(); return render(); }
      if (t.id === 'bn-fnuevos') { S.filtroNuevos = t.value; save(); return render(); }
      if (d.pag != null && R) { var msp = mesState(d.k), o = msp.nuevos[d.cli] = Object.assign(msp.nuevos[d.cli] || {}, {}); o['pag' + d.pag] = t.checked; if (d.pag === '2' && t.checked) o.pag1 = true; save(); return render(); }
      if (d.valid != null && R) { var ms2 = mesState(d.k); ms2.nuevos[d.valid] = Object.assign(ms2.nuevos[d.valid] || {}, { excl: !t.checked }); save(); return render(); }
    });
    root.addEventListener('click', function (ev) {
      var t = ev.target, d = t.dataset || {};
      if (d.simx != null) { ev.preventDefault(); delete SIM[d.simx]; return render(); }
      if (d.simdx != null) { ev.preventDefault(); delete SIMD[d.simdx]; return render(); }
      if (t.id === 'bn-real') { SIM = {}; SIMD = {}; return render(); }
      if (t.id === 'bn-def') { var keep = { meses: S.meses, esquema: S.esquema, nombres: S.nombres }; S = Object.assign(clone(DEF), keep); save(); return render(); }
      if (t.id === 'bn-copy') return copiar();
      if (t.id === 'bn-xls') return excel();
    });
  }
  /* el estado de canalizado/validación vive en el mes de la 1.ª compra del cliente */
  function resumenTexto() {
    var U = W.__bnUltimo; if (!U) return ''; var R = U.R, L = [];
    L.push('💵 *Bonos ' + MES[U.m] + ' ' + U.Y.cy + '*' + (Object.keys(SIM).length || Object.keys(SIMD).length ? ' (ESCENARIO SIMULADO)' : '') + (R.parcial ? ' (preliminar, mes incompleto)' : ''));
    L.push('Crecimiento de la división: ' + pct(R.gdReal));
    R.personas.forEach(function (p) {
      L.push(''); L.push('*' + p.nombre + '*: ' + $$(p.total));
      p.conceptos.forEach(function (x) { L.push('  • ' + x[0] + ': ' + $$(x[1])); });
    });
    L.push(''); L.push('*Total del mes: ' + $$(R.total) + '*');
    return L.join('\n');
  }
  function copiar() {
    var txt = resumenTexto(), b = D.getElementById('bn-copy');
    var ok = function () { if (b) { b.textContent = '✔ Copiado'; setTimeout(function () { b.textContent = '📋 Copiar resumen'; }, 1800); } };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok).catch(function () { fallback(txt); ok(); }); else { fallback(txt); ok(); }
  }
  function fallback(txt) { var ta = D.createElement('textarea'); ta.value = txt; D.body.appendChild(ta); ta.select(); try { D.execCommand('copy'); } catch (e) { } ta.remove(); }
  function excel() {
    var U = W.__bnUltimo; if (!U) return; if (typeof XLSX === 'undefined' || !XLSX.utils) { alert('No se cargó la librería de Excel.'); return; }
    var R = U.R, wb = XLSX.utils.book_new(), sim = Object.keys(SIM).length || Object.keys(SIMD).length;
    var a = [['Bonos ' + MES[U.m] + ' ' + U.Y.cy + (sim ? ' — ESCENARIO SIMULADO' : '') + (R.parcial ? ' — preliminar' : '')], [], ['Persona', 'Rol', 'Concepto', 'Importe']];
    R.personas.forEach(function (p) {
      p.conceptos.forEach(function (x) { a.push([p.nombre, p.rol === 'vendedor' ? (p.esq === 'general' ? 'Vendedor' : 'Vendedor · arranque') : 'Soporte', x[0], x[1]]); });
      a.push(['', '', 'Total ' + p.nombre, p.total]);
    });
    a.push([], ['', '', 'TOTAL DEL MES', R.total]);
    var ws = XLSX.utils.aoa_to_sheet(a); ws['!cols'] = [{ wch: 26 }, { wch: 18 }, { wch: 70 }, { wch: 14 }];
    for (var r = 3; r < a.length; r++) { var c = XLSX.utils.encode_cell({ r: r, c: 3 }); if (ws[c] && typeof ws[c].v === 'number') ws[c].z = '"$"#,##0.00'; }
    XLSX.utils.book_append_sheet(wb, ws, 'Pago');
    var b = [['Vendedor', 'Esquema', 'Base ' + U.Y.py, 'Venta ' + U.Y.cy, 'Crecimiento %', 'Sacos adicionales', 'Bono crecimiento', 'Bono volumen', 'Total']];
    R.personas.filter(function (p) { return p.rol === 'vendedor'; }).forEach(function (p) {
      if (p.esq === 'general') { var u = p.sim || p.real; b.push([p.nombre, 'General', p.base, u.venta, u.g, u.extra, u.esfuerzo, u.volumen, p.total]); }
      else b.push([p.nombre, 'Arranque', p.base, p.ventaUsada, '', '', '', '', p.total]);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(b), 'Vendedores');
    XLSX.writeFile(wb, 'Bonos_' + U.Y.cy + '-' + ('0' + U.m).slice(-2) + (sim ? '_escenario' : '') + '.xlsx');
  }

  W.renderBonos = function () { if (!S) load(); bind(); render(); };
  W.Bonos19H = { calcular: function (m) { var dd = datos(); if (!S) load(); return dd ? calcular(dd.Y, m) : null; }, pagoVendedor: function (b, v, g) { if (!S) load(); return pagoVendedor(b, v, g); }, nivelArranque: function (v) { if (!S) load(); return nivelArranque(v); } };
})(window, document);
