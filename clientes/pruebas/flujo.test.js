// Prueba de extremo a extremo de la lógica central: node clientes/pruebas/flujo.test.js
const assert = require('assert');
const C = require('../cli-core.js');
global.window = global; global.localStorage = { _s: {}, getItem(k) { return this._s[k] || null; }, setItem(k, v) { this._s[k] = v; }, removeItem(k) { delete this._s[k]; } };
global.CliCore = C; global.btoa = (s) => Buffer.from(s, 'binary').toString('base64'); global.atob = (s) => Buffer.from(s, 'base64').toString('binary');
require('../cli-demo.js');
const D = global.CliDemo;
const cli = { uid: 'u1', tel: '+523311112222' };
(async () => {
  let r = await D.api('cliente', 'yo', {}, cli); assert.equal(r.estado, 'sin_registro');
  await assert.rejects(D.api('cliente', 'registrar', { nombre: 'Juan', razonSocial: 'X' }, cli));
  r = await D.api('cliente', 'registrar', { nombre: 'Juan Pérez López', razonSocial: 'Abarrotes La Estrella', numCliente: '', negocio: { nombre: 'La Estrella', lat: 20.79, lng: -102.35, modo: 'gps' } }, cli);
  assert.equal(r.estado, 'pendiente');
  await assert.rejects(D.api('cliente', 'prepedido', { items: [] }, cli), (e) => /revisión/.test(e.error || e.message));
  // personal
  await assert.rejects(D.api('login', '', { usuario: 'DEMO', pin: '9999' }));
  const vend = (await D.api('login', '', { usuario: 'DEMO', pin: '123456' })).token;
  const adm = (await D.api('login', '', { usuario: 'ADMINISTRACION', pin: '123456' })).token;
  const ger = (await D.api('login', '', { usuario: 'GERENCIA', pin: '123456' })).token;
  let regs = await D.api('staff', 'registros', {}, { sesion: adm });
  assert.equal(regs.registros.length, 1); assert.ok(regs.registros[0].sugerencias.length >= 1, 'sugiere por teléfono');
  console.log('sugerencia:', regs.registros[0].sugerencias[0]);
  await assert.rejects(D.api('staff', 'vincular', { uid: 'u1', skanName: 'X', vk: 'VENDEDORDEMO' }, { sesion: vend }), (e) => /permiso/.test(e.error || e.message));
  await D.api('staff', 'vincular', { uid: 'u1', skanName: 'ABARROTES LA ESTRELLA (DEMO)', vk: 'VENDEDORDEMO' }, { sesion: adm });
  r = await D.api('cliente', 'yo', {}, cli);
  assert.equal(r.estado, 'activo'); assert.ok(r.avance.row.avg === 640); assert.ok(r.precios.mostrar); 
  const prod = r.precios.productos.find(p => p.code === '04MAS003');
  console.log('escenarios 04MAS003:', prod.escenarios.map(e => [e.label, e.precio, e.conIva, e.flete]));
  assert.equal(prod.escenarios.length, 3);
  const f = C.calcFlete({ vehiculo: 'TORTON', km: 151, casetas: 122, ayudante: 1200 }, {});
  assert.ok(Math.abs(f.total - 4247.32) < 0.1, 'coincide con Excel fila 27: ' + f.total);
  assert.ok(Math.abs(f.saco20 - 5.6631) < 0.01);
  const f2 = C.calcFlete({ vehiculo: 'NISSAN', km: 120, casetas: 105 }, {});
  assert.ok(Math.abs(f2.total - 1028.437) < 0.1, 'Nissan fila 3: ' + f2.total);
  // prepedido
  r = await D.api('cliente', 'prepedido', { items: [{ code: '04MAS003', piezas: 80 }, { code: '04MAS001', piezas: 20 }, { code: 'XXX', piezas: 5 }], modalidad: 'entrega', escenario: prod.escenarios[1].id, nota: 'Llegar antes de las 12' }, cli);
  const pid = r.pedido.id; console.log('folio', r.pedido.folio, r.pedido.totales, r.pedido.entregaLabel);
  assert.equal(r.pedido.items.length, 2);
  let b = await D.api('staff', 'bandeja', {}, { sesion: vend }); assert.equal(b.cont.enviado, 1);
  await assert.rejects(D.api('staff', 'fincar', { id: pid, remision: 'S00123' }, { sesion: adm }), (e) => /confirmar/.test(e.error || e.message));
  await D.api('staff', 'confirmar', { id: pid, items: [{ code: '04MAS003', piezas: 100 }, { code: '04MAS001', piezas: 20 }] }, { sesion: vend });
  b = await D.api('staff', 'bandeja', {}, { sesion: adm }); assert.equal(b.cont.confirmado, 1);
  await D.api('staff', 'fincar', { id: pid, remision: 'S00123' }, { sesion: adm });
  await D.api('staff', 'editarRemision', { id: pid, remision: 'S00124', motivo: 'Odoo cambió el pedido' }, { sesion: adm });
  await D.simularCargador('S00123'); // número viejo: no debe liberar
  r = await D.api('cliente', 'yo', {}, cli); assert.equal(r.pedidos[0].estado, 'fincado');
  await D.simularCargador('PEDIDO 124'); // coincide por número
  r = await D.api('cliente', 'yo', {}, cli); assert.equal(r.pedidos[0].estado, 'liberado'); console.log('liberación', r.pedidos[0].liberacion);
  D.simularFacturacion(120);
  r = await D.api('cliente', 'yo', {}, cli); assert.equal(r.pedidos[0].estado, 'facturado');
  assert.ok(r.notifs.length >= 4); console.log('notifs:', r.notifs.map(n => n.titulo));
  // mensajes
  await D.api('cliente', 'mensaje', { texto: 'Quiero hablar del precio de Premium' }, cli);
  await assert.rejects(D.api('staff', 'mensajes', {}, { sesion: adm }), (e) => /permiso/.test(e.error || e.message));
  const ms = await D.api('staff', 'mensajes', {}, { sesion: ger }); assert.equal(ms.mensajes.length, 1);
  await D.api('staff', 'responder', { id: ms.mensajes[0].id, texto: 'Con gusto, te llamo mañana' }, { sesion: ger });
  r = await D.api('cliente', 'yo', {}, cli); assert.equal(r.mensajes[0].respuesta, 'Con gusto, te llamo mañana');
  // ocultar precios
  const prog = (await D.api('login', '', { usuario: 'PROGRAMACION', pin: '123456' })).token;
  await assert.rejects(D.api('staff', 'guardarConfig', { config: { mostrarPrecios: false } }, { sesion: prog }));
  await D.api('staff', 'guardarConfig', { config: { mostrarPrecios: false } }, { sesion: ger });
  r = await D.api('cliente', 'yo', {}, cli); assert.equal(r.precios.mostrar, false); assert.ok(!r.precios.productos[0].escenarios);
  assert.ok(!r.pedidos[0].totales && !r.pedidos[0].items[0].precio, 'no filtra precios viejos');

  // programador: superusuario solo km/casetas/diésel/ayudante y rutas nuevas; master todo
  await assert.rejects(D.api('loginProg', '', { pwd: 'mala' }));
  const su = (await D.api('loginProg', '', { pwd: 'admin123' })).token;
  const pm = (await D.api('loginProg', '', { pwd: 'master-2026' })).token;
  let F = await D.api('staff', 'fletes', {}, { sesion: su });
  const rid = Object.keys(F.fletes.rutas)[0]; const antes = F.fletes.rutas[rid];
  const mod = JSON.parse(JSON.stringify(F.fletes));
  mod.rutas[rid].km = 999; mod.rutas[rid].casetas = 50; mod.rutas[rid].ayudante = 1500; mod.rutas[rid].seguro = 1; mod.rutas[rid].vehiculo = 'NISSAN'; mod.rutas[rid].cobrado = 1;
  mod.params.diesel = 25.5; mod.params.anios = 9; mod.vehiculos.TORTON = { margen: 0.9 };
  mod.rutas.NUEVOCLIENTE = { destino: 'Cliente nuevo', vehiculo: 'TRAILER', km: 300, casetas: 400, seguro: 5 };
  const otraId = Object.keys(F.fletes.rutas)[1]; delete mod.rutas[otraId];
  let rr = await D.api('staff', 'guardarFletes', { fletes: mod }, { sesion: su }); assert.equal(rr.nuevas, 1);
  F = await D.api('staff', 'fletes', {}, { sesion: su });
  const d = F.fletes.rutas[rid];
  assert.equal(d.km, 999); assert.equal(d.casetas, 50); assert.equal(d.ayudante, 1500);
  assert.equal(d.vehiculo, antes.vehiculo, 'unidad no cambia'); assert.ok(d.seguro === antes.seguro && !d.cobrado, 'seguro/cobrado no cambian');
  assert.equal(F.fletes.params.diesel, 25.5); assert.equal(F.fletes.params.anios, 5); assert.ok(!(F.fletes.vehiculos.TORTON || {}).margen);
  assert.ok(F.fletes.rutas[otraId], 'superusuario no borra'); assert.ok(F.fletes.rutas.NUEVOCLIENTE && F.fletes.rutas.NUEVOCLIENTE.seguro === undefined);
  await assert.rejects(D.api('staff', 'guardarConfig', { config: { mostrarPrecios: true } }, { sesion: su }));
  await assert.rejects(D.api('staff', 'importarPrecios', { data: { lists: [{ id: 'X', name: 'x', items: [] }] } }, { sesion: su }));
  await assert.rejects(D.api('staff', 'mensajes', {}, { sesion: pm }));
  mod.params.anios = 6; await D.api('staff', 'guardarFletes', { fletes: mod }, { sesion: pm });
  F = await D.api('staff', 'fletes', {}, { sesion: pm }); assert.equal(F.fletes.params.anios, 6); assert.ok(!F.fletes.rutas[otraId], 'master sí borra');
  await D.api('staff', 'guardarConfig', { config: { mostrarPrecios: false } }, { sesion: pm });
  // otro cliente no ve nada ajeno
  const otro = { uid: 'u2', tel: '+523300000000' };
  await assert.rejects(D.api('cliente', 'cancelar', { id: pid }, otro));
  console.log('\nTODO OK');
})().catch(e => { console.error('FALLÓ', e); process.exit(1); });
