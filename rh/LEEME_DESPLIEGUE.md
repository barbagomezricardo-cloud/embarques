# Recursos Humanos 19H — Puesta en marcha

Tres aplicaciones sobre tu mismo proyecto de Firebase (**embarques-mascotas**), ligadas a tu **Panel de Licencia** y publicadas en tu GitHub (**barbagomezricardo-cloud**). Misma arquitectura que Inventarios: `config.js` + `core.js` + usuarios con rol + reglas por rol + IA en Cloud Functions.

| App | Archivo | Quién la usa | Licencia |
|---|---|---|---|
| Programa principal | `rh/index.html` | Master, RH, Dirección, Jefes de área | `licencia/apps/rh` |
| Checador (kiosco) | `rh/checador.html` | Tablet en la entrada (usuario rol *kiosco*) | `licencia/apps/rh_checador` |
| Portal del empleado | `rh/empleado.html` | Cada empleado en su celular (No. + NIP) | `licencia/apps/rh_empleado` |

Direcciones una vez publicadas:
- https://barbagomezricardo-cloud.github.io/embarques/rh/
- https://barbagomezricardo-cloud.github.io/embarques/rh/checador.html
- https://barbagomezricardo-cloud.github.io/embarques/rh/empleado.html

Para probar sin tocar datos reales agrega `?demo=1` a cualquier dirección (usuarios demo: master, rh, jefe, director, kiosco · contraseña `demo`; empleado No. 1013 · NIP 123456).

---

## Paso 1 — Reglas de seguridad ✅ (publicadas el 2-nov-2026)
Se agregó el nodo `rh` (y `rh_ia_uso`) a las reglas que ya tenías publicadas, sin tocar los demás nodos. El bloque está en `rh/firebase/reglas-solo-rh.json`. Si algún día pegas reglas desde tu Panel de Licencia, agrega ese bloque para no borrar la protección de RH.

## Paso 2 — Subir a GitHub (2 min)
1. github.com/barbagomezricardo-cloud/embarques → **Add file → Upload files**.
2. Arrastra la carpeta **`rh`** completa → **Commit changes**.

> ⚠️ No subas la carpeta **PRIVADO** (trae la plantilla real con nombres y saldos).

## Paso 3 — Licencia
En tu Panel de Licencia agrega los interruptores `rh`, `rh_checador` y `rh_empleado`. Sin nodo propio heredan la licencia general; "Apagar TODO" también los apaga. Revisan la licencia al abrir y cada 10 minutos.

## Paso 4 — Primer arranque
1. Abre `rh/index.html` → **"Primer uso: crear usuario master"** (solo funciona una vez; es independiente del master de inventarios).
2. **Configuración** → revisa tolerancia, semana de nómina (jueves a miércoles), bono, turnos y **geocerca**: párate en la entrada de la planta y toca "Usar mi ubicación actual".
3. **Plantilla → Importar Excel / JSON** → elige `PRIVADO/plantilla-inicial.json` (170 activos + 23 bajas de tu VACACIONES 2026, saldo de vacaciones al 2-nov-2026).
   - Los números de empleado vienen como **provisionales (1001…)**: cámbialos por los de nómina (son el puente con Odoo: campo *Badge ID / barcode*).
   - Revisa la lista de pendientes en `PRIVADO/REVISAR_plantilla.txt`.
4. **Usuarios y accesos** → crea RH, Dirección, jefes (con sus departamentos) y el usuario *kiosco* de la tablet.
5. **Plantilla → Gafetes QR** → imprime y enmica.
6. **Usuarios y accesos → Generar NIP** → entrega los NIP en sobre cerrado (requiere el Paso 6).

## Paso 5 — Tablet y celulares
- Tablet de la entrada: abre `checador.html` en Chrome, entra con el usuario *kiosco* y "Agregar a pantalla de inicio". Déjala conectada a corriente.
- Empleados: comparte la liga de `empleado.html`; se instala igual que una app. Solo choferes y vendedores (marcados "en ruta") checan fuera de la geocerca; el resto checa en el kiosco o dentro del radio de la planta (actívalo por persona en su ficha).

## Paso 6 — Cloud Functions (IA, accesos masivos, NIP)
Mismo procedimiento que usaste con inventarios (Cloud Shell):
1. Copia el bloque `rh/firebase/functions/rh-bloque.js` y pégalo **al final** de tu `functions/index.js` (conserva tus `vzAsk`, `invAsk`, etc.). El archivo `index.js` del paquete ya viene armado así, por si prefieres reemplazarlo completo.
2. `cd functions && npm install && cd .. && firebase deploy --only functions`
3. Tu llave de IA ya está como secreto `ANTHROPIC_API_KEY`.

- **rhAsk** — IA solo del master, tope 300 preguntas/mes, revisa licencia.
- **rhAdmin** — alta masiva de accesos de empleados (50 por llamada) y restablecer contraseñas/NIP.

## Paso 7 — Odoo (cuando lo decidas)
- Hoy: **Prenómina → CSV Odoo** genera `hr.attendance` (fechas en UTC) y `hr.leave`; **Plantilla → CSV para Odoo** genera `hr.employee` con `barcode` = número de empleado.
- Directo: `rh-odoo-opcional.js` trae **rhOdoo** (servidor a servidor, sin problemas de CORS). Crea los secretos `ODOO_URL`, `ODOO_DB`, `ODOO_USER`, `ODOO_API_KEY`, pega el bloque y despliega. Al **cerrar una semana** aparece "Enviar a Odoo". Pruébalo primero contra tu Odoo de prueba en Docker.

---

## Flujo diario
1. **Checada**: gafete QR en el kiosco (foto + hora de servidor) o celular con ubicación. Si se cae el internet, el kiosco guarda y envía al volver.
2. **Automático**: faltas, retardos (tolerancia), salidas sin checar, tiempo extra checado vs autorizado, bono.
3. **Solicitudes**: el empleado pide vacaciones/permiso en su celular con firma → **jefe** autoriza → **RH** enterada (el flujo se cambia en Configuración; se puede agregar Dirección). Las vacaciones validan saldo, días laborables según su turno y festivos, cobertura del departamento y anticipación.
4. **Tiempo extra**: el jefe lo pre-autoriza; solo se paga lo autorizado y checado. 9 h dobles por semana, el excedente triple (LFT 67-68). Opción tiempo por tiempo (banco de horas).
5. **Jueves**: RH revisa **Prenómina**, corrige pendientes y **Cierra la semana** (queda congelada; solo el master reabre) → Excel para nómina y CSV/envío a Odoo.
6. **Vacaciones**: cada aniversario se abonan los días LFT 2023 (12, 14, 16, 18, 20, luego +2 cada 5 años); alerta de días fuera de plazo (LFT 81).
7. **Rotación**: cada baja pide tipo, motivo y si es recontratable → índice mensual, anual, voluntaria y temprana (<90 días) por departamento.

## Archivos
- `config.js` — conexión (único archivo a editar).
- `core.js` — datos, usuarios, licencia y cálculos de RH.
- `app.js` / `index.html` — programa principal.
- `checador.html`, `empleado.html` — apps de piso.
- `estilos.css`, `rh.css`, `img/`, `icons/` — identidad 19 Hermanos (misma que la app de clientes).
- `sw.js`, `manifest-*.json` — instalación como app.
- `firebase/` — reglas y funciones.
