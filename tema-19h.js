/* =====================================================================
   TEMA 19H · Automático / Claro / Oscuro (igual que la app de Clientes)
   - Se guarda en este equipo y lo comparten todas tus apps de GitHub.
   - Automático sigue el modo del teléfono o la computadora.
   - Se carga en el <head> para que la página no "parpadee" al abrir.
   ===================================================================== */
(function (W, D) {
  'use strict';
  var KEY = 'tema19h';
  function leer() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function guardar(v) { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch (e) { } }
  function aplicar(v) {
    var r = D.documentElement;
    if (v === 'light' || v === 'dark') r.setAttribute('data-theme', v); else r.removeAttribute('data-theme');
    var oscuro = v === 'dark' || (!v && W.matchMedia && W.matchMedia('(prefers-color-scheme: dark)').matches);
    var m = D.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', oscuro ? '#A80810' : '#DE0A14');
    var b = D.getElementById('tema19h-btn'); if (b) b.textContent = v === 'dark' ? '🌙' : (v === 'light' ? '☀️' : '🌗');
  }
  aplicar(leer());
  // si otra app abierta cambia el tema, esta también
  W.addEventListener('storage', function (e) { if (e.key === KEY) aplicar(leer()); });
  if (W.matchMedia) { try { W.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { aplicar(leer()); }); } catch (e) { } }

  function menu(btn) {
    var viejo = D.getElementById('tema19h-menu'); if (viejo) { viejo.remove(); return; }
    var v = leer(), m = D.createElement('div'); m.id = 'tema19h-menu'; m.setAttribute('role', 'group'); m.setAttribute('aria-label', 'Apariencia');
    m.innerHTML = '<b>Apariencia</b>' + [['', '🌗 Automático'], ['light', '☀️ Claro'], ['dark', '🌙 Oscuro']].map(function (o) {
      return '<button type="button" data-t="' + o[0] + '" aria-pressed="' + (o[0] === v) + '">' + o[1] + '</button>';
    }).join('');
    D.body.appendChild(m);
    var r = btn.getBoundingClientRect(); m.style.top = (r.bottom + 8) + 'px'; m.style.right = Math.max(8, W.innerWidth - r.right) + 'px';
    Array.prototype.forEach.call(m.querySelectorAll('button'), function (b) {
      b.onclick = function () { guardar(b.dataset.t); aplicar(b.dataset.t); m.remove(); };
    });
    setTimeout(function () { D.addEventListener('click', function cierra(e) { if (!m.contains(e.target) && e.target !== btn) { m.remove(); D.removeEventListener('click', cierra); } }); }, 0);
  }
  function boton() {
    if (D.getElementById('tema19h-btn')) return;
    var h = D.querySelector('body>header'); if (!h) return;
    var b = D.createElement('button'); b.type = 'button'; b.id = 'tema19h-btn'; b.title = 'Apariencia: automático, claro u oscuro';
    b.setAttribute('aria-label', 'Apariencia'); b.onclick = function (e) { e.stopPropagation(); menu(b); };
    h.appendChild(b); aplicar(leer());
  }
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', boton); else boton();
  W.Tema19H = { aplicar: aplicar, leer: leer };
})(window, document);
