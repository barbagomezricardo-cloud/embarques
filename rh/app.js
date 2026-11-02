/* =====================================================================
   PROGRAMA PRINCIPAL — Recursos Humanos 19 Hermanos
   Master · RH · Dirección · Jefes de área
   ===================================================================== */
(async function () {
  'use strict';
  const I = RH, { $, $$, esc, num, fmt, fDia, fDiaL, fFecha, hm, minTxt, hTxt, vals, addDias, difDias } = I;
  const app = $('#app');
  try { await I.start({ appKey: 'principal' }); } catch (e) { return; }
  const DB = I.DB;

  const UI = { tab: 'tablero', semana: null, depto: '', q: '', est: 'activo', autF: 'pend', vacMes: I.hoyISO().slice(0, 7), heSem: null, preSem: null, iaModelo: 'haiku' };
  try { Object.assign(UI, JSON.parse(localStorage.getItem('rh19_ui') || '{}'), { tab: UI.tab }); } catch (e) { }
  const guardaUI = () => { try { localStorage.setItem('rh19_ui', JSON.stringify({ depto: UI.depto, est: UI.est, iaModelo: UI.iaModelo })); } catch (e) { } };
  let D = null, X = null, U = null, off = null, CHAT = [];

  const ADM = () => U && (U.rol === 'master' || U.rol === 'rh');
  const MASTER = () => U && U.rol === 'master';
  const TABS = [
    { id: 'tablero', t: 'Tablero', r: ['master', 'rh', 'director', 'jefe'] },
    { id: 'plantilla', t: 'Plantilla', r: ['master', 'rh', 'director', 'jefe'] },
    { id: 'asistencias', t: 'Asistencias', r: ['master', 'rh', 'jefe', 'director'] },
    { id: 'autorizaciones', t: 'Autorizaciones', r: ['master', 'rh', 'director', 'jefe'] },
    { id: 'vacaciones', t: 'Vacaciones', r: ['master', 'rh', 'director', 'jefe'] },
    { id: 'extra', t: 'Tiempo extra', r: ['master', 'rh', 'jefe'] },
    { id: 'rotacion', t: 'Rotación', r: ['master', 'rh', 'director'] },
    { id: 'prenomina', t: 'Prenómina', r: ['master', 'rh'] },
    { id: 'anomalias', t: 'Anomalías e IA', r: ['master', 'rh'] },
    { id: 'usuarios', t: 'Usuarios y accesos', r: ['master', 'rh'] },
    { id: 'config', t: 'Configuración', r: ['master', 'rh'] }
  ];

  /* ------------------------------------------------------------ sesión */
  I.AUTH.onChange(u => {
    if (off) { off(); off = null; }
    if (!u || u.bloqueado || u.sinPerfil || !u.rol) {
      U = null;
      I.pantallaLogin(app, { titulo: 'Recursos Humanos', permitirMaster: true, icono: '👥' });
      if (u && u.bloqueado) $('#lg-e').textContent = 'Tu usuario está desactivado.';
      if (u && u.sinPerfil) $('#lg-e').textContent = 'Tu usuario no tiene perfil en RH. Pide al master que te dé de alta.';
      return;
    }
    if (u.rol === 'empleado') { location.href = 'empleado.html' + location.search; return; }
    if (u.rol === 'kiosco') { location.href = 'checador.html' + location.search; return; }
    U = u;
    if (!TABS.find(t => t.id === UI.tab && t.r.includes(U.rol))) UI.tab = 'tablero';
    const nodos = ['config', 'empleados', 'solicitudes', 'he', 'ajustesVac', 'cierres', 'checadas'];
    if (ADM()) nodos.push('privado', 'bitacora');
    if (ADM()) nodos.push('usuarios');
    shell();
    off = I.suscribir(nodos, addDias(I.hoyISO(), -75), d => { D = d; X = I.indices(D); render(); });
  });

  /* ------------------------------------------------------------ helpers de datos */
  const C = () => D.C;
  const emps = (todos) => vals(D.empleados).filter(e => todos || e.estatus !== 'baja');
  const visibles = (todos) => { let l = emps(todos); if (U.rol === 'jefe') l = l.filter(e => (U.deptos || []).includes(e.depto)); return l; };
  const emp = id => D.empleados && D.empleados[id] ? Object.assign({ _k: id }, D.empleados[id]) : null;
  const nomE = id => { const e = emp(id); return e ? e.nombre : id; };
  const ord = l => l.sort((a, b) => (I.DEPTOS_DEF.indexOf(a.depto) - I.DEPTOS_DEF.indexOf(b.depto)) || String(a.nombre).localeCompare(b.nombre));
  const deptosUsados = () => { const s = new Set(emps(true).map(e => e.depto)); return C().deptos.filter(d => s.has(d)).concat([...s].filter(d => !C().deptos.includes(d))); };
  const tipoN = t => t === 'HE' ? 'Tiempo extra' : ((C().tipos[t] || {}).nombre || t);
  const ESTADO_CLS = { pendiente: 'b-amb', aprobada: 'b-grn', rechazada: 'b-red', cancelada: 'b-gry' };
  const ROL_TXT = { jefe: 'Jefe de área', director: 'Dirección', rh: 'RH' };
  const optDeptos = (sel, todos) => (todos ? '<option value="">Todos los departamentos</option>' : '') + deptosUsados().filter(d => U.rol !== 'jefe' || (U.deptos || []).includes(d)).map(d => `<option ${d === sel ? 'selected' : ''}>${esc(d)}</option>`).join('');
  const optEmps = (sel, lista) => (lista || ord(visibles())).map(e => `<option value="${e._k}" ${e._k === sel ? 'selected' : ''}>${esc(e.nombre)} · ${esc(e.depto)}</option>`).join('');
  const semanaActual = () => I.semana(I.hoyISO(), C());
  const cerrada = semKey => D.cierres && D.cierres[semKey];

  /* Pendientes que este usuario puede autorizar */
  function cola() {
    const out = [];
    Object.keys(D.solicitudes || {}).forEach(eid => Object.keys(D.solicitudes[eid] || {}).forEach(id => {
      const s = D.solicitudes[eid][id]; if (s.estado !== 'pendiente') return; const e = emp(eid); if (!e) return;
      const i = I.pasoActual(s); if (i >= 0 && I.puedePaso(U, s.pasos[i], e)) out.push({ k: 'sol', eid, id, s, e });
    }));
    Object.keys(D.he || {}).forEach(eid => Object.keys(D.he[eid] || {}).forEach(id => {
      const s = D.he[eid][id]; if (s.estado !== 'pendiente') return; const e = emp(eid); if (!e) return;
      const i = I.pasoActual(s); if (i >= 0 && I.puedePaso(U, s.pasos[i], e)) out.push({ k: 'he', eid, id, s, e });
    }));
    return out.sort((a, b) => (a.s.desde || a.s.fecha || '').localeCompare(b.s.desde || b.s.fecha || ''));
  }

  /* ------------------------------------------------------------ armazón */
  function shell() {
    app.innerHTML = `
    ${I.DEMO ? '<div class="demo-bar">MODO DEMO · datos de ejemplo con nombres ficticios · <a href="#" id="demo-rst">reiniciar demo</a> · <a href="checador.html?demo=1">checador</a> · <a href="empleado.html?demo=1">portal empleado</a> (No. 1013 · NIP 123456)</div>' : ''}
    <header class="top"><div class="top-in">
      <div class="brand"><div class="sello"><img src="img/logo-19h.png" alt="Los 19 Hermanos"></div><div class="sello"><img src="img/logo-petfood.png" alt="División Pet Food"></div><div><b>Recursos Humanos</b><small>${esc(I.CFG.EMPRESA || '')}</small></div></div>
      <span class="sp"></span>
      <span class="chip" title="${esc(I.ROLES[U.rol].desc)}"><b>${esc(U.nombre)}</b> · ${esc(I.ROLES[U.rol].nombre)}</span>
      <button class="btn sm ghost" id="b-pass">Contraseña</button>
      <button class="btn sm" id="b-out">Salir</button>
    </div><div class="estrellas" aria-hidden="true">★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★</div><nav class="nav" id="nav"></nav></header>
    <main id="main"><div class="empty">Cargando…</div></main>`;
    $('#b-out').onclick = () => I.AUTH.logout();
    $('#b-pass').onclick = cambiarPass;
    if ($('#demo-rst')) $('#demo-rst').onclick = e => { e.preventDefault(); I.resetDemo(); };
  }
  function nav() {
    const n = cola().length;
    $('#nav').innerHTML = TABS.filter(t => t.r.includes(U.rol)).map(t => `<button data-t="${t.id}" class="${UI.tab === t.id ? 'on' : ''}">${esc(t.id === 'usuarios' && !MASTER() ? 'Accesos' : t.t)}${t.id === 'autorizaciones' && n ? `<span class="cnt">${n}</span>` : ''}</button>`).join('');
    $$('#nav button').forEach(b => b.onclick = () => { UI.tab = b.dataset.t; render(); window.scrollTo(0, 0); });
  }
  const VISTAS = {};
  function render() {
    if (!D || !U) return;
    nav();
    const m = $('#main'); const y = window.scrollY;
    try { (VISTAS[UI.tab] || VISTAS.tablero)(m); } catch (e) { console.error(e); m.innerHTML = '<div class="card warn">Error al mostrar esta sección: ' + esc(e.message) + '</div>'; }
    window.scrollTo(0, y);
  }
  async function cambiarPass() {
    await I.modal('Cambiar contraseña', '<label>Nueva contraseña (mín. 6)<input id="np" type="password"></label>', [{ t: 'Cancelar' }, { t: 'Guardar', c: 'pri', antes: async ov => { const p = $('#np', ov).value; if (p.length < 6) { I.toast('Mínimo 6 caracteres', 'err'); return false; } try { await I.AUTH.cambiarPass(p); I.toast('Contraseña actualizada ✔', 'ok'); } catch (e) { I.toast(e.message, 'err'); return false; } } }]);
  }
  const kpi = (l, v, s, cls) => `<div class="kpi ${cls || ''}"><div class="l">${esc(l)}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;

  /* ============================================================ TABLERO */
  VISTAS.tablero = function (m) {
    const hoy = I.hoyISO(), L = visibles();
    const H = L.map(e => ({ e, r: I.calcDia(e, hoy, D, X) }));
    const cuenta = st => H.filter(x => st.includes(x.r.estado)).length;
    const presentes = cuenta(['ok', 'retardo', 'desclab', 'festlab']), ret = cuenta(['retardo']), sin = H.filter(x => x.r.estado === 'sinchecar');
    const inc = H.filter(x => x.r.estado === 'inc'), prog = H.filter(x => x.r.h && x.r.estado !== 'na' && !x.r.fer).length;
    const plazas = Object.values(C().plazas || {}).reduce((a, v) => a + num(v), 0);
    const rot = I.rotacion(emps(true).filter(e => U.rol !== 'jefe' || (U.deptos || []).includes(e.depto)), Array.from({ length: 12 }, (_, i) => I.addMes(hoy.slice(0, 7), i - 11)));
    const mesAct = rot.serie[rot.serie.length - 1];
    const sem = semanaActual(); const HE = L.reduce((a, e) => a + I.calcSemana(e, sem, D, X).t.hePag, 0);
    const n = cola().length;
    // asistencia 14 días
    const serie = []; for (let i = 13; i >= 0; i--) { const f = addDias(hoy, -i); let p = 0, t = 0; L.forEach(e => { const r = I.calcDia(e, f, D, X); if (['ok', 'retardo', 'falta', 'sinchecar'].includes(r.estado)) { t++; if (r.estado === 'ok' || r.estado === 'retardo') p++; } }); serie.push({ l: I.DIAS[I.parseISO(f).getDay()].slice(0, 2) + ' ' + (+f.slice(8)), v: t ? Math.round(p / t * 1000) / 10 : 0, c: t && p / t < 0.9 ? 'var(--amb)' : 'var(--grn)' }); }
    const prox = []; L.forEach(e => { for (let i = 1; i <= 7; i++) { const f = addDias(hoy, i); const s = X.solIdx[e._k] && X.solIdx[e._k][f]; if (s && s.tipo === 'VAC' && s.desde === f) prox.push({ e, s }); } });
    const anivs = L.map(e => ({ e, v: I.vacSaldo(e, D) })).filter(x => x.v.proximo && difDias(hoy, x.v.proximo.fecha) <= 30).sort((a, b) => a.v.proximo.fecha.localeCompare(b.v.proximo.fecha));
    const anom = ADM() ? I.anomalias(D, X, L) : [];
    m.innerHTML = `
    <div class="card-h"><h2>${esc(fDiaL(hoy))}</h2><span class="muted small">Semana de nómina ${esc(sem.label)}${cerrada(sem.key) ? ' · <span class="b b-gry">cerrada</span>' : ''}</span></div>
    <div class="grid g4">
      ${kpi('Plantilla activa', fmt(L.length, 0), plazas && U.rol !== 'jefe' ? 'Plazas autorizadas ' + plazas + ' · vacantes ' + Math.max(0, plazas - L.length) : (U.rol === 'jefe' ? 'Tu equipo' : ''), '')}
      ${kpi('Presentes hoy', fmt(presentes, 0) + '<span class="muted small"> / ' + prog + '</span>', prog ? fmt(presentes / prog * 100) + ' % de los programados' : '', 'grn')}
      ${kpi('Sin checar', fmt(sin.length, 0), 'Programados que no han llegado', sin.length ? 'red' : '')}
      ${kpi('Retardos hoy', fmt(ret, 0), 'Tolerancia ' + C().p.toleranciaMin + ' min', ret ? 'amb' : '')}
      ${kpi('Vacaciones / permisos / incapacidad', fmt(inc.length, 0), '', 'blu')}
      ${kpi('Por autorizar', fmt(n, 0), n ? '<a href="#" data-go="autorizaciones">Ver pendientes</a>' : 'Nada pendiente', n ? 'amb' : '')}
      ${kpi('Rotación del mes', fmt(mesAct.idx) + ' %', mesAct.bajas + ' bajas · ' + mesAct.altas + ' altas', mesAct.idx > 3 ? 'red' : '')}
      ${kpi('Tiempo extra semana', hTxt(HE), 'Pagable (autorizado)', '')}
    </div>
    <div class="grid g2" style="margin-top:12px">
      <div class="card"><div class="card-h"><h3>Asistencia últimos 14 días</h3><span class="muted small">% de presentes sobre programados</span></div><div class="chart">${I.barras(serie, { suf: '%', max: 100, dec: 1, alto: 190 })}</div></div>
      <div class="card"><div class="card-h"><h3>Rotación 12 meses</h3><span class="muted small">Anualizada ${fmt(rot.anual)} % · ${rot.totalBajas} bajas</span><span class="sp"></span>${U.rol !== 'jefe' ? '<a href="#" data-go="rotacion" class="small">Detalle</a>' : ''}</div><div class="chart">${I.barras(rot.serie.map(x => ({ l: I.mesLabel(x.k).slice(0, 3), v: Math.round(x.idx * 10) / 10, c: x.idx > 3 ? 'var(--rojo)' : 'var(--line2)' })), { suf: '%', dec: 1, alto: 190 })}</div></div>
    </div>
    <div class="grid g3" style="margin-top:12px">
      <div class="card"><h3>No han checado (${sin.length})</h3>${sin.length ? '<div class="lista">' + ord(sin.map(x => x.e)).map(e => { const r = H.find(x => x.e === e).r; return `<div class="li"><b>${esc(e.nombre)}</b><span class="muted small">${esc(e.depto)} · entra ${esc(r.h.ent)}</span><button class="btn sm ghost" data-dia="${e._k}|${hoy}">Ver</button></div>`; }).join('') + '</div>' : '<div class="empty">Todos los programados ya checaron.</div>'}</div>
      <div class="card"><h3>Ausentes hoy con permiso (${inc.length})</h3>${inc.length ? '<div class="lista">' + inc.map(x => `<div class="li"><b>${esc(x.e.nombre)}</b><span class="b b-${(C().tipos[x.r.sol.tipo] || {}).color || 'blu'}">${esc(tipoN(x.r.sol.tipo))}</span><span class="muted small">hasta ${esc(fDia(x.r.sol.hasta))}</span></div>`).join('') + '</div>' : '<div class="empty">Nadie.</div>'}
        <h3 style="margin-top:14px">Salen de vacaciones en 7 días</h3>${prox.length ? '<div class="lista">' + prox.map(x => `<div class="li"><b>${esc(x.e.nombre)}</b><span class="muted small">${esc(fDia(x.s.desde))} → ${esc(fDia(x.s.hasta))} · ${x.s.dias} días${x.s.cubre ? ' · cubre ' + esc(nomE(x.s.cubre)) : ''}</span></div>`).join('') + '</div>' : '<div class="muted small">Ninguno.</div>'}</div>
      <div class="card"><h3>Aniversarios en 30 días</h3><p class="muted small">Ese día se abonan sus nuevos días de vacaciones (LFT art. 76).</p>${anivs.length ? '<div class="lista">' + anivs.slice(0, 12).map(x => `<div class="li"><b>${esc(x.e.nombre)}</b><span class="muted small">${esc(fDia(x.v.proximo.fecha))} · ${x.v.proximo.n} año(s) · +${x.v.proximo.dias} días</span></div>`).join('') + '</div>' : '<div class="muted small">Ninguno.</div>'}</div>
    </div>
    ${ADM() ? `<div class="card" style="margin-top:12px"><div class="card-h"><h3>Alertas</h3><span class="b ${anom.filter(a => a.nivel === 'alta').length ? 'b-red' : 'b-gry'}">${anom.filter(a => a.nivel === 'alta').length} altas</span><span class="b b-amb">${anom.filter(a => a.nivel === 'media').length} medias</span><span class="sp"></span><a href="#" data-go="anomalias" class="small">Ver todas</a></div>${anom.length ? '<div class="lista">' + anom.slice(0, 6).map(liAnom).join('') + '</div>' : '<div class="empty">Sin alertas.</div>'}</div>` : ''}`;
    bindComunes(m);
  };
  const liAnom = a => `<div class="li"><span class="b ${a.nivel === 'alta' ? 'b-red' : a.nivel === 'media' ? 'b-amb' : 'b-gry'}">${esc(a.tipo)}</span>${a.empId ? `<a href="#" data-ficha="${a.empId}"><b>${esc(nomE(a.empId))}</b></a>` : ''}<span class="small">${esc(a.texto)}</span></div>`;
  function bindComunes(m) {
    $$('[data-go]', m).forEach(a => a.onclick = ev => { ev.preventDefault(); UI.tab = a.dataset.go; render(); });
    $$('[data-dia]', m).forEach(b => b.onclick = ev => { ev.preventDefault(); const [id, f] = b.dataset.dia.split('|'); modalDia(id, f); });
    $$('[data-ficha]', m).forEach(b => b.onclick = ev => { ev.preventDefault(); ficha(b.dataset.ficha); });
  }

  /* ============================================================ PLANTILLA */
  VISTAS.plantilla = function (m) {
    const q = I.normNom(UI.q);
    let L = visibles(true).filter(e => (UI.est === 'todos' || (UI.est === 'baja' ? e.estatus === 'baja' : e.estatus !== 'baja')) && (!UI.depto || e.depto === UI.depto) && (!q || I.normNom(e.nombre + ' ' + e.num + ' ' + e.puesto).includes(q)));
    L = ord(L);
    const act = visibles();
    const porDep = {}; act.forEach(e => porDep[e.depto] = (porDep[e.depto] || 0) + 1);
    const plz = C().plazas || {};
    const filas = [];
    let dep = null;
    L.forEach(e => {
      if (e.depto !== dep) { dep = e.depto; filas.push(`<tr class="grp"><td colspan="10">${esc(dep)} · ${porDep[dep] || 0} activos${plz[dep] ? ' de ' + plz[dep] + ' plazas' : ''}</td></tr>`); }
      const v = I.vacSaldo(e, D);
      filas.push(`<tr data-ficha="${e._k}" style="cursor:pointer"><td class="mono">${esc(e.num || '')}</td><td><b>${esc(e.nombre)}</b>${e.numProv ? ' <span class="b b-amb" title="Número provisional: cámbialo por el de nómina">prov.</span>' : ''}</td><td class="small">${esc(e.puesto || '')}</td><td class="small">${esc((C().turnos[e.turno] || {}).nombre || e.turno || '')}</td><td class="small">${esc(fDia(e.ingreso))}</td><td class="num">${fmt(v.anios)} a</td><td class="num ${v.saldo < 0 ? 'neg' : ''}">${fmt(v.saldo)}</td><td>${e.estatus === 'baja' ? `<span class="b b-red">Baja ${esc(e.baja && e.baja.fecha ? fDia(e.baja.fecha) : 'sin fecha')}</span>` : '<span class="b b-grn">Activo</span>'}</td><td>${e.checaMovil ? '<span class="b b-blu" title="Puede checar desde su celular">📱</span>' : ''}</td></tr>`);
    });
    const deps = Object.keys(plz).length ? deptosUsados().map(d => ({ d, o: porDep[d] || 0, p: num(plz[d]) })).filter(x => x.p || x.o) : [];
    m.innerHTML = `
    <div class="card"><div class="card-h"><h2>Plantilla del personal</h2><span class="muted small">${act.length} activos · ${visibles(true).length - act.length} bajas registradas</span><span class="sp"></span>
      ${ADM() ? '<button class="btn pri" id="p-alta">+ Alta</button><button class="btn" id="p-imp">Importar Excel / JSON</button><button class="btn" id="p-gaf">Gafetes QR</button>' : ''}<button class="btn" id="p-xls">Exportar Excel</button>${ADM() ? '<button class="btn" id="p-odoo" title="Archivo para importar en Odoo → Empleados">CSV para Odoo</button>' : ''}</div>
      <div class="row" style="margin-bottom:10px"><input id="p-q" placeholder="Buscar nombre, número o puesto" value="${esc(UI.q)}" style="max-width:280px"><select id="p-d" style="max-width:260px">${optDeptos(UI.depto, true)}</select>
      <div class="seg" id="p-e">${['activo', 'baja', 'todos'].map(s => `<button data-v="${s}" class="${UI.est === s ? 'on' : ''}">${s === 'activo' ? 'Activos' : s === 'baja' ? 'Bajas' : 'Todos'}</button>`).join('')}</div></div>
      <div class="tw"><table><thead><tr><th>No.</th><th>Nombre</th><th>Puesto</th><th>Turno</th><th>Ingreso</th><th class="num">Antig.</th><th class="num">Vac. saldo</th><th>Estatus</th><th></th></tr></thead><tbody>${filas.join('') || '<tr><td colspan="10" class="empty">Sin resultados</td></tr>'}</tbody></table></div>
    </div>
    ${deps.length ? `<div class="card"><div class="card-h"><h3>Plazas autorizadas vs ocupadas</h3><span class="muted small">Se editan en Configuración</span></div><div class="plazas">${deps.map(x => `<div class="plz ${x.p && x.o < x.p ? 'vac' : x.p && x.o > x.p ? 'exc' : ''}"><div class="small">${esc(x.d)}</div><div class="bar ${x.o >= x.p ? 'grn' : ''}"><i style="width:${x.p ? Math.min(100, x.o / x.p * 100) : 100}%"></i></div><div class="small"><b>${x.o}</b> / ${x.p || '—'} ${x.p && x.o < x.p ? '· ' + (x.p - x.o) + ' vacante(s)' : x.p && x.o > x.p ? '· ' + (x.o - x.p) + ' de más' : ''}</div></div>`).join('')}</div></div>` : ''}`;
    $('#p-q').oninput = I.debounce(ev => { UI.q = ev.target.value; render(); setTimeout(() => { const i = $('#p-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 0); }, 250);
    $('#p-d').onchange = ev => { UI.depto = ev.target.value; guardaUI(); render(); };
    $$('#p-e button').forEach(b => b.onclick = () => { UI.est = b.dataset.v; guardaUI(); render(); });
    $$('[data-ficha]', m).forEach(tr => tr.onclick = () => ficha(tr.dataset.ficha));
    if ($('#p-alta')) $('#p-alta').onclick = () => editarEmp(null);
    if ($('#p-imp')) $('#p-imp').onclick = importarPlantilla;
    if ($('#p-gaf')) $('#p-gaf').onclick = () => gafetes(L.filter(e => e.estatus !== 'baja'));
    $('#p-xls').onclick = () => I.exportXlsx('Plantilla_RH_' + I.hoyISO() + '.xlsx', [{ nombre: 'Plantilla', filas: [['No.', 'Nombre', 'Departamento', 'Puesto', 'Turno', 'Ingreso', 'Antigüedad (años)', 'Días vac. periodo', 'Saldo vacaciones', 'Estatus', 'Fecha baja', 'Tipo baja', 'Motivo baja']].concat(ord(visibles(true)).map(e => { const v = I.vacSaldo(e, D); return [e.num, e.nombre, e.depto, e.puesto, e.turno, e.ingreso, Math.round(v.anios * 100) / 100, v.actuales, v.saldo, e.estatus, e.baja && e.baja.fecha || '', e.baja && e.baja.tipo || '', e.baja && e.baja.motivo || '']; })) }]);
    if ($('#p-odoo')) $('#p-odoo').onclick = () => {
      const f = [['id', 'name', 'barcode', 'department_id', 'job_title', 'active']].concat(ord(visibles(true)).map(e => ['rh19_emp_' + I.keySafe(e.num || e._k), e.nombre, e.num || '', e.depto, e.puesto || '', e.estatus === 'baja' ? 'False' : 'True']));
      I.descargar('odoo_hr.employee_' + I.hoyISO() + '.csv', I.csv(f)); I.toast('CSV listo: Odoo → Empleados → Importar', 'ok');
    };
  };

  /* Ficha del empleado */
  async function ficha(id) {
    const e = emp(id); if (!e) return;
    const v = I.vacSaldo(e, D), hoy = I.hoyISO(), pv = (D.privado || {})[id] || {};
    const ult = []; for (let i = 13; i >= 0; i--) ult.push(I.calcDia(e, addDias(hoy, -i), D, X));
    const sols = vals((D.solicitudes || {})[id]).sort((a, b) => (b.desde || '').localeCompare(a.desde || '')).slice(0, 12);
    const hes = vals((D.he || {})[id]).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')).slice(0, 8);
    const banco = vals((D.he || {})[id]).filter(h => h.estado === 'aprobada' && h.forma === 'banco').reduce((a, h) => a + num(h.min), 0) - vals((D.solicitudes || {})[id]).filter(s => s.estado === 'aprobada' && s.recompensado).reduce((a, s) => a + num(s.horas) * 60, 0);
    const html = `
      <div class="grid g4">
        ${kpi('Antigüedad', fmt(v.anios) + ' años', 'Ingreso ' + fDia(e.ingreso))}
        ${kpi('Saldo vacaciones', fmt(v.saldo) + ' d', v.pendientes ? v.pendientes + ' en trámite' : 'Le tocan ' + v.actuales + ' por año', v.saldo < 0 ? 'red' : 'grn')}
        ${kpi('Próximo aniversario', v.proximo ? fDia(v.proximo.fecha) : '—', v.proximo ? '+' + v.proximo.dias + ' días' : '')}
        ${kpi('Banco de horas', minTxt(banco), 'Tiempo por tiempo')}
      </div>
      <div class="card" style="margin-top:10px"><div class="row"><div class="grow"><b>${esc(e.nombre)}</b><div class="muted small">No. ${esc(e.num || '—')} · ${esc(e.depto)} · ${esc(e.puesto || '')} · ${esc((C().turnos[e.turno] || {}).nombre || e.turno)}</div>${e.tel ? `<div class="small">Tel. ${esc(e.tel)}</div>` : ''}${ADM() && (pv.salarioDiario || pv.nss) ? `<div class="small muted">SD ${pv.salarioDiario ? I.money(pv.salarioDiario) : '—'} · NSS ${esc(pv.nss || '—')}</div>` : ''}</div>
      ${e.estatus === 'baja' ? `<span class="b b-red">Baja ${esc(fDia(e.baja && e.baja.fecha))} · ${esc(e.baja && e.baja.tipo || '')}</span>` : ''}</div></div>
      <h3 style="margin-top:12px">Últimos 14 días</h3><div class="mini-dias">${ult.map(r => celdaDia(r, e, true)).join('')}</div>
      <h3 style="margin-top:12px">Libro de vacaciones</h3>
      <div class="tw" style="max-height:260px"><table><thead><tr><th>Fecha</th><th>Concepto</th><th class="num">Días</th></tr></thead><tbody>
        ${v.corte ? `<tr><td>${fDia(v.corte)}</td><td>Saldo inicial (de tu control en Excel)</td><td class="num">${fmt(v.ini)}</td></tr>` : ''}
        ${v.abonos.map(a => `<tr><td>${fDia(a.fecha)}</td><td>${a.n}º aniversario · LFT art. 76</td><td class="num">+${a.dias}</td></tr>`).join('')}
        ${v.sols.filter(s => s.estado === 'aprobada' && (!v.corte || s.desde > v.corte)).map(s => `<tr><td>${fDia(s.desde)}</td><td>Vacaciones ${fDia(s.desde)} – ${fDia(s.hasta)}${s.desde > hoy ? ' <span class="b b-blu">programadas</span>' : ''}</td><td class="num">−${s.dias}</td></tr>`).join('')}
        ${v.ajs.map(a => `<tr><td>${fDia(a.fecha)}</td><td>Ajuste: ${esc(a.concepto)} <span class="muted small">(${esc(a.por || '')})</span></td><td class="num">${a.dias > 0 ? '+' : ''}${fmt(a.dias)}</td></tr>`).join('')}
        <tr class="grp"><td></td><td>Saldo</td><td class="num">${fmt(v.saldo)}</td></tr></tbody></table></div>
      ${v.fueraPlazo ? `<div class="warn" style="margin-top:8px">${fmt(v.fueraPlazo)} días ya pasaron los 6 meses desde su aniversario sin otorgarse (LFT art. 81). Conviene programarlos.</div>` : ''}
      <h3 style="margin-top:12px">Solicitudes recientes</h3>${sols.length ? '<div class="lista">' + sols.map(s => `<div class="li"><span class="b ${ESTADO_CLS[s.estado]}">${esc(s.estado)}</span><b>${esc(tipoN(s.tipo))}</b><span class="small">${esc(fDia(s.desde))}${s.hasta && s.hasta !== s.desde ? ' – ' + esc(fDia(s.hasta)) : ''}${s.dias ? ' · ' + s.dias + ' d' : ''}${s.horas ? ' · ' + s.horas + ' h' : ''}</span>${s.tipo === 'VAC' || s.grupo === 'PERM' || ['PCG', 'PSG', 'PHR', 'CMD', 'LPA', 'LUT'].includes(s.tipo) ? `<button class="btn sm ghost" data-fmt="${s._k}">Formato</button>` : ''}</div>`).join('') + '</div>' : '<div class="muted small">Ninguna.</div>'}
      ${hes.length ? '<h3 style="margin-top:12px">Tiempo extra</h3><div class="lista">' + hes.map(h => `<div class="li"><span class="b ${ESTADO_CLS[h.estado]}">${esc(h.estado)}</span><span class="small">${esc(fDia(h.fecha))} · ${minTxt(h.min)} · ${h.forma === 'banco' ? 'a banco de horas' : 'pago'} · ${esc(h.motivo || '')}</span></div>`).join('') + '</div>' : ''}`;
    const bts = [{ t: 'Cerrar' }];
    if (U.rol !== 'director') bts.unshift({ t: 'Nueva solicitud', antes: () => { setTimeout(() => nuevaSolicitud(id), 50); } });
    if (ADM()) { bts.unshift({ t: 'Editar', antes: () => { setTimeout(() => editarEmp(id), 50); } }); bts.unshift({ t: 'Ajustar vacaciones', antes: () => { setTimeout(() => ajusteVac(id), 50); } }); bts.unshift(e.estatus === 'baja' ? { t: 'Reingreso', antes: () => { setTimeout(() => reingreso(id), 50); } } : { t: 'Dar de baja', c: 'danger', antes: () => { setTimeout(() => darBaja(id), 50); } }); }
    await I.modal('Ficha del empleado', html, bts, { ancho: true, sinFoco: true, onOpen: ov => { $$('[data-fmt]', ov).forEach(b => b.onclick = () => formato(id, b.dataset.fmt)); $$('[data-dia]', ov).forEach(b => b.onclick = () => { const [i2, f] = b.dataset.dia.split('|'); modalDia(i2, f); }); } });
  }

  async function editarEmp(id) {
    const e = id ? emp(id) : { estatus: 'activo', turno: 'T1', depto: UI.depto || C().deptos[0], ingreso: I.hoyISO(), checaMovil: false };
    const pv = (id && (D.privado || {})[id]) || {};
    const turnos = C().turnos;
    const html = `<div class="form">
      <label>No. de empleado<input id="e-num" value="${esc(e.num || '')}" inputmode="numeric"></label>
      <label class="full">Nombre completo (apellidos y nombre)<input id="e-nom" value="${esc(e.nombre || '')}"></label>
      <label>Departamento<select id="e-dep">${C().deptos.concat(deptosUsados().filter(d => !C().deptos.includes(d))).map(d => `<option ${d === e.depto ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></label>
      <label>Puesto<input id="e-pue" value="${esc(e.puesto || '')}"></label>
      <label>Turno<select id="e-tur">${Object.keys(turnos).map(k => `<option value="${k}" ${k === e.turno ? 'selected' : ''}>${esc(turnos[k].nombre)}</option>`).join('')}</select></label>
      <label>Fecha de ingreso<input id="e-ing" type="date" value="${esc(e.ingreso || '')}"></label>
      <label>Teléfono<input id="e-tel" value="${esc(e.tel || '')}" inputmode="tel"></label>
      <label>Saldo inicial de vacaciones<input id="e-sal" class="in-num" value="${esc(e.saldoIni != null ? e.saldoIni : 0)}"></label>
      <label>Fecha del saldo inicial<input id="e-cor" type="date" value="${esc(e.corte || C().p.fechaCorte || I.hoyISO())}"></label>
      <label>Salario diario (solo RH)<input id="e-sd" class="in-num" value="${esc(pv.salarioDiario || '')}"></label>
      <label>NSS (solo RH)<input id="e-nss" value="${esc(pv.nss || '')}"></label>
      <label class="full"><input type="checkbox" id="e-mov" ${e.checaMovil ? 'checked' : ''}> Puede checar desde su celular (con ubicación)</label>
      <label class="full"><input type="checkbox" id="e-rut" ${e.enRuta ? 'checked' : ''}> Trabaja en ruta: su checada del celular vale fuera de la geocerca (choferes, vendedores)</label>
    </div><p class="muted small">El saldo inicial es el SALDO de tu control de vacaciones a esa fecha; a partir de ahí el sistema abona cada aniversario (LFT) y descuenta lo que se autoriza.</p>`;
    await I.modal(id ? 'Editar empleado' : 'Alta de empleado', html, [{ t: 'Cancelar' }, { t: 'Guardar', c: 'pri', antes: async ov => {
      const g = s => $(s, ov).value.trim();
      const d = { num: g('#e-num'), nombre: g('#e-nom').toUpperCase(), depto: g('#e-dep'), puesto: g('#e-pue'), turno: g('#e-tur'), ingreso: g('#e-ing'), tel: g('#e-tel'), saldoIni: num(g('#e-sal')), corte: g('#e-cor'), checaMovil: $('#e-mov', ov).checked, enRuta: $('#e-rut', ov).checked };
      if (!d.nombre || !d.ingreso) { I.toast('Nombre y fecha de ingreso son obligatorios', 'err'); return false; }
      if (d.num && emps(true).some(x => x.num === d.num && x._k !== id)) { I.toast('Ese número ya lo tiene otra persona', 'err'); return false; }
      const k = id || ('E' + (d.num ? I.keySafe(d.num) : I.newId()));
      const up = {};
      Object.keys(d).forEach(f => up['empleados/' + k + '/' + f] = d[f]);
      if (!id) { up['empleados/' + k + '/estatus'] = 'activo'; const qr = I.rnd(10); up['empleados/' + k + '/qr'] = qr; up['gafetes/' + qr] = k; up['empleados/' + k + '/alta'] = I.now(); }
      if (e.numProv && d.num !== e.num) up['empleados/' + k + '/numProv'] = null;
      if (g('#e-sd') || g('#e-nss')) { up['privado/' + k + '/salarioDiario'] = num(g('#e-sd')) || null; up['privado/' + k + '/nss'] = g('#e-nss') || null; }
      try { await DB.update(up); I.log(id ? 'Editó empleado' : 'Alta de empleado', d.nombre); I.toast('Guardado ✔', 'ok'); } catch (x) { I.toast('No se pudo guardar: ' + x.message, 'err'); return false; }
    } }], { ancho: true });
  }

  async function darBaja(id) {
    const e = emp(id);
    const html = `<p><b>${esc(e.nombre)}</b> · ${esc(e.depto)} · ingreso ${esc(fDia(e.ingreso))}</p><div class="form">
      <label>Fecha de baja (último día laborado)<input id="b-f" type="date" value="${I.hoyISO()}"></label>
      <label>Tipo de baja<select id="b-t">${I.BAJA_TIPOS.map(t => `<option>${esc(t)}</option>`).join('')}</select></label>
      <label>Motivo principal<select id="b-m">${I.BAJA_MOTIVOS.map(t => `<option>${esc(t)}</option>`).join('')}</select></label>
      <label>¿Es recontratable?<select id="b-r"><option value="1">Sí</option><option value="0">No</option></select></label>
      <label class="full">Entrevista de salida / notas<textarea id="b-n"></textarea></label></div>
      <p class="muted small">La baja entra al índice de rotación y desactiva su acceso al portal y su gafete.</p>`;
    await I.modal('Dar de baja', html, [{ t: 'Cancelar' }, { t: 'Registrar baja', c: 'danger', antes: async ov => {
      const b = { fecha: $('#b-f', ov).value, tipo: $('#b-t', ov).value, motivo: $('#b-m', ov).value, recontratable: $('#b-r', ov).value === '1', nota: $('#b-n', ov).value.trim(), por: U.nombre, ts: I.now() };
      if (!b.fecha) { I.toast('Falta la fecha', 'err'); return false; }
      const up = { ['empleados/' + id + '/estatus']: 'baja', ['empleados/' + id + '/baja']: b };
      if (e.qr) up['gafetes/' + e.qr] = null;
      const us = vals(D.usuarios).find(u => u.empId === id); if (us) up['usuarios/' + us._k + '/activo'] = false;
      await DB.update(up); I.log('Baja', e.nombre + ' · ' + b.tipo + ' · ' + b.fecha); I.toast('Baja registrada', 'ok');
    } }]);
  }
  async function reingreso(id) {
    const e = emp(id);
    await I.modal('Reingreso', `<p><b>${esc(e.nombre)}</b> causó baja el ${esc(fDia(e.baja && e.baja.fecha))}${e.baja && e.baja.recontratable === false ? ' <span class="b b-red">marcado como NO recontratable</span>' : ''}.</p><p class="muted small">Se crea un registro nuevo (la baja anterior se conserva para la rotación).</p><label>Nueva fecha de ingreso<input id="r-f" type="date" value="${I.hoyISO()}"></label>`, [{ t: 'Cancelar' }, { t: 'Reingresar', c: 'pri', antes: async ov => {
      const f = $('#r-f', ov).value; const k = 'E' + I.newId(); const qr = I.rnd(10);
      const n = Object.assign({}, D.empleados[id], { ingreso: f, estatus: 'activo', baja: null, saldoIni: 0, corte: f, qr, reingresoDe: id, alta: I.now() });
      await DB.update({ ['empleados/' + k]: n, ['gafetes/' + qr]: k, ['empleados/' + id + '/num']: (e.num || '') + '-ant' }); I.log('Reingreso', e.nombre); I.toast('Reingreso registrado', 'ok');
    } }]);
  }
  async function ajusteVac(id) {
    await I.modal('Ajuste de vacaciones', `<p>${esc(nomE(id))}</p><div class="form"><label>Días (+ abona, − descuenta)<input id="a-d" class="in-num" value="-1"></label><label>Fecha<input id="a-f" type="date" value="${I.hoyISO()}"></label><label class="full">Concepto<select id="a-c"><option>Pagadas en nómina (rebajadas)</option><option>Día feriado laborado a cuenta</option><option>Corrección de saldo inicial</option><option>Vacaciones tomadas antes del sistema</option><option>Otro</option></select></label><label class="full">Nota<input id="a-n"></label></div>`, [{ t: 'Cancelar' }, { t: 'Guardar', c: 'pri', antes: async ov => { const d = num($('#a-d', ov).value); if (!d) { I.toast('Captura los días', 'err'); return false; } await DB.push('ajustesVac/' + id, { dias: d, fecha: $('#a-f', ov).value, concepto: $('#a-c', ov).value + ($('#a-n', ov).value ? ' · ' + $('#a-n', ov).value : ''), por: U.nombre, ts: I.now() }); I.log('Ajuste de vacaciones', nomE(id) + ' ' + d + ' días'); I.toast('Ajuste guardado', 'ok'); } }]);
  }

  /* Importar plantilla: tu Excel de control de vacaciones (hoja VACACIONES 2026 y BAJAS) o un respaldo JSON */
  async function importarPlantilla() {
    await I.modal('Importar plantilla', `<p>Elige tu archivo <b>VACACIONES 2026.xlsx</b> (el sistema lee la hoja del año con departamentos, fecha de ingreso, días tomados y saldo, y la hoja BAJAS) o el archivo <b>plantilla-inicial.json</b> que viene en la carpeta PRIVADO.</p><input type="file" id="i-f" accept=".xlsx,.xls,.json"><div id="i-r" style="margin-top:10px"></div>`, [{ t: 'Cerrar' }], { onOpen: ov => {
      $('#i-f', ov).onchange = async ev => {
        const f = ev.target.files[0]; if (!f) return; const out = $('#i-r', ov); out.innerHTML = '<div class="muted">Leyendo…</div>';
        try {
          let lista;
          if (/\.json$/i.test(f.name)) { const j = JSON.parse(await f.text()); lista = Object.keys(j.empleados || {}).map(k => Object.assign({ _k: k }, j.empleados[k])); if (j.config && j.config.param && j.config.param.fechaCorte && !C().p.fechaCorte) await DB.set('config/param/fechaCorte', j.config.param.fechaCorte); }
          else lista = parseControlVac(await I.leerExcel(f), f.name);
          const ya = emps(true); const nuevos = lista.filter(n => !ya.some(e => I.normNom(e.nombre) === I.normNom(n.nombre) && (e.ingreso === n.ingreso || !n.ingreso)));
          out.innerHTML = `<div class="note">Se encontraron <b>${lista.length}</b> personas (${lista.filter(x => x.estatus === 'baja').length} bajas). Nuevas para el sistema: <b>${nuevos.length}</b>. Las que ya existen no se tocan.</div>
            <div class="tw" style="max-height:240px;margin-top:8px"><table><thead><tr><th>Nombre</th><th>Depto</th><th>Ingreso</th><th class="num">Saldo</th><th>Estatus</th></tr></thead><tbody>${nuevos.slice(0, 300).map(n => `<tr><td>${esc(n.nombre)}</td><td class="small">${esc(n.depto)}</td><td class="small">${esc(fDia(n.ingreso))}</td><td class="num">${fmt(n.saldoIni)}</td><td>${n.estatus === 'baja' ? '<span class="b b-red">baja</span>' : ''}</td></tr>`).join('')}</tbody></table></div>
            <button class="btn pri" id="i-ok" style="margin-top:10px" ${nuevos.length ? '' : 'disabled'}>Cargar ${nuevos.length} personas</button>`;
          if ($('#i-ok', ov)) $('#i-ok', ov).onclick = async () => {
            const up = {}; let n = 1000 + ya.length;
            nuevos.forEach(p => { n++; const k = p._k && !D.empleados?.[p._k] ? p._k : 'E' + I.newId(); const qr = I.rnd(10); const o = Object.assign({}, p); delete o._k; if (!o.num) { o.num = String(n); o.numProv = true; } o.qr = qr; up['empleados/' + k] = o; if (o.estatus !== 'baja') up['gafetes/' + qr] = k; });
            const corte = nuevos.find(x => x.corte); if (corte && !C().p.fechaCorte) up['config/param/fechaCorte'] = corte.corte;
            await DB.update(up); I.log('Importó plantilla', nuevos.length + ' personas desde ' + f.name); I.toast('Plantilla cargada ✔', 'ok'); out.innerHTML = '<div class="note">Listo. Revisa los números de empleado marcados como "prov." y cámbialos por los de nómina.</div>';
          };
        } catch (x) { console.error(x); out.innerHTML = '<div class="warn">No se pudo leer: ' + esc(x.message) + '</div>'; }
      };
    } });
  }
  function parseControlVac(wb, nombre) {
    const hoja = wb.SheetNames.find(n => /VACACIONES\s*20\d\d/i.test(n) && !/copia/i.test(n) && /2026/.test(n)) || wb.SheetNames.find(n => /VACACIONES\s*20\d\d/i.test(n) && !/copia/i.test(n)) || wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, raw: true, defval: null });
    const hi = rows.findIndex(r => r && r.some(c => /EMPLEADO/i.test(String(c || ''))) && r.some(c => /INGRESO/i.test(String(c || ''))));
    if (hi < 0) throw new Error('No encontré los encabezados EMPLEADO / FECHA DE INGRESO en la hoja ' + hoja);
    const H = rows[hi].map(c => String(c || '').toUpperCase().trim());
    const col = re => H.findIndex(h => re.test(h));
    const cN = col(/EMPLEADO|NOMBRE/), cI = col(/INGRESO/), cS = col(/^SALDO/), cT = col(/TOMADOS/), cF = col(/FERIADOS/), cA = col(/ACUMULADAS/);
    const corte = I.hoyISO(); const out = []; let dep = 'ADMINISTRACION';
    const fecha = v => { if (v == null || v === '') return ''; if (v instanceof Date) return I.iso(v); if (typeof v === 'number') return I.iso(new Date(Math.round((v - 25569) * 864e5) + new Date().getTimezoneOffset() * 60000)); const m = String(v).match(/(\d{4})-(\d\d)-(\d\d)/); return m ? m[0] : ''; };
    const turnoDe = d => /ADMIN(?!.*PROD)|BASCULA|VENTAS/.test(d) ? 'ADM' : /CHOFER/.test(d) ? 'RUTA' : /VIGILANCIA|SEGURIDAD/.test(d) ? 'VIG' : /MICRO/.test(d) ? 'MIC' : 'T1';
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i] || []; const n = String(r[cN] || '').trim(); if (!n) continue;
      const ing = fecha(r[cI]);
      if (!ing) { if (n.length > 2 && !/^\d/.test(n)) dep = n.toUpperCase().replace(/\s+/g, ' ').trim(); continue; }
      const numOr = v => typeof v === 'number' && isFinite(v) ? v : null;
      let saldo = numOr(r[cS]); if (saldo == null) { const ac = numOr(r[cA]); saldo = (ac != null ? ac : num(r[cF])) - num(r[cT]); }
      out.push({ nombre: n.toUpperCase().replace(/\s+/g, ' '), depto: dep, puesto: dep, turno: turnoDe(dep), ingreso: ing, estatus: 'activo', saldoIni: Math.round(saldo * 10) / 10, corte, checaMovil: /CHOFER|VENTAS/.test(dep), enRuta: /CHOFER|VENTAS/.test(dep), origen: nombre + ' · ' + hoja });
    }
    const hb = wb.SheetNames.find(n => /BAJAS/i.test(n));
    if (hb) {
      XLSX.utils.sheet_to_json(wb.Sheets[hb], { header: 1, raw: true, defval: null }).forEach(r => {
        const n = String((r || [])[0] || '').trim(); if (!n || /EMPLEADO|NOMBRE/i.test(n)) return;
        const ing = (r || []).map(fecha).find(Boolean) || '';
        if (out.some(o => I.normNom(o.nombre) === I.normNom(n))) return;
        out.push({ nombre: n.toUpperCase().replace(/\s+/g, ' '), depto: 'SIN DEPARTAMENTO', turno: 'T1', ingreso: ing, estatus: 'baja', baja: { fecha: null, tipo: 'Renuncia voluntaria', motivo: 'Otro', nota: 'Importada de la hoja BAJAS sin fecha de baja: complétala para que cuente en la rotación' }, saldoIni: 0, corte, origen: nombre + ' · BAJAS' });
      });
    }
    return out;
  }

  /* Gafetes con QR para el checador */
  async function gafetes(lista) {
    await I.loadScript('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js');
    const up = {}; lista.forEach(e => { if (!e.qr) { const qr = I.rnd(10); up['empleados/' + e._k + '/qr'] = qr; up['gafetes/' + qr] = e._k; e.qr = qr; } });
    if (Object.keys(up).length) await DB.update(up);
    const tmp = document.createElement('div');
    const img = t => { tmp.innerHTML = ''; new QRCode(tmp, { text: 'RH19:' + t, width: 160, height: 160, correctLevel: QRCode.CorrectLevel.M }); const c = tmp.querySelector('canvas'); return c ? c.toDataURL() : (tmp.querySelector('img') || {}).src; };
    const html = '<div class="gafetes">' + lista.map(e => `<div class="gaf"><div class="gaf-h"><img src="img/logo-19h.png" alt=""><span>LOS 19 HERMANOS<br>DIVISIÓN PET FOOD</span><img src="img/logo-petfood.png" alt=""></div><img src="${img(e.qr)}" alt="QR"><div class="gaf-n">${esc(e.nombre)}</div><div class="gaf-d">No. ${esc(e.num || '')} · ${esc(e.depto)}</div></div>`).join('') + '</div>';
    await I.modal('Gafetes QR (' + lista.length + ')', `<p class="muted small">Imprime en hoja carta y enmica. El QR identifica al empleado en el checador; si un gafete se pierde, en la ficha usa "Editar" → se puede regenerar desde aquí con el botón "Reponer gafete".</p>${html}`, [{ t: 'Cerrar' }, !I.enIframe ? { t: 'Imprimir', c: 'pri', antes: () => { I.imprimir(html); return false; } } : null, { t: 'Reponer gafete de…', antes: async () => { const id = await elegirEmp('¿A quién se le repone el gafete?'); if (!id) return false; const e = emp(id); const qr = I.rnd(10); await DB.update({ ['gafetes/' + e.qr]: null, ['gafetes/' + qr]: id, ['empleados/' + id + '/qr']: qr }); I.log('Repuso gafete', e.nombre); I.toast('El gafete anterior ya no sirve. Imprime el nuevo.', 'ok'); } }], { ancho: true, sinFoco: true });
  }
  async function elegirEmp(t, lista) { let v = null; const r = await I.modal(t, `<select id="ee">${optEmps('', lista)}</select>`, [{ t: 'Cancelar', v: 0 }, { t: 'Aceptar', v: 1, c: 'pri', antes: ov => { v = $('#ee', ov).value; } }]); return r.v ? v : null; }

  /* ============================================================ ASISTENCIAS */
  const EST_TXT = { ok: 'Asistencia', retardo: 'Retardo', falta: 'Falta', sinchecar: 'Sin checar', porllegar: 'Por llegar', descanso: 'Descanso', festivo: 'Festivo', desclab: 'Trabajó en descanso', festlab: 'Trabajó en festivo', inc: 'Incidencia', futuro: '', na: '' };
  function celdaDia(r, e, conFecha) {
    const ent = r.ent != null ? I.pad(Math.floor(r.ent / 60) % 24) + ':' + I.pad(r.ent % 60) : '', sal = r.sal != null ? I.pad(Math.floor(r.sal / 60) % 24) + ':' + I.pad(r.sal % 60) : '';
    let txt = '', cls = 'd-' + r.estado;
    if (r.estado === 'inc') txt = r.sol.tipo;
    else if (r.estado === 'descanso') txt = '—';
    else if (r.estado === 'festivo') txt = 'FEST';
    else if (r.estado === 'falta') txt = r.confirmada ? 'FI' : 'F';
    else if (r.estado === 'sinchecar') txt = '?';
    else if (ent) txt = ent + (sal ? '<br>' + sal : (r.fecha === I.hoyISO() ? '<br><span class="muted">en turno</span>' : '<br><span class="sin">sin salida</span>'));
    const marcas = (r.retardo ? `<i class="m-ret">+${r.retardo}</i>` : '') + (r.heMin ? `<i class="m-he ${r.hePag < r.heMin ? 'sinaut' : ''}">TE ${minTxt(r.heMin)}</i>` : '') + (r.pend ? '<i class="m-pend" title="Solicitud en trámite">⏳</i>' : '');
    const tit = (EST_TXT[r.estado] || '') + (r.sol ? ' · ' + tipoN(r.sol.tipo) : '') + (r.fer ? ' · ' + r.fer : '') + (r.flags.length ? ' · ' + r.flags.join(', ') : '');
    if (r.estado === 'na' || r.estado === 'futuro') return conFecha ? `<div class="dcell d-na"><span class="df">${I.DIAS[I.parseISO(r.fecha).getDay()]} ${+r.fecha.slice(8)}</span></div>` : '<td class="dcell d-na"></td>';
    const inner = (conFecha ? `<span class="df">${I.DIAS[I.parseISO(r.fecha).getDay()]} ${+r.fecha.slice(8)}</span>` : '') + `<span class="dt">${txt}</span>${marcas}`;
    return conFecha ? `<button class="dcell ${cls}" data-dia="${e._k}|${r.fecha}" title="${esc(tit)}">${inner}</button>` : `<td class="dcell ${cls}" data-dia="${e._k}|${r.fecha}" title="${esc(tit)}">${inner}</td>`;
  }
  VISTAS.asistencias = function (m) {
    const sem = I.semana(UI.semana || I.hoyISO(), C()); UI.semana = sem.key;
    const q = I.normNom(UI.q);
    const L = ord(visibles().filter(e => (!UI.depto || e.depto === UI.depto) && (!q || I.normNom(e.nombre + ' ' + e.num).includes(q))));
    const R = L.map(e => I.calcSemana(e, sem, D, X));
    const T = R.reduce((a, r) => { a.f += r.t.faltas; a.r += r.t.retardos; a.he += r.t.hePag; a.sin += r.t.sinSalida; a.nb += r.t.bono === false ? 1 : 0; return a; }, { f: 0, r: 0, he: 0, sin: 0, nb: 0 });
    let dep = null; const filas = [];
    R.forEach(x => {
      if (x.emp.depto !== dep) { dep = x.emp.depto; filas.push(`<tr class="grp"><td colspan="13">${esc(dep)}</td></tr>`); }
      filas.push(`<tr><td class="nm"><a href="#" data-ficha="${x.emp._k}">${esc(x.emp.nombre)}</a><div class="muted tiny">${esc(x.emp.num || '')} · ${esc(x.emp.turno)}</div></td>${x.dias.map(r => celdaDia(r, x.emp)).join('')}<td class="num ${x.t.faltas ? 'neg' : ''}">${x.t.faltas || ''}</td><td class="num ${x.t.retardos ? 'low' : ''}">${x.t.retardos || ''}</td><td class="num">${x.t.hePag ? fmt(x.t.hePag / 60) : ''}${x.t.heSinAut ? `<div class="tiny low" title="Tiempo extra checado sin autorización">+${fmt(x.t.heSinAut / 60)} s/a</div>` : ''}</td><td>${x.t.bono === null ? '' : x.t.bono ? '<span class="b b-grn">Sí</span>' : `<span class="b b-red" title="${esc(x.t.motivosBono.join(', '))}">No</span>`}</td></tr>`);
    });
    m.innerHTML = `
    <div class="card"><div class="card-h"><h2>Asistencias</h2>
      <div class="row"><button class="btn sm" id="s-prev">◀</button><b>${esc(sem.label)}</b><button class="btn sm" id="s-next">▶</button><button class="btn sm ghost" id="s-hoy">Semana actual</button>${cerrada(sem.key) ? '<span class="b b-gry">Semana cerrada para nómina</span>' : ''}</div>
      <span class="sp"></span>${ADM() ? '<button class="btn" id="a-imp">Importar del reloj checador</button>' : ''}<button class="btn" id="a-xls">Exportar</button></div>
      <div class="row" style="margin-bottom:10px"><input id="a-q" placeholder="Buscar" value="${esc(UI.q)}" style="max-width:220px"><select id="a-d" style="max-width:260px">${optDeptos(UI.depto, U.rol !== 'jefe' || (U.deptos || []).length > 1)}</select>
        <span class="chip">Faltas <b>${T.f}</b></span><span class="chip">Retardos <b>${T.r}</b></span><span class="chip">Sin salida <b>${T.sin}</b></span><span class="chip">TE pagable <b>${hTxt(T.he)}</b></span><span class="chip">Sin bono <b>${T.nb}</b></span></div>
      <div class="leyenda small"><span class="d-ok">Asistencia</span><span class="d-retardo">Retardo</span><span class="d-falta">Falta</span><span class="d-inc">Permiso/vacaciones/incapacidad</span><span class="d-desclab">Trabajó en descanso</span><span class="d-descanso">Descanso</span><i class="m-he">TE</i> tiempo extra · <i class="m-he sinaut">TE</i> sin autorizar · ⏳ solicitud en trámite · toca un día para ver checadas, justificar o autorizar</div>
      <div class="tw"><table class="t-asis"><thead><tr><th>Empleado</th>${sem.dias.map(f => `<th class="c">${I.DIAS[I.parseISO(f).getDay()]} ${+f.slice(8)}${I.esFeriado(f, C()) ? '<div class="tiny" title="' + esc(I.esFeriado(f, C())) + '">festivo</div>' : ''}</th>`).join('')}<th class="num">F</th><th class="num">R</th><th class="num">TE h</th><th>Bono</th></tr></thead><tbody>${filas.join('') || '<tr><td colspan="13" class="empty">Sin personal</td></tr>'}</tbody></table></div>
    </div>`;
    $('#s-prev').onclick = () => { UI.semana = addDias(sem.key, -7); render(); };
    $('#s-next').onclick = () => { UI.semana = addDias(sem.key, 7); render(); };
    $('#s-hoy').onclick = () => { UI.semana = null; render(); };
    $('#a-d').onchange = ev => { UI.depto = ev.target.value; guardaUI(); render(); };
    $('#a-q').oninput = I.debounce(ev => { UI.q = ev.target.value; render(); setTimeout(() => { const i = $('#a-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 0); }, 250);
    if ($('#a-imp')) $('#a-imp').onclick = importarReloj;
    $('#a-xls').onclick = () => I.exportXlsx('Asistencias_' + sem.key + '.xlsx', [{ nombre: 'Asistencias', filas: [['No.', 'Nombre', 'Depto', 'Fecha', 'Día', 'Estado', 'Entrada', 'Salida', 'Retardo (min)', 'TE checado (min)', 'TE autorizado (min)', 'Incidencia', 'Observaciones']].concat([].concat(...R.map(x => x.dias.filter(r => r.estado !== 'na').map(r => [x.emp.num, x.emp.nombre, x.emp.depto, r.fecha, I.DIAS_L[I.parseISO(r.fecha).getDay()], EST_TXT[r.estado] || r.estado, r.ent != null ? hm(r.chs[0].ts) : '', r.sal != null ? hm(r.chs[r.chs.length - 1].ts) : '', r.retardo || '', r.heMin || '', r.heAut || '', r.sol ? tipoN(r.sol.tipo) : '', r.flags.join(', ')])))) }]);
    bindComunes(m);
  };

  /* Un día: checadas, justificar, corregir, autorizar TE */
  async function modalDia(id, f) {
    const e = emp(id); const r = I.calcDia(e, f, D, X); const sem = I.semana(f, C()); const lock = cerrada(sem.key) && !MASTER();
    const fuente = { kiosco: '🖥️ Kiosco', movil: '📱 Celular', reloj: '⏱️ Reloj checador', manual: '✍️ Captura manual' };
    const html = `<p><b>${esc(e.nombre)}</b> · ${esc(e.depto)}<br><span class="muted">${esc(fDiaL(f))}${r.h ? ' · horario ' + r.h.ent + '–' + r.h.sal : ' · día de descanso'}${r.fer ? ' · ' + esc(r.fer) : ''}</span></p>
      <div class="row" style="margin-bottom:8px"><span class="b ${r.estado === 'falta' || r.estado === 'sinchecar' ? 'b-red' : r.estado === 'retardo' ? 'b-amb' : r.estado === 'inc' ? 'b-blu' : 'b-grn'}">${esc(EST_TXT[r.estado] || r.estado)}</span>${r.retardo ? `<span class="chip">Retardo <b>${r.retardo} min</b></span>` : ''}${r.trabMin ? `<span class="chip">Trabajó <b>${minTxt(r.trabMin)}</b></span>` : ''}${r.heMin ? `<span class="chip">TE checado <b>${minTxt(r.heMin)}</b> · autorizado <b>${minTxt(r.heAut)}</b></span>` : ''}${r.sol ? `<span class="chip">${esc(tipoN(r.sol.tipo))}</span>` : ''}</div>
      ${r.flags.length ? `<div class="warn small">${esc(r.flags.join(' · '))}</div>` : ''}
      <h3 style="margin-top:10px">Checadas</h3>
      ${r.chs.length ? '<div class="lista">' + r.chs.map((c, i) => `<div class="li"><b class="mono" style="font-size:15px">${hm(c.ts)}</b><span class="small">${i % 2 ? 'Salida' : 'Entrada'} · ${fuente[c.src] || c.src}${c.geo ? ` · ${c.geo.d != null ? Math.round(c.geo.d) + ' m de planta' : ''}${c.geo.fuera ? ' <span class="b b-amb">fuera de geocerca</span>' : ''}` : ''}${c.por ? ' · ' + esc(c.por) : ''}${c.nota ? ' · ' + esc(c.nota) : ''}</span>${c.foto ? `<img class="foto-ch" src="${c.foto}" alt="foto">` : ''}${ADM() && !lock ? `<button class="btn sm ghost danger" data-anula="${c._k}">Anular</button>` : ''}</div>`).join('') + '</div>' : '<div class="muted small">Sin checadas.</div>'}
      ${lock ? '<div class="note small" style="margin-top:8px">La semana ya se cerró para nómina. Solo el master puede corregirla.</div>' : ''}`;
    const bts = [{ t: 'Cerrar' }];
    if (!lock && U.rol !== 'director') {
      if (ADM()) bts.unshift({ t: 'Agregar checada', antes: () => { setTimeout(() => checadaManual(id, f), 50); } });
      bts.unshift({ t: ADM() ? 'Justificar / incidencia' : 'Solicitar justificación', antes: () => { setTimeout(() => nuevaSolicitud(id, { desde: f, hasta: f, tipo: r.estado === 'retardo' ? 'PHR' : 'PCG' }), 50); } });
      if (r.heMin > r.heAut) bts.unshift({ t: 'Autorizar TE ' + minTxt(r.heMin - r.heAut), c: 'pri', antes: () => { setTimeout(() => nuevoTE([id], f, r.heMin - r.heAut), 50); } });
    }
    await I.modal('Detalle del día', html, bts, { ancho: true, sinFoco: true, onOpen: ov => {
      $$('[data-anula]', ov).forEach(b => b.onclick = async () => { const mot = await I.pedirTexto('Anular checada', 'Motivo (queda en la bitácora)', true); if (!mot) return; await DB.update({ ['checadas/' + f + '/' + id + '/' + b.dataset.anula + '/anulada']: { por: U.nombre, ts: I.now(), motivo: mot } }); I.log('Anuló checada', e.nombre + ' ' + f + ' · ' + mot); I.toast('Checada anulada', 'ok'); ov.remove(); });
    } });
  }
  async function checadaManual(id, f) {
    const e = emp(id);
    await I.modal('Checada manual', `<p>${esc(e.nombre)} · ${esc(fDiaL(f))}</p><div class="form"><label>Hora<input id="cm-h" type="time" value="${(I.horario(e, f, C()) || { ent: '08:00' }).ent}"></label><label>Día real de la checada<input id="cm-f" type="date" value="${f}"></label><label class="full">Motivo (obligatorio)<select id="cm-m"><option>Olvidó checar</option><option>Falla del checador / sin internet</option><option>Gafete extraviado</option><option>Salió a comisión</option><option>Corrección autorizada por jefe</option><option>Otro</option></select></label><label class="full">Nota<input id="cm-n"></label></div>`, [{ t: 'Cancelar' }, { t: 'Guardar', c: 'pri', antes: async ov => {
      const h = $('#cm-h', ov).value, fr = $('#cm-f', ov).value; if (!h) return false;
      const [y, mo, d] = fr.split('-').map(Number); const [hh, mm] = h.split(':').map(Number); const ts = new Date(y, mo - 1, d, hh, mm).getTime();
      await DB.set('checadas/' + f + '/' + id + '/' + DB.key(), { ts, src: 'manual', por: U.nombre, nota: $('#cm-m', ov).value + ($('#cm-n', ov).value ? ' · ' + $('#cm-n', ov).value : ''), cap: I.now() });
      I.log('Checada manual', e.nombre + ' ' + fr + ' ' + h); I.toast('Checada agregada', 'ok');
    } }]);
  }

  /* Importar del reloj checador (Excel o CSV): sirve para tu formato semanal actual y para el log de un reloj biométrico */
  async function importarReloj() {
    await I.modal('Importar del reloj checador', `<p class="muted small">Acepta el reporte de tu reloj (una fila por checada: empleado, fecha, hora) o tu formato semanal actual (NOMBRE · DÍA · FECHA · ENTRADA · SALIDA). Los nombres se empatan con la plantilla aunque vengan incompletos.</p><input type="file" id="r-f" accept=".xlsx,.xls,.csv"><div id="r-m" style="margin-top:10px"></div>`, [{ t: 'Cerrar' }], { ancho: true, onOpen: ov => {
      $('#r-f', ov).onchange = async ev => {
        const f = ev.target.files[0]; if (!f) return; const wb = await I.leerExcel(f); const box = $('#r-m', ov);
        const pinta = hoja => {
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, raw: true, defval: null });
          const hi = Math.max(0, rows.findIndex(r => r && r.filter(c => typeof c === 'string' && /NOMBRE|EMPLEADO|FECHA|ENTRADA|HORA|ID|NO\.?/i.test(c)).length >= 2));
          const H = (rows[hi] || []).map((c, i) => String(c || 'Columna ' + (i + 1)).trim());
          const g = re => Math.max(-1, H.findIndex(h => re.test(h)));
          const sel = (id, v, opc) => `<select id="${id}">${opc ? '<option value="-1">(no aplica)</option>' : ''}${H.map((h, i) => `<option value="${i}" ${i === v ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select>`;
          box.innerHTML = `<div class="form"><label>Hoja<select id="r-h">${wb.SheetNames.map(n => `<option ${n === hoja ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
            <label>Empleado (número o nombre)${sel('r-e', g(/NOMBRE|EMPLEADO|ADMON|NAME/i) >= 0 ? g(/NOMBRE|EMPLEADO|ADMON|NAME/i) : g(/^ID|NO/i))}</label>
            <label>Fecha${sel('r-d', g(/FECHA|DATE/i))}</label>
            <label>Hora / Entrada${sel('r-i', g(/ENTRADA|HORA|TIME|CHECK/i))}</label>
            <label>Salida${sel('r-o', g(/SALIDA/i), true)}</label></div>
            <button class="btn" id="r-prev">Revisar</button><div id="r-res" style="margin-top:10px"></div>`;
          $('#r-h', box).onchange = e2 => pinta(e2.target.value);
          $('#r-prev', box).onclick = () => {
            const ce = +$('#r-e', box).value, cd = +$('#r-d', box).value, ci = +$('#r-i', box).value, co = +$('#r-o', box).value;
            const L = emps(true); const ok = [], noEmp = {}, malas = [];
            const toDate = v => { if (v == null || v === '') return null; if (v instanceof Date) return I.iso(v); if (typeof v === 'number') return I.iso(new Date(Math.round((v - 25569) * 864e5) + new Date().getTimezoneOffset() * 60000)); const s = String(v).trim(); let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return m[1] + '-' + I.pad(m[2]) + '-' + I.pad(m[3]); m = s.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/); if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + I.pad(m[2]) + '-' + I.pad(m[1]); return null; };
            const toMin = v => { if (v == null || v === '') return null; if (v instanceof Date) return v.getHours() * 60 + v.getMinutes(); if (typeof v === 'number') { const fr = v % 1; return Math.round(fr * 1440) % 1440; } const m = String(v).match(/(\d{1,2}):(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : null; };
            rows.slice(hi + 1).forEach((r, i) => {
              if (!r) return; const who = r[ce]; if (who == null || who === '') return;
              const fe = toDate(r[cd]); const mi = toMin(r[ci]); const mo = co >= 0 ? toMin(r[co]) : null;
              if (!fe || (mi == null && mo == null)) { if (r[ci] != null && String(r[ci]).trim()) malas.push({ i: i + hi + 2, who, t: String(r[ci]) }); return; }
              const e = I.buscarEmpleado(who, L); if (!e) { noEmp[who] = (noEmp[who] || 0) + 1; return; }
              const [y, m, d] = fe.split('-').map(Number);
              if (mi != null) ok.push({ e, ts: new Date(y, m - 1, d, Math.floor(mi / 60), mi % 60).getTime() });
              if (mo != null) { let ts = new Date(y, m - 1, d, Math.floor(mo / 60), mo % 60).getTime(); if (mi != null && mo < mi) ts += 864e5; ok.push({ e, ts }); }
            });
            const dupe = c => { const f2 = I.fechaLaboral(c.e, c.ts, C()); return Object.values((D.checadas[f2] || {})[c.e._k] || {}).some(x => Math.abs(x.ts - c.ts) < 60000); };
            const nuevos = ok.filter(c => !dupe(c));
            $('#r-res', box).innerHTML = `<div class="note">Checadas leídas: <b>${ok.length}</b> · nuevas: <b>${nuevos.length}</b> · ya existían: ${ok.length - nuevos.length}</div>
              ${Object.keys(noEmp).length ? `<div class="warn small" style="margin-top:6px">No encontré en la plantilla (${Object.keys(noEmp).length}): ${Object.keys(noEmp).slice(0, 40).map(esc).join(' · ')}</div>` : ''}
              ${malas.length ? `<div class="muted small" style="margin-top:6px">${malas.length} filas con texto en lugar de hora (p. ej. "${esc(malas[0].t)}"): captúralas como incidencia.</div>` : ''}
              <button class="btn pri" id="r-ok" style="margin-top:8px" ${nuevos.length ? '' : 'disabled'}>Importar ${nuevos.length} checadas</button>`;
            if ($('#r-ok', box)) $('#r-ok', box).onclick = async () => {
              const up = {}; nuevos.forEach(c => { const f2 = I.fechaLaboral(c.e, c.ts, C()); up['checadas/' + f2 + '/' + c.e._k + '/' + DB.key()] = { ts: c.ts, src: 'reloj', por: U.nombre }; });
              const ks = Object.keys(up); for (let i = 0; i < ks.length; i += 400) { const o = {}; ks.slice(i, i + 400).forEach(k => o[k] = up[k]); await DB.update(o); }
              I.log('Importó checadas del reloj', nuevos.length + ' desde ' + f.name); I.toast('Importadas ' + nuevos.length + ' checadas ✔', 'ok'); $('#r-res', box).innerHTML = '<div class="note">Listo.</div>';
            };
          };
        };
        pinta(wb.SheetNames[wb.SheetNames.length - 1]);
      };
    } });
  }

  /* ============================================================ SOLICITUDES (vacaciones, permisos, incidencias) */
  async function nuevaSolicitud(id, pre) {
    pre = pre || {}; const T = C().tipos; let firma = null;
    const lista = ord(visibles());
    const html = `<div class="form">
      <label class="full">Empleado<select id="n-e">${optEmps(id || '', lista)}</select></label>
      <label>Tipo<select id="n-t">${Object.keys(T).map(k => `<option value="${k}" ${k === (pre.tipo || 'VAC') ? 'selected' : ''}>${esc(T[k].nombre)}</option>`).join('')}</select></label>
      <label>Del<input type="date" id="n-d" value="${pre.desde || addDias(I.hoyISO(), 1)}"></label>
      <label>Al<input type="date" id="n-a" value="${pre.hasta || pre.desde || addDias(I.hoyISO(), 1)}"></label>
      <label class="hrs">De (hora)<input type="time" id="n-h1" value="09:00"></label><label class="hrs">A (hora)<input type="time" id="n-h2" value="13:00"></label>
      <label class="hrs">¿Descontable del salario?<select id="n-des"><option value="0">No</option><option value="1">Sí</option></select></label>
      <label class="hrs">¿Recompensado (tiempo por tiempo)?<select id="n-rec"><option value="0">No</option><option value="1">Sí, lo repone / sale de su banco de horas</option></select></label>
      <label class="fol">Folio IMSS<input id="n-fol"></label><label class="fol">Ramo<select id="n-ramo"><option>Enfermedad general</option><option>Riesgo de trabajo</option><option>Maternidad</option></select></label>
      <label class="vac full">Quién cubre el puesto<select id="n-c"><option value="">(sin asignar)</option></select></label>
      <label class="full">Motivo / observaciones<input id="n-m" value="${esc(pre.motivo || '')}"></label>
      <label class="full">Evidencia (foto del comprobante, opcional)<input type="file" id="n-ev" accept="image/*" capture="environment"></label>
    </div><div id="n-info"></div>`;
    await I.modal('Nueva solicitud', html, [{ t: 'Cancelar' }, { t: 'Registrar', c: 'pri', antes: async ov => {
      const r = calc(ov); if (r.err) { I.toast(r.err, 'err'); return false; }
      const e = r.e; const tipo = r.tipo;
      const d = { tipo, desde: r.desde, hasta: r.hasta, dias: r.dias, motivo: $('#n-m', ov).value.trim(), ts: I.now(), por: U.nombre, porUid: U.uid, estado: 'pendiente' };
      if (T[tipo].unidad === 'horas') { d.horaDe = $('#n-h1', ov).value; d.horaA = $('#n-h2', ov).value; d.horas = r.horas; d.descontable = $('#n-des', ov).value === '1'; d.recompensado = $('#n-rec', ov).value === '1'; d.hasta = d.desde; d.dias = 0; }
      if (T[tipo].folio) { d.folio = $('#n-fol', ov).value.trim(); d.ramo = $('#n-ramo', ov).value; if (!d.folio) { I.toast('Captura el folio de la incapacidad', 'err'); return false; } }
      if (tipo === 'VAC') { d.cubre = $('#n-c', ov).value || null; d.saldoAntes = r.v.saldo; if (r.adelantadas) d.adelantadas = true; }
      const ev = $('#n-ev', ov).files[0]; if (ev) d.evidencia = await miniFoto(ev, 900);
      d.pasos = I.autoPasos(I.pasosPara(tipo, C()), U, e);
      if (I.pasoActual(d) < 0) d.estado = 'aprobada';
      Object.keys(d).forEach(k => d[k] == null && delete d[k]);
      await DB.push('solicitudes/' + e._k, d); I.log('Solicitud ' + tipoN(tipo), e.nombre + ' ' + d.desde + (d.estado === 'aprobada' ? ' (aprobada al capturar)' : ''));
      I.toast(d.estado === 'aprobada' ? 'Registrada y aprobada ✔' : 'Enviada a autorización ✔', 'ok');
    } }], { ancho: true, onOpen: ov => { ['#n-e', '#n-t', '#n-d', '#n-a', '#n-h1', '#n-h2'].forEach(s => $(s, ov).onchange = () => calc(ov)); calc(ov); } });
    function calc(ov) {
      const e = emp($('#n-e', ov).value), tipo = $('#n-t', ov).value, tp = T[tipo]; const desde = $('#n-d', ov).value; let hasta = $('#n-a', ov).value;
      $$('.hrs', ov).forEach(x => x.hidden = tp.unidad !== 'horas'); $$('.fol', ov).forEach(x => x.hidden = !tp.folio); $$('.vac', ov).forEach(x => x.hidden = tipo !== 'VAC');
      $('#n-a', ov).disabled = tp.unidad === 'horas';
      if (tp.unidad === 'horas') hasta = desde;
      const sc = $('#n-c', ov); if (e && sc.dataset.e !== e._k) { sc.dataset.e = e._k; sc.innerHTML = '<option value="">(sin asignar)</option>' + emps().filter(x => x.depto === e.depto && x._k !== e._k).map(x => `<option value="${x._k}">${esc(x.nombre)}</option>`).join(''); }
      const out = { e, tipo, desde, hasta };
      if (!e) return Object.assign(out, { err: 'Elige al empleado' });
      if (!desde || !hasta || hasta < desde) { $('#n-info', ov).innerHTML = '<div class="warn">Revisa las fechas.</div>'; return Object.assign(out, { err: 'Revisa las fechas' }); }
      const dh = I.diasHabiles(e, desde, hasta, C()); out.dias = dh.n;
      const msgs = [];
      if (tp.unidad === 'horas') { const h = (I.toMin($('#n-h2', ov).value) - I.toMin($('#n-h1', ov).value)) / 60; out.horas = Math.max(0, Math.round(h * 100) / 100); msgs.push(`<span class="chip">Horas <b>${fmt(out.horas)}</b></span>`); if (!out.horas) out.err = 'Revisa el horario'; }
      else msgs.push(`<span class="chip">Días laborables <b>${dh.n}</b></span><span class="chip">Regresa <b>${esc(fDiaL(I.regreso(e, hasta, C())))}</b></span>`);
      const choque = vals((D.solicitudes || {})[e._k]).filter(s => ['pendiente', 'aprobada'].includes(s.estado) && s.desde <= hasta && (s.hasta || s.desde) >= desde);
      if (choque.length) msgs.push(`<div class="warn small">Ya tiene ${esc(tipoN(choque[0].tipo))} del ${esc(fDia(choque[0].desde))} al ${esc(fDia(choque[0].hasta))} (${choque[0].estado}).</div>`);
      if (tipo === 'VAC') {
        const v = I.vacSaldo(e, D); out.v = v;
        msgs.push(`<span class="chip">Saldo <b>${fmt(v.saldo)}</b></span><span class="chip">En trámite <b>${fmt(v.pendientes)}</b></span><span class="chip">Le quedarían <b class="${v.disponible - dh.n < 0 ? 'neg' : ''}">${fmt(v.disponible - dh.n)}</b></span>`);
        if (v.disponible - dh.n < 0) { if (C().p.vacPermitirAdelantadas) { out.adelantadas = true; msgs.push('<div class="warn small">No le alcanza el saldo: quedará como <b>vacaciones adelantadas</b> (se descuentan de su próximo aniversario).</div>'); } else out.err = 'No le alcanza el saldo de vacaciones'; }
        const ant = difDias(I.hoyISO(), desde); if (ant < C().p.vacAnticipacion) msgs.push(`<div class="note small">Se pide con ${ant} día(s) de anticipación (lo sugerido son ${C().p.vacAnticipacion}).</div>`);
        const comp = emps().filter(x => x.depto === e.depto); let peor = 0, fp = '';
        dh.lista.forEach(f => { const n = comp.filter(x => x._k !== e._k && ((X.solIdx[x._k] || {})[f] || (X.pendIdx[x._k] || {})[f])).length + 1; if (n > peor) { peor = n; fp = f; } });
        if (comp.length >= 3 && peor / comp.length * 100 > C().p.vacTopeAusentesPct) msgs.push(`<div class="warn small">El ${esc(fDia(fp))} faltarían ${peor} de ${comp.length} personas de ${esc(e.depto)} (tope ${C().p.vacTopeAusentesPct} %).</div>`);
      }
      const pasos = I.autoPasos(I.pasosPara(tipo, C()), U, e);
      msgs.push(`<div class="pasos">${pasos.map(p => `<span class="b ${p.estado === 'ok' ? 'b-grn' : 'b-gry'}">${esc(ROL_TXT[p.rol] || p.rol)}${p.estado === 'ok' ? ' ✓' : ''}</span>`).join(' → ')}</div>`);
      $('#n-info', ov).innerHTML = '<div class="row" style="margin-top:8px">' + msgs.join('') + '</div>';
      return out;
    }
  }
  function miniFoto(file, max) {
    return new Promise(ok => { const r = new FileReader(); r.onload = () => { const im = new Image(); im.onload = () => { const s = Math.min(1, max / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = im.width * s; c.height = im.height * s; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); ok(c.toDataURL('image/jpeg', 0.6)); }; im.onerror = () => ok(null); im.src = r.result; }; r.readAsDataURL(file); });
  }

  /* ============================================================ AUTORIZACIONES */
  VISTAS.autorizaciones = function (m) {
    const Q = cola();
    const hist = []; const desde = addDias(I.hoyISO(), -60);
    if (UI.autF !== 'pend') {
      Object.keys(D.solicitudes || {}).forEach(eid => Object.keys(D.solicitudes[eid] || {}).forEach(id => { const s = D.solicitudes[eid][id]; const e = emp(eid); if (!e || (U.rol === 'jefe' && !I.esJefeDe(U, e))) return; if ((s.desde || '') >= desde && (UI.autF === 'todas' || s.estado === UI.autF)) hist.push({ k: 'sol', eid, id, s, e }); }));
      Object.keys(D.he || {}).forEach(eid => Object.keys(D.he[eid] || {}).forEach(id => { const s = D.he[eid][id]; const e = emp(eid); if (!e || (U.rol === 'jefe' && !I.esJefeDe(U, e))) return; if ((s.fecha || '') >= desde && (UI.autF === 'todas' || s.estado === UI.autF)) hist.push({ k: 'he', eid, id, s, e }); }));
      hist.sort((a, b) => (b.s.ts || 0) - (a.s.ts || 0));
    }
    const L = UI.autF === 'pend' ? Q : hist;
    m.innerHTML = `<div class="card"><div class="card-h"><h2>Autorizaciones</h2><div class="seg" id="af">${[['pend', 'Por autorizar (' + Q.length + ')'], ['aprobada', 'Aprobadas'], ['rechazada', 'Rechazadas'], ['todas', 'Todas (60 días)']].map(([v, t]) => `<button data-v="${v}" class="${UI.autF === v ? 'on' : ''}">${t}</button>`).join('')}</div><span class="sp"></span>${U.rol !== 'director' ? '<button class="btn pri" id="au-n">+ Nueva solicitud</button>' : ''}</div>
      ${L.length ? '<div class="sol-lista">' + L.map(tarjetaSol).join('') + '</div>' : `<div class="empty">${UI.autF === 'pend' ? 'No tienes nada pendiente por autorizar.' : 'Sin registros.'}</div>`}</div>`;
    $$('#af button').forEach(b => b.onclick = () => { UI.autF = b.dataset.v; render(); });
    if ($('#au-n')) $('#au-n').onclick = () => nuevaSolicitud();
    $$('[data-ok]', m).forEach(b => b.onclick = () => resolver(b.dataset.ok, true));
    $$('[data-no]', m).forEach(b => b.onclick = () => resolver(b.dataset.no, false));
    $$('[data-can]', m).forEach(b => b.onclick = () => cancelarSol(b.dataset.can));
    $$('[data-fmt2]', m).forEach(b => b.onclick = () => { const [eid, id] = b.dataset.fmt2.split('|'); formato(eid, id); });
    $$('[data-ev]', m).forEach(b => b.onclick = () => { const [k, eid, id] = b.dataset.ev.split('|'); const s = (k === 'he' ? D.he : D.solicitudes)[eid][id]; I.modal('Evidencia', `<img src="${s.evidencia}" style="width:100%;border-radius:8px" alt="evidencia">`); });
    bindComunes(m);
  };
  function tarjetaSol(x) {
    const s = x.s, e = x.e, he = x.k === 'he'; const ref = x.k + '|' + x.eid + '|' + x.id;
    const i = I.pasoActual(s); const mio = s.estado === 'pendiente' && i >= 0 && I.puedePaso(U, s.pasos[i], e);
    let det = '';
    if (he) det = `${esc(fDia(s.fecha))} · <b>${minTxt(s.min)}</b> · ${s.forma === 'banco' ? 'a banco de horas' : 'pago'}`;
    else {
      det = `${esc(fDia(s.desde))}${s.hasta && s.hasta !== s.desde ? ' al ' + esc(fDia(s.hasta)) : ''}${s.dias ? ' · <b>' + s.dias + ' día(s)</b>' : ''}${s.horas ? ' · <b>' + fmt(s.horas) + ' h</b> (' + esc(s.horaDe) + '–' + esc(s.horaA) + ')' : ''}`;
      if (s.tipo === 'VAC') { const v = I.vacSaldo(e, D); det += ` · saldo ${fmt(v.saldo)}${s.estado === 'pendiente' ? ' → quedaría ' + fmt(v.saldo - s.dias) : ''}${s.adelantadas ? ' <span class="b b-amb">adelantadas</span>' : ''}`; }
      if (s.cubre) det += ' · cubre ' + esc(nomE(s.cubre));
      if (s.folio) det += ' · folio ' + esc(s.folio);
      if (s.descontable) det += ' · <span class="b b-amb">descontable</span>'; if (s.recompensado) det += ' · <span class="b b-blu">tiempo por tiempo</span>';
    }
    const conflicto = (!he && s.estado === 'pendiente' && s.tipo === 'VAC') ? (() => { const comp = emps().filter(y => y.depto === e.depto && y._k !== e._k); const n = comp.filter(y => { for (let f = s.desde; f <= s.hasta; f = addDias(f, 1)) { if ((X.solIdx[y._k] || {})[f]) return true; } return false; }); return n.length ? `<div class="small low">También ausentes en esas fechas: ${n.map(y => esc(y.nombre)).join(', ')}</div>` : ''; })() : '';
    return `<div class="sol ${mio ? 'mio' : ''}"><div class="row"><span class="b ${he ? 'b-amb' : 'b-' + ((C().tipos[s.tipo] || {}).color || 'blu')}">${esc(he ? 'Tiempo extra' : tipoN(s.tipo))}</span><a href="#" data-ficha="${x.eid}"><b>${esc(e.nombre)}</b></a><span class="muted small">${esc(e.depto)}</span><span class="sp"></span><span class="b ${ESTADO_CLS[s.estado]}">${esc(s.estado)}</span></div>
      <div class="small" style="margin-top:4px">${det}</div>${s.motivo ? `<div class="small muted">“${esc(s.motivo)}”</div>` : ''}${conflicto}
      <div class="pasos small" style="margin-top:6px">${(s.pasos || []).map(p => `<span class="b ${p.estado === 'ok' ? 'b-grn' : p.estado === 'no' ? 'b-red' : 'b-gry'}" title="${esc((p.por || '') + (p.ts ? ' · ' + fFecha(p.ts) : '') + (p.nota ? ' · ' + p.nota : ''))}">${esc(ROL_TXT[p.rol] || p.rol)}${p.estado === 'ok' ? ' ✓' : p.estado === 'no' ? ' ✕' : ''}</span>`).join(' → ')} <span class="muted">· pidió ${esc(s.por || '')} ${s.ts ? fFecha(s.ts) : ''}</span></div>
      <div class="row" style="margin-top:8px">${mio ? `<button class="btn ok sm" data-ok="${ref}">Autorizar</button><button class="btn danger sm" data-no="${ref}">Rechazar</button>` : ''}${s.firmaEmp ? `<img class="firma-mini" src="${s.firmaEmp}" alt="firma">` : ''}${s.evidencia ? `<button class="btn sm ghost" data-ev="${ref}">Ver evidencia</button>` : ''}${!he && (s.tipo === 'VAC' || C().tipos[s.tipo]?.grupo === 'PERM') ? `<button class="btn sm ghost" data-fmt2="${x.eid}|${x.id}">Formato</button>` : ''}${ADM() && s.estado !== 'cancelada' && s.estado !== 'rechazada' ? `<button class="btn sm ghost" data-can="${ref}">Cancelar</button>` : ''}</div></div>`;
  }
  async function resolver(ref, si) {
    const [k, eid, id] = ref.split('|'); const base = (k === 'he' ? 'he/' : 'solicitudes/') + eid + '/' + id;
    const s = (k === 'he' ? D.he : D.solicitudes)[eid][id]; const e = emp(eid); const i = I.pasoActual(s);
    if (i < 0 || !I.puedePaso(U, s.pasos[i], e)) { I.toast('Ya no te toca este paso', 'err'); return; }
    if (k === 'sol' && cerrada(I.semana(s.desde, C()).key) && !MASTER()) { I.toast('Esa semana ya se cerró para nómina', 'err'); return; }
    let nota = '';
    if (!si) { nota = await I.pedirTexto('Rechazar', 'Motivo del rechazo (lo verá el empleado)', true); if (!nota) return; }
    const pasos = s.pasos.map(p => Object.assign({}, p));
    pasos[i] = Object.assign(pasos[i], { estado: si ? 'ok' : 'no', por: U.nombre + (pasos[i].rol === 'jefe' && U.rol !== 'jefe' ? ' (en lugar del jefe)' : ''), ts: I.now(), nota: nota || null });
    if (si) for (let j = i + 1; j < pasos.length; j++) { if (pasos[j].estado === 'pend' && I.puedePaso(U, pasos[j], e) && U.rol === 'master') { pasos[j] = Object.assign(pasos[j], { estado: 'ok', por: U.nombre, ts: I.now(), auto: true }); } else break; }
    const estado = !si ? 'rechazada' : (pasos.some(p => p.estado === 'pend') ? 'pendiente' : 'aprobada');
    Object.keys(pasos).forEach(j => Object.keys(pasos[j]).forEach(f => pasos[j][f] == null && delete pasos[j][f]));
    await DB.update({ [base + '/pasos']: pasos, [base + '/estado']: estado });
    I.log((si ? 'Autorizó ' : 'Rechazó ') + (k === 'he' ? 'tiempo extra' : tipoN(s.tipo)), e.nombre + ' ' + (s.desde || s.fecha) + (nota ? ' · ' + nota : ''));
    I.toast(si ? (estado === 'aprobada' ? 'Aprobada ✔' : 'Autorizada, pasa al siguiente nivel') : 'Rechazada', si ? 'ok' : '');
  }
  async function cancelarSol(ref) {
    const [k, eid, id] = ref.split('|'); const base = (k === 'he' ? 'he/' : 'solicitudes/') + eid + '/' + id;
    const mot = await I.pedirTexto('Cancelar', 'Motivo de la cancelación', true); if (!mot) return;
    await DB.update({ [base + '/estado']: 'cancelada', [base + '/cancelada']: { por: U.nombre, ts: I.now(), motivo: mot } }); I.log('Canceló solicitud', nomE(eid) + ' · ' + mot); I.toast('Cancelada', 'ok');
  }

  /* Formatos impresos: AVISO DE VACACIONES y SOLICITUD DE PERMISO (mismos campos que tu formato original) */
  async function formato(eid, id) {
    const s = D.solicitudes[eid][id], e = emp(eid); const v = I.vacSaldo(e, D);
    const firmaDe = rol => { const p = (s.pasos || []).find(x => x.rol === rol && x.estado === 'ok'); return p ? `<div class="f-dig">Autorizado digitalmente<br>${esc(p.por)}<br>${fFecha(p.ts)}</div>` : ''; };
    const hdr = t => `<div class="fm-h"><div class="fm-logo"><img src="img/logo-19h.png" alt="Los 19 Hermanos"><img src="img/logo-petfood.png" alt="División Pet Food"></div><div class="fm-t">${t}</div><div class="fm-f">${esc(fDia(I.iso(new Date(s.ts || I.now()))))}</div></div>`;
    const firmas = `<div class="fm-firmas"><div><div class="fm-lin">${firmaDe('jefe')}</div>JEFE DE DEPARTAMENTO</div><div><div class="fm-lin">${s.firmaEmp ? `<img src="${s.firmaEmp}" alt="firma">` : ''}</div>FIRMA DEL INTERESADO<br><b>${esc(e.nombre)}</b></div><div><div class="fm-lin">${firmaDe('director')}</div>DIRECTOR GENERAL</div><div><div class="fm-lin">${firmaDe('rh')}</div>REVISADO / ENTERADA RECURSOS HUMANOS</div></div>`;
    let html;
    if (s.tipo === 'VAC') {
      const antes = s.saldoAntes != null ? s.saldoAntes : v.saldo + (s.estado === 'aprobada' ? s.dias : 0);
      html = `<div class="formato">${hdr('AVISO DE VACACIONES')}
        <table class="fm"><tr><th colspan="3">APELLIDOS PATERNO, MATERNO Y NOMBRE</th></tr><tr><td colspan="3" class="big">${esc(e.nombre)}</td></tr>
        <tr><th>DEPARTAMENTO</th><th>FECHA DE INGRESO</th><th>ANTIGÜEDAD EN AÑOS CUMPLIDOS</th></tr><tr><td>${esc(e.depto)}</td><td>${esc(fDia(e.ingreso))}</td><td>${Math.floor(I.antig(e.ingreso, s.desde))}</td></tr></table>
        <table class="fm"><tr><th>DÍAS QUE LE CORRESPONDEN (aniversario)</th><th>DÍAS A DISFRUTAR</th><th>SALDO ANTES</th><th>DEL</th><th>AL</th><th>RESTAN</th></tr>
        <tr><td>${I.diasLFT(Math.floor(I.antig(e.ingreso, s.desde)))}</td><td class="big">${s.dias}</td><td>${fmt(antes)}</td><td>${esc(fDia(s.desde))}</td><td>${esc(fDia(s.hasta))}</td><td class="big">${fmt(antes - s.dias)}</td></tr></table>
        <table class="fm"><tr><th>OBSERVACIONES</th></tr><tr><td class="obs">PRESENTARSE A TRABAJAR EL ${esc(fDiaL(I.regreso(e, s.hasta, C())).toUpperCase())}${s.motivo ? '<br>' + esc(s.motivo) : ''}${s.adelantadas ? '<br>VACACIONES ADELANTADAS' : ''}</td></tr></table>
        ${firmas}<table class="fm"><tr><th>QUIEN CUBRE EL PUESTO</th></tr><tr><td>${esc(s.cubre ? nomE(s.cubre) : '')}</td></tr></table>
        <div class="fm-cc">C: NÓMINA · C: INTERESADO · C: EXPEDIENTE · Folio ${esc(id)}</div></div>`;
    } else {
      const tp = C().tipos[s.tipo] || {}; const chk = c => c ? '☒' : '☐';
      html = `<div class="formato">${hdr('FORMATO DE SOLICITUD DE PERMISO')}
        <table class="fm"><tr><th colspan="2">APELLIDOS PATERNO, MATERNO Y NOMBRE</th></tr><tr><td colspan="2" class="big">${esc(e.nombre)}</td></tr><tr><th>DEPARTAMENTO</th><th>FECHA DE SOLICITUD</th></tr><tr><td>${esc(e.depto)}</td><td>${esc(fFecha(s.ts))}</td></tr></table>
        <table class="fm"><tr><th>PERMISO POR HORAS</th><th>DEL</th><th>AL</th></tr><tr><td>${s.horas ? fmt(s.horas) + ' HRS · ' + esc(s.horaDe) + ' a ' + esc(s.horaA) : '—'}</td><td>${esc(fDia(s.desde))}</td><td>${esc(fDia(s.hasta || s.desde))}${s.dias ? ' (' + s.dias + ' días)' : ''}</td></tr></table>
        <table class="fm"><tr><td>Descontable del salario: ${chk(s.descontable || tp.goce === false)} Sí ${chk(!(s.descontable || tp.goce === false))} No</td><td>Recompensado: ${chk(s.recompensado)} Sí ${chk(!s.recompensado)} No</td></tr>
        <tr><td colspan="2">Motivo: ${chk(s.tipo === 'CMD')} Cita médica ${chk(s.tipo === 'LPA')} Licencia paternidad ${chk(s.tipo === 'LUT')} Licencia por luto ${chk(!['CMD', 'LPA', 'LUT'].includes(s.tipo))} Otro: ${!['CMD', 'LPA', 'LUT'].includes(s.tipo) ? esc(tp.nombre || s.tipo) : ''}</td></tr></table>
        <table class="fm"><tr><th>OBSERVACIONES</th></tr><tr><td class="obs">${esc(s.motivo || '')}${s.evidencia ? '<br>Documento soporte anexo en el sistema' : ''}</td></tr></table>
        <div class="fm-cc">NOTA: ANEXAR DOCUMENTO QUE SOPORTE EL PERMISO</div>${firmas}<div class="fm-cc">C: NÓMINA · C: INTERESADO · C: EXPEDIENTE · Folio ${esc(id)}</div></div>`;
    }
    await I.modal(s.tipo === 'VAC' ? 'Aviso de vacaciones' : 'Solicitud de permiso', html, [{ t: 'Cerrar' }, !I.enIframe ? { t: 'Imprimir', c: 'pri', antes: () => { I.imprimir(html); return false; } } : null], { ancho: true, sinFoco: true });
  }

  /* ============================================================ VACACIONES */
  VISTAS.vacaciones = function (m) {
    const k = UI.vacMes; const a = k + '-01', b = I.finMes(k); const dias = []; for (let f = a; f <= b; f = addDias(f, 1)) dias.push(f);
    const L = ord(visibles().filter(e => !UI.depto || e.depto === UI.depto));
    const S = L.map(e => ({ e, v: I.vacSaldo(e, D) }));
    const tot = S.reduce((x, y) => { x.s += y.v.saldo; x.p += y.v.pendientes; x.pr += y.v.programadas; x.f += y.v.fueraPlazo; x.n += y.v.saldo < 0 ? 1 : 0; return x; }, { s: 0, p: 0, pr: 0, f: 0, n: 0 });
    const conAus = L.filter(e => dias.some(f => (X.solIdx[e._k] || {})[f] || (X.pendIdx[e._k] || {})[f]));
    let dep = null;
    const gantt = conAus.map(e => {
      const fila = dias.map(f => { const s = (X.solIdx[e._k] || {})[f], p = (X.pendIdx[e._k] || {})[f]; const x = s || p; if (!x) return `<td class="${I.horario(e, f, C()) && !I.esFeriado(f, C()) ? '' : 'g-off'}"></td>`; return `<td class="g-${s ? 'ok' : 'pend'} g-${x.tipo}" title="${esc(tipoN(x.tipo) + ' · ' + (s ? 'aprobada' : 'en trámite'))}">${x.desde === f || f === a ? esc(x.tipo) : ''}</td>`; }).join('');
      const g = e.depto !== dep ? (dep = e.depto, `<tr class="grp"><td colspan="${dias.length + 1}">${esc(dep)}</td></tr>`) : '';
      return g + `<tr><td class="nm"><a href="#" data-ficha="${e._k}">${esc(e.nombre)}</a></td>${fila}</tr>`;
    }).join('');
    dep = null;
    const saldos = S.map(({ e, v }) => { const g = e.depto !== dep ? (dep = e.depto, `<tr class="grp"><td colspan="9">${esc(dep)}</td></tr>`) : ''; return g + `<tr data-ficha="${e._k}" style="cursor:pointer"><td>${esc(e.nombre)}</td><td class="num">${fmt(v.anios)}</td><td class="num">${v.actuales}</td><td class="num ${v.saldo < 0 ? 'neg' : ''}"><b>${fmt(v.saldo)}</b></td><td class="num">${v.programadas || ''}</td><td class="num">${v.pendientes || ''}</td><td class="small">${v.proximo ? esc(fDia(v.proximo.fecha)) + ' (+' + v.proximo.dias + ')' : ''}</td><td>${v.fueraPlazo ? `<span class="b b-red">${fmt(v.fueraPlazo)} fuera de plazo</span>` : v.porVencer ? `<span class="b b-amb">${fmt(v.porVencer)} por programar</span>` : ''}</td></tr>`; }).join('');
    m.innerHTML = `
    <div class="grid g4">${kpi('Días por disfrutar (saldo total)', fmt(tot.s, 0), L.length + ' personas', '')}${kpi('Programadas a futuro', fmt(tot.pr, 0), 'días aprobados', 'blu')}${kpi('En trámite', fmt(tot.p, 0), 'días por autorizar', tot.p ? 'amb' : '')}${kpi('Fuera de plazo (LFT art. 81)', fmt(tot.f, 0), tot.n + ' con saldo negativo', tot.f ? 'red' : '')}</div>
    <div class="card" style="margin-top:12px"><div class="card-h"><h2>Calendario de ausencias</h2><div class="row"><button class="btn sm" id="v-prev">◀</button><b>${esc(I.MESES_L[+k.slice(5) - 1])} ${k.slice(0, 4)}</b><button class="btn sm" id="v-next">▶</button></div><select id="v-d" style="max-width:260px">${optDeptos(UI.depto, U.rol !== 'jefe' || (U.deptos || []).length > 1)}</select><span class="sp"></span>${U.rol !== 'director' ? '<button class="btn pri" id="v-n">+ Solicitud</button>' : ''}</div>
      <div class="leyenda small"><span class="g-ok g-VAC">VAC aprobada</span><span class="g-pend">En trámite</span><span class="g-ok g-INC">Incapacidad</span><span class="g-ok g-PCG">Permiso</span><span class="g-off">Descanso/festivo</span></div>
      ${conAus.length ? `<div class="tw"><table class="gantt"><thead><tr><th>Empleado</th>${dias.map(f => `<th class="c ${I.parseISO(f).getDay() === 0 ? 'dom' : ''}">${I.DIAS[I.parseISO(f).getDay()][0]}<br>${+f.slice(8)}</th>`).join('')}</tr></thead><tbody>${gantt}</tbody></table></div>` : '<div class="empty">Nadie ausente este mes.</div>'}</div>
    <div class="card"><div class="card-h"><h2>Saldos de vacaciones</h2><span class="muted small">Saldo inicial de tu Excel + aniversarios (LFT 2023: 12, 14, 16, 18, 20, luego +2 cada 5 años) − autorizadas ± ajustes</span><span class="sp"></span><button class="btn" id="v-x">Exportar saldos</button></div>
      <div class="tw"><table><thead><tr><th>Empleado</th><th class="num">Antig.</th><th class="num">Días/año</th><th class="num">Saldo</th><th class="num">Programadas</th><th class="num">En trámite</th><th>Próximo aniversario</th><th>Alerta</th></tr></thead><tbody>${saldos}</tbody></table></div></div>`;
    $('#v-prev').onclick = () => { UI.vacMes = I.addMes(k, -1); render(); };
    $('#v-next').onclick = () => { UI.vacMes = I.addMes(k, 1); render(); };
    $('#v-d').onchange = ev => { UI.depto = ev.target.value; guardaUI(); render(); };
    if ($('#v-n')) $('#v-n').onclick = () => nuevaSolicitud(null, { tipo: 'VAC' });
    $('#v-x').onclick = () => I.exportXlsx('Saldos_vacaciones_' + I.hoyISO() + '.xlsx', [{ nombre: 'Saldos', filas: [['No.', 'Empleado', 'Departamento', 'Ingreso', 'Antigüedad', 'Días por año', 'Saldo', 'Programadas', 'En trámite', 'Próximo aniversario', 'Días que se abonarán', 'Fuera de plazo', 'Prima vacacional 25% (días)']].concat(S.map(({ e, v }) => [e.num, e.nombre, e.depto, e.ingreso, Math.round(v.anios * 100) / 100, v.actuales, v.saldo, v.programadas, v.pendientes, v.proximo && v.proximo.fecha, v.proximo && v.proximo.dias, v.fueraPlazo, Math.round(v.actuales * 0.25 * 100) / 100])) }]);
    bindComunes(m);
  };

  /* ============================================================ TIEMPO EXTRA */
  VISTAS.extra = function (m) {
    const sem = I.semana(UI.heSem || I.hoyISO(), C()); UI.heSem = sem.key;
    const L = ord(visibles().filter(e => !UI.depto || e.depto === UI.depto));
    const R = L.map(e => I.calcSemana(e, sem, D, X)).filter(x => x.t.heMin || x.t.hePag || vals((D.he || {})[x.emp._k]).some(h => h.fecha >= sem.ini && h.fecha <= sem.fin));
    const pv = D.privado || {};
    const costo = x => { const sd = num((pv[x.emp._k] || {}).salarioDiario); if (!sd) return null; const vh = sd / 8; return vh * 2 * x.t.dobles / 60 + vh * 3 * x.t.triples / 60; };
    const T = R.reduce((a, x) => { a.c += x.t.heMin; a.p += x.t.hePag; a.s += x.t.heSinAut; a.d += x.t.dobles; a.t += x.t.triples; a.$ += costo(x) || 0; return a; }, { c: 0, p: 0, s: 0, d: 0, t: 0, $: 0 });
    const pend = [];
    Object.keys(D.he || {}).forEach(eid => Object.keys(D.he[eid] || {}).forEach(id => { const h = D.he[eid][id]; const e = emp(eid); if (!e || !L.includes(L.find(z => z._k === eid))) return; if (h.estado === 'pendiente') pend.push({ k: 'he', eid, id, s: h, e }); }));
    m.innerHTML = `
    <div class="grid g4">${kpi('TE checado', hTxt(T.c), 'según checadas', '')}${kpi('TE pagable', hTxt(T.p), 'checado y autorizado', 'grn')}${kpi('Sin autorización', hTxt(T.s), 'no se paga hasta autorizar', T.s ? 'amb' : '')}${kpi('Dobles / triples', hTxt(T.d) + ' / ' + hTxt(T.t), 'LFT art. 67-68 (9 h dobles por semana)', T.t ? 'red' : '')}${ADM() && T.$ ? kpi('Costo estimado', I.money(T.$), 'con salario diario capturado', '') : ''}</div>
    <div class="card" style="margin-top:12px"><div class="card-h"><h2>Tiempo extra por semana</h2><div class="row"><button class="btn sm" id="h-prev">◀</button><b>${esc(sem.label)}</b><button class="btn sm" id="h-next">▶</button></div><select id="h-d" style="max-width:240px">${optDeptos(UI.depto, U.rol !== 'jefe' || (U.deptos || []).length > 1)}</select><span class="sp"></span><button class="btn pri" id="h-n">Pre-autorizar tiempo extra</button></div>
      <p class="muted small">Regla: el jefe autoriza el tiempo extra antes o el mismo día; el sistema cruza lo autorizado contra lo checado y paga lo menor. Bloques de ${C().p.heBloque} min.</p>
      <div class="tw"><table><thead><tr><th>Empleado</th>${sem.dias.map(f => `<th class="c">${I.DIAS[I.parseISO(f).getDay()]} ${+f.slice(8)}</th>`).join('')}<th class="num">Checado</th><th class="num">Autorizado</th><th class="num">Pagable</th><th class="num">Dobles</th><th class="num">Triples</th>${ADM() ? '<th class="num">Costo</th>' : ''}</tr></thead><tbody>
      ${R.map(x => `<tr><td><a href="#" data-ficha="${x.emp._k}">${esc(x.emp.nombre)}</a><div class="tiny muted">${esc(x.emp.depto)}</div></td>${x.dias.map(r => `<td class="c ${r.heMin > r.heAut ? 'cell-amb' : ''}" ${r.heMin || r.heAut ? `data-dia="${x.emp._k}|${r.fecha}" style="cursor:pointer"` : ''}>${r.heMin || r.heAut ? `${r.heMin ? minTxt(r.heMin) : '—'}<div class="tiny muted">aut ${minTxt(r.heAut)}</div>` : ''}</td>`).join('')}<td class="num">${hTxt(x.t.heMin)}</td><td class="num">${hTxt(x.dias.reduce((a, r) => a + r.heAut, 0))}</td><td class="num"><b>${hTxt(x.t.hePag)}</b></td><td class="num">${hTxt(x.t.dobles)}</td><td class="num ${x.t.triples ? 'neg' : ''}">${x.t.triples ? hTxt(x.t.triples) : ''}</td>${ADM() ? `<td class="num">${costo(x) != null ? I.money(costo(x)) : '<span class="muted tiny">sin SD</span>'}</td>` : ''}</tr>`).join('') || '<tr><td colspan="15" class="empty">Sin tiempo extra esta semana</td></tr>'}</tbody></table></div></div>
    ${pend.length ? `<div class="card"><h3>Tiempo extra en trámite</h3><div class="sol-lista">${pend.map(tarjetaSol).join('')}</div></div>` : ''}`;
    $('#h-prev').onclick = () => { UI.heSem = addDias(sem.key, -7); render(); };
    $('#h-next').onclick = () => { UI.heSem = addDias(sem.key, 7); render(); };
    $('#h-d').onchange = ev => { UI.depto = ev.target.value; guardaUI(); render(); };
    $('#h-n').onclick = () => nuevoTE([], I.hoyISO(), 60);
    $$('[data-ok]', m).forEach(b => b.onclick = () => resolver(b.dataset.ok, true));
    $$('[data-no]', m).forEach(b => b.onclick = () => resolver(b.dataset.no, false));
    bindComunes(m);
  };
  async function nuevoTE(ids, f, min) {
    const L = ord(visibles());
    await I.modal('Autorizar tiempo extra', `<div class="form"><label>Fecha<input type="date" id="t-f" value="${f}"></label><label>Tiempo<select id="t-m">${[30, 60, 90, 120, 150, 180, 240, 300, 360, 480].map(x => `<option value="${x}" ${x === Math.round(min / 30) * 30 ? 'selected' : ''}>${minTxt(x)}</option>`).join('')}</select></label><label>Forma<select id="t-p"><option value="pago">Se paga (doble / triple)</option><option value="banco">Tiempo por tiempo (banco de horas)</option></select></label><label class="full">Motivo<input id="t-mo" placeholder="Ej. pedido urgente, falta de personal, mantenimiento"></label></div>
      <label>Personal (${L.length})</label><input id="t-q" placeholder="Filtrar"><div class="chk-lista" id="t-l">${L.map(e => `<label class="chk"><input type="checkbox" value="${e._k}" ${ids.includes(e._k) ? 'checked' : ''}> ${esc(e.nombre)} <span class="muted tiny">${esc(e.depto)}</span></label>`).join('')}</div>
      <p class="muted small">LFT: máximo 3 horas diarias ni más de 3 veces por semana como tiempo extraordinario ordinario; lo que pase de 9 horas a la semana se paga triple.</p>`, [{ t: 'Cancelar' }, { t: 'Autorizar', c: 'pri', antes: async ov => {
      const sel = $$('#t-l input:checked', ov).map(i => i.value); if (!sel.length) { I.toast('Elige al menos una persona', 'err'); return false; }
      const mo = $('#t-mo', ov).value.trim(); if (!mo) { I.toast('Escribe el motivo', 'err'); return false; }
      const up = {};
      sel.forEach(id => { const e = emp(id); const d = { fecha: $('#t-f', ov).value, min: +$('#t-m', ov).value, forma: $('#t-p', ov).value, motivo: mo, ts: I.now(), por: U.nombre, estado: 'pendiente' }; d.pasos = I.autoPasos(I.pasosPara('HE', C()), U, e); if (I.pasoActual(d) < 0) d.estado = 'aprobada'; up['he/' + id + '/' + DB.key()] = d; });
      await DB.update(up); I.log('Tiempo extra', sel.length + ' persona(s) ' + $('#t-f', ov).value + ' · ' + mo); I.toast('Registrado ✔', 'ok');
    } }], { ancho: true, onOpen: ov => { $('#t-q', ov).oninput = ev => { const q = I.normNom(ev.target.value); $$('#t-l .chk', ov).forEach(l => l.hidden = q && !I.normNom(l.textContent).includes(q)); }; } });
  }

  /* ============================================================ ROTACIÓN */
  VISTAS.rotacion = function (m) {
    const hoy = I.hoyISO(); const meses = Array.from({ length: 12 }, (_, i) => I.addMes(hoy.slice(0, 7), i - 11));
    const todos = emps(true); const R = I.rotacion(todos, meses);
    const bajas = [].concat(...R.serie.map(s => s.lista)).sort((a, b) => b.baja.fecha.localeCompare(a.baja.fecha));
    const porTipo = {}, porMot = {}; bajas.forEach(e => { porTipo[e.baja.tipo] = (porTipo[e.baja.tipo] || 0) + 1; porMot[e.baja.motivo || 'Sin motivo'] = (porMot[e.baja.motivo || 'Sin motivo'] || 0) + 1; });
    const COLS = ['var(--acc)', 'var(--red)', 'var(--blu)', 'var(--grn)', '#b48cff', '#5ad1c8', '#e07ab0', 'var(--muted)'];
    const porDep = deptosUsados().map(d => { const r = I.rotacion(todos, meses, e => e.depto === d); return { d, r }; }).filter(x => x.r.totalBajas || x.r.promPlantilla).sort((a, b) => b.r.anual - a.r.anual);
    const antB = bajas.length ? bajas.reduce((a, e) => a + difDias(e.ingreso, e.baja.fecha), 0) / bajas.length : 0;
    const sinFecha = todos.filter(e => e.estatus === 'baja' && (!e.baja || !e.baja.fecha)).length;
    const metaMens = num((D.config.param || {}).rotacionMeta) || 3;
    m.innerHTML = `
    <div class="grid g4">${kpi('Rotación anual (12 meses)', fmt(R.anual) + ' %', R.totalBajas + ' bajas / plantilla prom. ' + fmt(R.promPlantilla, 0), R.anual > metaMens * 12 ? 'red' : '')}${kpi('Rotación del mes', fmt(R.serie[11].idx) + ' %', R.serie[11].bajas + ' bajas · ' + R.serie[11].altas + ' altas', R.serie[11].idx > metaMens ? 'red' : 'grn')}${kpi('Voluntaria', R.totalBajas ? fmt(R.vol / R.totalBajas * 100, 0) + ' %' : '—', R.vol + ' renuncias / abandonos', '')}${kpi('Rotación temprana', R.totalBajas ? fmt(R.temp / R.totalBajas * 100, 0) + ' %' : '—', R.temp + ' se fueron antes de 90 días', R.temp / (R.totalBajas || 1) > 0.3 ? 'amb' : '')}${kpi('Antigüedad promedio al salir', fmt(antB / 30.4) + ' meses', '', '')}${kpi('Altas 12 meses', fmt(R.altas, 0), 'contrataciones', 'blu')}</div>
    ${sinFecha ? `<div class="warn" style="margin-top:10px">${sinFecha} bajas importadas no tienen fecha de baja y no cuentan en el índice. Complétalas desde Plantilla → Bajas.</div>` : ''}
    <div class="grid g2" style="margin-top:12px">
      <div class="card"><div class="card-h"><h3>Índice mensual</h3><span class="muted small">bajas del mes ÷ plantilla promedio × 100 · meta ${fmt(metaMens, 1)} %</span></div><div class="chart">${I.barras(R.serie.map(x => ({ l: I.mesLabel(x.k), v: Math.round(x.idx * 10) / 10, c: x.idx > metaMens ? 'var(--rojo)' : 'var(--line2)' })), { suf: '%', dec: 1, meta: metaMens })}</div></div>
      <div class="card"><div class="card-h"><h3>Altas vs bajas</h3><span class="muted small"><span style="color:var(--grn)">■</span> altas · <span style="color:var(--red)">■</span> bajas</span></div><div class="chart">${(() => { const d = []; R.serie.forEach(x => { d.push({ l: I.mesLabel(x.k).slice(0, 3), v: x.altas, c: 'var(--grn)' }); d.push({ l: '', v: x.bajas, c: 'var(--red)' }); }); return I.barras(d, {}); })()}</div></div>
    </div>
    <div class="grid g3" style="margin-top:12px">
      <div class="card"><h3>Por tipo de baja</h3><div class="row">${I.dona(Object.keys(porTipo).map((k, i) => ({ l: k, v: porTipo[k], c: COLS[i % COLS.length] })), { sub: 'bajas' })}<div class="small">${Object.keys(porTipo).sort((a, b) => porTipo[b] - porTipo[a]).map((k, i) => `<div><span style="color:${COLS[Object.keys(porTipo).indexOf(k) % COLS.length]}">■</span> ${esc(k)} <b>${porTipo[k]}</b></div>`).join('')}</div></div></div>
      <div class="card"><h3>Motivos principales</h3>${Object.keys(porMot).sort((a, b) => porMot[b] - porMot[a]).slice(0, 8).map(k => `<div class="hbar"><span class="small">${esc(k)}</span><div class="bar"><i style="width:${porMot[k] / Math.max(...Object.values(porMot)) * 100}%"></i></div><b class="small">${porMot[k]}</b></div>`).join('') || '<div class="muted small">Sin bajas.</div>'}</div>
      <div class="card"><h3>Por departamento (12 meses)</h3><div class="tw" style="max-height:300px"><table><thead><tr><th>Depto</th><th class="num">Plantilla</th><th class="num">Bajas</th><th class="num">Índice</th></tr></thead><tbody>${porDep.map(x => `<tr><td class="small">${esc(x.d)}</td><td class="num">${fmt(x.r.promPlantilla)}</td><td class="num">${x.r.totalBajas}</td><td class="num ${x.r.anual > metaMens * 12 ? 'neg' : ''}">${fmt(x.r.anual)} %</td></tr>`).join('')}</tbody></table></div></div>
    </div>
    <div class="card"><div class="card-h"><h3>Bajas de los últimos 12 meses (${bajas.length})</h3><span class="sp"></span><button class="btn" id="r-x">Exportar</button></div><div class="tw" style="max-height:380px"><table><thead><tr><th>Fecha</th><th>Nombre</th><th>Depto</th><th>Antigüedad</th><th>Tipo</th><th>Motivo</th><th>Recontratable</th></tr></thead><tbody>${bajas.map(e => `<tr data-ficha="${e._k}" style="cursor:pointer"><td>${esc(fDia(e.baja.fecha))}</td><td>${esc(e.nombre)}</td><td class="small">${esc(e.depto)}</td><td class="num">${difDias(e.ingreso, e.baja.fecha) < 90 ? '<span class="b b-amb">' + difDias(e.ingreso, e.baja.fecha) + ' días</span>' : fmt(difDias(e.ingreso, e.baja.fecha) / 365.25) + ' años'}</td><td class="small">${esc(e.baja.tipo)}</td><td class="small">${esc(e.baja.motivo || '')}</td><td>${e.baja.recontratable === false ? '<span class="b b-red">No</span>' : '<span class="b b-grn">Sí</span>'}</td></tr>`).join('')}</tbody></table></div></div>`;
    $('#r-x').onclick = () => I.exportXlsx('Rotacion_' + hoy + '.xlsx', [{ nombre: 'Índice mensual', filas: [['Mes', 'Plantilla inicio', 'Plantilla fin', 'Promedio', 'Altas', 'Bajas', 'Voluntarias', 'Involuntarias', 'Antes de 90 días', 'Índice %']].concat(R.serie.map(x => [x.k, x.ini, x.fin, x.prom, x.altas, x.bajas, x.vol, x.invol, x.temp, Math.round(x.idx * 100) / 100])) }, { nombre: 'Bajas', filas: [['Fecha', 'Nombre', 'Depto', 'Ingreso', 'Días laborados', 'Tipo', 'Motivo', 'Recontratable', 'Notas']].concat(bajas.map(e => [e.baja.fecha, e.nombre, e.depto, e.ingreso, difDias(e.ingreso, e.baja.fecha), e.baja.tipo, e.baja.motivo, e.baja.recontratable === false ? 'No' : 'Sí', e.baja.nota || ''])) }]);
    bindComunes(m);
  };

  /* ============================================================ PRENÓMINA */
  VISTAS.prenomina = function (m) {
    const sem = I.semana(UI.preSem || addDias(I.hoyISO(), -7), C()); UI.preSem = sem.key;
    const L = ord(emps(true).filter(e => (I.activoEn(e, sem.fin) || (e.baja && e.baja.fecha >= sem.ini)) && e.ingreso <= sem.fin));
    const R = L.map(e => I.calcSemana(e, sem, D, X));
    const ci = cerrada(sem.key);
    const pend = R.filter(x => x.dias.some(r => r.pend)).length;
    const sinSal = R.reduce((a, x) => a + x.t.sinSalida, 0), heSin = R.reduce((a, x) => a + x.t.heSinAut, 0);
    const filas = R.map(x => `<tr><td class="mono">${esc(x.emp.num || '')}</td><td><a href="#" data-ficha="${x.emp._k}">${esc(x.emp.nombre)}</a></td><td class="small">${esc(x.emp.depto)}</td><td class="num">${x.t.trab}</td><td class="num ${x.t.faltas ? 'neg' : ''}">${x.t.faltas || ''}${x.t.faltasPorRetardo ? ' +' + x.t.faltasPorRetardo : ''}</td><td class="num">${x.t.retardos || ''}${x.t.minRet ? ' <span class="tiny muted">(' + x.t.minRet + 'm)</span>' : ''}</td><td class="num">${x.t.psg || ''}</td><td class="num">${x.t.inc || ''}</td><td class="num">${x.t.vac || ''}</td><td class="num">${x.t.cg || ''}</td><td class="num">${x.t.dobles ? fmt(x.t.dobles / 60) : ''}</td><td class="num">${x.t.triples ? fmt(x.t.triples / 60) : ''}</td><td class="num">${x.t.domingos || ''}</td><td class="num">${x.t.festLab || ''}</td><td>${x.t.bono === null ? '' : x.t.bono ? '<span class="b b-grn">Sí</span>' : `<span class="b b-red" title="${esc(x.t.motivosBono.join(', '))}">No</span>`}</td></tr>`).join('');
    m.innerHTML = `<div class="card"><div class="card-h"><h2>Prenómina semanal</h2><div class="row"><button class="btn sm" id="pn-prev">◀</button><b>${esc(sem.label)}</b><button class="btn sm" id="pn-next">▶</button></div>${ci ? `<span class="b b-gry">Cerrada por ${esc(ci.por)} · ${fFecha(ci.ts)}</span>` : ''}<span class="sp"></span><button class="btn" id="pn-x">Excel para nómina</button><button class="btn" id="pn-o">CSV Odoo (asistencias)</button><button class="btn" id="pn-l">CSV Odoo (ausencias)</button>${!ci ? '<button class="btn pri" id="pn-c">Cerrar semana</button>' : (MASTER() ? '<button class="btn danger" id="pn-a">Reabrir</button>' : '')}${!I.DEMO && ci ? '<button class="btn" id="pn-s">Enviar a Odoo</button>' : ''}</div>
      ${!ci && (pend || sinSal || heSin) ? `<div class="warn" style="margin-bottom:10px">Antes de cerrar: ${pend ? pend + ' persona(s) con solicitudes en trámite · ' : ''}${sinSal ? sinSal + ' día(s) sin checada de salida · ' : ''}${heSin ? hTxt(heSin) + ' de tiempo extra sin autorizar' : ''}</div>` : ''}
      <p class="muted small">Columnas: días trabajados · faltas (+ por retardos si tu reglamento lo aplica) · retardos · PSG permiso sin goce · INC incapacidad · VAC vacaciones · CG permisos con goce · TE dobles y triples en horas · domingos trabajados (prima dominical 25 %) · festivos laborados (pago doble adicional, LFT art. 75) · bono de puntualidad y asistencia.</p>
      <div class="tw"><table><thead><tr><th>No.</th><th>Nombre</th><th>Depto</th><th class="num">Días</th><th class="num">F</th><th class="num">R</th><th class="num">PSG</th><th class="num">INC</th><th class="num">VAC</th><th class="num">CG</th><th class="num">TE 2x</th><th class="num">TE 3x</th><th class="num">Dom</th><th class="num">Fest</th><th>Bono</th></tr></thead><tbody>${filas}</tbody></table></div></div>`;
    $('#pn-prev').onclick = () => { UI.preSem = addDias(sem.key, -7); render(); };
    $('#pn-next').onclick = () => { UI.preSem = addDias(sem.key, 7); render(); };
    $('#pn-x').onclick = () => I.exportXlsx('Prenomina_' + sem.key + '.xlsx', [{ nombre: 'Prenómina', filas: [['No.', 'Nombre', 'Departamento', 'Días trabajados', 'Faltas', 'Faltas por retardos', 'Retardos', 'Min. retardo', 'Permiso sin goce', 'Incapacidad', 'Vacaciones', 'Permisos con goce', 'TE dobles (h)', 'TE triples (h)', 'Domingos', 'Festivos laborados', 'Bono', 'Motivo sin bono']].concat(R.map(x => [x.emp.num, x.emp.nombre, x.emp.depto, x.t.trab, x.t.faltas, x.t.faltasPorRetardo || 0, x.t.retardos, x.t.minRet, x.t.psg, x.t.inc, x.t.vac, x.t.cg, x.t.dobles / 60, x.t.triples / 60, x.t.domingos, x.t.festLab, x.t.bono === false ? 'NO' : 'SI', x.t.motivosBono.join(', ')])) }, { nombre: 'Sin bono', filas: [['Nombre', 'Departamento', 'Motivo']].concat(R.filter(x => x.t.bono === false).map(x => [x.emp.nombre, x.emp.depto, x.t.motivosBono.join(', ')])) }]);
    $('#pn-o').onclick = () => {
      const tz = d => new Date(d).toISOString().replace('T', ' ').slice(0, 19); // Odoo guarda en UTC
      const f = [['employee_id/barcode', 'check_in', 'check_out']];
      R.forEach(x => x.dias.forEach(r => { if (r.chs.length) { const a = r.chs[0].ts, b = r.chs.length > 1 ? r.chs[r.chs.length - 1].ts : null; f.push([x.emp.num, tz(a), b ? tz(b) : '']); } }));
      I.descargar('odoo_hr.attendance_' + sem.key + '.csv', I.csv(f)); I.toast('CSV listo: Odoo → Asistencias → Importar (fechas en UTC)', 'ok');
    };
    $('#pn-l').onclick = () => {
      const f = [['employee_id/barcode', 'holiday_status_id', 'request_date_from', 'request_date_to', 'name']]; const vistos = new Set();
      R.forEach(x => x.dias.forEach(r => { if (r.sol && !vistos.has(r.sol._id)) { vistos.add(r.sol._id); f.push([x.emp.num, tipoN(r.sol.tipo), r.sol.desde, r.sol.hasta || r.sol.desde, (r.sol.motivo || tipoN(r.sol.tipo)) + ' · RH19 ' + r.sol._id]); } }));
      I.descargar('odoo_hr.leave_' + sem.key + '.csv', I.csv(f)); I.toast('CSV listo: Odoo → Ausencias → Importar', 'ok');
    };
    if ($('#pn-c')) $('#pn-c').onclick = async () => { if (!(await I.confirmar('Cerrar semana', 'Al cerrar, nadie (salvo el master) podrá modificar checadas ni autorizar incidencias de ' + esc(sem.label) + '. Se guarda una foto de la prenómina.', 'Cerrar semana'))) return; await DB.set('cierres/' + sem.key, { ts: I.now(), por: U.nombre, resumen: R.map(x => ({ id: x.emp._k, num: x.emp.num || '', t: { trab: x.t.trab, faltas: x.t.faltas, retardos: x.t.retardos, psg: x.t.psg, inc: x.t.inc, vac: x.t.vac, dobles: x.t.dobles, triples: x.t.triples, domingos: x.t.domingos, festLab: x.t.festLab, bono: x.t.bono } })) }); I.log('Cerró semana', sem.label); I.toast('Semana cerrada ✔', 'ok'); };
    if ($('#pn-a')) $('#pn-a').onclick = async () => { if (!(await I.confirmar('Reabrir semana', '¿Reabrir ' + esc(sem.label) + ' para correcciones?', 'Reabrir'))) return; await DB.set('cierres/' + sem.key, null); I.log('Reabrió semana', sem.label); };
    if ($('#pn-s')) $('#pn-s').onclick = async () => { try { const j = await I.fn('rhOdoo', { accion: 'asistencias', semana: sem.key }); I.toast('Odoo: ' + (j.creadas || 0) + ' asistencias enviadas', 'ok'); } catch (e) { I.toast(e.message, 'err'); } };
    bindComunes(m);
  };

  /* ============================================================ ANOMALÍAS E IA */
  VISTAS.anomalias = function (m) {
    const A = I.anomalias(D, X, visibles());
    const ns = { alta: A.filter(a => a.nivel === 'alta').length, media: A.filter(a => a.nivel === 'media').length, baja: A.filter(a => a.nivel === 'baja').length };
    m.innerHTML = `<div class="grid g4">${kpi('Alertas altas', ns.alta, 'atender hoy', ns.alta ? 'red' : '')}${kpi('Medias', ns.media, '', ns.media ? 'amb' : '')}${kpi('Bajas', ns.baja, '', '')}${kpi('Correcciones manuales 30 días', Object.keys(D.checadas || {}).filter(f => f >= addDias(I.hoyISO(), -30)).reduce((a, f) => a + Object.values(D.checadas[f]).reduce((b, x) => b + Object.values(x).filter(c => c.src === 'manual').length, 0), 0), 'checadas capturadas a mano', '')}</div>
      <div class="grid g2" style="margin-top:12px"><div class="card"><div class="card-h"><h3>Detector de anomalías</h3><span class="muted small">Últimos 30 días · reglas: faltas (LFT art. 47), checadas repetidas, TE sin autorizar, saldos negativos, vacaciones fuera de plazo, cobertura por departamento, posible abandono</span></div>${A.length ? '<div class="lista">' + A.map(liAnom).join('') + '</div>' : '<div class="empty">Sin anomalías.</div>'}</div>
      <div class="card"><div class="card-h"><h3>Pregúntale a la IA</h3><span class="muted small">Solo master · usa tu llave guardada en Cloud Functions</span><span class="sp"></span><div class="seg" id="ia-m"><button data-v="haiku" class="${UI.iaModelo === 'haiku' ? 'on' : ''}">Rápida</button><button data-v="sonnet" class="${UI.iaModelo === 'sonnet' ? 'on' : ''}">Profunda</button></div></div>
        ${MASTER() ? `<div class="chat" id="ia-c">${CHAT.map(x => `<div class="msg ${x.r}">${esc(x.t)}</div>`).join('') || '<div class="muted small">Ejemplos: “¿Qué departamentos tienen más faltas este mes y qué patrón ves?”, “¿Quién acumula tiempo extra sin autorización?”, “Prepárame el resumen de rotación para Dirección”.</div>'}</div><div class="row" style="margin-top:8px"><input id="ia-q" placeholder="Escribe tu pregunta" class="grow"><button class="btn pri" id="ia-b">Preguntar</button></div>` : '<div class="note">La IA solo está disponible para el usuario master.</div>'}</div></div>`;
    $$('#ia-m button').forEach(b => b.onclick = () => { UI.iaModelo = b.dataset.v; guardaUI(); render(); });
    if ($('#ia-b')) { const go = async () => { const q = $('#ia-q').value.trim(); if (!q) return; CHAT.push({ r: 'u', t: q }, { r: 'a', t: 'Analizando…' }); render(); try { const j = await I.fn('rhAsk', { question: q, model: UI.iaModelo, context: contextoIA(A), history: CHAT.slice(-8, -2).map(x => ({ role: x.r === 'u' ? 'user' : 'assistant', content: x.t })) }); CHAT[CHAT.length - 1].t = j.answer; } catch (e) { CHAT[CHAT.length - 1].t = '⚠️ ' + e.message; } render(); const c = $('#ia-c'); if (c) c.scrollTop = c.scrollHeight; }; $('#ia-b').onclick = go; $('#ia-q').onkeydown = ev => { if (ev.key === 'Enter') go(); }; }
    bindComunes(m);
  };
  function contextoIA(A) {
    const hoy = I.hoyISO(); const L = emps(); const sems = [0, 1, 2, 3].map(i => I.semana(addDias(hoy, -7 * i), C()));
    const meses = Array.from({ length: 12 }, (_, i) => I.addMes(hoy.slice(0, 7), i - 11)); const R = I.rotacion(emps(true), meses);
    return {
      hoy, empresa: C().empresa, parametros: C().p, plantillaActiva: L.length,
      porDepartamento: deptosUsados().map(d => ({ depto: d, activos: L.filter(e => e.depto === d).length, plazas: num(C().plazas[d]) || null })),
      semanas: sems.map(s => ({ semana: s.label, filas: L.map(e => { const t = I.calcSemana(e, s, D, X).t; return [e.num, e.nombre, e.depto, t.trab, t.faltas, t.retardos, t.minRet, Math.round(t.hePag / 6) / 10, Math.round(t.heSinAut / 6) / 10, t.vac, t.inc, t.psg, t.bono === false ? 0 : 1]; }), columnas: ['num', 'nombre', 'depto', 'diasTrab', 'faltas', 'retardos', 'minRetardo', 'teHorasPagables', 'teHorasSinAut', 'vac', 'incap', 'permisoSinGoce', 'bono'] })),
      vacaciones: L.map(e => { const v = I.vacSaldo(e, D); return [e.nombre, e.depto, Math.round(v.anios * 10) / 10, v.saldo, v.programadas, v.pendientes, v.fueraPlazo]; }), vacColumnas: ['nombre', 'depto', 'antig', 'saldo', 'programadas', 'enTramite', 'fueraPlazo'],
      rotacion: { anual: Math.round(R.anual * 10) / 10, mensual: R.serie.map(x => [x.k, x.prom, x.altas, x.bajas, x.vol, x.temp, Math.round(x.idx * 10) / 10]), bajas: [].concat(...R.serie.map(s => s.lista)).map(e => [e.baja.fecha, e.depto, e.baja.tipo, e.baja.motivo, difDias(e.ingreso, e.baja.fecha)]) },
      anomalias: A.slice(0, 80).map(a => [a.nivel, a.tipo, a.empId ? nomE(a.empId) : a.depto || '', a.texto]),
      bitacora: vals(D.bitacora).sort((a, b) => b.ts - a.ts).slice(0, 60).map(b => [fFecha(b.ts), b.por, b.accion, b.detalle])
    };
  }

  /* ============================================================ USUARIOS Y ACCESOS */
  VISTAS.usuarios = function (m) {
    const us = vals(D.usuarios).sort((a, b) => (a.rol === 'empleado') - (b.rol === 'empleado') || String(a.nombre).localeCompare(b.nombre));
    const staff = us.filter(u => u.rol !== 'empleado'), empU = us.filter(u => u.rol === 'empleado');
    const sinAcc = emps().filter(e => !empU.some(u => u.empId === e._k));
    m.innerHTML = `
    ${MASTER() ? `<div class="card"><div class="card-h"><h2>Usuarios del sistema</h2><span class="sp"></span><button class="btn pri" id="u-n">+ Usuario</button></div>
      <div class="tw"><table><thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Departamentos</th><th>Estado</th><th></th></tr></thead><tbody>${staff.map(u => `<tr><td>${esc(u.nombre)}</td><td class="mono">${esc(u.usuario)}</td><td>${esc((I.ROLES[u.rol] || {}).nombre || u.rol)}</td><td class="small">${esc((u.deptos || []).join(', '))}</td><td>${u.activo === false ? '<span class="b b-red">Inactivo</span>' : '<span class="b b-grn">Activo</span>'}</td><td class="row">${u._k !== U.uid ? `<button class="btn sm" data-ue="${u._k}">Editar</button><button class="btn sm" data-ua="${u._k}">${u.activo === false ? 'Activar' : 'Desactivar'}</button><button class="btn sm ghost" data-up="${u._k}">Contraseña</button>` : '<span class="muted small">tú</span>'}</td></tr>`).join('')}</tbody></table></div>
      <p class="muted small">Roles: ${Object.keys(I.ROLES).map(r => `<b>${esc(I.ROLES[r].nombre)}</b>: ${esc(I.ROLES[r].desc)}`).join(' · ')}</p></div>` : ''}
    <div class="card"><div class="card-h"><h2>Accesos de empleados al portal móvil</h2><span class="muted small">${empU.length} con acceso · ${sinAcc.length} sin acceso</span><span class="sp"></span><button class="btn pri" id="u-acc" ${sinAcc.length ? '' : 'disabled'}>Generar NIP a ${sinAcc.length} personas</button></div>
      <p class="muted small">Cada empleado entra a <b>empleado.html</b> con su número de empleado y un NIP de 6 dígitos (el mismo NIP le sirve en el kiosco si no trae gafete). Al generar, el sistema muestra la lista de NIP para entregarlos en sobre cerrado; no se vuelven a mostrar.</p>
      <div class="tw" style="max-height:360px"><table><thead><tr><th>No.</th><th>Empleado</th><th>Depto</th><th>Acceso</th><th></th></tr></thead><tbody>${ord(emps()).map(e => { const u = empU.find(x => x.empId === e._k); return `<tr><td class="mono">${esc(e.num)}</td><td>${esc(e.nombre)}</td><td class="small">${esc(e.depto)}</td><td>${u ? (u.activo === false ? '<span class="b b-red">Inactivo</span>' : '<span class="b b-grn">Activo</span>') : '<span class="b b-gry">Sin acceso</span>'}</td><td>${u ? `<button class="btn sm ghost" data-nip="${e._k}">Nuevo NIP</button>` : `<button class="btn sm ghost" data-acc1="${e._k}">Dar acceso</button>`}</td></tr>`; }).join('')}</tbody></table></div></div>
    ${ADM() ? `<div class="card"><div class="card-h"><h3>Bitácora</h3><span class="muted small">últimos movimientos</span></div><div class="tw" style="max-height:320px"><table><thead><tr><th>Fecha</th><th>Quién</th><th>Acción</th><th>Detalle</th></tr></thead><tbody>${vals(D.bitacora).sort((a, b) => b.ts - a.ts).slice(0, 200).map(b => `<tr><td class="small">${fFecha(b.ts)}</td><td class="small">${esc(b.por)}</td><td class="small">${esc(b.accion)}</td><td class="small">${esc(b.detalle)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
    if ($('#u-n')) $('#u-n').onclick = () => editarUsuario(null);
    $$('[data-ue]', m).forEach(b => b.onclick = () => editarUsuario(b.dataset.ue));
    $$('[data-ua]', m).forEach(b => b.onclick = async () => { const u = D.usuarios[b.dataset.ua]; await DB.set('usuarios/' + b.dataset.ua + '/activo', u.activo === false); I.log((u.activo === false ? 'Activó' : 'Desactivó') + ' usuario', u.usuario); });
    $$('[data-up]', m).forEach(b => b.onclick = () => resetPass(b.dataset.up));
    $('#u-acc').onclick = () => generarAccesos(sinAcc);
    $$('[data-acc1]', m).forEach(b => b.onclick = () => generarAccesos([emp(b.dataset.acc1)]));
    $$('[data-nip]', m).forEach(b => b.onclick = async () => { const e = emp(b.dataset.nip); const u = empU.find(x => x.empId === e._k); const nip = I.nipNuevo(); try { if (I.DEMO) await DB.set('usuarios/' + u._k + '/_demoPass', nip); else await I.fn('rhAdmin', { accion: 'password', uid: u._k, pass: nip }); await DB.set('empleados/' + e._k + '/nipK', await I.nipHash(e._k, nip)); I.log('Nuevo NIP', e.nombre); I.modal('Nuevo NIP', `<p>${esc(e.nombre)}</p><p class="nip-grande">${nip}</p><p class="muted small">Entrégalo en persona. No se vuelve a mostrar.</p>`); } catch (x) { I.toast(x.message, 'err'); } });
  };
  async function editarUsuario(uid) {
    const u = uid ? D.usuarios[uid] : { rol: 'jefe', deptos: [] };
    const html = `<div class="form"><label>Nombre<input id="uu-n" value="${esc(u.nombre || '')}"></label>${uid ? '' : '<label>Usuario<input id="uu-u" autocapitalize="none"></label><label>Contraseña (mín. 6)<input id="uu-p" type="password"></label>'}
      <label>Rol<select id="uu-r">${['rh', 'director', 'jefe', 'kiosco', 'master'].map(r => `<option value="${r}" ${r === u.rol ? 'selected' : ''}>${esc(I.ROLES[r].nombre)}</option>`).join('')}</select></label></div>
      <label>Departamentos a su cargo (solo jefes)</label><div class="chk-lista">${deptosUsados().map(d => `<label class="chk"><input type="checkbox" value="${esc(d)}" ${(u.deptos || []).includes(d) ? 'checked' : ''}> ${esc(d)}</label>`).join('')}</div>`;
    await I.modal(uid ? 'Editar usuario' : 'Nuevo usuario', html, [{ t: 'Cancelar' }, { t: 'Guardar', c: 'pri', antes: async ov => {
      const deptos = $$('.chk-lista input:checked', ov).map(i => i.value); const rol = $('#uu-r', ov).value; const nombre = $('#uu-n', ov).value.trim();
      if (rol === 'jefe' && !deptos.length) { I.toast('Elige los departamentos del jefe', 'err'); return false; }
      try {
        if (uid) await DB.update({ ['usuarios/' + uid + '/nombre']: nombre, ['usuarios/' + uid + '/rol']: rol, ['usuarios/' + uid + '/deptos']: deptos });
        else await I.AUTH.crearUsuario({ usuario: $('#uu-u', ov).value.trim(), pass: $('#uu-p', ov).value, nombre, rol, deptos });
        I.log(uid ? 'Editó usuario' : 'Creó usuario', nombre + ' · ' + rol); I.toast('Guardado ✔', 'ok');
      } catch (x) { I.toast(x.message, 'err'); return false; }
    } }], { ancho: true });
  }
  async function resetPass(uid) {
    await I.modal('Restablecer contraseña', `<p>Usuario <b>${esc(D.usuarios[uid].usuario)}</b></p><label>Nueva contraseña (mín. 6)<input id="rp"></label>`, [{ t: 'Cancelar' }, { t: 'Guardar', c: 'pri', antes: async ov => { const p = $('#rp', ov).value; if (p.length < 6) { I.toast('Mínimo 6 caracteres', 'err'); return false; } try { if (I.DEMO) await DB.set('usuarios/' + uid + '/_demoPass', p); else await I.fn('rhAdmin', { accion: 'password', uid, pass: p }); I.toast('Contraseña restablecida ✔', 'ok'); } catch (e) { I.toast(e.message, 'err'); return false; } } }]);
  }
  async function generarAccesos(lista) {
    lista = lista.filter(e => e.num);
    if (!lista.length) { I.toast('Captura primero el número de empleado', 'err'); return; }
    if (!(await I.confirmar('Generar accesos', `Se creará el acceso al portal de <b>${lista.length}</b> persona(s) con un NIP aleatorio de 6 dígitos.`, 'Generar'))) return;
    const res = []; I.toast('Generando… no cierres la ventana', '');
    const items = []; for (const e of lista) items.push({ empId: e._k, num: e.num, nombre: e.nombre, pin: I.nipNuevo() });
    try {
      if (I.DEMO) { for (const it of items) { await I.AUTH.crearUsuario({ usuario: I.userEmpleado(it.num), nombre: it.nombre, rol: 'empleado', pass: it.pin, empId: it.empId, reemplazar: true }); res.push(it); } }
      else { for (let i = 0; i < items.length; i += 50) { const j = await I.fn('rhAdmin', { accion: 'accesos', lista: items.slice(i, i + 50) }); (j.ok_ids || []).forEach(id => res.push(items.find(x => x.empId === id))); } }
      const up = {}; for (const it of res) up['empleados/' + it.empId + '/nipK'] = await I.nipHash(it.empId, it.pin); await DB.update(up);
      I.log('Generó accesos', res.length + ' empleados');
    } catch (x) { I.toast(x.message, 'err'); }
    if (!res.length) return;
    const html = `<div class="nips">${res.map(it => `<div class="nip"><b>${esc(it.nombre)}</b><div>No. empleado: <b>${esc(it.num)}</b></div><div>NIP: <b class="mono" style="font-size:16px">${it.pin}</b></div><div class="tiny">Entra en: ${esc(location.href.replace(/[^/]*$/, ''))}empleado.html</div></div>`).join('')}</div>`;
    await I.modal('NIP generados (' + res.length + ')', '<p class="warn small">Esta es la única vez que se muestran. Imprímelos o expórtalos y entrégalos en sobre cerrado.</p>' + html, [{ t: 'Cerrar' }, { t: 'Exportar Excel', antes: () => { I.exportXlsx('NIP_portal_' + I.hoyISO() + '.xlsx', [{ nombre: 'NIP', filas: [['No.', 'Nombre', 'NIP']].concat(res.map(it => [it.num, it.nombre, it.pin])) }]); return false; } }, !I.enIframe ? { t: 'Imprimir', c: 'pri', antes: () => { I.imprimir(html); return false; } } : null], { ancho: true, sinFoco: true });
  }

  /* ============================================================ CONFIGURACIÓN */
  VISTAS.config = function (m) {
    const c = C(), p = c.p; const tur = c.turnos;
    const num_ = (id, l, v, s) => `<label>${l}<input id="${id}" class="in-num" value="${esc(v)}">${s ? `<span class="tiny muted">${s}</span>` : ''}</label>`;
    m.innerHTML = `
    <div class="card"><div class="card-h"><h2>Reglas de asistencia y nómina</h2><span class="sp"></span><button class="btn pri" id="cf-g">Guardar reglas</button></div>
      <div class="form">
        ${num_('cf-tol', 'Tolerancia de entrada (min)', p.toleranciaMin)}
        <label>La semana de nómina inicia en<select id="cf-sem">${I.DIAS_L.map((d, i) => `<option value="${i}" ${i === +p.semanaInicio ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
        ${num_('cf-heb', 'Tiempo extra: bloque (min)', p.heBloque)}${num_('cf-hem', 'Tiempo extra: mínimo (min)', p.heMinimo)}
        <label>¿Solo se paga TE autorizado?<select id="cf-hea"><option value="1" ${p.heRequiereAut ? 'selected' : ''}>Sí (recomendado)</option><option value="0" ${!p.heRequiereAut ? 'selected' : ''}>No, todo lo checado</option></select></label>
        ${num_('cf-rpf', 'Retardos que equivalen a 1 falta (0 = no aplica)', p.retardosPorFalta, 'Solo si tu reglamento interior lo dice')}
        <label>Bono de puntualidad y asistencia<select id="cf-bo"><option value="1" ${p.bonoActivo ? 'selected' : ''}>Activo</option><option value="0" ${!p.bonoActivo ? 'selected' : ''}>No se maneja</option></select></label>
        ${num_('cf-brm', 'Bono: retardos permitidos en la semana', p.bonoRetardosMax)}${num_('cf-brx', 'Bono: pierde con un retardo mayor a (min)', p.bonoRetardoMaxMin)}
        ${num_('cf-va', 'Vacaciones: días de anticipación sugeridos', p.vacAnticipacion)}${num_('cf-vt', 'Aviso si se ausenta más del % de un depto', p.vacTopeAusentesPct)}
        <label>¿Permitir vacaciones adelantadas?<select id="cf-vad"><option value="1" ${p.vacPermitirAdelantadas ? 'selected' : ''}>Sí, con aviso</option><option value="0" ${!p.vacPermitirAdelantadas ? 'selected' : ''}>No</option></select></label>
        <label>Fecha del saldo inicial de vacaciones<input id="cf-fc" type="date" value="${esc(p.fechaCorte || '')}"></label>
        <label>Inicio de operación (antes no cuenta faltas)<input id="cf-io" type="date" value="${esc(p.inicioOperacion || '')}"></label>
        ${num_('cf-dup', 'Ignorar checada repetida en menos de (min)', p.antiDuplicadoMin)}
        <label>Foto al checar en kiosco<select id="cf-fk"><option value="1" ${p.fotoKiosco ? 'selected' : ''}>Sí (evita que otro cheque por él)</option><option value="0" ${!p.fotoKiosco ? 'selected' : ''}>No</option></select></label>
        ${num_('cf-rm', 'Meta de rotación mensual (%)', (D.config.param || {}).rotacionMeta || 3)}
      </div>
      <h3 style="margin-top:12px">Geocerca de la planta (checada desde celular)</h3>
      <div class="form">${num_('cf-lat', 'Latitud', p.geocerca.lat)}${num_('cf-lng', 'Longitud', p.geocerca.lng)}${num_('cf-rad', 'Radio (metros)', p.geocerca.radio)}<label>&nbsp;<button class="btn" id="cf-gps" type="button">Usar mi ubicación actual</button></label></div>
      <p class="muted small">Párate en la entrada de la planta y toca "Usar mi ubicación actual". El celular del empleado solo registra checadas dentro de ese radio (excepto personal en ruta).</p></div>
    <div class="card"><div class="card-h"><h2>Turnos</h2><span class="muted small">Horario por día · vacío = descanso · si la salida es menor que la entrada, es turno nocturno</span><span class="sp"></span><button class="btn" id="cf-tn">+ Turno</button><button class="btn pri" id="cf-tg">Guardar turnos</button></div>
      <div class="tw"><table class="t-tur"><thead><tr><th>Clave</th><th>Nombre</th>${[1, 2, 3, 4, 5, 6, 0].map(d => `<th class="c">${I.DIAS[d]}</th>`).join('')}<th>Comida (min)</th></tr></thead><tbody>${Object.keys(tur).map(k => `<tr data-k="${esc(k)}"><td class="mono">${esc(k)}</td><td><input class="tn" value="${esc(tur[k].nombre)}"></td>${[1, 2, 3, 4, 5, 6, 0].map(d => { const h = (tur[k].dias || {})[d]; return `<td class="c"><input type="time" class="te" data-d="${d}" value="${h ? h[0] : ''}"><input type="time" class="ts" data-d="${d}" value="${h ? h[1] : ''}"></td>`; }).join('')}<td><input class="tc in-num" value="${num(tur[k].comida)}"></td></tr>`).join('')}</tbody></table></div></div>
    <div class="grid g2">
      <div class="card"><div class="card-h"><h2>Plazas autorizadas</h2><span class="sp"></span><button class="btn pri" id="cf-pg">Guardar</button></div><div class="plz-form">${deptosUsados().map(d => `<label>${esc(d)}<input class="in-num pz" data-d="${esc(d)}" value="${esc(c.plazas[d] || '')}"></label>`).join('')}</div><label style="margin-top:8px">Agregar departamento<div class="row"><input id="cf-nd" placeholder="Nombre del departamento"><button class="btn" id="cf-ndb">Agregar</button></div></label></div>
      <div class="card"><div class="card-h"><h2>Flujos de autorización</h2><span class="sp"></span><button class="btn pri" id="cf-fg">Guardar</button></div>
        ${[['VAC', 'Vacaciones'], ['PERM', 'Permisos'], ['INC', 'Incapacidades y suspensiones'], ['HE', 'Tiempo extra']].map(([g, t]) => `<label>${t}<select class="fl" data-g="${g}">${[['jefe,rh', 'Jefe → RH'], ['jefe,director,rh', 'Jefe → Dirección → RH'], ['jefe', 'Solo jefe'], ['rh', 'Solo RH'], ['jefe,director', 'Jefe → Dirección'], ['director,rh', 'Dirección → RH']].map(([v, l]) => `<option value="${v}" ${(c.flujos[g] || []).join(',') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`).join('')}
        <h3 style="margin-top:12px">Días festivos ${new Date().getFullYear()}</h3><div class="small">${Object.entries(I.feriadosLFT(new Date().getFullYear())).map(([f, n]) => `<div>${fDia(f)} · ${esc(n)}</div>`).join('')}${Object.entries(c.feriadosExtra).map(([f, n]) => `<div>${fDia(f)} · ${esc(n)} <span class="b b-blu">empresa</span> <a href="#" data-qf="${f}">quitar</a></div>`).join('')}</div>
        <div class="row" style="margin-top:6px"><input type="date" id="cf-fe" style="max-width:170px"><input id="cf-fen" placeholder="Ej. Día del panadero / descanso de empresa"><button class="btn" id="cf-feb">Agregar festivo</button></div></div>
    </div>
    <div class="card"><div class="card-h"><h2>Conexión, licencia y respaldo</h2></div>
      ${I.DEMO ? '<div class="warn">Modo demo: no hay base en línea ni licencia. Sigue la guía LEEME_DESPLIEGUE.md para conectar.</div>' : `<p>Base: <span class="mono">${esc(I.CFG.FIREBASE.databaseURL)}</span> · nodo <span class="mono">rh</span></p><p>Interruptores en tu Panel de Licencia: ${Object.entries(I.CFG.LICENCIA.apps).map(([k, v]) => `<span class="mono">licencia/apps/${esc(v)}</span> (${k})`).join(' · ')}</p>`}
      <div class="row"><button class="btn" id="cf-bk">Descargar respaldo (JSON)</button>${I.DEMO ? '<button class="btn danger" id="cf-rst">Reiniciar demo</button>' : ''}</div></div>`;
    $('#cf-gps').onclick = () => { if (!navigator.geolocation) return I.toast('Este navegador no da ubicación', 'err'); navigator.geolocation.getCurrentPosition(pos => { $('#cf-lat').value = pos.coords.latitude.toFixed(6); $('#cf-lng').value = pos.coords.longitude.toFixed(6); I.toast('Ubicación tomada (±' + Math.round(pos.coords.accuracy) + ' m). Guarda las reglas.', 'ok'); }, e => I.toast('No se pudo obtener la ubicación: ' + e.message, 'err'), { enableHighAccuracy: true, timeout: 15000 }); };
    $('#cf-g').onclick = async () => {
      const g = id => num($(id).value);
      const prm = { toleranciaMin: g('#cf-tol'), semanaInicio: +$('#cf-sem').value, heBloque: g('#cf-heb') || 30, heMinimo: g('#cf-hem'), heRequiereAut: $('#cf-hea').value === '1', retardosPorFalta: g('#cf-rpf'), bonoActivo: $('#cf-bo').value === '1', bonoRetardosMax: g('#cf-brm'), bonoRetardoMaxMin: g('#cf-brx'), vacAnticipacion: g('#cf-va'), vacTopeAusentesPct: g('#cf-vt'), vacPermitirAdelantadas: $('#cf-vad').value === '1', fechaCorte: $('#cf-fc').value, inicioOperacion: $('#cf-io').value, antiDuplicadoMin: g('#cf-dup'), fotoKiosco: $('#cf-fk').value === '1', rotacionMeta: g('#cf-rm'), geocerca: { lat: g('#cf-lat'), lng: g('#cf-lng'), radio: g('#cf-rad') || 200 } };
      await DB.set('config/param', prm); I.log('Cambió reglas', JSON.stringify(prm).slice(0, 300)); I.toast('Reglas guardadas ✔', 'ok');
    };
    $('#cf-tg').onclick = async () => {
      const o = {}; $$('.t-tur tbody tr').forEach(tr => { const k = tr.dataset.k; const dias = {}; $$('.te', tr).forEach(i => { const s = $(`.ts[data-d="${i.dataset.d}"]`, tr).value; if (i.value && s) dias[i.dataset.d] = [i.value, s]; }); o[k] = Object.assign({}, tur[k], { nombre: $('.tn', tr).value, dias, comida: num($('.tc', tr).value) }); });
      await DB.set('config/turnos', o); I.log('Cambió turnos', Object.keys(o).join(', ')); I.toast('Turnos guardados ✔', 'ok');
    };
    $('#cf-tn').onclick = async () => { const k = I.keySafe(await I.pedirTexto('Nuevo turno', 'Clave corta (ej. T4, SAB, MANT)', true) || ''); if (!k) return; await DB.set('config/turnos/' + k, { nombre: 'Turno ' + k, dias: { 1: ['08:00', '16:00'], 2: ['08:00', '16:00'], 3: ['08:00', '16:00'], 4: ['08:00', '16:00'], 5: ['08:00', '16:00'] }, comida: 30 }); };
    $('#cf-pg').onclick = async () => { const o = {}; $$('.pz').forEach(i => { if (num(i.value)) o[i.dataset.d] = num(i.value); }); await DB.set('config/plazas', o); I.toast('Plazas guardadas ✔', 'ok'); };
    $('#cf-ndb').onclick = async () => { const n = $('#cf-nd').value.trim().toUpperCase(); if (!n) return; await DB.set('config/deptos', c.deptos.concat([n])); I.toast('Departamento agregado', 'ok'); };
    $('#cf-fg').onclick = async () => { const o = {}; $$('.fl').forEach(s => o[s.dataset.g] = s.value.split(',')); await DB.set('config/flujos', o); I.log('Cambió flujos de autorización', JSON.stringify(o)); I.toast('Flujos guardados ✔', 'ok'); };
    $('#cf-feb').onclick = async () => { const f = $('#cf-fe').value, n = $('#cf-fen').value.trim(); if (!f || !n) return I.toast('Fecha y nombre', 'err'); await DB.set('config/feriadosExtra/' + f, n); };
    $$('[data-qf]').forEach(a => a.onclick = async ev => { ev.preventDefault(); await DB.set('config/feriadosExtra/' + a.dataset.qf, null); });
    $('#cf-bk').onclick = () => { const o = { tipo: 'respaldo-rh', fecha: I.hoyISO(), config: D.config, empleados: D.empleados, solicitudes: D.solicitudes, he: D.he, ajustesVac: D.ajustesVac, cierres: D.cierres }; I.descargar('respaldo_rh_' + I.hoyISO() + '.json', JSON.stringify(o), 'application/json'); };
    if ($('#cf-rst')) $('#cf-rst').onclick = () => I.resetDemo();
  };
})();
