/* =====================================================================
   SEGURIDAD 19H · contraseña de super-usuario de Ventas y Gerencia
   ---------------------------------------------------------------------
   La contraseña YA NO vive escrita en el código (el repositorio es
   público). Se guarda CIFRADA (PBKDF2-SHA256, 210 000 vueltas, con sal)
   en  licencia/seguridad/superVentas  de tu Firebase. Ese nodo solo se
   puede escribir con el Database Secret, es decir, desde tu Panel de
   Licencia («🔑 Contraseña de super-usuario»).
   Mientras no la configures ahí, sigue funcionando la contraseña
   anterior (comparada también cifrada) y la app te lo recuerda.
   Además: 5 intentos fallidos bloquean el acceso 10 minutos en ese equipo.
   ===================================================================== */
(function (W) {
  'use strict';
  var DB = 'https://embarques-mascotas-default-rtdb.firebaseio.com';
  var NODO = '/licencia/seguridad/superVentas.json';
  /* contraseña anterior, solo como respaldo temporal (cifrada, no en texto) */
  var ANTERIOR = { s: '6ee0685730c0bb9f28d95615b41dd4c2', h: '3747f6ff6c5f2ae274e1bc44acc6b30b34940a414eec327bb551b08008995df9', i: 210000 };
  var LS = 'seg19h_intentos', MAX = 5, BLOQUEO_MS = 10 * 60 * 1000;

  function hex2buf(h) { var a = new Uint8Array(h.length / 2); for (var i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16); return a; }
  function buf2hex(b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }
  function pbkdf2(pwd, saltHex, iter) {
    if (!W.crypto || !W.crypto.subtle) return Promise.reject(new Error('Este navegador no permite verificar la contraseña de forma segura.'));
    return W.crypto.subtle.importKey('raw', new TextEncoder().encode(pwd), 'PBKDF2', false, ['deriveBits'])
      .then(function (k) { return W.crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: hex2buf(saltHex), iterations: iter }, k, 256); })
      .then(buf2hex);
  }
  function iguales(a, b) { if (!a || !b || a.length !== b.length) return false; var r = 0; for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
  function leerIntentos() { try { return JSON.parse(localStorage.getItem(LS) || '{"n":0,"t":0}'); } catch (e) { return { n: 0, t: 0 }; } }
  function guardarIntentos(o) { try { localStorage.setItem(LS, JSON.stringify(o)); } catch (e) { } }
  function config() {
    return fetch(DB + NODO, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  /* Devuelve { ok, aviso } — aviso trae un texto cuando conviene mostrar algo al usuario */
  function verificar(pwd) {
    var it = leerIntentos();
    if (it.n >= MAX && Date.now() - it.t < BLOQUEO_MS) {
      var min = Math.ceil((BLOQUEO_MS - (Date.now() - it.t)) / 60000);
      return Promise.resolve({ ok: false, aviso: 'Demasiados intentos. Espera ' + min + ' min para volver a intentar.' });
    }
    if (it.n >= MAX) it = { n: 0, t: 0 };
    return config().then(function (c) {
      var ref = (c && c.s && c.h) ? c : ANTERIOR, nueva = ref !== ANTERIOR;
      return pbkdf2(String(pwd || ''), ref.s, Number(ref.i) || 210000).then(function (h) {
        if (iguales(h, ref.h)) {
          guardarIntentos({ n: 0, t: 0 });
          return { ok: true, aviso: nueva ? '' : '⚠️ Sigues usando la contraseña anterior, que estuvo visible en el código público.\nCámbiala desde tu Panel de Licencia → «🔑 Contraseña de super-usuario».' };
        }
        it.n++; it.t = Date.now(); guardarIntentos(it);
        return { ok: false, aviso: 'Contraseña incorrecta.' + (it.n >= MAX ? ' Acceso bloqueado 10 min en este equipo.' : ' Te quedan ' + (MAX - it.n) + ' intento(s).') };
      });
    }).catch(function (e) { return { ok: false, aviso: e.message || 'No se pudo verificar la contraseña.' }; });
  }
  W.Seguridad19H = { verificar: verificar };
})(window);
