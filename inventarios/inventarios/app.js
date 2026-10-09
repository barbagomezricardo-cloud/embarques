/* =====================================================================
   PROGRAMA PRINCIPAL — Gestión de inventarios y proyección
   Roles: master (todo), jefe (operación), compras (proyección + alertas)
   ===================================================================== */
(async function () {
  'use strict';
  const I = window.INV;
  const { $, $$, esc, num, fmt, money, hoyISO, mesKey, mesLabel, fFecha, fDia, vals, keySafe } = I;
  try { await I.start({ appKey: 'principal', messaging: true }); } catch (e) { return; }
  const DB = I.DB, AUTH = I.AUTH;

  const S = { catalogo: {}, fisico: {}, pt: {}, silos: {}, silosLect: {}, densidades: {}, llegadas: {}, odoo: null, conteos: {}, entregas: {}, solicitudes: {}, movimientos: {}, ptCortes: {}, usuarios: {}, config: {}, meta: {}, notasCompra: {} };
  let USER = null, offs = [], TAB = null;
  const UI = { proyFam: 'EMPAQUE', proyMeses: 15, proyPC: true, proyQ: '', proyItem: null, alFam: '', alSt: 'todos', alQ: '', fisFam: '', fisQ: '', fisSub: 'fis', conteoSel: null, catFam: '', catQ: '', catAct: 'act', bitTipo: '', bitQ: '', bitDesde: '', bitHasta: '', histQ: '', histDesde: '', iaModelo: 'haiku', odooQ: '', rev: {} };
  const ROLES_PRINCIPAL = ['master', 'jefe', 'compras'];

  /* ---------------- Pestañas ---------------- */
  const TABS = [
    { id: 'tablero', t: '📊 Tablero', roles: ['master', 'jefe', 'compras'] },
    { id: 'entradas', t: '📥 Entradas a almacén', roles: ['master', 'jefe'] },
    { id: 'transfer', t: '🔁 Transferencias a PT', roles: ['master', 'jefe'], cnt: () => vals(S.entregas).filter(e => I.estadoEntrega(e) === 'recibida').length },
    { id: 'pt', t: '🏭 Almacén PT', roles: ['master', 'jefe'] },
    { id: 'fisico', t: '📋 Físico y conteos', roles: ['master', 'jefe'], cnt: () => vals(S.conteos).filter(c => c.estado === 'confirmado').length },
    { id: 'silos', t: '🛢️ Silos', roles: ['master', 'jefe', 'compras'] },
    { id: 'proyeccion', t: '📈 Proyección', roles: ['master', 'jefe', 'compras'] },
    { id: 'alertas', t: '🚨 Alertas de compra', roles: ['master', 'jefe', 'compras'] },
    { id: 'odoo', t: '🔄 Odoo', roles: ['master', 'jefe'] },
    { id: 'catalogo', t: '🗂️ Catálogo', roles: ['master', 'jefe'] },
    { id: 'bitacora', t: '🧾 Bitácora', roles: ['master', 'jefe'] },
    { id: 'usuarios', t: '👥 Usuarios', roles: ['master'] },
    { id: 'ia', t: '🤖 IA', roles: ['master'] },
    { id: 'config', t: '⚙️ Configuración', roles: ['master'] }
  ];
  const can = (...roles) => USER && roles.includes(USER.rol);
  const editor = () => can('master', 'jefe');

  /* ---------------- Sesión ---------------- */
  AUTH.onChange(u => {
    offs.forEach(f => f()); offs = [];
    USER = u && u.uid ? u : null;
    if (!USER) {
      I.pantallaLogin($('#app'), { titulo: 'Inventarios Pet Food', icono: '📦', permitirMaster: true });
      if (u && u.bloqueado) setTimeout(() => { $('#lg-e').textContent = 'Tu usuario está desactivado. Consulta al master.'; AUTH.logout(); }, 50);
      if (u && u.sinPerfil) setTimeout(() => { $('#lg-e').textContent = 'Tu usuario no tiene perfil asignado. Pide al master que te dé de alta.'; AUTH.logout(); }, 50);
      return;
    }
    if (!ROLES_PRINCIPAL.includes(USER.rol)) {
      const dest = USER.rol === 'almacenista' ? 'almacen.html' : 'produccion.html';
      $('#app').innerHTML = `<div class="login"><div class="login-card"><div class="login-logo">📱</div><h1>Hola, ${esc(USER.nombre)}</h1><p class="muted">Tu usuario es de <b>${esc(I.ROLES[USER.rol].nombre)}</b>. Tu aplicación está aquí:</p><a class="btn pri big" href="${dest}${location.search}">Abrir mi aplicación</a><p><a href="#" id="lo">Cerrar sesión</a></p></div></div>`;
      $('#lo').onclick = e => { e.preventDefault(); AUTH.logout(); };
      return;
    }
    shell(); subscribe();
  });

  function subscribe() {
    const sub = (path, key, last) => { const cb = v => { S[key] = v || (key === 'odoo' ? null : {}); render(); }; offs.push(last ? DB.onLast(path, last, cb) : DB.on(path, cb)); };
    sub('catalogo', 'catalogo'); sub('fisico', 'fisico'); sub('pt', 'pt'); sub('llegadas', 'llegadas'); sub('silos', 'silos'); sub('silosLect', 'silosLect'); sub('config', 'config'); sub('meta', 'meta');
    if (editor()) {
      sub('densidades', 'densidades'); sub('odoo', 'odoo'); sub('conteos', 'conteos', 60); sub('entregas', 'entregas', 600); sub('solicitudes', 'solicitudes', 400); sub('movimientos', 'movimientos', 2500); sub('ptCortes', 'ptCortes', 60);
    }
    if (can('master')) sub('usuarios', 'usuarios');
    sub('notasCompra', 'notasCompra');
  }

  function shell() {
    const tabs = TABS.filter(t => t.roles.includes(USER.rol));
    if (!TAB || !tabs.some(t => t.id === TAB)) TAB = (localStorage.getItem('inv_tab') && tabs.some(t => t.id === localStorage.getItem('inv_tab'))) ? localStorage.getItem('inv_tab') : tabs[0].id;
    $('#app').innerHTML = `
      ${I.DEMO ? '<div class="demo-bar">MODO DEMO — datos de prueba que viven solo en este navegador. Quita ?demo=1 de la dirección para trabajar con los datos reales.</div>' : ''}
      <header class="top">
        <div class="top-in">
          <div class="brand"><div class="logo">📦</div><div>Inventarios Pet Food<small>${esc(I.CFG.EMPRESA || '')}</small></div></div>
          <div class="sp"></div>
          <span class="chip"><b>${esc(USER.nombre)}</b> · ${esc(I.ROLES[USER.rol].nombre)}</span>
          <button class="btn sm ghost" id="b-pass" title="Cambiar mi contraseña">🔑</button>
          <button class="btn sm" id="b-out">Salir</button>
        </div>
        <nav class="nav" id="nav">${tabs.map(t => `<button data-t="${t.id}">${t.t}<span class="cnt hide"></span></button>`).join('')}</nav>
      </header>
      <main id="main"></main>`;
    $('#b-out').onclick = () => AUTH.logout();
    $('#b-pass').onclick = cambiarMiPass;
    $$('#nav button').forEach(b => b.onclick = () => { TAB = b.dataset.t; try { localStorage.setItem('inv_tab', TAB); } catch (e) { } mounted = null; render(true); });
    mounted = null; render(true);
  }

  async function cambiarMiPass() {
    await I.modal('Cambiar mi contraseña', '<label>Nueva contraseña (mín. 6)<input id="np" type="password"></label><label>Repetir<input id="np2" type="password"></label>', [{ t: 'Cancelar' }, {
      t: 'Guardar', c: 'pri', antes: async ov => {
        const a = $('#np', ov).value, b = $('#np2', ov).value;
        if (a.length < 6 || a !== b) { I.toast('Las contraseñas no coinciden o son muy cortas', 'err'); return false; }
        try { await AUTH.cambiarPass(a); I.toast('Contraseña actualizada ✔', 'ok'); } catch (e) { I.toast(e.message, 'err'); return false; }
      }
    }]);
  }

  /* ---------------- Render ---------------- */
  let mounted = null, rT = null;
  function render(now) {
    if (!USER || !$('#main')) return;
    if (!now) { clearTimeout(rT); rT = setTimeout(() => render(true), 120); return; }
    $$('#nav button').forEach(b => {
      b.classList.toggle('on', b.dataset.t === TAB);
      const t = TABS.find(x => x.id === b.dataset.t); const c = $('.cnt', b);
      if (t && t.cnt && editor()) { const n = t.cnt(); c.textContent = n; c.classList.toggle('hide', !n); }
    });
    const V = VIEWS[TAB]; if (!V) return;
    const main = $('#main');
    if (mounted !== TAB) { main.innerHTML = ''; if (V.mount) V.mount(main); mounted = TAB; }
    try { V.update(main); } catch (e) { console.error(e); }
    refreshDL();
  }
  let dlSig = '';
  function refreshDL() {
    const sig = Object.keys(S.catalogo).length + ':' + $$('datalist').length;
    if (sig === dlSig && !$$('datalist').some(d => !d.options.length)) return;
    dlSig = sig;
    const html = items(true).map(it => `<option value="${esc(I.itemLabel(it))}"></option>`).join('');
    $$('datalist').forEach(d => d.innerHTML = html);
  }

  /* ---------------- Datos derivados ---------------- */
  const items = (soloActivos) => vals(S.catalogo).map(x => Object.assign({ id: x._k }, x)).filter(x => !soloActivos || x.activo !== false).sort((a, b) => (I.FAMILIAS.indexOf(a.familia) - I.FAMILIAS.indexOf(b.familia)) || ((a.orden || 999) - (b.orden || 999)) || String(a.nombre).localeCompare(b.nombre));
  const item = id => { const x = S.catalogo[id]; return x ? Object.assign({ id }, x) : { id, nombre: id + ' (no está en catálogo)', codigo: '', unidad: '' }; };
  const F = id => I.fis(id, S.fisico, S.pt);
  /* Disponible para compras: descuenta material en silos con calidad distinta de OK */
  const BLQ = () => I.silosBloqueados(S.silos, S.silosLect);
  const Fd = id => { const f = F(id); const q = BLQ()[id] || 0; return q ? Object.assign({}, f, { total: Math.max(0, f.total - q), bloq: q }) : f; };
  const fLleg = l => l.fecha ? fDia(l.fecha) : mesLabel(l.mes);
  const odooQ = id => { const o = S.odoo && S.odoo.items && S.odoo.items[id]; return o ? num(o.q) : null; };
  const costo = id => { const o = S.odoo && S.odoo.items && S.odoo.items[id]; return o ? num(o.costo) : 0; };
  const lbl = id => I.itemLabel(item(id));
  const famOpts = (sel, todas) => (todas ? `<option value="">Todas las familias</option>` : '') + I.FAMILIAS.map(f => `<option ${f === sel ? 'selected' : ''} value="${f}">${I.FAM_ICO[f]} ${f}</option>`).join('');
  function datalist(id) { return `<datalist id="${id}">${items(true).map(it => `<option value="${esc(I.itemLabel(it))}"></option>`).join('')}</datalist>`; }
  function pick(v) { v = String(v || '').trim(); if (!v) return null; const it = items(false).find(x => I.itemLabel(x) === v); if (it) return it.id; const m = v.match(/^\[([^\]]+)\]/); if (m && S.catalogo[keySafe(m[1])]) return keySafe(m[1]); const k = keySafe(v); return S.catalogo[k] ? k : null; }
  const alertas = () => items(true).filter(it => it.planear && num(it.consumo) > 0).map(it => { const f = Fd(it.id); const tr = I.transito(it.id, S.llegadas); const a = I.alerta(it, f, tr); const p = I.proyeccion(it, f, S.llegadas, 15, true); return Object.assign({ it, f, tr, p }, a); });
  const critOrder = { 'CRÍTICO': 0, 'RIESGO': 1, 'SALUDABLE': 2 };
  const ultimaAct = () => { let m = 0; vals(S.fisico).forEach(f => { if (f.ts > m) m = f.ts; }); vals(S.pt).forEach(f => { if (f.ts > m) m = f.ts; }); return m; };
  const entregasValidadas = () => vals(S.entregas).filter(e => e.estado === 'validada').sort((a, b) => (b.valTs || b.ts) - (a.valTs || a.ts));

  /* ================================================================ */
  /* VISTAS                                                            */
  /* ================================================================ */
  const VIEWS = {};

  /* ---------- TABLERO ---------- */
  VIEWS.tablero = {
    update(el) {
      if (can('compras')) return tableroCompras(el);
      const al = alertas();
      const oc = al.filter(a => a.status === 'COLOCAR OC'), cr = al.filter(a => a.crit === 'CRÍTICO');
      const porVal = vals(S.entregas).filter(e => I.estadoEntrega(e) === 'recibida');
      const porConf = vals(S.entregas).filter(e => I.estadoEntrega(e) === 'por_recibir');
      const hoy = hoyISO();
      const solHoy = vals(S.solicitudes).filter(s => s.fecha === hoy);
      const conteo = vals(S.conteos).filter(c => c.estado === 'en_captura').sort((a, b) => b.inicio - a.inicio)[0];
      const confirmados = vals(S.conteos).filter(c => c.estado === 'confirmado');
      let valor = 0, difAbs = 0, teo = 0;
      items(true).forEach(it => { const f = F(it.id); valor += f.total * costo(it.id); const q = odooQ(it.id); if (q != null && S.odoo && S.odoo.alcance === 'total') { difAbs += Math.abs(f.total - q) * costo(it.id); teo += q * costo(it.id); } });
      const pendOdoo = entregasValidadas().filter(e => !e.odoo).length + vals(S.movimientos).filter(m => m.tipo === 'entrada' && !m.odoo).length;
      let avance = '';
      if (conteo) { const tot = conteoItems(conteo).length, cap = conteoItems(conteo).filter(it => conteoCapturado(conteo, it.id)).length; avance = `${cap}/${tot}`; }
      const vacio = !Object.keys(S.catalogo).length;
      el.innerHTML = (vacio ? `<div class="card" style="border-color:var(--acc);margin-bottom:12px"><h2>👋 Primer arranque</h2><p>La base está vacía. ${can('master') ? 'Carga el catálogo, las existencias, consumos, lead times, silos, pedidos fincados y el reporte de Odoo que vienen de tus archivos de Excel.' : 'Pide al master que haga la carga inicial.'}</p>${can('master') ? '<button class="btn pri" id="seed-go">Cargar datos iniciales de mis archivos</button>' : ''}</div>` : '') + `
      <div class="grid g4">
        <div class="kpi red"><div class="l">Colocar OC</div><div class="v">${oc.length}</div><div class="s">${cr.length} críticos</div></div>
        <div class="kpi ${porVal.length ? 'amb' : 'grn'}"><div class="l">Transferencias a PT por aceptar</div><div class="v">${porVal.length}</div><div class="s">${porConf.length} esperando confirmación de producción</div></div>
        <div class="kpi blu"><div class="l">Solicitudes de producción hoy</div><div class="v">${solHoy.length}</div><div class="s">${solHoy.filter(s => s.estado === 'pendiente').length} sin surtir</div></div>
        <div class="kpi ${conteo ? 'amb' : ''}"><div class="l">Conteo cíclico</div><div class="v">${conteo ? avance : (confirmados.length ? confirmados.length + ' por revisar' : '—')}</div><div class="s">${conteo ? 'en captura · ' + esc(conteo.almacenista && conteo.almacenista.nombre) : 'sin conteo activo'}</div></div>
        <div class="kpi"><div class="l">Valor del inventario físico</div><div class="v">${money(valor)}</div><div class="s">a costo promedio Odoo</div></div>
        <div class="kpi ${difAbs > 0 ? 'amb' : ''}"><div class="l">Diferencia absoluta vs Odoo</div><div class="v">${S.odoo && S.odoo.alcance === 'total' ? money(difAbs) : '—'}</div><div class="s">${S.odoo ? 'Odoo del ' + fDia(S.odoo.fecha) + (teo ? ' · ' + fmt(difAbs / teo * 100) + '%' : '') : 'sin reporte de Odoo'}</div></div>
        <div class="kpi ${pendOdoo ? 'amb' : ''}"><div class="l">Pendientes de reflejar en Odoo</div><div class="v">${pendOdoo}</div><div class="s">entradas y transferencias</div></div>
        <div class="kpi"><div class="l">Físico actualizado</div><div class="v" style="font-size:16px">${fFecha(ultimaAct())}</div><div class="s">última captura</div></div>
      </div>
      <div class="grid g2" style="margin-top:12px">
        <div class="card"><div class="card-h"><h3>🚨 Alertas críticas</h3><span class="sp"></span><button class="btn sm" data-go="alertas">Ver todas</button></div>
          ${(() => { const L = al.filter(a => a.status !== 'SUFICIENTE').sort((a, b) => critOrder[a.crit] - critOrder[b.crit] || a.alcance - b.alcance).slice(0, 10); return L.length ? `<div class="tw" style="max-height:none;border:0"><table><tbody>${L.map(a => `<tr><td><span class="b ${I.critClass(a.crit)}">${a.crit}</span></td><td>${esc(a.it.nombre)}<div class="tiny muted">${esc(a.it.codigo)}</div></td><td class="num small">${isFinite(a.alcance) ? fmt(a.alcance, 0) + ' días' : ''}</td><td><span class="b ${I.statusClass(a.status)}">${a.status}</span></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Sin alertas 🎉</div>'; })()}
        </div>
        <div class="card"><div class="card-h"><h3>🔁 Recibidas por producción · por aceptar</h3><span class="sp"></span><button class="btn sm" data-go="transfer">Ir a aceptar</button></div>
          ${porVal.sort((a, b) => a.ts - b.ts).slice(0, 8).map(e => `<div style="padding:6px 0;border-bottom:1px solid var(--line)"><b>${esc(e.por && e.por.nombre)}</b> → ${esc(e.recepcion ? e.recepcion.nombre : '')} <span class="muted small">${fFecha(e.ts)}</span><div class="small">${lineasTxt(e.lineas)}</div></div>`).join('') || '<div class="empty">Nada pendiente</div>'}
        </div>
        <div class="card"><div class="card-h"><h3>🏭 Solicitudes de producción de hoy</h3></div>
          ${solHoy.sort((a, b) => b.ts - a.ts).map(s => `<div style="padding:6px 0;border-bottom:1px solid var(--line)"><span class="b ${solCls(s.estado)}">${solTxt(s.estado)}</span> <b>${esc(s.por && s.por.nombre)}</b> <span class="muted small">${fFecha(s.ts)}</span><div class="small">${lineasTxt(s.lineas)}</div></div>`).join('') || '<div class="empty">Aún no hay solicitudes hoy</div>'}
        </div>
        <div class="card"><div class="card-h"><h3>🛢️ Silos</h3><span class="sp"></span><button class="btn sm" data-go="silos">Detalle</button></div><div class="mini">${silosGrid(true)}</div></div>
      </div>`;
      $$('[data-go]', el).forEach(b => b.onclick = () => { TAB = b.dataset.go; mounted = null; render(true); });
      const sg = $('#seed-go', el); if (sg) sg.onclick = async () => { sg.disabled = true; try { await I.cargarSemilla(true); I.toast('Carga inicial lista ✔', 'ok'); } catch (e) { I.toast('Error: ' + e.message, 'err'); sg.disabled = false; } };
    }
  };
  const lineasTxt = l => vals(l).map(x => `${esc(item(x.itemId).nombre)}: <b>${fmt(x.cantValidada != null ? x.cantValidada : x.cantRecibida != null ? x.cantRecibida : x.cant)}</b>${x.pacas ? ' <span class="muted">(' + fmt(x.pacas) + ' pacas, info)</span>' : ''}`).join(' · ');
  const solTxt = s => ({ pendiente: 'Pendiente', surtida: 'Entregada', recibida: 'Recibida por producción', validada: 'Aceptada', rechazada: 'Rechazada', cancelada: 'Cancelada' }[s] || s);
  const solCls = s => ({ pendiente: 'b-amb', surtida: 'b-blu', recibida: 'b-blu', validada: 'b-grn', rechazada: 'b-red', cancelada: 'b-gry' }[s] || 'b-gry');

  /* ---------- TABLERO DE COMPRAS (solo consulta + seguimiento de compras) ---------- */
  function tableroCompras(el) {
    const al = alertas();
    const mias = vals(S.llegadas).filter(l => l.origen === 'compras' && l.estado === 'fincado').sort((a, b) => String(a.mes).localeCompare(b.mes));
    const prox = vals(S.llegadas).filter(l => l.estado === 'fincado' || l.estado === 'por_comprar').sort((a, b) => String(a.mes).localeCompare(b.mes)).slice(0, 12);
    const L = al.filter(a => a.status !== 'SUFICIENTE').sort((a, b) => critOrder[a.crit] - critOrder[b.crit] || a.alcance - b.alcance).slice(0, 12);
    el.innerHTML = `<div class="grid g4">
      <div class="kpi red"><div class="l">Colocar OC</div><div class="v">${al.filter(a => a.status === 'COLOCAR OC').length}</div><div class="s">${al.filter(a => a.crit === 'CRÍTICO').length} críticos</div></div>
      <div class="kpi blu"><div class="l">Cubiertos con OC</div><div class="v">${al.filter(a => a.status === 'CUBIERTO CON OC').length}</div></div>
      <div class="kpi amb"><div class="l">Mis OC en tránsito</div><div class="v">${mias.length}</div><div class="s">registradas por compras</div></div>
      <div class="kpi"><div class="l">Físico actualizado</div><div class="v" style="font-size:16px">${fFecha(ultimaAct())}</div></div></div>
      <div class="grid g2" style="margin-top:12px">
        <div class="card"><div class="card-h"><h3>🚨 Lo que hay que comprar</h3><span class="sp"></span><button class="btn sm" data-go="alertas">Ver todas</button></div>
          ${L.length ? `<div class="tw" style="max-height:none;border:0"><table><tbody>${L.map(a => `<tr><td><span class="b ${I.critClass(a.crit)}">${a.crit}</span></td><td>${esc(a.it.nombre)}<div class="tiny muted">${a.sugerido > 0 ? 'sugerido ' + fmt(a.sugerido) + ' ' + esc(a.it.unidad) : ''}${segTxt(a.it.id)}</div></td><td class="num small">${isFinite(a.alcance) ? fmt(a.alcance, 0) + ' días' : ''}</td><td>${botonesCompra(a.it.id)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Sin alertas 🎉</div>'}
        </div>
        <div class="card"><div class="card-h"><h3>🚚 Próximas llegadas</h3><span class="sp"></span><button class="btn sm" data-go="proyeccion">Proyección</button></div>
          ${prox.length ? `<div class="tw" style="max-height:none;border:0"><table><tbody>${prox.map(l => `<tr><td>${fLleg(l)}</td><td>${esc(lbl(l.itemId))}<div class="tiny muted">${esc(l.proveedor || '')} ${l.oc ? '· OC ' + esc(l.oc) : ''}</div></td><td class="num">${fmt(l.cant)}</td><td><span class="b ${l.estado === 'fincado' ? 'b-blu' : 'b-amb'}">${l.estado === 'fincado' ? 'fincado' : 'por comprar'}</span>${l.origen === 'compras' ? ' <span class="b b-gry">compras</span>' : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Sin llegadas programadas</div>'}
        </div>
        <div class="card"><div class="card-h"><h3>🛢️ Silos</h3><span class="sp"></span><button class="btn sm" data-go="silos">Detalle</button></div><div class="mini">${silosGrid(true)}</div></div>
      </div>`;
    $$('[data-go]', el).forEach(b => b.onclick = () => { TAB = b.dataset.go; mounted = null; render(true); });
    bindCompra(el);
  }
  /* Seguimiento de compras: registrar OC (entra a la proyección como fincado) y notas por artículo */
  const notasDe = id => vals(S.notasCompra && S.notasCompra[id]).sort((a, b) => b.ts - a.ts);
  const segTxt = id => { const n = notasDe(id); const est = n.find(x => x.estatus); const oc = vals(S.llegadas).filter(l => l.itemId === id && l.origen === 'compras' && l.estado === 'fincado'); return (est ? ` · <span class="b b-blu">${esc(I.ESTATUS_COMPRA[est.estatus] || est.estatus)}</span>` : '') + (oc.length ? ` · ${oc.length} OC` : '') + (n.length ? ` · 💬 ${n.length}` : ''); };
  const puedeComprar = () => can('master', 'jefe', 'compras');
  const botonesCompra = id => puedeComprar() ? `<span style="white-space:nowrap"><button class="btn sm" data-buy="${id}" title="Registrar orden de compra">🛒</button> <button class="btn sm" data-nt="${id}" title="Notas y estatus">💬${notasDe(id).length ? ' ' + notasDe(id).length : ''}</button></span>` : '';
  function bindCompra(el) {
    $$('[data-buy]', el).forEach(b => b.onclick = () => editarLlegada(null, b.dataset.buy, true));
    $$('[data-nt]', el).forEach(b => b.onclick = () => notasCompra(b.dataset.nt));
  }
  async function notasCompra(id) {
    const n = notasDe(id);
    await I.modal('Seguimiento de compra · ' + item(id).nombre, `<div style="max-height:40vh;overflow:auto;margin-bottom:10px">${n.map(x => `<div style="padding:8px 0;border-bottom:1px solid var(--line)"><div class="row"><b>${esc(x.por)}</b><span class="muted small">${fFecha(x.ts)}</span>${x.estatus ? `<span class="b b-blu">${esc(I.ESTATUS_COMPRA[x.estatus] || x.estatus)}</span>` : ''}</div><div>${esc(x.texto || '')}</div></div>`).join('') || '<div class="empty small">Sin notas todavía</div>'}</div>
      <label>Estatus<select id="nc-e"><option value="">— sin cambio —</option>${Object.keys(I.ESTATUS_COMPRA).map(k => `<option value="${k}">${I.ESTATUS_COMPRA[k]}</option>`).join('')}</select></label><label>Nota<textarea id="nc-t" placeholder="Proveedor, fecha comprometida, precio, motivo de retraso…"></textarea></label>`, [{ t: 'Cerrar' }, { t: 'Agregar nota', c: 'pri', antes: async ov => { const t = $('#nc-t', ov).value.trim(), e = $('#nc-e', ov).value; if (!t && !e) { I.toast('Escribe una nota o elige un estatus', 'err'); return false; } await DB.push('notasCompra/' + id, { texto: t, estatus: e || null, por: USER.nombre, rol: USER.rol, ts: Date.now() }); I.toast('Nota guardada ✔', 'ok'); } }]);
  }

  /* ---------- ENTRADAS AL MDE ---------- */
  VIEWS.entradas = {
    mount(el) {
      el.innerHTML = `
      <div class="card"><div class="card-h"><h2>📥 Entrada de material a almacén <span class="muted small">(MDE empaque · MP materias primas · insumos otros)</span></h2></div>
        <div class="form">
          <label class="full">Artículo<input id="en-it" list="dl-en" placeholder="Escribe código o nombre…" autocomplete="off"></label>${datalist('dl-en')}
          <label>Cantidad<input id="en-q" class="in-num" inputmode="decimal"></label>
          <label>Pacas (opcional)<input id="en-pac" class="in-num" inputmode="decimal" placeholder="—"></label>
          <label>Proveedor<input id="en-prov"></label>
          <label>Factura / remisión<input id="en-doc"></label>
          <label>Pedido fincado que se recibe<select id="en-lle"><option value="">— ninguno —</option></select></label>
          <label>Fecha<input id="en-f" type="date" value="${hoyISO()}"></label>
          <label class="full">Nota<input id="en-n"></label>
        </div>
        <div class="row"><span id="en-info" class="muted small grow"></span><button class="btn pri" id="en-b">Registrar entrada</button></div>
      </div>
      <div class="card"><div class="card-h"><h3>Entradas registradas</h3><span class="sp"></span><label style="margin:0">Desde <input type="date" id="en-d" style="width:auto"></label><button class="btn sm" id="en-x">Exportar Excel</button></div><div id="en-list"></div></div>`;
      const refreshInfo = () => {
        const id = pick($('#en-it').value); const it = id && item(id);
        const sel = $('#en-lle'); const cur = sel.value;
        sel.innerHTML = '<option value="">— ninguno —</option>' + (id ? vals(S.llegadas).filter(l => l.itemId === id && (l.estado === 'fincado' || l.estado === 'por_comprar')).map(l => `<option value="${l._k}">${fLleg(l)} · ${fmt(l.cant)} · ${l.estado === 'fincado' ? 'fincado' : 'por comprar'} ${esc(l.oc || l.nota || '')}</option>`).join('') : '');
        sel.value = cur;
        $('#en-info').innerHTML = it ? `${I.almacen(it.familia).nombre} actual: <b>${fmt(F(id).mde)}</b> ${esc(it.unidad)}${it.ppp ? ' · ' + fmt(it.ppp) + ' pzas por paca' : ''}` : '';
      };
      $('#en-it').oninput = refreshInfo;
      $('#en-pac').oninput = () => { const id = pick($('#en-it').value); const it = id && item(id); if (it && it.ppp && num($('#en-pac').value)) $('#en-q').value = num($('#en-pac').value) * num(it.ppp); };
      $('#en-b').onclick = async () => {
        const id = pick($('#en-it').value), q = num($('#en-q').value);
        if (!id) return I.toast('Elige un artículo del catálogo', 'err');
        if (!(q > 0)) return I.toast('Captura la cantidad', 'err');
        $('#en-b').disabled = true;
        try {
          const antes = F(id).mde;
          await I.sumar('fisico/' + id + '/mde', q);
          await DB.update({ ['fisico/' + id + '/ts']: Date.now(), ['fisico/' + id + '/por']: USER.nombre, ['fisico/' + id + '/origen']: 'entrada' });
          const lle = $('#en-lle').value;
          if (lle) { const l = S.llegadas[lle]; const rest = num(l.cant) - q; await DB.update(rest > 0 ? { ['llegadas/' + lle + '/cant']: rest, ['llegadas/' + lle + '/recibido']: num(l.recibido) + q } : { ['llegadas/' + lle + '/estado']: 'recibido', ['llegadas/' + lle + '/recibido']: num(l.recibido) + q, ['llegadas/' + lle + '/recibidoTs']: Date.now() }); }
          await I.mov({ tipo: 'entrada', itemId: id, cant: q, pacas: num($('#en-pac').value) || null, proveedor: $('#en-prov').value.trim(), doc: $('#en-doc').value.trim(), llegadaId: lle || null, fecha: $('#en-f').value || hoyISO(), nota: $('#en-n').value.trim(), antes, despues: antes + q, odoo: false });
          I.toast('Entrada registrada ✔', 'ok');
          ['#en-it', '#en-q', '#en-pac', '#en-doc', '#en-n'].forEach(s => $(s).value = ''); refreshInfo();
        } catch (e) { I.toast('Error: ' + e.message, 'err'); }
        $('#en-b').disabled = false;
      };
      $('#en-d').onchange = () => render(true);
      $('#en-x').onclick = () => { const r = entradasList(); I.exportXlsx('Entradas_almacen_' + hoyISO() + '.xlsx', [{ nombre: 'Entradas', filas: [['Fecha', 'Artículo', 'Cantidad', 'Unidad', 'Pacas', 'Proveedor', 'Documento', 'Registró', 'Nota', 'Reflejada en Odoo']].concat(r.map(m => [m.fecha, lbl(m.itemId), m.cant, item(m.itemId).unidad, m.pacas || '', m.proveedor || '', m.doc || '', m.por, m.nota || '', m.odoo ? 'Sí' : 'No'])) }]); };
    },
    update(el) {
      const r = entradasList();
      $('#en-list', el).innerHTML = r.length ? `<div class="tw"><table><thead><tr><th>Fecha</th><th>Artículo</th><th class="num">Cantidad</th><th>Proveedor</th><th>Documento</th><th>Registró</th><th>Nota</th><th>Odoo</th></tr></thead><tbody>${r.slice(0, 300).map(m => `<tr><td>${fDia(m.fecha)}<div class="tiny muted">${fFecha(m.ts)}</div></td><td>${esc(lbl(m.itemId))}</td><td class="num">${fmt(m.cant)} <span class="muted tiny">${esc(item(m.itemId).unidad)}</span></td><td>${esc(m.proveedor || '')}</td><td>${esc(m.doc || '')}</td><td>${esc(m.por)}</td><td class="small">${esc(m.nota || '')}</td><td><label style="margin:0"><input type="checkbox" data-od="${m._k}" ${m.odoo ? 'checked' : ''}> reflejada</label></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Sin entradas registradas</div>';
      $$('[data-od]', el).forEach(c => c.onchange = () => DB.update({ ['movimientos/' + c.dataset.od + '/odoo']: c.checked, ['movimientos/' + c.dataset.od + '/odooPor']: USER.nombre }));
    }
  };
  const entradasList = () => { const d = $('#en-d') && $('#en-d').value; return vals(S.movimientos).filter(m => m.tipo === 'entrada' && (!d || m.fecha >= d)).sort((a, b) => b.ts - a.ts); };

  /* ---------- TRANSFERENCIAS A PT ----------
     Flujo: almacén entrega → producción confirma lo que recibió → el jefe acepta
     (hasta la aceptación se mueve el inventario MDE → PT). */
  const est = e => I.estadoEntrega(e);
  VIEWS.transfer = {
    mount(el) {
      el.innerHTML = `
      <div class="card"><div class="card-h"><h2>✅ Recibidas por producción — por aceptar</h2></div><p class="muted small">Producción ya confirmó lo que recibió. Al aceptar se descuenta de su almacén (MDE empaque / MP / insumos) y entra al almacén de insumos PT. La cantidad que mueve inventario son los sacos/piezas; las pacas son informativas.</p><div id="tr-acept"></div></div>
      <div class="card"><div class="card-h"><h2>⏳ Entregadas — esperando confirmación de producción</h2></div><div id="tr-pend"></div></div>
      <div class="card"><div class="card-h"><h2>➕ Transferencia directa almacén → insumos PT</h2></div>
        <p class="muted small">También pasa por la confirmación de producción antes de que la aceptes.</p>
        <div id="tr-lines"></div>${datalist('dl-tr')}
        <div class="row" style="margin-top:8px"><button class="btn sm" id="tr-add">+ Agregar renglón</button><input id="tr-nota" class="grow" placeholder="Nota (opcional)" style="max-width:460px"><span class="sp"></span><button class="btn pri" id="tr-go">Enviar a producción para confirmar</button></div>
      </div>
      <div class="card"><div class="card-h"><h2>🧾 Historial de transferencias a PT</h2><span class="sp"></span><input id="tr-q" placeholder="Buscar artículo / persona" style="max-width:220px"><label style="margin:0">Desde <input type="date" id="tr-d" style="width:auto"></label><button class="btn sm" id="tr-x">Exportar Excel</button></div><div id="tr-hist"></div></div>`;
      const lines = [{}];
      const drawLines = () => {
        $('#tr-lines').innerHTML = lines.map((l, i) => `<div class="row" style="margin-bottom:6px"><input class="grow" list="dl-tr" data-li="${i}" data-f="it" placeholder="Artículo" value="${esc(l.it || '')}" style="min-width:260px;flex:3"><input class="in-num" data-li="${i}" data-f="pac" placeholder="Pacas (info)" value="${esc(l.pac || '')}" style="max-width:110px"><input class="in-num" data-li="${i}" data-f="q" placeholder="Sacos / piezas" value="${esc(l.q || '')}" style="max-width:140px"><span class="muted small" style="min-width:150px" data-inf="${i}"></span><button class="btn sm ghost" data-del="${i}">✕</button></div>`).join('');
        $$('#tr-lines input').forEach(inp => inp.oninput = () => {
          const l = lines[+inp.dataset.li]; l[inp.dataset.f] = inp.value;
          const id = pick(l.it); const it = id && item(id);
          if (inp.dataset.f === 'pac' && it && it.ppp) { l.q = num(l.pac) * num(it.ppp); $(`[data-li="${inp.dataset.li}"][data-f="q"]`).value = l.q; }
          $(`[data-inf="${inp.dataset.li}"]`).innerHTML = it ? `${I.almacen(it.familia).cod}: ${fmt(F(id).mde)} · PT: ${fmt(F(id).pt)}` : '';
        });
        $$('[data-del]').forEach(b => b.onclick = () => { lines.splice(+b.dataset.del, 1); if (!lines.length) lines.push({}); drawLines(); });
      };
      drawLines();
      $('#tr-add').onclick = () => { lines.push({}); drawLines(); };
      $('#tr-go').onclick = async () => {
        const ls = lines.map(l => ({ itemId: pick(l.it), cant: num(l.q), pacas: num(l.pac) || null })).filter(l => l.itemId && l.cant > 0);
        if (!ls.length) return I.toast('Agrega al menos un artículo con cantidad', 'err');
        await DB.push('entregas', { fecha: hoyISO(), ts: Date.now(), origen: 'jefe', por: { uid: USER.uid, nombre: USER.nombre }, lineas: Object.assign({}, ls), nota: $('#tr-nota').value.trim(), estado: 'por_recibir' });
        lines.length = 0; lines.push({}); drawLines(); $('#tr-nota').value = '';
        I.toast('Enviada ✔ — producción debe confirmar la recepción', 'ok');
      };
      $('#tr-q').oninput = I.debounce(() => render(true), 250); $('#tr-d').onchange = () => render(true);
      $('#tr-x').onclick = () => { const r = histTransfer(); const filas = [['Folio', 'Fecha', 'Artículo', 'Solicitado', 'Entregado', 'Recibido producción', 'Aceptado', 'Pacas (info)', 'Entregó', 'Recibió', 'Aceptó', 'Fecha aceptación', 'Reflejada en Odoo', 'Nota']]; r.forEach(e => { const sm = solMap(e); vals(e.lineas).forEach(l => filas.push([e._k, e.fecha, lbl(l.itemId), sm[l.itemId] != null ? sm[l.itemId] : '', l.cant, l.cantRecibida != null ? l.cantRecibida : '', l.cantValidada != null ? l.cantValidada : '', l.pacas || '', e.por && e.por.nombre, e.recepcion ? e.recepcion.nombre : '', e.validado && e.validado.nombre, fFecha(e.valTs), e.odoo ? 'Sí' : 'No', [e.recepcion && e.recepcion.nota, e.notaVal || e.nota].filter(Boolean).join(' | ')])); }); I.exportXlsx('Transferencias_PT_' + hoyISO() + '.xlsx', [{ nombre: 'Transferencias', filas }]); };
    },
    update(el) {
      const tabla = (e, editable) => {
        const sm = solMap(e), sol = e.solicitudId && S.solicitudes[e.solicitudId];
        return `<div class="tw" style="margin-top:8px;max-height:none"><table><thead><tr><th>Artículo</th><th class="num">Solicitado</th><th class="num">Entregó almacén</th><th class="num">Recibió producción</th><th class="num">Pacas (info)</th><th class="num">Almacén actual</th>${editable ? '<th style="width:150px">Cantidad a aceptar</th>' : ''}</tr></thead><tbody>
        ${vals(e.lineas).map(l => { const rec = l.cantRecibida; const d1 = sol && sm[l.itemId] != null && Math.abs(sm[l.itemId] - num(l.cant)) > 0.001; const d2 = rec != null && Math.abs(rec - num(l.cant)) > 0.001; return `<tr><td>${esc(lbl(l.itemId))}${sol && sm[l.itemId] == null ? ' <span class="b b-amb">no solicitado</span>' : ''}</td><td class="num">${sol ? (sm[l.itemId] != null ? fmt(sm[l.itemId]) : '—') : '—'}</td><td class="num ${d1 ? 'low' : ''}">${fmt(l.cant)}</td><td class="num ${d2 ? 'neg' : ''}">${rec == null ? '<span class="muted">pendiente</span>' : fmt(rec)}</td><td class="num muted">${l.pacas ? fmt(l.pacas) : ''}</td><td class="num">${fmt(F(l.itemId).mde)}</td>${editable ? `<td><input class="in-num" data-vq="${e._k}|${l._k}" value="${rec != null ? rec : l.cant}"></td>` : ''}</tr>`; }).join('')}
        </tbody></table></div>`;
      };
      const cab = e => { const sol = e.solicitudId && S.solicitudes[e.solicitudId]; return `<div class="row"><b>${esc(e.por && e.por.nombre)}</b><span class="muted small">entregó ${fFecha(e.ts)}</span>${e.origen === 'jefe' ? '<span class="b b-gry">directa</span>' : ''}${sol ? `<span class="b b-blu">Solicitud de ${esc(sol.por && sol.por.nombre)}</span>` : '<span class="b b-amb">Sin solicitud</span>'}${e.recepcion ? `<span class="b b-grn">Recibió ${esc(e.recepcion.nombre)} · ${fFecha(e.recepcion.ts)}</span>` : ''}</div>${e.nota ? `<div class="small muted">Nota de entrega: ${esc(e.nota)}</div>` : ''}${e.recepcion && e.recepcion.nota ? `<div class="small" style="color:var(--amb)">Nota de producción: ${esc(e.recepcion.nota)}</div>` : ''}`; };
      const acep = vals(S.entregas).filter(e => est(e) === 'recibida').sort((a, b) => a.ts - b.ts);
      $('#tr-acept', el).innerHTML = acep.length ? acep.map(e => `<div class="card" style="background:var(--panel2)">${cab(e)}${tabla(e, true)}
        <div class="row" style="margin-top:8px"><input class="grow" placeholder="Nota (obligatoria si cambias cantidades o rechazas)" data-vn="${e._k}"><button class="btn danger" data-rej="${e._k}">Rechazar</button><button class="btn ok" data-val="${e._k}">✔ Aceptar y transferir a PT</button></div></div>`).join('') : '<div class="empty">Nada por aceptar</div>';
      const pend = vals(S.entregas).filter(e => est(e) === 'por_recibir').sort((a, b) => a.ts - b.ts);
      $('#tr-pend', el).innerHTML = pend.length ? pend.map(e => `<div class="card" style="background:var(--panel2)">${cab(e)}${tabla(e, false)}
        <div class="row" style="margin-top:8px"><span class="muted small grow">Producción aún no confirma la recepción en su app.</span><button class="btn sm danger" data-cnl="${e._k}">Cancelar entrega</button><button class="btn sm" data-force="${e._k}">Aceptar sin confirmación…</button></div></div>`).join('') : '<div class="empty">No hay entregas esperando a producción</div>';
      $$('[data-val]', el).forEach(b => b.onclick = async () => {
        const k = b.dataset.val, e = S.entregas[k];
        const ls = vals(e.lineas).map(l => Object.assign({}, l, { cantValidada: num($(`[data-vq="${k}|${l._k}"]`).value) }));
        const cambio = ls.some(l => Math.abs(l.cantValidada - num(l.cantRecibida != null ? l.cantRecibida : l.cant)) > 0.0001);
        const nota = $(`[data-vn="${k}"]`).value.trim();
        if (cambio && !nota) return I.toast('Cambiaste cantidades respecto a lo recibido: escribe una nota', 'err');
        const neg = ls.filter(l => F(l.itemId).mde - l.cantValidada < 0);
        if (neg.length && !(await I.confirmar('Existencia insuficiente en almacén', 'Estos artículos quedarían en negativo en su almacén: <b>' + neg.map(l => esc(item(l.itemId).nombre)).join(', ') + '</b>. ¿Aceptar de todos modos?'))) return;
        b.disabled = true; await validarEntrega(k, { lineas: ls, nota }); b.disabled = false;
      });
      $$('[data-rej]', el).forEach(b => b.onclick = async () => {
        const k = b.dataset.rej, nota = $(`[data-vn="${k}"]`).value.trim();
        if (!nota) return I.toast('Escribe el motivo del rechazo en la nota', 'err');
        const e = S.entregas[k];
        const up = { ['entregas/' + k + '/estado']: 'rechazada', ['entregas/' + k + '/validado']: { uid: USER.uid, nombre: USER.nombre }, ['entregas/' + k + '/valTs']: Date.now(), ['entregas/' + k + '/notaVal']: nota };
        if (e.solicitudId) up['solicitudes/' + e.solicitudId + '/estado'] = 'pendiente';
        await DB.update(up); I.toast('Entrega rechazada', 'ok');
      });
      $$('[data-cnl]', el).forEach(b => b.onclick = async () => {
        const k = b.dataset.cnl, e = S.entregas[k];
        const r = await I.modal('Cancelar entrega', '<label>Motivo<input id="cn-n"></label>', [{ t: 'Volver' }, { t: 'Cancelar entrega', c: 'danger', v: 1, antes: ov => { if (!$('#cn-n', ov).value.trim()) { I.toast('Escribe el motivo', 'err'); return false; } b._n = $('#cn-n', ov).value.trim(); } }]);
        if (r.v !== 1) return;
        const up = { ['entregas/' + k + '/estado']: 'cancelada', ['entregas/' + k + '/notaVal']: b._n, ['entregas/' + k + '/validado']: { uid: USER.uid, nombre: USER.nombre }, ['entregas/' + k + '/valTs']: Date.now() };
        if (e.solicitudId) up['solicitudes/' + e.solicitudId + '/estado'] = 'pendiente';
        await DB.update(up); I.toast('Entrega cancelada', 'ok');
      });
      $$('[data-force]', el).forEach(b => b.onclick = async () => {
        const k = b.dataset.force, e = S.entregas[k];
        const r = await I.modal('Aceptar sin confirmación de producción', `<p class="warn">Úsalo solo en casos excepcionales: quedará registrado que se aceptó sin la confirmación de producción.</p>${vals(e.lineas).map(l => `<label>${esc(lbl(l.itemId))}<input class="in-num" data-fq="${l._k}" value="${l.cant}"></label>`).join('')}<label>Motivo (obligatorio)<input id="fz-n"></label>`, [{ t: 'Volver' }, { t: 'Aceptar y transferir', c: 'pri', v: 1, antes: ov => { if (!$('#fz-n', ov).value.trim()) { I.toast('Escribe el motivo', 'err'); return false; } b._n = $('#fz-n', ov).value.trim(); b._q = {}; $$('[data-fq]', ov).forEach(i => b._q[i.dataset.fq] = num(i.value)); } }]);
        if (r.v !== 1) return;
        const ls = vals(e.lineas).map(l => Object.assign({}, l, { cantValidada: b._q[l._k] }));
        await validarEntrega(k, { lineas: ls, nota: 'SIN CONFIRMACIÓN DE PRODUCCIÓN: ' + b._n, sinConfirmar: true });
      });
      const r = histTransfer();
      $('#tr-hist', el).innerHTML = r.length ? `<div class="tw"><table><thead><tr><th>Fecha</th><th>Artículos (aceptado)</th><th>Entregó</th><th>Recibió</th><th>Aceptó</th><th>Estado</th><th>Odoo</th></tr></thead><tbody>${r.slice(0, 250).map(e => `<tr><td>${fDia(e.fecha)}<div class="tiny muted">${fFecha(e.valTs || e.ts)}</div></td><td class="small">${lineasTxt(e.lineas)}${e.notaVal ? `<div class="muted tiny">Nota: ${esc(e.notaVal)}</div>` : ''}${e.recepcion && e.recepcion.nota ? `<div class="muted tiny">Producción: ${esc(e.recepcion.nota)}</div>` : ''}</td><td>${esc(e.por && e.por.nombre)}${e.origen === 'jefe' ? ' <span class="b b-gry">directa</span>' : ''}</td><td>${e.recepcion ? esc(e.recepcion.nombre) : (e.sinConfirmar ? '<span class="b b-amb">sin confirmar</span>' : '')}</td><td>${esc(e.validado && e.validado.nombre || '')}</td><td><span class="b ${I.ENTREGA_CLS[est(e)] || 'b-gry'}">${I.ENTREGA_TXT[est(e)] || e.estado}</span></td><td>${e.estado === 'validada' ? `<label style="margin:0"><input type="checkbox" data-eo="${e._k}" ${e.odoo ? 'checked' : ''}> reflejada</label>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Sin transferencias</div>';
      $$('[data-eo]', el).forEach(c => c.onchange = () => DB.update({ ['entregas/' + c.dataset.eo + '/odoo']: c.checked, ['entregas/' + c.dataset.eo + '/odooPor']: USER.nombre, ['entregas/' + c.dataset.eo + '/odooTs']: Date.now() }));
    }
  };
  const solMap = e => { const sol = e.solicitudId && S.solicitudes[e.solicitudId]; const m = {}; if (sol) vals(sol.lineas).forEach(l => m[l.itemId] = (m[l.itemId] || 0) + num(l.cant)); return m; };
  function histTransfer() { const q = ($('#tr-q') && $('#tr-q').value || '').toLowerCase(), d = $('#tr-d') && $('#tr-d').value; return vals(S.entregas).filter(e => ['validada', 'rechazada', 'cancelada'].includes(e.estado) && (!d || e.fecha >= d) && (!q || (lineasTxt(e.lineas) + ' ' + (e.por && e.por.nombre) + ' ' + (e.validado && e.validado.nombre) + ' ' + (e.recepcion && e.recepcion.nombre)).toLowerCase().includes(q))).sort((a, b) => (b.valTs || b.ts) - (a.valTs || a.ts)); }

  async function validarEntrega(k, d) {
    try {
      const e = S.entregas[k] || {};
      const ls = d.lineas.map(l => Object.assign({}, l, { cantValidada: l.cantValidada != null ? l.cantValidada : (l.cantRecibida != null ? l.cantRecibida : l.cant) }));
      for (const l of ls) {
        if (!(l.cantValidada > 0)) continue;
        const f = F(l.itemId);
        await I.sumar('fisico/' + l.itemId + '/mde', -l.cantValidada);
        await I.sumar('pt/' + l.itemId + '/cant', l.cantValidada);
        await DB.update({ ['pt/' + l.itemId + '/ts']: Date.now(), ['fisico/' + l.itemId + '/ts']: Date.now(), ['fisico/' + l.itemId + '/por']: USER.nombre, ['fisico/' + l.itemId + '/origen']: 'transferencia' });
        await I.mov({ tipo: 'transferencia_pt', itemId: l.itemId, cant: l.cantValidada, entregado: num(l.cant), recibido: l.cantRecibida != null ? l.cantRecibida : null, pacas: l.pacas || null, entregaId: k, reporto: (e.por && e.por.nombre) || USER.nombre, recibio: e.recepcion ? e.recepcion.nombre : null, mdeAntes: f.mde, mdeDespues: f.mde - l.cantValidada, ptAntes: f.pt, ptDespues: f.pt + l.cantValidada, nota: d.nota || '' });
      }
      const lineasObj = {}; ls.forEach((l, i) => { const kk = l._k != null ? l._k : String(i); const c = Object.assign({}, l); delete c._k; lineasObj[kk] = c; });
      const up = { ['entregas/' + k + '/estado']: 'validada', ['entregas/' + k + '/lineas']: lineasObj, ['entregas/' + k + '/validado']: { uid: USER.uid, nombre: USER.nombre }, ['entregas/' + k + '/valTs']: Date.now(), ['entregas/' + k + '/notaVal']: d.nota || '', ['entregas/' + k + '/odoo']: false };
      if (d.sinConfirmar) up['entregas/' + k + '/sinConfirmar'] = true;
      if (e.solicitudId) up['solicitudes/' + e.solicitudId + '/estado'] = 'validada';
      await DB.update(up);
      I.toast('Transferencia aceptada y aplicada a PT ✔ — recuerda reflejarla en Odoo', 'ok');
    } catch (x) { I.toast('Error: ' + x.message, 'err'); }
  }

  /* ---------- ALMACÉN PT ---------- */
  VIEWS.pt = {
    mount(el) {
      el.innerHTML = `
      <div class="card"><div class="card-h"><h2>🏭 Almacén de insumos PT (producción)</h2><span class="sp"></span>
        <input type="file" id="pt-file" accept=".xlsx,.xls,.csv" class="hide"><button class="btn pri" id="pt-up">Cargar existencia Odoo del almacén PT</button><button class="btn sm" id="pt-x">Exportar</button></div>
        <p class="muted small">Entradas = transferencias aceptadas desde los almacenes (MDE / MP / insumos). Salidas = lo que ya no está según la existencia que reporta Odoo en este almacén (consumo de producción).</p>
        <div class="row" style="margin-bottom:8px"><select id="pt-fam" style="max-width:260px">${famOpts('', true)}</select><label style="margin:0"><input type="checkbox" id="pt-cero"> mostrar artículos en cero</label></div>
        <div id="pt-tab"></div></div>
      <div class="card"><div class="card-h"><h3>Cortes con Odoo (salidas de PT)</h3></div><div id="pt-cortes"></div></div>`;
      $('#pt-up').onclick = () => $('#pt-file').click();
      $('#pt-file').onchange = async ev => { const f = ev.target.files[0]; ev.target.value = ''; if (f) await cargarOdooPT(f); };
      $('#pt-fam').onchange = () => render(true); $('#pt-cero').onchange = () => render(true);
      $('#pt-x').onclick = () => { const filas = [['Código', 'Artículo', 'Familia', 'Unidad', 'Existencia PT', 'Entradas desde último corte', 'Última salida (corte)', 'Almacén', 'Total']]; ptRows().forEach(r => filas.push([r.it.codigo, r.it.nombre, r.it.familia, r.it.unidad, r.f.pt, r.ent, r.sal, r.f.mde, r.f.total])); I.exportXlsx('Almacen_PT_' + hoyISO() + '.xlsx', [{ nombre: 'PT', filas }]); };
    },
    update(el) {
      const rows = ptRows();
      $('#pt-tab', el).innerHTML = `<div class="tw"><table><thead><tr><th>Artículo</th><th class="num">Existencia PT</th><th class="num">Entradas desde último corte</th><th class="num">Salida último corte</th><th class="num">Almacén</th><th>Actualizado</th>${editor() ? '<th></th>' : ''}</tr></thead><tbody>${rows.map(r => `<tr><td>${esc(I.itemLabel(r.it))}</td><td class="num ${r.f.pt < 0 ? 'neg' : ''}"><b>${fmt(r.f.pt)}</b> <span class="tiny muted">${esc(r.it.unidad)}</span></td><td class="num">${r.ent ? fmt(r.ent) : ''}</td><td class="num">${r.sal != null ? fmt(r.sal) : ''}</td><td class="num">${fmt(r.f.mde)}</td><td class="tiny muted">${fFecha(S.pt[r.it.id] && S.pt[r.it.id].ts)}</td>${editor() ? `<td><button class="btn sm" data-ept="${r.it.id}">Ajustar</button></td>` : ''}</tr>`).join('') || '<tr><td colspan="7" class="empty">Sin existencias en PT</td></tr>'}</tbody></table></div>`;
      $$('[data-ept]', el).forEach(b => b.onclick = () => ajustarCant(b.dataset.ept, 'pt'));
      const cortes = vals(S.ptCortes).sort((a, b) => b.ts - a.ts);
      $('#pt-cortes', el).innerHTML = cortes.length ? `<div class="tw" style="max-height:340px"><table><thead><tr><th>Fecha</th><th>Archivo</th><th class="num">Artículos</th><th class="num">Salidas registradas</th><th>Registró</th></tr></thead><tbody>${cortes.map(c => `<tr><td>${fFecha(c.ts)}</td><td class="small">${esc(c.archivo || '')}</td><td class="num">${vals(c.items).length}</td><td class="num">${vals(c.items).filter(x => x.salida > 0).length}</td><td>${esc(c.por || '')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Aún no hay cortes con Odoo</div>';
    }
  };
  function ptRows() {
    const fam = $('#pt-fam') && $('#pt-fam').value, cero = $('#pt-cero') && $('#pt-cero').checked;
    const ult = vals(S.ptCortes).sort((a, b) => b.ts - a.ts)[0];
    const desde = ult ? ult.ts : 0;
    const ent = {}; vals(S.movimientos).forEach(m => { if (m.tipo === 'transferencia_pt' && m.ts > desde) ent[m.itemId] = (ent[m.itemId] || 0) + num(m.cant); });
    return items(true).filter(it => (!fam || it.familia === fam)).map(it => ({ it, f: F(it.id), ent: ent[it.id] || 0, sal: ult && ult.items && ult.items[it.id] ? ult.items[it.id].salida : null })).filter(r => cero || r.f.pt !== 0 || r.ent);
  }
  async function cargarOdooPT(file) {
    let rep; try { rep = await I.leerOdoo(file); } catch (e) { return I.toast(e.message, 'err'); }
    const filas = items(true).filter(it => rep.items[it.id] || F(it.id).pt).map(it => { const ant = F(it.id).pt; const od = rep.items[it.id] ? rep.items[it.id].q : null; return { it, ant, od, sal: od == null ? null : ant - od }; });
    const html = `<p class="muted small">Archivo: <b>${esc(file.name)}</b> · ${rep.n} renglones. Se tomará la existencia de Odoo como la nueva existencia del almacén PT; la diferencia se registra como salida (consumo de producción).</p>
      <div class="tw" style="max-height:52vh"><table><thead><tr><th>Artículo</th><th class="num">PT actual</th><th class="num">Odoo PT</th><th class="num">Salida</th></tr></thead><tbody>${filas.map(r => `<tr><td>${esc(I.itemLabel(r.it))}</td><td class="num">${fmt(r.ant)}</td><td class="num">${r.od == null ? '<span class="muted">no viene</span>' : fmt(r.od)}</td><td class="num ${r.sal != null && r.sal < 0 ? 'neg' : ''}">${r.sal == null ? '—' : fmt(r.sal)}</td></tr>`).join('')}</tbody></table></div>
      <p class="small warn" style="margin-top:8px">Salidas en rojo (negativas) significan que Odoo tiene MÁS de lo que el sistema registró como transferido: revisa transferencias no capturadas.</p>`;
    const r = await I.modal('Corte del almacén PT con Odoo', html, [{ t: 'Cancelar', v: 0 }, { t: 'Aplicar corte', v: 1, c: 'pri' }], { ancho: true });
    if (r.v !== 1) return;
    const up = {}, itemsCorte = {}; const ts = Date.now();
    filas.filter(x => x.od != null).forEach(x => { up['pt/' + x.it.id] = { cant: x.od, ts, origen: 'odoo' }; itemsCorte[x.it.id] = { antes: x.ant, odoo: x.od, salida: x.sal }; });
    await DB.update(up);
    await DB.push('ptCortes', { ts, fecha: hoyISO(), archivo: file.name, por: USER.nombre, items: itemsCorte });
    await I.mov({ tipo: 'salida_pt', nota: 'Corte de almacén PT con Odoo (' + file.name + ')', items: itemsCorte, cant: Object.values(itemsCorte).reduce((s, x) => s + Math.max(0, x.salida), 0) });
    I.toast('Corte aplicado ✔', 'ok');
  }

  /* Ajuste manual con nota obligatoria (físico MDE o PT) */
  async function ajustarCant(id, donde) {
    const it = item(id), f = F(id); const actual = donde === 'pt' ? f.pt : f.mde;
    await I.modal('Ajustar ' + (donde === 'pt' ? 'almacén PT' : 'existencia en almacén'), `<p><b>${esc(I.itemLabel(it))}</b></p><p class="muted small">Actual: ${fmt(actual)} ${esc(it.unidad)}</p><label>Nueva existencia<input id="aj-v" class="in-num" value="${actual}"></label><label>Nota del ajuste (obligatoria, queda en bitácora)<textarea id="aj-n"></textarea></label>`, [{ t: 'Cancelar' }, {
      t: 'Guardar ajuste', c: 'pri', antes: async ov => {
        const v = num($('#aj-v', ov).value), n = $('#aj-n', ov).value.trim();
        if (!n) { I.toast('La nota es obligatoria', 'err'); return false; }
        if (donde === 'pt') await DB.update({ ['pt/' + id + '/cant']: v, ['pt/' + id + '/ts']: Date.now(), ['pt/' + id + '/origen']: 'ajuste' });
        else await DB.update({ ['fisico/' + id + '/mde']: v, ['fisico/' + id + '/ts']: Date.now(), ['fisico/' + id + '/por']: USER.nombre, ['fisico/' + id + '/origen']: 'ajuste', ['fisico/' + id + '/nota']: n });
        await I.mov({ tipo: 'ajuste', donde, itemId: id, antes: actual, despues: v, cant: v - actual, nota: n });
        I.toast('Ajuste guardado y registrado en bitácora ✔', 'ok');
      }
    }]);
  }

  /* ---------- FÍSICO Y CONTEOS ---------- */
  const conteoItems = c => items(true).filter(it => c.itemsSel ? c.itemsSel.includes(it.id) : ((c.familias || []).includes(it.familia) && I.esContable(it)));
  const conteoTotal = (c, id) => { const x = c.items && c.items[id]; return x ? x.total : null; };
  const conteoCapturado = (c, id) => { const x = c.items && c.items[id]; if (!x || !x.lineas) return false; return vals(x.lineas).every(l => l.q !== '' && l.q != null); };

  VIEWS.fisico = {
    mount(el) {
      VIEWS.fisico._m = null;
      el.innerHTML = `<div class="row" style="margin-bottom:12px"><div class="seg" id="fs-seg"><button data-s="fis">Existencia física</button><button data-s="cont">Conteos cíclicos</button><button data-s="prog">📅 Programa ABC y exactitud</button></div></div><div id="fs-body"></div>`;
      $$('#fs-seg button').forEach(b => b.onclick = () => { UI.fisSub = b.dataset.s; $('#fs-body').innerHTML = ''; VIEWS.fisico._m = null; render(true); });
    },
    update(el) {
      $$('#fs-seg button', el).forEach(b => b.classList.toggle('on', b.dataset.s === UI.fisSub));
      const body = $('#fs-body', el);
      if (UI.fisSub === 'fis') fisicoView(body); else if (UI.fisSub === 'prog') progView(body); else conteosView(body);
    }
  };

  function fisicoView(body) {
    if (VIEWS.fisico._m !== 'fis') {
      body.innerHTML = `<div class="card"><div class="card-h"><h2>Existencia física</h2><span class="sp"></span><select id="fi-fam" style="max-width:240px">${famOpts(UI.fisFam, true)}</select><input id="fi-q" placeholder="Buscar…" style="max-width:220px" value="${esc(UI.fisQ)}"><button class="btn sm" id="fi-x">Exportar Excel</button></div>
      <p class="muted small">Físico total = almacén de origen (MDE empaque · MP materias primas · insumos otros) + almacén de insumos PT. Es la base de la proyección y de las alertas de compra. Los ajustes manuales piden nota y quedan en bitácora.</p><div id="fi-tab"></div></div>`;
      $('#fi-fam').onchange = e => { UI.fisFam = e.target.value; render(true); };
      $('#fi-q').oninput = I.debounce(e => { UI.fisQ = $('#fi-q').value; render(true); }, 200);
      $('#fi-x').onclick = () => { const filas = [['Código', 'Artículo', 'Familia', 'Unidad', 'Almacén', 'Almacén (código)', 'PT', 'Físico total', 'Odoo teórico', 'Diferencia', 'Actualizado', 'Por', 'Origen']]; fisRows().forEach(r => filas.push([r.it.codigo, r.it.nombre, r.it.familia, r.it.unidad, r.f.mde, I.almacen(r.it.familia).cod, r.f.pt, r.f.total, r.q, r.q == null ? '' : r.f.total - r.q, fFecha(r.fx.ts), r.fx.por || '', r.fx.origen || ''])); I.exportXlsx('Existencia_fisica_' + hoyISO() + '.xlsx', [{ nombre: 'Físico', filas }]); };
      VIEWS.fisico._m = 'fis';
    }
    let fam = null;
    $('#fi-tab', body).innerHTML = `<div class="tw"><table><thead><tr><th>Artículo</th><th>Ubicación</th><th class="num">Almacén</th><th class="num">PT</th><th class="num">Físico total</th><th class="num">Odoo</th><th class="num">Dif.</th><th>Actualizado</th><th></th></tr></thead><tbody>${fisRows().map(r => {
      const g = r.it.familia !== fam ? `<tr class="grp"><td colspan="9">${I.FAM_ICO[r.it.familia] || ''} ${esc(r.it.familia)}</td></tr>` : ''; fam = r.it.familia;
      const d = r.q == null ? null : r.f.total - r.q;
      return g + `<tr><td>${esc(I.itemLabel(r.it))}${r.it.fuente === 'silo' ? ' <span class="b b-blu">silo</span>' : ''}</td><td class="tiny muted"><span class="b b-gry">${I.almacen(r.it.familia).cod}</span> ${esc((r.it.ubic || []).join(', '))}</td><td class="num ${r.f.mde < 0 ? 'neg' : ''}">${fmt(r.f.mde)}</td><td class="num">${r.f.pt ? fmt(r.f.pt) : ''}</td><td class="num"><b>${fmt(r.f.total)}</b> <span class="tiny muted">${esc(r.it.unidad)}</span></td><td class="num muted">${r.q == null ? '' : fmt(r.q)}</td><td class="num ${d && Math.abs(d) > 0.5 ? (d < 0 ? 'neg' : 'low') : ''}">${d == null ? '' : fmt(d)}</td><td class="tiny muted">${fFecha(r.fx.ts)}<br>${esc(r.fx.origen || '')}${r.fx.por ? ' · ' + esc(r.fx.por) : ''}</td><td><button class="btn sm" data-aj="${r.it.id}">Editar</button></td></tr>`;
    }).join('')}</tbody></table></div>`;
    $$('[data-aj]', body).forEach(b => b.onclick = () => ajustarCant(b.dataset.aj, 'mde'));
  }
  const fisRows = () => { const q = UI.fisQ.toLowerCase(); return items(true).filter(it => (!UI.fisFam || it.familia === UI.fisFam) && (!q || I.itemLabel(it).toLowerCase().includes(q))).map(it => ({ it, f: F(it.id), q: odooQ(it.id), fx: S.fisico[it.id] || {} })); };

  function conteosView(body) {
    const cs = vals(S.conteos).sort((a, b) => b.inicio - a.inicio);
    if (!UI.conteoSel || !S.conteos[UI.conteoSel]) UI.conteoSel = (cs.find(c => c.estado === 'confirmado') || cs.find(c => c.estado === 'en_captura') || cs[0] || {})._k || null;
    if (VIEWS.fisico._m !== 'cont') { body.innerHTML = `<div class="grid" style="grid-template-columns:minmax(240px,320px) 1fr;align-items:start"><div class="card" id="co-list"></div><div id="co-det"></div></div>`; VIEWS.fisico._m = 'cont'; }
    $('#co-list', body).innerHTML = `<div class="card-h"><h3>Conteos</h3></div>` + (cs.length ? cs.map(c => { const its = conteoItems(c); const cap = its.filter(it => conteoCapturado(c, it.id)).length; return `<div class="item ${c._k === UI.conteoSel ? 'ok' : ''}" data-cs="${c._k}" style="cursor:pointer"><div class="row"><b>${fDia(c.fecha)}</b><span class="sp"></span><span class="b ${({ en_captura: 'b-amb', confirmado: 'b-blu', aplicado: 'b-grn', cancelado: 'b-gry' })[c.estado] || 'b-gry'}">${({ en_captura: 'en captura', confirmado: 'por revisar', aplicado: 'aplicado', cancelado: 'cancelado' })[c.estado] || c.estado}</span></div><div class="small muted">${esc(c.almacenista && c.almacenista.nombre)} · ${c.itemsSel ? c.itemsSel.length + ' artículos elegidos' : (c.familias || []).map(f => I.FAM_ICO[f] || f).join(' ')}</div><div class="bar ${cap === its.length ? 'grn' : ''}" style="margin-top:6px"><i style="width:${its.length ? cap / its.length * 100 : 0}%"></i></div><div class="tiny muted">${cap}/${its.length} artículos</div></div>`; }).join('') : '<div class="empty">El almacenista inicia los conteos desde su tablet.</div>');
    $$('[data-cs]', body).forEach(d => d.onclick = () => { UI.conteoSel = d.dataset.cs; render(true); });
    const det = $('#co-det', body);
    const c = UI.conteoSel && S.conteos[UI.conteoSel];
    if (!c) { det.innerHTML = '<div class="card empty">Sin conteos todavía</div>'; return; }
    c._k = UI.conteoSel;
    const its = conteoItems(c);
    const od = S.odoo; const alc = od && od.alcance;
    const R = UI.rev[c._k] = UI.rev[c._k] || {};
    const rows = its.map(it => {
      const cnt = conteoTotal(c, it.id); const f = F(it.id);
      const fis = cnt == null ? null : (alc === 'mde' ? cnt : cnt + f.pt);
      const teo = odooQ(it.id); const dif = (fis != null && teo != null) ? fis - teo : null;
      const r = R[it.id] = R[it.id] || { aplicar: true, odoo: dif != null && Math.abs(dif) > 0.001, nota: '' };
      return { it, cnt, f, fis, teo, dif, pct: dif != null && teo ? dif / teo * 100 : null, val: dif != null ? dif * costo(it.id) : null, r, x: c.items && c.items[it.id] };
    });
    const enVivo = c.estado === 'en_captura';
    const tot = rows.reduce((s, r) => s + (r.val || 0), 0), totAbs = rows.reduce((s, r) => s + Math.abs(r.val || 0), 0);
    det.innerHTML = `<div class="card"><div class="card-h"><h2>Conteo del ${fDia(c.fecha)}</h2><span class="b ${enVivo ? 'b-amb' : 'b-blu'}">${enVivo ? '● EN VIVO' : c.estado === 'confirmado' ? 'Confirmado por almacén' : 'Aplicado'}</span><span class="sp"></span>${['en_captura', 'confirmado'].includes(c.estado) ? '<button class="btn sm danger" id="co-cnl">Cancelar conteo</button>' : ''}${!enVivo && c.estado !== 'cancelado' ? `<button class="btn sm" id="co-x">Exportar ajustes para Odoo</button>` : ''}</div>
      <p class="small muted">Almacenista: <b>${esc(c.almacenista && c.almacenista.nombre)}</b> · inició ${fFecha(c.inicio)}${c.confirmadoTs ? ` · confirmó ${fFecha(c.confirmadoTs)} <span class="b b-grn">✔ ${esc(c.firma || '')}</span>` : ''}${c.aplicado ? ` · aplicado por ${esc(c.aplicado.nombre)} ${fFecha(c.aplicado.ts)}` : ''}</p>
      ${od ? `<p class="small muted">Comparado contra Odoo del <b>${fDia(od.fecha)}</b> (${alc === 'mde' ? 'solo almacenes MDE/MP/insumos → se compara el conteo' : 'todas las ubicaciones → se compara conteo + PT'}). <a href="#" id="co-od">Cargar otro reporte de Odoo</a></p>` : `<div class="warn">Carga el reporte de existencias de Odoo (pestaña Odoo) para comparar contra el teórico.</div>`}
      ${!enVivo ? `<div class="grid g4" style="margin:10px 0"><div class="kpi"><div class="l">Artículos con diferencia</div><div class="v">${rows.filter(r => r.dif && Math.abs(r.dif) > 0.001).length}</div></div><div class="kpi ${tot < 0 ? 'red' : 'grn'}"><div class="l">Diferencia neta valorizada</div><div class="v">${money(tot)}</div></div><div class="kpi amb"><div class="l">Diferencia absoluta</div><div class="v">${money(totAbs)}</div></div><div class="kpi"><div class="l">Marcados para ajustar en Odoo</div><div class="v">${rows.filter(r => r.r.odoo).length}</div></div></div>` : ''}
      <div class="tw"><table><thead><tr><th>Artículo</th><th class="num">Conteo</th>${enVivo ? '<th>Ubicaciones</th><th>Hora</th>' : `<th class="num">PT</th><th class="num">Físico</th><th class="num">Odoo</th><th class="num">Dif.</th><th class="num">%</th><th class="num">$ Dif.</th><th class="num">Sistema hoy</th><th>Actualizar físico</th><th>Ajustar en Odoo</th><th>Nota</th>`}</tr></thead><tbody>
      ${rows.map(r => enVivo ? `<tr><td>${esc(I.itemLabel(r.it))}</td><td class="num">${r.cnt == null ? '<span class="muted">pendiente</span>' : '<b>' + fmt(r.cnt) + '</b>'}</td><td class="tiny muted">${r.x && r.x.lineas ? vals(r.x.lineas).map(l => esc(l.u) + ': ' + (l.q === '' || l.q == null ? '—' : fmt(l.q))).join(' · ') : ''}</td><td class="tiny muted">${r.x ? fFecha(r.x.ts) : ''}</td></tr>`
      : `<tr><td>${esc(I.itemLabel(r.it))}${r.x && r.x.nota ? `<div class="tiny muted">📝 ${esc(r.x.nota)}</div>` : ''}</td><td class="num">${r.cnt == null ? '—' : fmt(r.cnt)}</td><td class="num muted">${alc === 'mde' ? '' : fmt(r.f.pt)}</td><td class="num"><b>${r.fis == null ? '—' : fmt(r.fis)}</b></td><td class="num muted">${r.teo == null ? '—' : fmt(r.teo)}</td><td class="num ${r.dif && Math.abs(r.dif) > 0.001 ? (r.dif < 0 ? 'neg' : 'low') : ''}">${r.dif == null ? '' : fmt(r.dif)}</td><td class="num">${r.pct == null ? '' : fmt(r.pct) + '%'}</td><td class="num">${r.val == null ? '' : money(r.val)}</td><td class="num muted">${fmt(r.f.mde)}</td><td style="text-align:center">${c.estado === 'confirmado' ? `<input type="checkbox" data-ra="${r.it.id}" ${r.r.aplicar ? 'checked' : ''}>` : (c.revision && c.revision[r.it.id] && c.revision[r.it.id].aplicar ? '✔' : '')}</td><td style="text-align:center"><input type="checkbox" data-ro="${r.it.id}" ${(c.revision && c.revision[r.it.id] ? c.revision[r.it.id].odoo : r.r.odoo) ? 'checked' : ''}></td><td><input data-rn="${r.it.id}" value="${esc(c.revision && c.revision[r.it.id] ? c.revision[r.it.id].nota || '' : r.r.nota)}" placeholder="—" style="min-width:140px"></td></tr>`).join('')}
      </tbody></table></div>
      ${c.estado === 'confirmado' ? `<div class="row" style="margin-top:10px"><span class="muted small grow">Al aplicar, el conteo reemplaza la existencia en almacén de los artículos marcados. Lo marcado como "Ajustar en Odoo" queda como lista de ajustes pendientes.</span><button class="btn danger" id="co-rea">Regresar a captura</button><button class="btn pri" id="co-apl">Aplicar revisión</button></div>` : ''}
      ${c.estado === 'aplicado' ? `<div class="row" style="margin-top:10px"><label style="margin:0"><input type="checkbox" id="co-odh" ${c.odooHecho ? 'checked' : ''}> Ajustes ya realizados en Odoo</label><span class="sp"></span><button class="btn sm" id="co-sv">Guardar marcas y notas</button></div>` : ''}
    </div>`;
    $$('[data-ra]', det).forEach(x => x.onchange = () => R[x.dataset.ra].aplicar = x.checked);
    $$('[data-ro]', det).forEach(x => x.onchange = () => R[x.dataset.ro].odoo = x.checked);
    $$('[data-rn]', det).forEach(x => x.oninput = () => R[x.dataset.rn].nota = x.value);
    const od_ = $('#co-od', det); if (od_) od_.onclick = e => { e.preventDefault(); TAB = 'odoo'; mounted = null; render(true); };
    const ex = $('#co-x', det); if (ex) ex.onclick = () => { const filas = [['Código', 'Artículo', 'Unidad', 'Conteo', 'PT', 'Físico', 'Odoo', 'Diferencia (ajuste Odoo)', '%', '$ Diferencia', 'Ajustar en Odoo', 'Nota']]; rows.forEach(r => { const rv = (c.revision && c.revision[r.it.id]) || r.r; filas.push([r.it.codigo, r.it.nombre, r.it.unidad, r.cnt, alc === 'mde' ? '' : r.f.pt, r.fis, r.teo, r.dif, r.pct, r.val, rv.odoo ? 'SÍ' : '', rv.nota || '']); }); I.exportXlsx('Conteo_' + c.fecha + '_ajustes_Odoo.xlsx', [{ nombre: 'Ajustes', filas }]); };
    const cnl = $('#co-cnl', det); if (cnl) cnl.onclick = async () => { if (await I.confirmar('Cancelar conteo', 'El conteo se descarta y no modifica el físico. El almacenista podrá iniciar uno nuevo.', 'Cancelar conteo')) await DB.update({ ['conteos/' + c._k + '/estado']: 'cancelado', ['conteos/' + c._k + '/canceladoPor']: USER.nombre, ['conteos/' + c._k + '/canceladoTs']: Date.now() }); };
    const rea = $('#co-rea', det); if (rea) rea.onclick = async () => { if (await I.confirmar('Regresar a captura', 'El almacenista podrá corregir su conteo y deberá confirmarlo de nuevo.')) await DB.update({ ['conteos/' + c._k + '/estado']: 'en_captura', ['conteos/' + c._k + '/confirmadoTs']: null, ['conteos/' + c._k + '/devuelto']: { por: USER.nombre, ts: Date.now() } }); };
    const apl = $('#co-apl', det); if (apl) apl.onclick = async () => {
      const sel = rows.filter(r => R[r.it.id].aplicar && r.cnt != null);
      if (!(await I.confirmar('Aplicar revisión', `Se actualizará la existencia física de <b>${sel.length}</b> artículos con lo contado y se guardarán <b>${rows.filter(r => R[r.it.id].odoo).length}</b> ajustes pendientes para Odoo.`, 'Aplicar'))) return;
      const up = {}, ts = Date.now(), rev = {}, det_ = {};
      sel.forEach(r => { up['fisico/' + r.it.id] = { mde: r.cnt, ts, por: USER.nombre, origen: 'conteo', conteoId: c._k }; det_[r.it.id] = { antes: r.f.mde, despues: r.cnt }; });
      rows.forEach(r => rev[r.it.id] = { aplicar: !!R[r.it.id].aplicar, odoo: !!R[r.it.id].odoo, nota: R[r.it.id].nota || '', dif: r.dif, val: r.val, sis: r.f.mde, cnt: r.cnt });
      up['conteos/' + c._k + '/estado'] = 'aplicado'; up['conteos/' + c._k + '/revision'] = rev; up['conteos/' + c._k + '/aplicado'] = { uid: USER.uid, nombre: USER.nombre, ts };
      await DB.update(up);
      await I.mov({ tipo: 'conteo', conteoId: c._k, items: det_, nota: 'Conteo cíclico del ' + fDia(c.fecha) + ' aplicado (' + sel.length + ' artículos)', cant: sel.length });
      I.toast('Revisión aplicada ✔', 'ok');
    };
    const sv = $('#co-sv', det); if (sv) sv.onclick = async () => { const rev = {}; rows.forEach(r => { const old = (c.revision && c.revision[r.it.id]) || {}; rev[r.it.id] = Object.assign({}, old, { odoo: $(`[data-ro="${r.it.id}"]`, det).checked, nota: $(`[data-rn="${r.it.id}"]`, det).value }); }); await DB.update({ ['conteos/' + c._k + '/revision']: rev, ['conteos/' + c._k + '/odooHecho']: $('#co-odh', det).checked }); I.toast('Guardado ✔', 'ok'); };
  }

  /* ---------- PROGRAMA ABC Y EXACTITUD DE INVENTARIO ---------- */
  function exactitudRows(P) {
    const movs = {}; vals(S.movimientos).forEach(m => { if (m.tipo === 'conteo' && m.conteoId) movs[m.conteoId] = m.items || {}; });
    const L = [];
    vals(S.conteos).filter(c => c.estado === 'aplicado' && c.aplicado).forEach(c => {
      Object.keys(c.items || {}).forEach(id => {
        const x = c.items[id]; if (!x || x.total == null) return;
        const rv = (c.revision || {})[id] || {}; let sis = rv.sis;
        if (sis == null && movs[c._k] && movs[c._k][id]) sis = movs[c._k][id].antes;
        if (sis == null) return;
        const it = item(id);
        L.push({ id, it, mes: hoyISO(new Date(c.aplicado.ts)).slice(0, 7), ts: c.aplicado.ts, cnt: num(x.total), sis: num(sis), ok: I.exacto(x.total, sis, P.tol), alm: (c.almacenista && c.almacenista.nombre) || '—', clase: ['A', 'B', 'C'].includes(it.abc) ? it.abc : 'C' });
      });
    });
    return L;
  }
  function progView(body) {
    const P = I.prog(S.meta.conteoProg);
    const pr = I.programaConteo(items(true).filter(I.esContable), S.conteos, P);
    const venc = pr.filter(x => x.vencido).sort((a, b) => a.clase.localeCompare(b.clase) || ((b.dias == null ? 1e9 : b.dias) - (a.dias == null ? 1e9 : a.dias)));
    const L = exactitudRows(P);
    if (VIEWS.fisico._m !== 'prog') {
      body.innerHTML = `<div id="pg-k" class="grid g4"></div>
        <div class="grid g2" style="align-items:start;margin-top:12px"><div class="card" id="pg-ex"></div>
        <div class="card"><div class="card-h"><h3>⚙️ Frecuencias y clasificación</h3></div>
          <p class="muted small">Clase ABC por valor anual de consumo (consumo mensual × 12 × costo promedio de Odoo). A = artículos que suman el primer ${'${'}corte A${'}'}% del valor.</p>
          <div class="form"><label>Clase A: contar cada (días)<input id="pg-a" class="in-num" value="${P.A}"></label><label>Clase B: cada (días)<input id="pg-b" class="in-num" value="${P.B}"></label><label>Clase C: cada (días)<input id="pg-c" class="in-num" value="${P.C}"></label><label>Tolerancia de exactitud (%)<input id="pg-t" class="in-num" value="${P.tol}"></label><label>Corte A (% del valor)<input id="pg-ca" class="in-num" value="${P.corteA}"></label><label>Corte B (% del valor)<input id="pg-cb" class="in-num" value="${P.corteB}"></label></div>
          <div class="row" style="margin-top:8px"><button class="btn pri" id="pg-s">Guardar</button><button class="btn" id="pg-r">Recalcular clasificación ABC</button></div></div></div>
        <div class="card"><div class="card-h"><h3>📋 Artículos que toca contar</h3><span class="sp"></span><button class="btn sm" id="pg-x">Exportar Excel</button></div><p class="muted small">La tablet del almacenista los muestra en "📅 Programados" al iniciar un conteo.</p><div id="pg-v"></div></div>`;
      body.querySelector('.muted.small').innerHTML = `Clase ABC por valor anual de consumo (consumo mensual × 12 × costo promedio de Odoo). A = artículos que suman el primer ${P.corteA}% del valor; B hasta ${P.corteB}%; C el resto. Puedes fijar la clase de un artículo en Catálogo.`;
      $('#pg-s', body).onclick = async () => { const o = { A: num($('#pg-a').value) || 7, B: num($('#pg-b').value) || 15, C: num($('#pg-c').value) || 30, tol: num($('#pg-t').value), corteA: num($('#pg-ca').value) || 80, corteB: num($('#pg-cb').value) || 95 }; await DB.set('meta/conteoProg', o); I.toast('Programa guardado ✔', 'ok'); };
      $('#pg-r', body).onclick = async () => {
        const Pn = I.prog(S.meta.conteoProg);
        const its = items(true).filter(I.esContable).map(it => ({ it, v: num(it.consumo) * 12 * costo(it.id) })).sort((a, b) => b.v - a.v);
        const tot = its.reduce((s_, x) => s_ + x.v, 0); let acc = 0; const up = {}, cnt = { A: 0, B: 0, C: 0 };
        its.forEach(x => { const prev = tot ? acc / tot * 100 : 100; acc += x.v; let cl = ['A', 'B', 'C'].includes(x.it.abcManual) ? x.it.abcManual : (!(x.v > 0) ? 'C' : prev < Pn.corteA ? 'A' : prev < Pn.corteB ? 'B' : 'C'); up['catalogo/' + x.it.id + '/abc'] = cl; cnt[cl]++; });
        if (!tot) I.toast('Sin costos de Odoo: carga el reporte de Odoo para clasificar por valor', 'err');
        if (!(await I.confirmar('Recalcular clasificación ABC', `Resultado: <b>A ${cnt.A}</b> · <b>B ${cnt.B}</b> · <b>C ${cnt.C}</b> artículos. ¿Guardar en el catálogo?`, 'Guardar'))) return;
        await DB.update(up); await I.mov({ tipo: 'catalogo', nota: 'Clasificación ABC recalculada (A ' + cnt.A + ', B ' + cnt.B + ', C ' + cnt.C + ')' }); I.toast('Clasificación guardada ✔', 'ok');
      };
      $('#pg-x', body).onclick = () => { const filas = [['Clase', 'Código', 'Artículo', 'Familia', 'Último conteo', 'Días sin contar', 'Frecuencia (días)', 'Estado']]; I.programaConteo(items(true).filter(I.esContable), S.conteos, I.prog(S.meta.conteoProg)).sort((a, b) => a.clase.localeCompare(b.clase)).forEach(x => filas.push([x.clase, x.it.codigo, x.it.nombre, x.it.familia, x.ult ? fFecha(x.ult) : 'nunca', x.dias == null ? '' : x.dias, x.freq, x.vencido ? 'TOCA CONTAR' : 'al corriente'])); I.exportXlsx('Programa_conteos_' + hoyISO() + '.xlsx', [{ nombre: 'Programa', filas }]); };
      VIEWS.fisico._m = 'prog';
    }
    const mk = mesKey(), Lm = L.filter(x => x.mes === mk);
    const pct = arr => arr.length ? arr.filter(x => x.ok).length / arr.length * 100 : null;
    const ira = pct(Lm), nunca = pr.filter(x => x.ult == null).length, cob = pr.length ? pr.filter(x => x.dias != null && x.dias <= 30).length / pr.length * 100 : 0;
    $('#pg-k', body).innerHTML = `<div class="kpi ${ira == null ? '' : ira >= 95 ? 'grn' : ira >= 85 ? 'amb' : 'red'}"><div class="l">Exactitud de inventario (mes)</div><div class="v">${ira == null ? '—' : fmt(ira, 1) + '%'}</div><div class="s">${Lm.length} artículos contados · tolerancia ±${fmt(P.tol)}%</div></div>
      <div class="kpi ${venc.length ? 'amb' : 'grn'}"><div class="l">Toca contar</div><div class="v">${venc.length}</div><div class="s">de ${pr.length} artículos · A ${venc.filter(x => x.clase === 'A').length} · B ${venc.filter(x => x.clase === 'B').length} · C ${venc.filter(x => x.clase === 'C').length}</div></div>
      <div class="kpi"><div class="l">Cobertura 30 días</div><div class="v">${fmt(cob, 0)}%</div><div class="s">artículos contados en el último mes</div></div>
      <div class="kpi ${nunca ? 'red' : 'grn'}"><div class="l">Nunca contados</div><div class="v">${nunca}</div><div class="s">desde que inició el sistema</div></div>`;
    const meses = [I.addMes(mk, -2), I.addMes(mk, -1), mk];
    const fila = (t, f) => `<tr><td>${t}</td>${meses.map(m => { const a = L.filter(x => x.mes === m && f(x)); const p_ = pct(a); return `<td class="num">${p_ == null ? '<span class="muted">—</span>' : `<b class="${p_ >= 95 ? '' : p_ >= 85 ? 'low' : 'neg'}">${fmt(p_, 1)}%</b> <span class="tiny muted">(${a.length})</span>`}</td>`; }).join('')}</tr>`;
    const alms = [...new Set(L.map(x => x.alm))];
    $('#pg-ex', body).innerHTML = `<div class="card-h"><h3>🎯 Exactitud por mes</h3></div><p class="muted small">Un artículo es exacto si lo contado coincide con el sistema dentro de ±${fmt(P.tol)}%. Entre paréntesis: artículos contados.</p>
      <div class="tw" style="max-height:none"><table><thead><tr><th></th>${meses.map(m => `<th class="num">${mesLabel(m)}</th>`).join('')}</tr></thead><tbody>
      ${fila('<b>Global</b>', () => true)}
      <tr class="grp"><td colspan="4">Por clase</td></tr>${['A', 'B', 'C'].map(c => fila('Clase ' + c, x => x.clase === c)).join('')}
      <tr class="grp"><td colspan="4">Por familia</td></tr>${I.FAMILIAS.filter(f => L.some(x => x.it.familia === f)).map(f => fila((I.FAM_ICO[f] || '') + ' ' + esc(f), x => x.it.familia === f)).join('')}
      <tr class="grp"><td colspan="4">Por almacenista</td></tr>${alms.map(a => fila(esc(a), x => x.alm === a)).join('')}
      </tbody></table></div>${L.length ? '' : '<div class="empty small">La exactitud se calcula con los conteos aplicados a partir de hoy.</div>'}`;
    $('#pg-v', body).innerHTML = venc.length ? `<div class="tw"><table><thead><tr><th>Clase</th><th>Artículo</th><th>Familia</th><th>Último conteo</th><th class="num">Días</th><th class="num">Cada</th></tr></thead><tbody>${venc.slice(0, 400).map(x => `<tr><td><span class="b ${x.clase === 'A' ? 'b-red' : x.clase === 'B' ? 'b-amb' : 'b-gry'}">${x.clase}</span></td><td>${esc(I.itemLabel(x.it))}</td><td class="small">${I.FAM_ICO[x.it.familia] || ''} ${esc(x.it.familia)}</td><td class="small">${x.ult ? fFecha(x.ult) : '<span class="b b-red">nunca</span>'}</td><td class="num">${x.dias == null ? '—' : x.dias}</td><td class="num">${x.freq} d</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Todo al corriente 👍</div>';
  }

  /* ---------- SILOS ---------- */
  function silosGrid(mini) {
    const ss = vals(S.silos).sort((a, b) => (a.orden || 0) - (b.orden || 0));
    if (!ss.length) return '<div class="empty">Sin silos configurados</div>';
    return `<div class="silos">${ss.map(s => { const l = S.silosLect[s._k]; const c = I.calcSilo(s, l); const p = c.pct == null ? 0 : Math.max(0, Math.min(1, c.pct)); const liq = /TANQUE/i.test(s.grupo); return `<div class="silo"><div class="n">${esc(s.nombre)}</div><div class="tank ${liq ? 'liq' : ''}"><i style="height:${p * 100}%"></i><span>${c.pct == null ? '—' : fmt(c.pct * 100, 0) + '%'}</span></div><div class="t">${c.contenido == null ? '—' : fmt(c.contenido) + ' t'}</div>${mini ? '' : `<div class="tiny muted">cap. ${fmt(c.capacidad)} t · caben ${c.caben == null ? '—' : fmt(c.caben)} t</div><div class="tiny muted">vacío ${l && l.vacio != null ? fmt(l.vacio) + ' m' : '—'} · ${l ? fFecha(l.ts) : ''}</div>${l && l.calidad && l.calidad !== 'OK' ? `<span class="b b-red">${esc(l.calidad)}</span>` : ''}`}</div>`; }).join('')}</div>`;
  }
  async function capturaSilos(el) {
    const b = $('#si-img'); b.disabled = true; b.textContent = '⏳ Generando…';
    const sello = document.createElement('div'); sello.className = 'small muted'; sello.style.margin = '0 0 8px'; sello.textContent = I.CFG.EMPRESA + ' · Niveles de silos y tanques · ' + fFecha(Date.now()) + ' · ' + USER.nombre;
    el.prepend(sello);
    try {
      await I.loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      const cv = await html2canvas(el, { backgroundColor: getComputedStyle(document.body).backgroundColor || '#0b1220', scale: 2, ignoreElements: n => n.tagName === 'BUTTON', onclone: d => d.querySelectorAll('.tw').forEach(t => { t.style.maxHeight = 'none'; t.style.overflow = 'visible'; }) });
      const a = document.createElement('a'); a.download = 'Silos_' + hoyISO() + '_' + new Date().toTimeString().slice(0, 5).replace(':', '') + '.png'; a.href = cv.toDataURL('image/png'); document.body.appendChild(a); a.click(); a.remove();
      I.toast('Imagen descargada ✔', 'ok');
    } catch (e) { I.toast('No se pudo generar la imagen: ' + e.message, 'err'); }
    sello.remove(); b.disabled = false; b.textContent = '📷 Descargar imagen';
  }
  VIEWS.silos = {
    mount(el) {
      el.innerHTML = `<div class="card"><div class="card-h"><h2>🛢️ Niveles de silos y tanques</h2><span class="sp"></span><button class="btn" id="si-img">📷 Descargar imagen</button><button class="btn" id="si-dens">Densidades</button><button class="btn" id="si-new">+ Silo</button><button class="btn pri" id="si-apl">Aplicar niveles al físico</button></div>
        <p class="muted small">Contenido = (volumen total ÷ altura total) × (altura total − vacío medido con láser) × densidad. El almacenista captura el vacío desde su tablet.</p><div id="si-blq"></div><div id="si-grid"></div></div>
        <div class="card"><div class="card-h"><h3>Detalle por silo</h3></div><div id="si-tab"></div></div>
        <div class="card"><div class="card-h"><h3>Comparación con el físico registrado</h3></div><div id="si-cmp"></div></div>`;
      $('#si-img').onclick = () => capturaSilos(el);
      if (!editor()) { ['#si-dens', '#si-new', '#si-apl'].forEach(x => { const b = $(x); if (b) b.remove(); }); return; }
      $('#si-dens').onclick = editarDensidades; $('#si-new').onclick = () => editarSilo(null);
      $('#si-apl').onclick = async () => {
        const t = I.silosPorItem(S.silos, S.silosLect); const ids = Object.keys(t);
        if (!ids.length) return I.toast('No hay silos ligados a artículos con lectura', 'err');
        if (!(await I.confirmar('Aplicar niveles al físico', 'Se reemplazará la existencia física de: <b>' + ids.map(id => esc(item(id).nombre) + ' = ' + fmt(t[id] * 1000) + ' kg').join('<br>') + '</b>'))) return;
        const up = {}, det = {}, ts = Date.now();
        ids.forEach(id => { const kg = Math.round(t[id] * 1000); det[id] = { antes: F(id).mde, despues: kg }; up['fisico/' + id] = { mde: kg, ts, por: USER.nombre, origen: 'silo' }; });
        await DB.update(up); await I.mov({ tipo: 'silo', items: det, nota: 'Niveles de silos aplicados al físico', cant: ids.length });
        I.toast('Físico actualizado con niveles de silos ✔', 'ok');
      };
    },
    update(el) {
      $('#si-grid', el).innerHTML = silosGrid(false);
      const bq = BLQ(), bk = Object.keys(bq);
      $('#si-blq', el).innerHTML = bk.length ? `<div class="warn" style="margin-bottom:10px">⛔ Material bloqueado por calidad (no cuenta como disponible en alertas ni proyección): ${bk.map(id => `<b>${esc(item(id).nombre)}</b> ${fmt(bq[id])} kg`).join(' · ')}</div>` : '';
      const ss = vals(S.silos).sort((a, b) => (a.orden || 0) - (b.orden || 0));
      $('#si-tab', el).innerHTML = `<div class="tw"><table><thead><tr><th>Silo / tanque</th><th>Artículo ligado</th><th class="num">Vacío (m)</th><th class="num">Altura total</th><th class="num">Vol. total m³</th><th class="num">Densidad</th><th class="num">Contenido t</th><th class="num">Capacidad t</th><th class="num">Caben t</th><th>Calidad</th><th>Lectura</th><th></th></tr></thead><tbody>${ss.map(s => { const l = S.silosLect[s._k]; const c = I.calcSilo(s, l); return `<tr><td><b>${esc(s.nombre)}</b><div class="tiny muted">${esc(s.grupo)}</div></td><td class="small">${s.itemId ? esc(lbl(s.itemId)) : '<span class="muted">—</span>'}</td><td class="num">${l && l.vacio != null ? fmt(l.vacio) : '—'}</td><td class="num">${fmt(c.alto)}</td><td class="num">${fmt(num(s.volTotal))}</td><td class="num">${fmt(c.dens)}</td><td class="num"><b>${c.contenido == null ? '—' : fmt(c.contenido)}</b></td><td class="num">${fmt(c.capacidad)}</td><td class="num ${c.caben != null && c.caben < 0 ? 'neg' : ''}">${c.caben == null ? '—' : fmt(c.caben)}</td><td>${l ? `<span class="b ${l.calidad === 'OK' || !l.calidad ? 'b-grn' : 'b-red'}">${esc(l.calidad || 'OK')}</span>${l.notaCalidad ? `<div class="tiny muted">${esc(l.notaCalidad)}</div>` : ''}` : ''}</td><td class="tiny muted">${l ? fFecha(l.ts) + '<br>' + esc(l.por || '') : ''}</td><td><button class="btn sm" data-sl="${s._k}">Lectura</button> <button class="btn sm ghost" data-se="${s._k}">✎</button></td></tr>`; }).join('')}</tbody></table></div>`;
      if (!editor()) $$('[data-sl],[data-se]', el).forEach(b => b.remove());
      $$('[data-sl]', el).forEach(b => b.onclick = () => capturarLectura(b.dataset.sl));
      $$('[data-se]', el).forEach(b => b.onclick = () => editarSilo(b.dataset.se));
      const t = I.silosPorItem(S.silos, S.silosLect);
      $('#si-cmp', el).innerHTML = `<div class="tw"><table><thead><tr><th>Artículo</th><th class="num">En silos (kg)</th><th class="num">Físico registrado (kg)</th><th class="num">Diferencia</th><th class="num">Odoo</th></tr></thead><tbody>${Object.keys(t).map(id => { const kg = t[id] * 1000, f = F(id).total; return `<tr><td>${esc(lbl(id))}</td><td class="num"><b>${fmt(kg)}</b></td><td class="num">${fmt(f)}</td><td class="num ${Math.abs(kg - f) > 1 ? 'low' : ''}">${fmt(kg - f)}</td><td class="num muted">${odooQ(id) == null ? '' : fmt(odooQ(id))}</td></tr>`; }).join('')}</tbody></table></div>`;
    }
  };
  async function capturarLectura(sid) {
    const s = S.silos[sid], l = S.silosLect[sid] || {};
    await I.modal('Lectura · ' + s.nombre, `<label>Vacío medido con láser (m)<input id="sl-v" class="in-num" inputmode="decimal" value="${l.vacio != null ? l.vacio : ''}"></label><label>Estatus de calidad<select id="sl-c">${I.calidades(S.config).map(x => `<option ${x === (l.calidad || 'OK') ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label><label>Nota de calidad (obligatoria si no es OK)<input id="sl-n" value="${esc(l.notaCalidad || '')}"></label>`, [{ t: 'Cancelar' }, { t: 'Guardar', c: 'pri', antes: async ov => { const v = $('#sl-v', ov).value, cq = $('#sl-c', ov).value, nt = $('#sl-n', ov).value.trim(); if (v === '' || num(v) < 0 || num(v) > num(s.alto) + num(s.cono)) { I.toast('Vacío fuera del rango de la altura del silo', 'err'); return false; } if (cq !== 'OK' && !nt) { I.toast('Escribe la nota de calidad', 'err'); return false; } const o = { vacio: num(v), calidad: cq, notaCalidad: cq === 'OK' ? '' : nt, ts: Date.now(), por: USER.nombre }; await DB.set('silosLect/' + sid, o); await DB.push('silosHist/' + sid, o); I.toast('Lectura guardada ✔', 'ok'); } }]);
  }
  async function editarSilo(sid) {
    const s = sid ? S.silos[sid] : { nombre: '', grupo: 'SILO', alto: 0, cono: 0, volCil: 0, volCono: 0, volTotal: 0, densidad: 0, itemId: '' };
    const f = (k, l) => `<label>${l}<input data-k="${k}" class="in-num" value="${s[k] != null ? s[k] : ''}"></label>`;
    await I.modal(sid ? 'Editar ' + s.nombre : 'Nuevo silo', `<div class="form"><label class="full">Nombre<input data-k="nombre" value="${esc(s.nombre)}"></label><label>Grupo<input data-k="grupo" value="${esc(s.grupo)}"></label><label>Producto (texto)<input data-k="producto" value="${esc(s.producto || '')}"></label><label class="full">Artículo del catálogo<input data-k="itemId" list="dl-si" value="${s.itemId ? esc(lbl(s.itemId)) : ''}"></label>${datalist('dl-si')}${f('alto', 'Alto cilindro (m)')}${f('cono', 'Cono (m)')}${f('volCil', 'Vol. cilindro m³')}${f('volCono', 'Vol. cono m³')}${f('volTotal', 'Vol. total m³')}${f('densidad', 'Densidad (t/m³)')}</div>`, [{ t: 'Cancelar' }].concat(sid ? [{ t: 'Eliminar', c: 'danger', antes: async () => { if (await I.confirmar('Eliminar silo', '¿Eliminar ' + esc(s.nombre) + '?')) { await DB.update({ ['silos/' + sid]: null, ['silosLect/' + sid]: null }); } } }] : []).concat([{
      t: 'Guardar', c: 'pri', antes: async ov => {
        const o = {}; $$('[data-k]', ov).forEach(i => { const k = i.dataset.k; o[k] = ['nombre', 'grupo', 'producto'].includes(k) ? i.value.trim() : k === 'itemId' ? (pick(i.value) || null) : num(i.value); });
        if (!o.nombre) { I.toast('Pon un nombre', 'err'); return false; }
        if (!o.volTotal) o.volTotal = o.volCil + o.volCono;
        const id = sid || 'S' + I.newId(); o.orden = (s.orden != null ? s.orden : vals(S.silos).length + 1);
        await DB.set('silos/' + id, Object.assign({}, s, o)); I.toast('Silo guardado ✔', 'ok');
      }
    }]));
  }
  async function editarDensidades() {
    const ds = vals(S.densidades).sort((a, b) => String(a.producto).localeCompare(b.producto));
    await I.modal('Densidades (t/m³)', `<p class="muted small">Tabla de densidades de tu archivo de silos. Al cambiar una, actualiza también la densidad del silo correspondiente (✎).</p><div class="tw" style="max-height:50vh"><table><tbody>${ds.map(d => `<tr><td>${esc(d.producto)}</td><td style="width:120px"><input class="in-num" data-dk="${d._k}" value="${d.densidad}"></td></tr>`).join('')}</tbody></table></div><div class="row" style="margin-top:8px"><input id="dn-p" placeholder="Nuevo producto"><input id="dn-v" class="in-num" placeholder="Densidad" style="max-width:120px"></div>`, [{ t: 'Cancelar' }, { t: 'Guardar', c: 'pri', antes: async ov => { const up = {}; $$('[data-dk]', ov).forEach(i => up['densidades/' + i.dataset.dk + '/densidad'] = num(i.value)); const p = $('#dn-p', ov).value.trim(); if (p) up['densidades/' + keySafe(p)] = { producto: p, densidad: num($('#dn-v', ov).value) }; await DB.update(up); I.toast('Densidades guardadas ✔', 'ok'); } }]);
  }

  /* ---------- PROYECCIÓN ---------- */
  VIEWS.proyeccion = {
    mount(el) {
      el.innerHTML = `<div class="card"><div class="card-h"><h2>📈 Proyección de inventario y compras</h2><span class="sp"></span>
        <select id="py-fam" style="max-width:230px">${famOpts(UI.proyFam, true)}</select><input id="py-q" placeholder="Buscar…" style="max-width:180px" value="${esc(UI.proyQ)}">
        <select id="py-m" style="max-width:120px">${[6, 12, 15, 18, 24].map(n => `<option ${n === UI.proyMeses ? 'selected' : ''} value="${n}">${n} meses</option>`).join('')}</select>
        <label style="margin:0"><input type="checkbox" id="py-pc" ${UI.proyPC ? 'checked' : ''}> incluir "por comprar"</label><button class="btn sm" id="py-x">Exportar</button></div>
        <p class="muted small">Stock fin de mes = stock anterior + llegadas del mes − consumo mensual. Arranca del <b>físico total de hoy</b>. <span class="b b-amb">ámbar</span> debajo del stock de seguridad · <span class="b b-red">rojo</span> desabasto · subrayado azul = llega material (pasa el cursor para ver el detalle).</p>
        <div id="py-tab"></div></div><div id="py-det"></div>`;
      $('#py-fam').onchange = e => { UI.proyFam = e.target.value; render(true); };
      $('#py-q').oninput = I.debounce(() => { UI.proyQ = $('#py-q').value; render(true); }, 200);
      $('#py-m').onchange = e => { UI.proyMeses = +e.target.value; render(true); };
      $('#py-pc').onchange = e => { UI.proyPC = e.target.checked; render(true); };
      $('#py-x').onclick = () => { const rows = proyRows(); const ms = rows[0] ? rows[0].p.meses.map(m => mesLabel(m.mes)) : []; const filas = [['Código', 'Artículo', 'Físico hoy', 'Consumo mensual', 'Lead time (meses)', 'Stock seguridad'].concat(ms).concat(['Quiebre', 'Pedir a más tardar'])]; rows.forEach(r => filas.push([r.it.codigo, r.it.nombre, r.f.total, num(r.it.consumo), num(r.it.lt), r.p.ss].concat(r.p.meses.map(m => Math.round(m.stock))).concat([r.p.quiebre ? mesLabel(r.p.quiebre) : '', r.p.pedirAntes ? hoyISO(r.p.pedirAntes) : '']))); const ll = [['Artículo', 'Mes', 'Cantidad', 'Estado', 'Proveedor', 'OC', 'Nota']]; vals(S.llegadas).filter(l => l.estado !== 'recibido').forEach(l => ll.push([lbl(l.itemId), l.mes, l.cant, l.estado, l.proveedor || '', l.oc || '', l.nota || ''])); I.exportXlsx('Proyeccion_' + hoyISO() + '.xlsx', [{ nombre: 'Proyección', filas }, { nombre: 'Llegadas', filas: ll }]); };
    },
    update(el) {
      const rows = proyRows();
      if (!rows.length) { $('#py-tab', el).innerHTML = '<div class="empty">No hay artículos con consumo mensual en esta familia. Captura el consumo en el Catálogo y marca "Planear compras".</div>'; $('#py-det', el).innerHTML = ''; return; }
      const ms = rows[0].p.meses;
      $('#py-tab', el).innerHTML = `<div class="tw"><table class="t-proy"><thead><tr><th>Artículo</th><th class="num">Físico hoy</th><th class="num">Consumo/mes</th><th class="num">LT</th>${ms.map(m => `<th class="num">${mesLabel(m.mes)}</th>`).join('')}<th>Pedir a más tardar</th></tr></thead><tbody>${rows.map(r => `<tr data-pi="${r.it.id}" style="cursor:pointer" class="${UI.proyItem === r.it.id ? 'sel' : ''}"><td><b>${esc(r.it.nombre)}</b><div class="tiny muted">${esc(r.it.codigo)}</div></td><td class="num">${fmt(r.f.total)}</td><td class="num">${fmt(num(r.it.consumo))}</td><td class="num">${fmt(num(r.it.lt))}m</td>${r.p.meses.map(m => `<td class="num ${m.negativo ? 'cell-red' : m.bajoSS ? 'cell-amb' : ''} ${m.llega ? 'cell-arr' : ''}" title="${m.llega ? esc('Llega: ' + m.notas.map(n => fmt(n.cant) + ' (' + (n.estado === 'fincado' ? 'fincado' : 'por comprar') + ') ' + (n.oc || n.nota || '')).join('; ')) : ''}">${fmt(m.stock, 0)}</td>`).join('')}<td>${r.p.pedirAntes ? `<span class="b ${r.p.pedirAntes < new Date() ? 'b-red' : 'b-amb'}">${fDia(hoyISO(r.p.pedirAntes))}</span>` : '<span class="b b-grn">OK</span>'}</td></tr>`).join('')}</tbody></table></div>`;
      $$('[data-pi]', el).forEach(tr => tr.onclick = () => { UI.proyItem = tr.dataset.pi; render(true); setTimeout(() => { const d = $('#py-det'); if (d) d.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50); });
      const sel = rows.find(r => r.it.id === UI.proyItem);
      $('#py-det', el).innerHTML = sel ? proyDetalle(sel) : '<div class="card muted small">Toca un artículo para ver su gráfica, las llegadas programadas y registrar pedidos.</div>';
      if (sel) bindProyDet(sel);
    }
  };
  const proyRows = () => { const q = UI.proyQ.toLowerCase(); return items(true).filter(it => it.planear && num(it.consumo) > 0 && (!UI.proyFam || it.familia === UI.proyFam) && (!q || I.itemLabel(it).toLowerCase().includes(q))).map(it => { const f = Fd(it.id); return { it, f, p: I.proyeccion(it, f, S.llegadas, UI.proyMeses, UI.proyPC) }; }); };

  function chartSVG(r) {
    const ms = r.p.meses, W = 900, H = 260, P = { l: 70, r: 16, t: 16, b: 34 };
    const vals_ = ms.map(m => m.stock).concat([r.p.ss, 0, r.f.total]); const mx = Math.max(...vals_), mn = Math.min(...vals_);
    const y = v => P.t + (H - P.t - P.b) * (1 - (v - mn) / ((mx - mn) || 1)); const x = i => P.l + (W - P.l - P.r) * (i + 0.5) / ms.length;
    const pts = [[P.l, y(r.f.total)]].concat(ms.map((m, i) => [x(i), y(m.stock)]));
    const ticks = 4; let g = '';
    for (let i = 0; i <= ticks; i++) { const v = mn + (mx - mn) * i / ticks; g += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" stroke="#1f3347"/><text x="${P.l - 8}" y="${y(v) + 4}" fill="#94a3b8" font-size="11" text-anchor="end">${fmt(v, 0)}</text>`; }
    const bw = (W - P.l - P.r) / ms.length * 0.5;
    const bars = ms.map((m, i) => m.llega ? `<rect x="${x(i) - bw / 2}" y="${y(Math.max(0, mn) + m.llega) < P.t ? P.t : y(mn + m.llega)}" width="${bw}" height="${Math.max(2, y(mn) - y(mn + m.llega))}" fill="${m.porComprar ? 'rgba(240,180,41,.35)' : 'rgba(78,168,255,.35)'}"><title>Llega ${fmt(m.llega)}</title></rect>` : '').join('');
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Proyección de ${esc(r.it.nombre)}">${g}${bars}
      ${mn < 0 ? `<line x1="${P.l}" x2="${W - P.r}" y1="${y(0)}" y2="${y(0)}" stroke="#ef5a5a" stroke-width="1.5"/>` : ''}
      <line x1="${P.l}" x2="${W - P.r}" y1="${y(r.p.ss)}" y2="${y(r.p.ss)}" stroke="#f0b429" stroke-dasharray="5 4"/><text x="${W - P.r}" y="${y(r.p.ss) - 5}" fill="#f0b429" font-size="11" text-anchor="end">stock de seguridad</text>
      <polyline fill="none" stroke="#E8A020" stroke-width="2.5" points="${pts.map(p => p.join(',')).join(' ')}"/>
      ${ms.map((m, i) => `<circle cx="${x(i)}" cy="${y(m.stock)}" r="3.5" fill="${m.negativo ? '#ef5a5a' : m.bajoSS ? '#f0b429' : '#E8A020'}"><title>${mesLabel(m.mes)}: ${fmt(m.stock, 0)}</title></circle><text x="${x(i)}" y="${H - 12}" fill="#94a3b8" font-size="11" text-anchor="middle">${mesLabel(m.mes)}</text>`).join('')}
    </svg>`;
  }
  function proyDetalle(r) {
    const ll = vals(S.llegadas).filter(l => l.itemId === r.it.id).sort((a, b) => String(a.mes).localeCompare(b.mes));
    const a = I.alerta(r.it, r.f, I.transito(r.it.id, S.llegadas));
    return `<div class="card"><div class="card-h"><h2>${esc(I.itemLabel(r.it))}</h2><span class="sp"></span><span class="b ${I.statusClass(a.status)}">${a.status}</span><span class="b ${I.critClass(a.crit)}">${a.crit}</span></div>
      <div class="grid g4" style="margin-bottom:10px"><div class="kpi"><div class="l">Físico hoy (almacén + PT)</div><div class="v">${fmt(r.f.total)}</div><div class="s">${fmt(r.f.mde)} + ${fmt(r.f.pt)}</div>${r.f.bloq ? `<div class="s" style="color:var(--red)">− ${fmt(r.f.bloq)} kg en silo con calidad no OK (no cuenta)</div>` : ''}</div><div class="kpi"><div class="l">Consumo mensual</div><div class="v">${fmt(num(r.it.consumo))}</div><div class="s">${fmt(a.consDia)} por día</div></div><div class="kpi"><div class="l">Stock mínimo</div><div class="v">${fmt(a.min)}</div><div class="s">LT ${fmt(a.ltd, 0)} días + seguridad ${fmt(a.ss)}</div></div><div class="kpi ${r.p.quiebre ? 'red' : 'grn'}"><div class="l">Quiebre proyectado</div><div class="v">${r.p.quiebre ? mesLabel(r.p.quiebre) : 'Sin quiebre'}</div><div class="s">${r.p.pedirAntes ? 'pedir a más tardar ' + fDia(hoyISO(r.p.pedirAntes)) : ''}</div></div></div>
      <div class="chart">${chartSVG(r)}</div>
      <div class="card-h" style="margin-top:12px"><h3>Llegadas programadas (pedidos fincados y por comprar)</h3></div>
      <div class="tw" style="max-height:none"><table><thead><tr><th>Llegada estimada</th><th class="num">Cantidad</th><th>Estado</th><th>Proveedor</th><th>OC</th><th>Nota</th>${puedeComprar() ? '<th></th>' : ''}</tr></thead><tbody>${ll.map(l => `<tr><td>${fLleg(l)}</td><td class="num">${fmt(l.cant)}${l.recibido ? `<div class="tiny muted">recibido ${fmt(l.recibido)}</div>` : ''}</td><td><span class="b ${l.estado === 'fincado' ? 'b-blu' : l.estado === 'por_comprar' ? 'b-amb' : l.estado === 'recibido' ? 'b-grn' : 'b-gry'}">${l.estado === 'por_comprar' ? 'por comprar' : l.estado}</span></td><td>${esc(l.proveedor || '')}</td><td>${esc(l.oc || '')}${l.fechaOC ? `<div class="tiny muted">${fDia(l.fechaOC)}</div>` : ''}</td><td class="small">${esc(l.nota || '')}${l.origen === 'compras' ? ' <span class="b b-gry">compras</span>' : ''}</td>${puedeComprar() ? `<td>${editor() || (l.origen === 'compras' && l.estado !== 'recibido') ? `<button class="btn sm" data-le="${l._k}">✎</button>` : ''}</td>` : ''}</tr>`).join('') || '<tr><td colspan="7" class="empty">Sin llegadas programadas</td></tr>'}</tbody></table></div>
      ${puedeComprar() ? `<div class="row" style="margin-top:8px"><button class="btn pri" id="ll-new">${can('compras') ? '🛒 Registrar orden de compra' : '+ Registrar pedido / llegada'}</button><button class="btn" data-nt="${r.it.id}">💬 Notas y estatus${notasDe(r.it.id).length ? ' (' + notasDe(r.it.id).length + ')' : ''}</button>${a.sugerido > 0 ? `<span class="muted small">Sugerido hoy: <b>${fmt(a.sugerido)}</b> ${esc(r.it.unidad)}</span>` : ''}</div>${notasDe(r.it.id).slice(0, 3).map(x => `<div class="small" style="margin-top:6px"><b>${esc(x.por)}</b> <span class="muted">${fFecha(x.ts)}</span> ${x.estatus ? `<span class="b b-blu">${esc(I.ESTATUS_COMPRA[x.estatus] || x.estatus)}</span>` : ''} ${esc(x.texto || '')}</div>`).join('')}` : ''}
    </div>`;
  }
  function bindProyDet(r) {
    $$('[data-le]').forEach(b => b.onclick = () => editarLlegada(b.dataset.le, r.it.id));
    const n = $('#ll-new'); if (n) n.onclick = () => editarLlegada(null, r.it.id, can('compras'));
    $$('[data-nt]').forEach(b => b.onclick = () => notasCompra(b.dataset.nt));
  }
  async function editarLlegada(k, itemId, comoCompra) {
    const esCompras = can('compras') || (!!comoCompra && !k);
    const it = item(itemId); const a = I.alerta(it, Fd(itemId), I.transito(itemId, S.llegadas));
    const l = k ? S.llegadas[k] : { itemId, cant: esCompras && a.sugerido > 0 ? Math.round(a.sugerido) : '', mes: I.addMes(mesKey(), Math.max(1, Math.round(num(it.lt)))), fecha: hoyISO(new Date(Date.now() + Math.max(30, Math.round(num(it.lt) * 30)) * 86400000)), fechaOC: esCompras ? hoyISO() : '', estado: esCompras ? 'fincado' : 'por_comprar', proveedor: '', oc: '', nota: '' };
    const estados = can('compras') ? [['fincado', 'OC colocada (fincado)'], ['cancelado', 'Cancelada']] : [['fincado', 'Fincado (OC colocada)'], ['por_comprar', 'Por comprar (planeado)'], ['recibido', 'Recibido'], ['cancelado', 'Cancelado']];
    await I.modal(k ? 'Editar llegada' : (esCompras ? 'Registrar orden de compra' : 'Nueva llegada / pedido'), `<p><b>${esc(lbl(itemId))}</b></p>${esCompras ? '<p class="muted small">Entra a la proyección como pedido fincado y se cierra cuando inventarios registra la entrada del material.</p>' : ''}<div class="form"><label>Cantidad (${esc(it.unidad || '')})<input id="ll-q" class="in-num" value="${l.cant}"></label><label>Fecha de la OC<input id="ll-fo" type="date" value="${l.fechaOC || ''}"></label><label>Fecha estimada de llegada<input id="ll-f" type="date" value="${l.fecha || (l.mes ? l.mes + '-15' : '')}"></label><label>Estado<select id="ll-e">${estados.map(([v, t]) => `<option value="${v}" ${l.estado === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label><label>Proveedor<input id="ll-p" value="${esc(l.proveedor || '')}"></label><label>Número de OC<input id="ll-oc" value="${esc(l.oc || '')}"></label><label class="full">Nota<input id="ll-n" value="${esc(l.nota || '')}"></label></div>`, [{ t: 'Cancelar' }].concat(k && editor() ? [{ t: 'Eliminar', c: 'danger', antes: async () => { await DB.remove('llegadas/' + k); I.toast('Eliminada', 'ok'); } }] : []).concat([{ t: 'Guardar', c: 'pri', antes: async ov => { const o = { itemId, cant: num($('#ll-q', ov).value), fecha: $('#ll-f', ov).value, mes: ($('#ll-f', ov).value || '').slice(0, 7), fechaOC: $('#ll-fo', ov).value, estado: $('#ll-e', ov).value, proveedor: $('#ll-p', ov).value.trim(), oc: $('#ll-oc', ov).value.trim(), nota: $('#ll-n', ov).value.trim(), ts: Date.now(), por: USER.nombre }; if (!(o.cant > 0) || !o.fecha) { I.toast('Cantidad y fecha estimada de llegada son obligatorias', 'err'); return false; } if (esCompras || (l.origen === 'compras')) o.origen = 'compras'; try { if (k) await DB.update({ ['llegadas/' + k]: Object.assign({}, l, o, { _k: null }) }); else await DB.push('llegadas', o); if (esCompras && !k) await DB.push('notasCompra/' + itemId, { texto: 'OC registrada: ' + fmt(o.cant) + ' ' + (it.unidad || '') + (o.oc ? ' · OC ' + o.oc : '') + (o.proveedor ? ' · ' + o.proveedor : '') + ' · llega ' + fDia(o.fecha), estatus: 'oc', por: USER.nombre, rol: USER.rol, ts: Date.now() }); I.toast('Guardado ✔', 'ok'); } catch (x) { I.toast('Sin permiso: ' + x.message, 'err'); return false; } } }]));
  }

  /* ---------- ALERTAS DE COMPRA ---------- */
  VIEWS.alertas = {
    mount(el) {
      el.innerHTML = `<div class="card"><div class="card-h"><h2>🚨 Alertas de compra</h2><span class="sp"></span><select id="al-f" style="max-width:230px">${famOpts(UI.alFam, true)}</select><select id="al-s" style="max-width:190px"><option value="todos">Todos</option><option value="oc">Colocar OC</option><option value="crit">Críticos</option><option value="cub">Cubiertos con OC</option><option value="ok">Suficiente</option></select><input id="al-q" placeholder="Buscar…" style="max-width:180px"><button class="btn sm" id="al-x">Exportar Excel</button></div>
        <p class="muted small" id="al-info"></p><div id="al-k" class="grid g4" style="margin-bottom:12px"></div><div id="al-t"></div></div>`;
      $('#al-s').value = UI.alSt;
      $('#al-f').onchange = e => { UI.alFam = e.target.value; render(true); };
      $('#al-s').onchange = e => { UI.alSt = e.target.value; render(true); };
      $('#al-q').oninput = I.debounce(() => { UI.alQ = $('#al-q').value; render(true); }, 200);
      $('#al-x').onclick = () => { const filas = [['Código', 'Artículo', 'Familia', 'Unidad', 'Físico (almacén+PT)', 'Consumo mensual', 'Lead time (días)', 'Stock seguridad', 'Stock mínimo', 'Alcance (días)', 'En tránsito fincado', 'Por comprar planeado', 'Status', 'Criticidad', 'Cantidad sugerida', 'Pedir a más tardar', 'Quiebre proyectado', 'Nota']]; alRows().forEach(a => filas.push([a.it.codigo, a.it.nombre, a.it.familia, a.it.unidad, a.fis, a.cons, a.ltd, Math.round(a.ss), Math.round(a.min), isFinite(a.alcance) ? Math.round(a.alcance) : '', a.tr.fincado, a.tr.porComprar, a.status, a.crit, Math.round(a.sugerido), a.p.pedirAntes ? hoyISO(a.p.pedirAntes) : '', a.p.quiebre ? mesLabel(a.p.quiebre) : '', a.it.nota || ''])); I.exportXlsx('Alertas_compra_' + hoyISO() + '.xlsx', [{ nombre: 'Alertas', filas }]); };
    },
    update(el) {
      const all = alertas(); const rows = alRows();
      $('#al-info', el).innerHTML = `Calculado sobre la <b>existencia física disponible</b> (almacén + PT; el material en silos con calidad distinta de OK no cuenta) actualizada al ${fFecha(ultimaAct())}. Stock mínimo = consumo diario × lead time + ${fmt(30, 0)}% del consumo mensual como seguridad. La cantidad sugerida descuenta lo ya fincado.`;
      $('#al-k', el).innerHTML = `<div class="kpi red"><div class="l">Colocar OC</div><div class="v">${all.filter(a => a.status === 'COLOCAR OC').length}</div></div><div class="kpi red"><div class="l">Críticos</div><div class="v">${all.filter(a => a.crit === 'CRÍTICO').length}</div><div class="s">se acaban antes de que llegue un pedido nuevo</div></div><div class="kpi blu"><div class="l">Cubiertos con OC</div><div class="v">${all.filter(a => a.status === 'CUBIERTO CON OC').length}</div></div><div class="kpi grn"><div class="l">Suficientes</div><div class="v">${all.filter(a => a.status === 'SUFICIENTE').length}</div></div>`;
      $('#al-t', el).innerHTML = `<div class="tw"><table><thead><tr><th>Artículo</th><th class="num">Físico</th><th class="num">Consumo/mes</th><th class="num">LT días</th><th class="num">Stock mín.</th><th class="num">Alcance</th><th class="num">Fincado</th><th>Status</th><th>Criticidad</th><th class="num">Sugerido</th><th>Pedir a más tardar</th><th>Quiebre</th><th>Nota</th><th>Seguimiento</th></tr></thead><tbody>${rows.map(a => `<tr><td><b>${esc(a.it.nombre)}</b><div class="tiny muted">${esc(a.it.codigo)} · ${esc(a.it.familia)}${segTxt(a.it.id)}</div></td><td class="num">${fmt(a.fis)} <span class="tiny muted">${esc(a.it.unidad)}</span>${a.f.bloq ? `<div class="tiny" style="color:var(--red)">−${fmt(a.f.bloq)} bloqueado (calidad silo)</div>` : ''}</td><td class="num">${fmt(a.cons)}</td><td class="num">${fmt(a.ltd, 0)}</td><td class="num">${fmt(a.min)}</td><td class="num ${a.alcance < a.ltd ? 'neg' : ''}">${isFinite(a.alcance) ? fmt(a.alcance, 0) + ' d' : '∞'}</td><td class="num">${a.tr.fincado ? fmt(a.tr.fincado) : ''}${a.tr.porComprar ? `<div class="tiny muted">+${fmt(a.tr.porComprar)} planeado</div>` : ''}</td><td><span class="b ${I.statusClass(a.status)}">${a.status}</span></td><td><span class="b ${I.critClass(a.crit)}">${a.crit}</span></td><td class="num"><b>${a.sugerido > 0 ? fmt(a.sugerido) : ''}</b></td><td>${a.p.pedirAntes ? `<span class="${a.p.pedirAntes < new Date() ? 'b b-red' : ''}">${fDia(hoyISO(a.p.pedirAntes))}</span>` : ''}</td><td>${a.p.quiebre ? `<span class="b b-red">${mesLabel(a.p.quiebre)}</span>` : ''}</td><td class="small muted">${esc(a.it.nota || '')}</td><td>${botonesCompra(a.it.id)}</td></tr>`).join('') || '<tr><td colspan="14" class="empty">Sin artículos</td></tr>'}</tbody></table></div>`;
      bindCompra(el);
    }
  };
  const alRows = () => { const q = UI.alQ.toLowerCase(); return alertas().filter(a => (!UI.alFam || a.it.familia === UI.alFam) && (!q || I.itemLabel(a.it).toLowerCase().includes(q)) && (UI.alSt === 'todos' || (UI.alSt === 'oc' && a.status === 'COLOCAR OC') || (UI.alSt === 'crit' && a.crit === 'CRÍTICO') || (UI.alSt === 'cub' && a.status === 'CUBIERTO CON OC') || (UI.alSt === 'ok' && a.status === 'SUFICIENTE'))).sort((a, b) => (critOrder[a.crit] - critOrder[b.crit]) || ((a.status === 'COLOCAR OC' ? 0 : 1) - (b.status === 'COLOCAR OC' ? 0 : 1)) || (a.alcance - b.alcance)); };

  /* ---------- ODOO ---------- */
  VIEWS.odoo = {
    mount(el) {
      el.innerHTML = `<div class="card"><div class="card-h"><h2>🔄 Existencia teórica de Odoo</h2></div>
        <p class="muted small">Exporta desde Odoo el reporte de existencias (Variantes de producto: "Nombre en pantalla", "Cantidad a la mano", "Costo promedio") y cárgalo aquí.</p>
        <div class="form"><label>¿Qué existencia trae el reporte?<select id="od-alc"><option value="total">Todas las ubicaciones (MDE + MP + insumos + PT) — para comparar</option><option value="mde">Solo almacenes MDE (empaque) / MP (materias primas) / insumos — para comparar</option><option value="pt">Solo almacén de insumos PT — para registrar salidas de PT</option></select></label><label>Archivo (.xlsx / .csv)<input type="file" id="od-f" accept=".xlsx,.xls,.csv"></label></div>
        <div id="od-last" class="small muted"></div></div>
      <div class="card"><div class="card-h"><h3>Físico vs teórico</h3><span class="sp"></span><input id="od-q" placeholder="Buscar…" style="max-width:200px"><button class="btn sm" id="od-x">Exportar Excel</button></div><div id="od-res" class="grid g4" style="margin-bottom:10px"></div><div id="od-t"></div></div>
      <div class="card"><div class="card-h"><h3>Artículos de Odoo que no están en tu catálogo</h3></div><div id="od-new"></div></div>`;
      $('#od-f').onchange = async ev => {
        const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
        const alc = $('#od-alc').value;
        if (alc === 'pt') return cargarOdooPT(f);
        try { const rep = await I.leerOdoo(f); await DB.set('odoo', { fecha: hoyISO(), ts: Date.now(), archivo: f.name, alcance: alc, por: USER.nombre, items: rep.items }); await I.mov({ tipo: 'odoo', nota: 'Reporte de Odoo cargado: ' + f.name + ' (' + rep.n + ' renglones, ' + (alc === 'mde' ? 'solo almacenes' : 'todas las ubicaciones') + ')' }); I.toast('Reporte de Odoo cargado ✔ (' + rep.n + ' renglones)', 'ok'); } catch (e) { I.toast(e.message, 'err'); }
      };
      $('#od-q').oninput = I.debounce(() => { UI.odooQ = $('#od-q').value; render(true); }, 200);
      $('#od-x').onclick = () => { const filas = [['Código', 'Artículo', 'Familia', 'Unidad', 'Físico', 'Teórico Odoo', 'Diferencia', '%', 'Costo promedio', '$ Diferencia']]; odRows().forEach(r => filas.push([r.it.codigo, r.it.nombre, r.it.familia, r.it.unidad, r.fis, r.q, r.d, r.pct, costo(r.it.id), r.val])); I.exportXlsx('Fisico_vs_Odoo_' + hoyISO() + '.xlsx', [{ nombre: 'Comparativo', filas }]); };
    },
    update(el) {
      const od = S.odoo;
      $('#od-last', el).innerHTML = od ? `Último reporte: <b>${esc(od.archivo || '')}</b> · ${fDia(od.fecha)} · ${od.alcance === 'mde' ? 'solo almacenes' : 'todas las ubicaciones'} · cargó ${esc(od.por || '')} · ${vals(od.items).length} códigos` : 'Aún no se ha cargado ningún reporte.';
      if (!od) { $('#od-t', el).innerHTML = '<div class="empty">Carga un reporte para comparar</div>'; $('#od-res', el).innerHTML = ''; $('#od-new', el).innerHTML = ''; return; }
      const rows = odRows();
      const tf = rows.reduce((s, r) => s + r.fis * costo(r.it.id), 0), tt = rows.reduce((s, r) => s + (r.q || 0) * costo(r.it.id), 0), ta = rows.reduce((s, r) => s + Math.abs(r.val || 0), 0);
      $('#od-res', el).innerHTML = `<div class="kpi"><div class="l">Valor físico</div><div class="v">${money(tf)}</div></div><div class="kpi"><div class="l">Valor teórico</div><div class="v">${money(tt)}</div></div><div class="kpi ${tf - tt < 0 ? 'red' : 'grn'}"><div class="l">Diferencia neta</div><div class="v">${money(tf - tt)}</div><div class="s">${tt ? fmt((tf - tt) / tt * 100) + '%' : ''}</div></div><div class="kpi amb"><div class="l">Diferencia absoluta</div><div class="v">${money(ta)}</div><div class="s">${tt ? fmt(ta / tt * 100) + '% del teórico' : ''}</div></div>`;
      let fam = null;
      $('#od-t', el).innerHTML = `<div class="tw"><table><thead><tr><th>Artículo</th><th class="num">Físico</th><th class="num">Teórico</th><th class="num">Diferencia</th><th class="num">%</th><th class="num">$ Dif.</th></tr></thead><tbody>${rows.map(r => { const g = r.it.familia !== fam ? `<tr class="grp"><td colspan="6">${esc(r.it.familia)}</td></tr>` : ''; fam = r.it.familia; return g + `<tr><td>${esc(I.itemLabel(r.it))}</td><td class="num">${fmt(r.fis)}</td><td class="num">${r.q == null ? '<span class="muted">no está en Odoo</span>' : fmt(r.q)}</td><td class="num ${r.d && Math.abs(r.d) > 0.5 ? (r.d < 0 ? 'neg' : 'low') : ''}">${r.d == null ? '' : fmt(r.d)}</td><td class="num">${r.pct == null ? '' : fmt(r.pct) + '%'}</td><td class="num">${r.val == null ? '' : money(r.val)}</td></tr>`; }).join('')}</tbody></table></div>`;
      const nuevos = vals(od.items).filter(o => !S.catalogo[o._k] && /^0[1-4](SAC|PRO|PIC|PRE|MIN|ENZ|ACE|CROQ|GRA|PAS|CRI|AMI|TIN|SOL|PFL)/.test(o.c || ''));
      $('#od-new', el).innerHTML = nuevos.length ? `<div class="tw" style="max-height:300px"><table><tbody>${nuevos.map(o => `<tr><td class="mono">${esc(o.c)}</td><td>${esc(o.n)}</td><td class="num">${fmt(o.q)} ${esc(o.u)}</td><td><button class="btn sm" data-add="${o._k}">Agregar al catálogo</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Todo lo relevante ya está en tu catálogo</div>';
      $$('[data-add]', el).forEach(b => b.onclick = () => { const o = od.items[b.dataset.add]; editarItem(null, { codigo: o.c, nombre: o.n, unidad: o.u, familia: /SAC|PRO/.test(o.c) ? 'EMPAQUE' : /CRI/.test(o.c) ? 'CRIBAS' : 'MICROINGREDIENTES' }); });
    }
  };
  const odRows = () => { const alc = S.odoo && S.odoo.alcance; const q = UI.odooQ.toLowerCase(); return items(true).filter(it => !q || I.itemLabel(it).toLowerCase().includes(q)).map(it => { const f = F(it.id); const fis = alc === 'mde' ? f.mde : f.total; const oq = odooQ(it.id); const d = oq == null ? null : fis - oq; return { it, fis, q: oq, d, pct: d != null && oq ? d / oq * 100 : null, val: d != null ? d * costo(it.id) : null }; }); };

  /* ---------- CATÁLOGO ---------- */
  VIEWS.catalogo = {
    mount(el) {
      el.innerHTML = `<div class="card"><div class="card-h"><h2>🗂️ Catálogo de materiales</h2><span class="sp"></span><select id="ca-f" style="max-width:230px">${famOpts(UI.catFam, true)}</select><select id="ca-a" style="max-width:150px"><option value="act">Activos</option><option value="ina">Inactivos</option><option value="">Todos</option></select><input id="ca-q" placeholder="Buscar…" style="max-width:180px"><button class="btn sm" id="ca-x">Exportar</button><button class="btn pri" id="ca-n">+ Nuevo artículo</button></div>
        <div class="row small" style="gap:6px;margin-bottom:8px"><span class="muted">Visibilidad en apps para los artículos filtrados:</span><button class="btn sm" data-bk="contar:1">📋 Contar: todos sí</button><button class="btn sm" data-bk="contar:0">📋 Contar: todos no</button><button class="btn sm" data-bk="solicitar:1">🏭 Solicitar: todos sí</button><button class="btn sm" data-bk="solicitar:0">🏭 Solicitar: todos no</button></div>
        <div id="ca-t"></div></div>`;
      $$('[data-bk]', el).forEach(b => b.onclick = async () => { const [campo, v] = b.dataset.bk.split(':'); const rows = catRows(); if (!rows.length) return; if (!await I.confirmar('Cambiar visibilidad', `${campo === 'contar' ? 'Contar en app almacén' : 'Solicitar en app producción'} → <b>${v === '1' ? 'Sí' : 'No'}</b> para ${rows.length} artículo(s) filtrados.`)) return; const u = {}; rows.forEach(it => u['catalogo/' + it.id + '/' + campo] = v === '1'); await DB.update(u); I.toast('Actualizado ✔', 'ok'); });
      $('#ca-a').value = UI.catAct;
      $('#ca-f').onchange = e => { UI.catFam = e.target.value; render(true); };
      $('#ca-a').onchange = e => { UI.catAct = e.target.value; render(true); };
      $('#ca-q').oninput = I.debounce(() => { UI.catQ = $('#ca-q').value; render(true); }, 200);
      $('#ca-n').onclick = () => editarItem(null);
      $('#ca-x').onclick = () => { const filas = [['ID', 'Código', 'Nombre', 'Familia', 'Tipo', 'Unidad', 'Consumo mensual', 'Lead time (meses)', '% seguridad', 'Pzas por paca', 'Ubicaciones', 'Fuente', 'Planear', 'Activo', 'Nota']]; items(false).forEach(it => filas.push([it.id, it.codigo, it.nombre, it.familia, it.sub, it.unidad, it.consumo, it.lt, it.ss, it.ppp || '', (it.ubic || []).join(', '), it.fuente, it.planear ? 'Sí' : 'No', it.activo !== false ? 'Sí' : 'No', it.nota || ''])); I.exportXlsx('Catalogo_' + hoyISO() + '.xlsx', [{ nombre: 'Catálogo', filas }]); };
    },
    update(el) {
      const rows = catRows();
      let fam = null;
      $('#ca-t', el).innerHTML = `<p class="muted small">${rows.length} artículos</p><div class="tw"><table><thead><tr><th>Artículo</th><th>Tipo</th><th>Unidad</th><th class="num">Consumo/mes</th><th class="num">LT (meses)</th><th class="num">Pzas/paca</th><th>Ubicaciones</th><th>Fuente</th><th>Planear</th><th title="Aparece en los conteos de la app almacén">📋 Contar</th><th title="Producción lo puede solicitar">🏭 Solicitar</th><th></th></tr></thead><tbody>${rows.map(it => { const g = it.familia !== fam ? `<tr class="grp"><td colspan="12">${I.FAM_ICO[it.familia] || ''} ${esc(it.familia)}</td></tr>` : ''; fam = it.familia; return g + `<tr style="${it.activo === false ? 'opacity:.5' : ''}"><td>${esc(I.itemLabel(it))}</td><td class="small muted">${esc(it.sub || '')}</td><td>${esc(it.unidad)}</td><td class="num">${num(it.consumo) ? fmt(it.consumo) : ''}</td><td class="num">${num(it.lt) ? fmt(it.lt) : ''}</td><td class="num">${it.ppp ? fmt(it.ppp) : ''}</td><td class="tiny muted">${esc((it.ubic || []).join(', '))}</td><td>${it.fuente === 'silo' ? '<span class="b b-blu">silo</span>' : 'conteo'}</td><td>${it.planear ? '✔' : ''}</td><td><input type="checkbox" data-vt="contar" data-id="${it.id}" ${I.esContable(Object.assign({}, it, { activo: true })) ? 'checked' : ''}></td><td><input type="checkbox" data-vt="solicitar" data-id="${it.id}" ${I.esSolicitable(Object.assign({}, it, { activo: true })) ? 'checked' : ''}></td><td><button class="btn sm" data-ei="${it.id}">Editar</button></td></tr>`; }).join('')}</tbody></table></div>`;
      $$('[data-ei]', el).forEach(b => b.onclick = () => editarItem(b.dataset.ei));
      $$('[data-vt]', el).forEach(c => c.onchange = async () => { await DB.set('catalogo/' + c.dataset.id + '/' + c.dataset.vt, c.checked); I.toast((c.dataset.vt === 'contar' ? 'Conteo' : 'Solicitud') + ': ' + (c.checked ? 'visible' : 'oculto') + ' ✔', 'ok'); });
    }
  };
  const catRows = () => { const q = UI.catQ.toLowerCase(); return items(false).filter(it => (!UI.catFam || it.familia === UI.catFam) && (UI.catAct === '' || (UI.catAct === 'act' ? it.activo !== false : it.activo === false)) && (!q || (I.itemLabel(it) + ' ' + (it.sub || '')).toLowerCase().includes(q))); };
  async function editarItem(id, pre) {
    const it = id ? item(id) : Object.assign({ codigo: '', nombre: '', familia: UI.catFam || 'EMPAQUE', sub: '', unidad: 'PZA', consumo: 0, lt: 0, ss: 0.3, ppp: '', ubic: [], fuente: 'conteo', planear: false, activo: true, nota: '' }, pre || {});
    await I.modal(id ? 'Editar artículo' : 'Nuevo artículo', `<div class="form">
      <label>Código Odoo<input id="it-c" value="${esc(it.codigo)}" ${id ? 'disabled' : ''} placeholder="02SAC001"></label>
      <label class="full">Nombre<input id="it-n" value="${esc(it.nombre)}"></label>
      <label>Familia<select id="it-f">${famOpts(it.familia)}</select></label>
      <label>Tipo / subfamilia<input id="it-s" value="${esc(it.sub || '')}" placeholder="SACO DE LINEA, SACO PROMOCIONAL…"></label>
      <label>Unidad<input id="it-u" value="${esc(it.unidad || '')}"></label>
      <label>Piezas por paca<input id="it-p" class="in-num" value="${it.ppp || ''}"></label>
      <label>Consumo mensual<input id="it-cm" class="in-num" value="${it.consumo || ''}"></label>
      <label>Lead time (meses)<input id="it-lt" class="in-num" value="${it.lt || ''}"></label>
      <label>% stock de seguridad<input id="it-ss" class="in-num" value="${it.ss == null ? 0.3 : it.ss}"></label>
      <label>Se mide por<select id="it-fu"><option value="conteo">Conteo físico</option><option value="silo" ${it.fuente === 'silo' ? 'selected' : ''}>Nivel de silo / tanque</option></select></label>
      <label class="full">Ubicaciones para el conteo (separadas por coma)<input id="it-ub" value="${esc((it.ubic || []).join(', '))}" placeholder="RACK 1 A1, ALM. EXTERNO C1"></label>
      <label class="full">Nota / comentario de compras<input id="it-no" value="${esc(it.nota || '')}"></label>
      <label><input type="checkbox" id="it-pl" ${it.planear ? 'checked' : ''}> Planear compras (proyección y alertas)</label>
      <label>Clase ABC (conteos)<select id="it-abc"><option value="">Automática${it.abc ? ' (hoy ' + it.abc + ')' : ''}</option>${['A', 'B', 'C'].map(c => `<option ${it.abcManual === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label><input type="checkbox" id="it-ac" ${it.activo !== false ? 'checked' : ''}> Activo</label>
      <label><input type="checkbox" id="it-ct" ${I.esContable(Object.assign({}, it, { activo: true })) ? 'checked' : ''}> 📋 Aparece en conteos (app almacén)</label>
      <label><input type="checkbox" id="it-so" ${I.esSolicitable(Object.assign({}, it, { activo: true })) ? 'checked' : ''}> 🏭 Producción lo puede solicitar</label>
    </div>`, [{ t: 'Cancelar' }, {
      t: 'Guardar', c: 'pri', antes: async ov => {
        const codigo = $('#it-c', ov).value.trim().toUpperCase(), nombre = $('#it-n', ov).value.trim().toUpperCase();
        if (!nombre) { I.toast('El nombre es obligatorio', 'err'); return false; }
        const nid = id || keySafe(codigo || nombre);
        if (!id && S.catalogo[nid]) { I.toast('Ya existe un artículo con ese código', 'err'); return false; }
        const o = Object.assign({}, id ? S.catalogo[id] : { orden: 900 + items(false).length }, { codigo, nombre, familia: $('#it-f', ov).value, sub: $('#it-s', ov).value.trim().toUpperCase(), unidad: $('#it-u', ov).value.trim(), ppp: num($('#it-p', ov).value) || null, consumo: num($('#it-cm', ov).value), lt: num($('#it-lt', ov).value), ss: num($('#it-ss', ov).value), fuente: $('#it-fu', ov).value, ubic: $('#it-ub', ov).value.split(',').map(x => x.trim()).filter(Boolean), nota: $('#it-no', ov).value.trim(), planear: $('#it-pl', ov).checked, activo: $('#it-ac', ov).checked, contar: $('#it-ct', ov).checked, solicitar: $('#it-so', ov).checked, abcManual: $('#it-abc', ov).value || null });
        if (o.abcManual) o.abc = o.abcManual;
        if (!o.ubic.length) o.ubic = ['GENERAL'];
        await DB.set('catalogo/' + nid, o);
        if (!id) await I.mov({ tipo: 'catalogo', itemId: nid, nota: 'Alta de artículo en catálogo' });
        I.toast('Artículo guardado ✔', 'ok');
      }
    }]);
  }

  /* ---------- BITÁCORA ---------- */
  const TIPOS = { carga: 'Carga de existencias', entrada: 'Entrada a almacén', transferencia_pt: 'Transferencia a PT', salida_pt: 'Salida PT (Odoo)', ajuste: 'Ajuste manual', conteo: 'Conteo aplicado', silo: 'Niveles de silo', odoo: 'Reporte Odoo', catalogo: 'Catálogo', sistema: 'Sistema', usuario: 'Usuarios' };
  VIEWS.bitacora = {
    mount(el) {
      el.innerHTML = `<div class="card"><div class="card-h"><h2>🧾 Bitácora de movimientos</h2><span class="sp"></span><select id="bi-t" style="max-width:200px"><option value="">Todos los tipos</option>${Object.keys(TIPOS).map(k => `<option value="${k}">${TIPOS[k]}</option>`).join('')}</select><label style="margin:0">Desde <input type="date" id="bi-d" style="width:auto"></label><label style="margin:0">Hasta <input type="date" id="bi-h" style="width:auto"></label><input id="bi-q" placeholder="Buscar…" style="max-width:180px"><button class="btn sm" id="bi-x">Exportar</button></div><div id="bi-l"></div></div>`;
      ['#bi-t', '#bi-d', '#bi-h'].forEach(s => $(s).onchange = () => render(true)); $('#bi-q').oninput = I.debounce(() => render(true), 200);
      $('#bi-x').onclick = () => { const filas = [['Fecha', 'Hora', 'Tipo', 'Artículo', 'Cantidad', 'Antes', 'Después', 'Por', 'Nota']]; biRows().forEach(m => filas.push([m.fecha, fFecha(m.ts), TIPOS[m.tipo] || m.tipo, m.itemId ? lbl(m.itemId) : '', m.cant != null ? m.cant : '', m.antes != null ? m.antes : (m.mdeAntes != null ? m.mdeAntes : ''), m.despues != null ? m.despues : (m.mdeDespues != null ? m.mdeDespues : ''), m.por, m.nota || ''])); I.exportXlsx('Bitacora_' + hoyISO() + '.xlsx', [{ nombre: 'Bitácora', filas }]); };
    },
    update(el) {
      const r = biRows();
      $('#bi-l', el).innerHTML = `<p class="muted small">${r.length} movimientos (se muestran los últimos 2,500 del sistema)</p><div class="tw"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Artículo</th><th class="num">Cantidad</th><th class="num">Antes → después</th><th>Por</th><th>Nota</th></tr></thead><tbody>${r.slice(0, 400).map(m => `<tr><td class="small">${fFecha(m.ts)}</td><td><span class="b ${m.tipo === 'ajuste' ? 'b-amb' : m.tipo === 'entrada' ? 'b-grn' : m.tipo === 'transferencia_pt' ? 'b-blu' : 'b-gry'}">${TIPOS[m.tipo] || m.tipo}</span></td><td class="small">${m.itemId ? esc(lbl(m.itemId)) : (m.items ? vals(m.items).length + ' artículos' : '')}</td><td class="num">${m.cant != null ? fmt(m.cant) : ''}</td><td class="num small">${m.antes != null ? fmt(m.antes) + ' → ' + fmt(m.despues) : m.mdeAntes != null ? 'Alm. ' + fmt(m.mdeAntes) + ' → ' + fmt(m.mdeDespues) : ''}</td><td class="small">${esc(m.por || '')}</td><td class="small">${esc(m.nota || '')}</td></tr>`).join('')}</tbody></table></div>`;
    }
  };
  const biRows = () => { const t = $('#bi-t') && $('#bi-t').value, d = $('#bi-d') && $('#bi-d').value, h = $('#bi-h') && $('#bi-h').value, q = ($('#bi-q') && $('#bi-q').value || '').toLowerCase(); return vals(S.movimientos).filter(m => (!t || m.tipo === t) && (!d || m.fecha >= d) && (!h || m.fecha <= h) && (!q || ((m.itemId ? lbl(m.itemId) : '') + ' ' + (m.nota || '') + ' ' + (m.por || '')).toLowerCase().includes(q))).sort((a, b) => b.ts - a.ts); };

  /* ---------- USUARIOS (master) ---------- */
  VIEWS.usuarios = {
    mount(el) {
      el.innerHTML = `<div class="card"><div class="card-h"><h2>👥 Usuarios</h2></div>
        <div class="form"><label>Nombre<input id="us-n"></label><label>Usuario (para entrar)<input id="us-u" autocapitalize="none"></label><label>Contraseña inicial (mín. 6)<input id="us-p"></label><label>Rol<select id="us-r">${Object.keys(I.ROLES).map(r => `<option value="${r}">${I.ROLES[r].nombre}</option>`).join('')}</select></label></div>
        <div class="row"><span class="muted small grow" id="us-desc"></span><button class="btn pri" id="us-b">Crear usuario</button></div></div>
        <div class="card"><div id="us-l"></div></div>`;
      const d = () => $('#us-desc').textContent = I.ROLES[$('#us-r').value].desc + (($('#us-r').value === 'almacenista') ? ' → almacen.html' : $('#us-r').value === 'produccion' ? ' → produccion.html' : ' → index.html');
      $('#us-r').onchange = d; d();
      $('#us-b').onclick = async () => {
        const o = { nombre: $('#us-n').value.trim(), usuario: $('#us-u').value.trim().toLowerCase(), pass: $('#us-p').value, rol: $('#us-r').value };
        if (!o.nombre || !/^[a-z0-9._-]{3,}$/.test(o.usuario)) return I.toast('Nombre y usuario (mín. 3 letras, sin espacios) son obligatorios', 'err');
        if (o.pass.length < 6) return I.toast('La contraseña debe tener al menos 6 caracteres', 'err');
        try { await AUTH.crearUsuario(o); await I.mov({ tipo: 'usuario', nota: 'Alta de usuario ' + o.usuario + ' (' + I.ROLES[o.rol].nombre + ')' }); I.toast('Usuario creado ✔', 'ok'); ['#us-n', '#us-u', '#us-p'].forEach(s => $(s).value = ''); } catch (e) { I.toast(e.message, 'err'); }
      };
    },
    update(el) {
      const us = vals(S.usuarios).sort((a, b) => String(a.rol).localeCompare(b.rol) || String(a.nombre).localeCompare(b.nombre));
      $('#us-l', el).innerHTML = `<div class="tw"><table><thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Estado</th><th>Alta</th><th></th></tr></thead><tbody>${us.map(u => `<tr style="${u.activo === false ? 'opacity:.5' : ''}"><td><b>${esc(u.nombre)}</b></td><td class="mono">${esc(u.usuario)}</td><td><select data-ur="${u._k}" ${u._k === USER.uid ? 'disabled' : ''}>${Object.keys(I.ROLES).map(r => `<option value="${r}" ${u.rol === r ? 'selected' : ''}>${I.ROLES[r].nombre}</option>`).join('')}</select></td><td>${u.activo === false ? '<span class="b b-red">desactivado</span>' : '<span class="b b-grn">activo</span>'}</td><td class="tiny muted">${fFecha(u.creado)}</td><td>${u._k !== USER.uid ? `<button class="btn sm" data-ua="${u._k}">${u.activo === false ? 'Activar' : 'Desactivar'}</button> <button class="btn sm" data-up="${u._k}">Restablecer contraseña</button>` : '<span class="muted small">tú</span>'}</td></tr>`).join('')}</tbody></table></div>`;
      $$('[data-ur]', el).forEach(s => s.onchange = async () => { await DB.set('usuarios/' + s.dataset.ur + '/rol', s.value); I.toast('Rol actualizado ✔', 'ok'); });
      $$('[data-ua]', el).forEach(b => b.onclick = async () => { const u = S.usuarios[b.dataset.ua]; await DB.set('usuarios/' + b.dataset.ua + '/activo', u.activo === false); await I.mov({ tipo: 'usuario', nota: (u.activo === false ? 'Activó' : 'Desactivó') + ' al usuario ' + u.usuario }); });
      $$('[data-up]', el).forEach(b => b.onclick = async () => {
        const u = S.usuarios[b.dataset.up];
        await I.modal('Restablecer contraseña', `<p>Usuario <b>${esc(u.usuario)}</b></p><label>Nueva contraseña (mín. 6)<input id="rp"></label>${I.DEMO ? '' : '<p class="muted small">Requiere las Cloud Functions desplegadas (ver guía).</p>'}`, [{ t: 'Cancelar' }, { t: 'Guardar', c: 'pri', antes: async ov => { const p = $('#rp', ov).value; if (p.length < 6) { I.toast('Mínimo 6 caracteres', 'err'); return false; } try { if (I.DEMO) await DB.set('usuarios/' + b.dataset.up + '/_demoPass', p); else await I.fn('invAdmin', { accion: 'password', uid: b.dataset.up, pass: p }); I.toast('Contraseña restablecida ✔', 'ok'); } catch (e) { I.toast(e.message, 'err'); return false; } } }]);
      });
    }
  };

  /* ---------- IA (solo master) ---------- */
  const CHAT = [];
  VIEWS.ia = {
    mount(el) {
      el.innerHTML = `<div class="grid g2" style="align-items:start">
        <div class="card"><div class="card-h"><h2>🔎 Hallazgos automáticos</h2><span class="muted small">reglas locales, sin costo</span></div><div id="ia-h"></div></div>
        <div class="card"><div class="card-h"><h2>🤖 Pregúntale a la IA</h2><span class="sp"></span><select id="ia-m" style="max-width:190px"><option value="haiku">Rápida (económica)</option><option value="sonnet">Analítica (más profunda)</option></select></div>
          <p class="muted small">Responde con los datos del sistema: físico, alertas, conteos, diferencias vs Odoo, transferencias, ajustes y bitácora reciente. Solo el master la usa.</p>
          <div class="row" style="margin-bottom:8px;gap:6px">${['Detecta anomalías en los movimientos y ajustes recientes', '¿Qué debo comprar esta semana y por qué?', '¿Qué artículos tienen diferencias recurrentes contra Odoo?', 'Resume el estado del almacén PT y el consumo de producción'].map(q => `<button class="btn sm" data-qq="${esc(q)}">${esc(q)}</button>`).join('')}</div>
          <div class="chat" id="ia-c"></div>
          <div class="row" style="margin-top:8px"><input id="ia-q" class="grow" placeholder="Escribe tu pregunta…"><button class="btn pri" id="ia-b">Preguntar</button></div></div></div>`;
      $('#ia-m').value = UI.iaModelo; $('#ia-m').onchange = e => UI.iaModelo = e.target.value;
      const ask = async q => {
        q = (q || $('#ia-q').value).trim(); if (!q) return; $('#ia-q').value = '';
        CHAT.push({ r: 'u', t: q }, { r: 'a', t: '…pensando' }); drawChat();
        try { const j = await I.fn('invAsk', { question: q, model: UI.iaModelo, context: contextoIA(), history: CHAT.slice(-8, -2).map(m => ({ role: m.r === 'u' ? 'user' : 'assistant', content: m.t })) }); CHAT[CHAT.length - 1].t = j.answer; }
        catch (e) { CHAT[CHAT.length - 1].t = '⚠ ' + e.message; }
        drawChat();
      };
      $('#ia-b').onclick = () => ask(); $('#ia-q').onkeydown = e => { if (e.key === 'Enter') ask(); };
      $$('[data-qq]').forEach(b => b.onclick = () => ask(b.dataset.qq));
      drawChat();
    },
    update(el) { $('#ia-h', el).innerHTML = hallazgos().map(h => `<div class="row" style="padding:7px 0;border-bottom:1px solid var(--line);align-items:flex-start"><span class="b ${h.n === 'alta' ? 'b-red' : h.n === 'media' ? 'b-amb' : 'b-blu'}">${h.n}</span><div class="grow"><b>${esc(h.t)}</b><div class="small muted">${h.d}</div></div></div>`).join('') || '<div class="empty">Sin hallazgos relevantes 👍</div>'; }
  };
  function drawChat() { const c = $('#ia-c'); if (!c) return; c.innerHTML = CHAT.length ? CHAT.map(m => `<div class="msg ${m.r}">${esc(m.t)}</div>`).join('') : '<div class="empty small">Haz una pregunta o usa uno de los atajos.</div>'; c.scrollTop = c.scrollHeight; }
  function hallazgos() {
    const H = [], now = Date.now();
    items(true).forEach(it => { const f = F(it.id); if (f.mde < 0) H.push({ n: 'alta', t: 'Existencia negativa en ' + I.almacen(it.familia).cod + ': ' + it.nombre, d: I.almacen(it.familia).cod + ' = ' + fmt(f.mde) + ' ' + esc(it.unidad) + '. Revisa transferencias a PT sin entrada registrada.' }); if (f.pt < 0) H.push({ n: 'alta', t: 'Existencia negativa en PT: ' + it.nombre, d: 'PT = ' + fmt(f.pt) }); });
    if (S.odoo) odRows().filter(r => r.d != null && Math.abs(r.val || 0) > 5000 && Math.abs(r.pct || 0) > 5).sort((a, b) => Math.abs(b.val) - Math.abs(a.val)).slice(0, 8).forEach(r => H.push({ n: Math.abs(r.val) > 50000 ? 'alta' : 'media', t: 'Diferencia vs Odoo: ' + r.it.nombre, d: 'Físico ' + fmt(r.fis) + ' vs teórico ' + fmt(r.q) + ' (' + fmt(r.pct) + '%, ' + money(r.val) + ')' }));
    vals(S.entregas).filter(e => ['por_recibir', 'recibida'].includes(I.estadoEntrega(e)) && now - e.ts > 86400000).forEach(e => H.push({ n: 'media', t: (I.estadoEntrega(e) === 'recibida' ? 'Entrega recibida por producción sin aceptar desde ' : 'Entrega sin confirmar por producción desde ') + fFecha(e.ts), d: esc(e.por && e.por.nombre) + ': ' + lineasTxt(e.lineas) }));
    vals(S.entregas).filter(e => e.solicitudId && S.solicitudes[e.solicitudId] && now - e.ts < 14 * 86400000).forEach(e => { const sol = S.solicitudes[e.solicitudId]; const sm = {}; vals(sol.lineas).forEach(l => sm[l.itemId] = (sm[l.itemId] || 0) + num(l.cant)); vals(e.lineas).forEach(l => { const s_ = sm[l.itemId]; if (s_ && Math.abs(num(l.cant) - s_) / s_ > 0.1) H.push({ n: 'baja', t: 'Entrega distinta a lo solicitado: ' + item(l.itemId).nombre, d: 'Solicitó ' + fmt(s_) + ', entregó ' + fmt(l.cant) + ' (' + fFecha(e.ts) + ')' }); }); });
    vals(S.entregas).filter(e => e.recepcion && e.recepcion.diferencia && now - e.ts < 14 * 86400000).forEach(e => H.push({ n: 'media', t: 'Producción reportó diferencia al recibir (' + fFecha(e.ts) + ')', d: esc(e.recepcion.nombre || '') + ': ' + esc(e.recepcion.nota || '') }));
    const ult = vals(S.ptCortes).sort((a, b) => b.ts - a.ts); if (ult.length >= 1) { const c = ult[0], prev = ult[1]; const dias = prev ? Math.max(1, (c.ts - prev.ts) / 86400000) : 1; vals(c.items).forEach(x => { const it = item(x._k); const esp = num(it.consumo) / 30 * dias; if (esp > 0 && x.salida > esp * 2) H.push({ n: 'media', t: 'Consumo de PT fuera de lo normal: ' + it.nombre, d: 'Salida ' + fmt(x.salida) + ' en ' + fmt(dias, 0) + ' día(s) vs ~' + fmt(esp) + ' esperado' }); if (x.salida < 0) H.push({ n: 'media', t: 'Odoo PT mayor que lo transferido: ' + it.nombre, d: 'Diferencia ' + fmt(x.salida) + '. Posible transferencia no capturada.' }); }); }
    vals(S.silos).forEach(s => { const c = I.calcSilo(s, S.silosLect[s._k]); if (c.contenido != null && c.caben < 0) H.push({ n: 'media', t: 'Lectura de silo fuera de rango: ' + s.nombre, d: 'Contenido mayor a la capacidad.' }); const l = S.silosLect[s._k]; if (l && now - l.ts > 3 * 86400000) H.push({ n: 'baja', t: 'Silo sin lectura reciente: ' + s.nombre, d: 'Última lectura ' + fFecha(l.ts) }); });
    const aj = vals(S.movimientos).filter(m => m.tipo === 'ajuste' && now - m.ts < 7 * 86400000); if (aj.length) H.push({ n: aj.length > 5 ? 'media' : 'baja', t: aj.length + ' ajustes manuales en los últimos 7 días', d: aj.slice(0, 5).map(m => esc(item(m.itemId).nombre) + ' (' + fmt(m.cant) + ', ' + esc(m.por) + ')').join(' · ') });
    vals(S.conteos).filter(c => c.estado === 'confirmado' && now - (c.confirmadoTs || 0) > 2 * 86400000).forEach(c => H.push({ n: 'media', t: 'Conteo confirmado sin revisar', d: 'Del ' + fDia(c.fecha) + ' por ' + esc(c.almacenista && c.almacenista.nombre) }));
    const pend = entregasValidadas().filter(e => !e.odoo && now - (e.valTs || 0) > 2 * 86400000).length; if (pend) H.push({ n: 'media', t: pend + ' transferencias a PT sin reflejar en Odoo (más de 2 días)', d: 'Márcalas en Transferencias a PT cuando las captures en Odoo.' });
    return H.sort((a, b) => ({ alta: 0, media: 1, baja: 2 }[a.n] - { alta: 0, media: 1, baja: 2 }[b.n]));
  }
  function contextoIA() {
    const al = alertas().map(a => ({ art: a.it.nombre, cod: a.it.codigo, fam: a.it.familia, fis: Math.round(a.fis), cons: a.cons, lt_dias: a.ltd, min: Math.round(a.min), alcance: isFinite(a.alcance) ? Math.round(a.alcance) : null, fincado: a.tr.fincado, status: a.status, crit: a.crit, sugerido: Math.round(a.sugerido), quiebre: a.p.quiebre }));
    const dif = S.odoo ? odRows().filter(r => r.d && Math.abs(r.d) > 0.5).map(r => ({ art: r.it.nombre, fis: r.fis, odoo: r.q, dif: r.d, pct: r.pct && Math.round(r.pct * 10) / 10, $: r.val && Math.round(r.val) })) : [];
    const mov = vals(S.movimientos).sort((a, b) => b.ts - a.ts).slice(0, 250).map(m => ({ f: m.fecha, t: m.tipo, art: m.itemId ? item(m.itemId).nombre : undefined, q: m.cant, por: m.por, nota: m.nota || undefined, antes: m.antes, desp: m.despues }));
    const ent = vals(S.entregas).sort((a, b) => b.ts - a.ts).slice(0, 60).map(e => ({ f: e.fecha, est: e.estado, por: e.por && e.por.nombre, valido: e.validado && e.validado.nombre, odoo: !!e.odoo, lineas: vals(e.lineas).map(l => [item(l.itemId).nombre, l.cant, l.cantValidada]) }));
    const conteos = vals(S.conteos).sort((a, b) => b.inicio - a.inicio).slice(0, 6).map(c => ({ f: c.fecha, est: c.estado, por: c.almacenista && c.almacenista.nombre, difs: c.revision ? vals(c.revision).filter(r => r.dif).map(r => [item(r._k).nombre, r.dif, r.val && Math.round(r.val), r.nota || '']) : undefined }));
    const pt = items(true).filter(it => F(it.id).pt).map(it => [it.nombre, F(it.id).pt]);
    const cortes = vals(S.ptCortes).sort((a, b) => b.ts - a.ts).slice(0, 6).map(c => ({ f: c.fecha, salidas: vals(c.items).filter(x => x.salida).map(x => [item(x._k).nombre, x.salida]) }));
    const silos = vals(S.silos).map(s => { const c = I.calcSilo(s, S.silosLect[s._k]); return [s.nombre, c.contenido && Math.round(c.contenido * 10) / 10, c.capacidad && Math.round(c.capacidad)]; });
    return { fecha: hoyISO(), odoo: S.odoo ? { fecha: S.odoo.fecha, alcance: S.odoo.alcance } : null, alertas: al, diferencias_odoo: dif.slice(0, 80), movimientos_recientes: mov, entregas_pt: ent, conteos, almacen_pt: pt, cortes_pt: cortes, silos_ton: silos, hallazgos_locales: hallazgos().map(h => h.t + ': ' + h.d.replace(/<[^>]+>/g, '')) };
  }

  /* ---------- CONFIGURACIÓN (master) ---------- */
  async function activarPush() {
    if (I.DEMO || !I.CFG.VAPID_KEY) return I.toast('No disponible', 'err');
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !(window.firebase && firebase.messaging)) return I.toast('Este navegador no soporta notificaciones (en iPhone agrega primero el programa a la pantalla de inicio)', 'err');
    const p = await Notification.requestPermission(); if (p !== 'granted') return I.toast('Permiso de notificaciones denegado', 'err');
    try {
      const reg = await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready;
      const tok = await firebase.messaging(I.app).getToken({ vapidKey: I.CFG.VAPID_KEY, serviceWorkerRegistration: reg });
      if (!tok) throw new Error('el navegador no entregó token');
      await DB.set('tokens/' + USER.uid + '/' + tok.slice(-24).replace(/[.#$\[\]\/]/g, '_'), { token: tok, ts: Date.now(), ua: navigator.userAgent.slice(0, 120) });
      I.toast('Avisos activados en este dispositivo ✔', 'ok');
    } catch (e) { I.toast('No se pudo activar: ' + e.message, 'err'); }
  }
  VIEWS.config = {
    mount(el) {
      el.innerHTML = `<div class="grid g2" style="align-items:start">
      <div class="card"><div class="card-h"><h2>🔔 Recordatorio a producción</h2></div>
        <p class="muted small">Producción recibe una notificación para capturar su solicitud de empaque e insumos. Requiere las Cloud Functions (guía de despliegue); mientras tanto la app de producción muestra el recordatorio al abrirla.</p>
        <div class="form"><label>Hora<input id="cf-h" type="time"></label><label><input type="checkbox" id="cf-a"> Activo</label></div>
        <div class="row">${['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((d, i) => `<label style="margin:0"><input type="checkbox" data-dw="${i}"> ${d}</label>`).join('')}</div>
        <div class="row" style="margin-top:10px"><button class="btn pri" id="cf-s">Guardar</button><button class="btn" id="cf-t">Enviar notificación de prueba</button></div></div>
      <div class="card"><div class="card-h"><h2>🧪 Motivos de calidad de silos</h2></div>
        <p class="muted small">Uno por renglón. "OK" siempre va primero. Cualquier motivo distinto de OK exige nota.</p>
        <textarea id="cf-cq" rows="9" style="width:100%"></textarea>
        <div class="row" style="margin-top:8px"><button class="btn pri" id="cf-cqs">Guardar motivos</button><button class="btn" id="cf-cqd">Restaurar sugeridos</button></div></div>
      <div class="card"><div class="card-h"><h2>🚨 Avisos al master</h2></div>
        <p class="muted small">Te llega una notificación cuando alguien registra un ajuste manual o se aplica un conteo con diferencias mayores a estos límites (basta con que se cumpla uno). Activa los avisos en cada dispositivo donde los quieras recibir; en iPhone primero agrega el programa a la pantalla de inicio.</p>
        <div class="form"><label>Diferencia mínima ($)<input id="av-m" class="in-num"></label><label>Diferencia mínima (%)<input id="av-p" class="in-num"></label><label><input type="checkbox" id="av-a"> Activo</label></div>
        <div class="row" style="margin-top:8px"><button class="btn pri" id="av-s">Guardar</button><button class="btn" id="av-n">🔔 Activar en este dispositivo</button><button class="btn" id="av-t">Enviar aviso de prueba</button></div></div>
      <div class="card"><div class="card-h"><h2>📦 Catálogo inicial</h2></div><div id="cf-seed"></div></div>
      <div class="card"><div class="card-h"><h2>🔐 Licencia y conexión</h2></div><div id="cf-lic" class="small"></div></div>
      </div>`;
      $('#cf-s').onclick = async () => { await DB.update({ 'config/recordatorio/hora': $('#cf-h').value || '08:00', 'config/recordatorio/activo': $('#cf-a').checked, 'config/recordatorio/dias': $$('[data-dw]').filter(c => c.checked).map(c => +c.dataset.dw) }); I.toast('Guardado ✔', 'ok'); };
      $('#cf-t').onclick = async () => { try { const j = await I.fn('invAdmin', { accion: 'notifPrueba' }); I.toast('Enviada a ' + (j.enviados || 0) + ' dispositivo(s)', 'ok'); } catch (e) { I.toast(e.message, 'err'); } };
      const av = Object.assign({ monto: 10000, pct: 20, activo: true }, S.config.avisoAjuste || {});
      $('#av-m').value = av.monto; $('#av-p').value = av.pct; $('#av-a').checked = av.activo !== false;
      $('#av-s').onclick = async () => { await DB.set('config/avisoAjuste', { monto: num($('#av-m').value), pct: num($('#av-p').value), activo: $('#av-a').checked }); I.toast('Guardado ✔', 'ok'); };
      $('#av-n').onclick = activarPush;
      $('#av-t').onclick = async () => { try { const j = await I.fn('invAvisoPrueba', {}); I.toast('Enviado a ' + (j.enviados || 0) + ' dispositivo(s)', j.enviados ? 'ok' : 'err'); } catch (e) { I.toast(e.message, 'err'); } };
      $('#cf-cq').value = I.calidades(S.config).join('\n');
      $('#cf-cqs').onclick = async () => { const l = $('#cf-cq').value.split('\n').map(x => x.trim().toUpperCase()).filter(Boolean).filter(x => x !== 'OK'); await DB.set('config/calidadSilo', ['OK'].concat([...new Set(l)])); I.toast('Motivos guardados ✔', 'ok'); };
      $('#cf-cqd').onclick = () => { $('#cf-cq').value = I.CALIDAD_SILO.join('\n'); };
      const r = S.config.recordatorio || { hora: '08:00', activo: true, dias: [1, 2, 3, 4, 5, 6] };
      $('#cf-h').value = r.hora; $('#cf-a').checked = r.activo !== false; $$('[data-dw]').forEach(c => c.checked = (r.dias || []).includes(+c.dataset.dw));
    },
    update(el) {
      const n = Object.keys(S.catalogo).length;
      $('#cf-seed', el).innerHTML = `<p class="small">Artículos en catálogo: <b>${n}</b>${S.meta.seed ? ' · carga inicial ' + fFecha(S.meta.seed.ts) : ''}</p>
        <p class="muted small">La carga inicial trae el catálogo por familias, ubicaciones, consumos y lead times de tu "Control de Empaque", la existencia física y el almacén PT de "Inventario Mascotas", los silos y densidades del SCADA, los pedidos fincados/por comprar de tu Proyección y el reporte de Odoo.</p>
        <div class="row"><button class="btn pri" id="cf-l0">📥 Cargar existencias actuales</button><button class="btn" id="cf-l1">Cargar catálogo + saldos iniciales</button><button class="btn" id="cf-l2">Solo catálogo</button>${I.DEMO ? '<button class="btn danger" id="cf-rst">Reiniciar datos demo</button>' : ''}</div>`;
      $('#cf-l0', el).onclick = async () => { try { const k = await I.cargarSemilla(true); if (k) I.toast('Existencias cargadas ✔', 'ok'); } catch (e) { I.toast(e.message, 'err'); } };
      $('#cf-l1', el).onclick = async () => { if (await I.confirmar('Carga inicial', n ? 'Ya hay datos. Se <b>sobrescribirán</b> catálogo, físico, PT, silos, llegadas y Odoo con los de tus Excel. ¿Continuar?' : 'Se cargará el catálogo y los saldos de tus Excel.')) { await I.cargarSemilla(true); I.toast('Carga inicial lista ✔', 'ok'); } };
      $('#cf-l2', el).onclick = async () => { if (await I.confirmar('Cargar solo catálogo', 'Se actualizará el catálogo, silos y densidades sin tocar existencias.')) { await I.cargarSemilla(false); I.toast('Catálogo cargado ✔', 'ok'); } };
      const rst = $('#cf-rst', el); if (rst) rst.onclick = async () => { if (await I.confirmar('Reiniciar demo', 'Se borrarán todos los datos de prueba de este navegador.')) { DB._reset(); location.reload(); } };
      $('#cf-lic', el).innerHTML = I.DEMO ? '<div class="warn">Modo demo: no hay base en línea ni licencia. Sigue la guía LEEME_DESPLIEGUE.md para conectar.</div>' : `<p>Base: <span class="mono">${esc(I.CFG.FIREBASE.databaseURL)}</span></p><p>Interruptores en tu Panel de Licencia:</p><ul>${Object.entries(I.CFG.LICENCIA.apps).map(([k, v]) => `<li><span class="mono">licencia/apps/${esc(v)}</span> — ${k === 'principal' ? 'Programa principal' : k === 'almacen' ? 'App almacenista' : 'App producción'}</li>`).join('')}</ul><p>Cloud Functions: ${I.CFG.FUNCTIONS_URL ? '<span class="b b-grn">configuradas</span>' : '<span class="b b-amb">pendientes</span>'}</p>`;
    }
  };
})();
