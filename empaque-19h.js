/* =====================================================================
   EMPAQUE 19H · consumo dinámico de costales y alcance (Centro de Mando)
   ---------------------------------------------------------------------
   Fuente: ventas.html publica en skan/_empaque, por día y por producto
   exacto, TODA salida física de Odoo (venta + promoción + bonificación +
   clientes excluidos del análisis comercial): cada saco que sale lleva
   su costal.

   Consumo vigente (cambia solo al cierre de mes, para que no sea volátil):
     50 % promedio de los últimos 3 meses cerrados
   + 50 % promedio de los últimos 6 meses cerrados
   × (1 + merma de empaque)
   A la quincena se compara el ritmo de los últimos 30 días contra el
   vigente: si se aleja más del umbral (15 %) se avisa, sin mover el cálculo.

   Existencia de control (independiente de Inventarios):
     conteo base capturado por el master en una fecha
   − salidas diarias desde el día siguiente al conteo (× (1 + merma))
   + entradas registradas por Inventarios después del conteo
   Si un costal no tiene conteo base se usa la existencia de Inventarios.
   ===================================================================== */
(function (W) {
  'use strict';
  const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };
  const norm = t => String(t || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

  /* Producto vendido → costal. Primero el código exacto (sin la P/B de promoción/bonificación),
     luego el nombre. Las presentaciones «+1 kg extra» usan su costal promocional. */
  const POR_CODIGO = {
    '04MAS001': '02SAC005', '04MAS0011': '02SAC005', '04MAS002': '02SAC006', '04MAS003': '02SAC001',
    '04MAS004': '02SAC008', '04MAS0015': '02SAC019', '04MAS005': '02SAC009', '04MAS006': '02SAC010',
    '04MAS0016': '02SAC011', '04MAS007': '02SAC012', '04MAS008': '02SAC007', '04MAS0012': '02SAC018',
    '04MAS009': '02SAC004', '04MAS010': '02SAC026', '04MAS020': '02SAC002', '04MAS0013': '02SAC003'
  };
  function costalPorNombre(nombre) {
    const n = norm(nombre);
    const mas1 = /\+\s*(1|I)\s*(K|KG|KILO|EXTRA)|\b1\s*KILO\s*EXTRA|\b1\s*KG\s*EXTRA/.test(n);
    const kg5 = /(^|[^0-9])5\s*KG/.test(n), kg20 = /(^|[^0-9])20\s*KG/.test(n);
    if (/MI\s*BOOB/.test(n)) return mas1 ? '02SAC018' : '02SAC007';
    if (/CACHORRO/.test(n)) return kg5 ? '02SAC009' : (mas1 ? '02SAC019' : '02SAC008');
    if (/SILVER\s*(KAT|CAT)/.test(n)) return kg5 ? '02SAC012' : (mas1 ? '02SAC011' : '02SAC010');
    if (/PREMIUM/.test(n)) return kg20 ? '02PRO089' : '02SAC005';
    if (/KAN\s*KAN/.test(n)) return kg20 ? '02SAC004' : (mas1 ? '02SAC003' : '02SAC002');
    if (/PET\s*FOOD/.test(n)) return '02SAC026';
    if (/SILVER\s*KAN/.test(n)) return kg5 ? '02SAC006' : (mas1 ? '02SAC017' : '02SAC001');
    return null;
  }
  function costalDe(codigo, nombre, cfg) {
    const c = String(codigo || '').toUpperCase(), base = c.replace(/[PB]\d*$/, '');
    if (cfg && cfg.mapa && cfg.mapa[c]) return cfg.mapa[c];
    if (cfg && cfg.mapa && cfg.mapa[base]) return cfg.mapa[base];
    // Las promociones/bonificaciones salen en el costal normal de su producto
    if (POR_CODIGO[base] && !/[PB]\d*$/.test(c)) return POR_CODIGO[base];
    const porNom = costalPorNombre(nombre);
    if (/[PB]\d*$/.test(c)) return POR_CODIGO[base] || porNom;
    return porNom || POR_CODIGO[base] || null;
  }
  /* Consumibles que dependen del total de sacos (kg por cada 1,000 sacos) */
  const CONSUMIBLES = ['02SAC016', 'PRO003', '02SAC032'];   // ribete, hilo torzal, stretch

  const ymd = n => { const s = String(n); return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8); };
  const mk = (y, m) => y + '-' + String(m).padStart(2, '0');
  const MESC = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  /* ---------- cálculo ---------- */
  function calc(E, cfg, inv, I, hoy) {
    if (!E || !E.dias) return null;
    cfg = cfg || {}; hoy = hoy || new Date();
    const merma = cfg.merma == null ? 0.01 : num(cfg.merma);
    const umbral = cfg.umbral == null ? 0.15 : num(cfg.umbral);
    const cat = (inv && inv.catalogo) || {};
    // 1) salidas por día y costal
    const dias = Object.keys(E.dias).map(Number).sort((a, b) => a - b);
    if (!dias.length) return null;
    const ultimo = dias[dias.length - 1];
    const porDia = {}, porMes = {}, sinMapa = {}, totDiaSacos = {};
    let promoSacos3 = 0, totSacos3 = 0;
    const d3 = new Date(hoy.getFullYear(), hoy.getMonth() - 3, 1), lim3 = d3.getFullYear() * 10000 + (d3.getMonth() + 1) * 100 + 1;
    dias.forEach(d => {
      const o = E.dias[d]; const m = mk(Math.floor(d / 10000), Math.floor(d / 100) % 100);
      Object.keys(o).forEach(code => {
        const q = num(o[code]); if (q <= 0) return;
        const nom = (E.nombres && E.nombres[code]) || code;
        totDiaSacos[d] = (totDiaSacos[d] || 0) + q;
        if (d >= lim3) { totSacos3 += q; if (/[PB]\d*$/.test(code) || /PROMOCI|BONIFIC/i.test(nom)) promoSacos3 += q; }
        const cos = costalDe(code, nom, cfg);
        if (!cos) { sinMapa[code] = { nombre: nom, q: (sinMapa[code] ? sinMapa[code].q : 0) + q }; return; }
        (porDia[cos] = porDia[cos] || {})[d] = ((porDia[cos] || {})[d] || 0) + q;
        (porMes[cos] = porMes[cos] || {})[m] = ((porMes[cos] || {})[m] || 0) + q;
      });
    });
    // 2) meses cerrados (antes del mes en curso) con venta registrada
    const mesHoy = mk(hoy.getFullYear(), hoy.getMonth() + 1);
    const cerrados = [];
    for (let i = 1; cerrados.length < 6 && i <= 18; i++) { const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1); const k = mk(d.getFullYear(), d.getMonth() + 1); if (dias.some(x => Math.floor(x / 100) === d.getFullYear() * 100 + d.getMonth() + 1)) cerrados.push(k); }
    const prom = (cos, L) => L.length ? L.reduce((a, k) => a + num((porMes[cos] || {})[k]), 0) / L.length : 0;
    // total de sacos por mes (para consumibles)
    const totMes = {}; Object.keys(porMes).forEach(c => Object.keys(porMes[c]).forEach(k => totMes[k] = (totMes[k] || 0) + porMes[c][k]));
    const promTot = L => L.length ? L.reduce((a, k) => a + num(totMes[k]), 0) / L.length : 0;
    const vigTot = 0.5 * promTot(cerrados.slice(0, 3)) + 0.5 * promTot(cerrados);
    // 3) ritmo de los últimos 30 días con venta registrada
    const fin = new Date(ymd(ultimo) + 'T12:00:00'), ini = new Date(fin); ini.setDate(ini.getDate() - 29);
    const ini30 = ini.getFullYear() * 10000 + (ini.getMonth() + 1) * 100 + ini.getDate();
    const ult30 = cos => Object.keys(porDia[cos] || {}).reduce((a, d) => a + (+d >= ini30 && +d <= ultimo ? porDia[cos][d] : 0), 0);
    const ult30Tot = Object.keys(totDiaSacos).reduce((a, d) => a + (+d >= ini30 && +d <= ultimo ? totDiaSacos[d] : 0), 0);
    // 4) existencia de control
    const conteo = cfg.conteo || null;
    const fConteo = conteo && conteo.fecha ? Number(String(conteo.fecha).replace(/-/g, '')) : null;
    const entradas = {};   // entradas de Inventarios después del conteo
    if (fConteo && inv && inv.movimientos) Object.values(inv.movimientos).forEach(m => {
      if (!m || m.tipo !== 'entrada' || !m.itemId) return; const f = Number(String(m.fecha || '').replace(/-/g, '')); if (f > fConteo) entradas[m.itemId] = (entradas[m.itemId] || 0) + num(m.cant);
    });
    const salidasDesde = cos => fConteo ? Object.keys(porDia[cos] || {}).reduce((a, d) => a + (+d > fConteo ? porDia[cos][d] : 0), 0) : 0;
    const totDesde = fConteo ? Object.keys(totDiaSacos).reduce((a, d) => a + (+d > fConteo ? totDiaSacos[d] : 0), 0) : 0;
    // 5) renglones por costal
    const ids = new Set(Object.keys(porMes));
    CONSUMIBLES.forEach(c => { if (cat[c] && cat[c].activo !== false) ids.add(c); });
    const filas = [];
    ids.forEach(id => {
      const it = Object.assign({ id: id, nombre: id, lt: 3, ss: 0.3 }, cat[id] || {});
      const esCons = CONSUMIBLES.includes(id);
      let vig, v30, sal;
      if (esCons) {
        // kg por 1,000 sacos: parámetro, o lo que Inventarios trae en catálogo frente a la venta actual
        const kgMil = cfg.kgMil && cfg.kgMil[id] != null ? num(cfg.kgMil[id]) : (vigTot > 0 && num(it.consumo) > 0 ? num(it.consumo) / vigTot * 1000 : 0);
        it._kgMil = kgMil;
        vig = vigTot * kgMil / 1000; v30 = ult30Tot * kgMil / 1000; sal = totDesde * kgMil / 1000;
      } else {
        vig = (0.5 * prom(id, cerrados.slice(0, 3)) + 0.5 * prom(id, cerrados)) * (1 + merma);
        v30 = ult30(id) * (1 + merma); sal = salidasDesde(id) * (1 + merma);
      }
      const invFis = I && I.fis ? I.fis(id, inv && inv.fisico, inv && inv.pt).total : null;
      const tieneConteo = !!(conteo && conteo.items && conteo.items[id] != null);
      const ctrl = tieneConteo ? num(conteo.items[id]) - sal + num(entradas[id]) : invFis;
      const tr = I && I.transito ? I.transito(id, inv && inv.llegadas) : { fincado: 0, porComprar: 0 };
      const a = I && I.alerta ? I.alerta(Object.assign({}, it, { consumo: vig }), { total: Math.max(0, ctrl == null ? 0 : ctrl) }, tr) : null;
      const desv = vig > 0 ? v30 / vig - 1 : null;
      const meses = cerrados.slice().reverse().map(k => ({ k, q: esCons ? num(totMes[k]) * (it._kgMil || 0) / 1000 : num((porMes[id] || {})[k]) }));
      filas.push({ id, it, esCons, vig, v30, desv, alertaRitmo: desv != null && Math.abs(desv) > umbral,
        ctrl, tieneConteo, invFis, dif: tieneConteo && invFis != null ? invFis - ctrl : null, entradas: num(entradas[id]), salidas: sal,
        fincado: num(tr.fincado), a, meses });
    });
    const ord = { 'CRÍTICO': 0, 'RIESGO': 1, 'SALUDABLE': 2 };
    filas.sort((x, y) => (ord[x.a && x.a.crit] ?? 3) - (ord[y.a && y.a.crit] ?? 3) || (x.a ? x.a.alcance : 1e9) - (y.a ? y.a.alcance : 1e9));
    return { filas, cerrados, ultimo: ymd(ultimo), conteo, merma, umbral, sinMapa, vigTot, ult30Tot,
      promoPct: totSacos3 > 0 ? promoSacos3 / totSacos3 : 0, mesHoy, upd: E.updStr || '' };
  }

  W.Empaque19H = { calc, costalDe, CONSUMIBLES, MESC };
})(window);
