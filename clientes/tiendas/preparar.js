// Copia la app web (carpeta clientes/) a www/ para empaquetarla. No copia el modo demostración
// ni el panel del personal: la app de tienda es solo para clientes.
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..'), DST = path.join(__dirname, 'www');
const INCLUIR = ['index.html', 'config.js', 'manifest.json', 'img'];
fs.rmSync(DST, { recursive: true, force: true }); fs.mkdirSync(DST, { recursive: true });
for (const f of INCLUIR) fs.cpSync(path.join(SRC, f), path.join(DST, f), { recursive: true });
// recursos para generar íconos y pantalla de arranque con @capacitor/assets
fs.mkdirSync(path.join(__dirname, 'assets'), { recursive: true });
fs.copyFileSync(path.join(SRC, 'img', 'icono-512.png'), path.join(__dirname, 'assets', 'icon.png'));
fs.copyFileSync(path.join(SRC, 'img', 'icono-512.png'), path.join(__dirname, 'assets', 'splash.png'));
console.log('Listo: www/ actualizado desde clientes/');
