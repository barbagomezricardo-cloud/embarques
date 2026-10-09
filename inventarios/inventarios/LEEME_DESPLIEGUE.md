# Sistema de Inventarios Pet Food — Puesta en marcha

Tres aplicaciones sobre tu mismo proyecto de Firebase (**embarques-mascotas**), ligadas a tu **Panel de Licencia** y publicadas en tu GitHub (**barbagomezricardo-cloud**).

| App | Archivo | Quién la usa |
|---|---|---|
| Programa principal | `inventarios/index.html` | Master (tú), Jefe de inventarios, Compras (solo Proyección y Alertas) |
| App Almacenista | `inventarios/almacen.html` | Almacenista, en tablet |
| App Producción | `inventarios/produccion.html` | Supervisores de producción |

Direcciones una vez publicadas:
- https://barbagomezricardo-cloud.github.io/embarques/inventarios/
- https://barbagomezricardo-cloud.github.io/embarques/inventarios/almacen.html
- https://barbagomezricardo-cloud.github.io/embarques/inventarios/produccion.html

Ya está configurado en **modo operativo** (`config.js` apunta a embarques-mascotas). Para probar sin tocar datos reales agrega `?demo=1` a cualquier dirección.

---

## Paso 1 — Subir a GitHub (2 min)
1. Entra a github.com/barbagomezricardo-cloud/embarques.
2. **Add file → Upload files** y arrastra la carpeta **`inventarios`** completa (la que viene en este paquete).
3. **Commit changes**. En 1–2 minutos queda en línea.

> ⚠️ No subas la carpeta **PRIVADO** (trae tu Panel de Licencia y la carga inicial con existencias y costos).

## Paso 2 — Activar usuarios en Firebase (1 min)
Consola de Firebase → proyecto embarques-mascotas:
1. **Authentication → Comenzar → Método de acceso → Correo electrónico/contraseña → Habilitar → Guardar.**
2. **Authentication → Configuración → Dominios autorizados**: confirma que esté `barbagomezricardo-cloud.github.io` (si no, agrégalo).

Los usuarios entran con **usuario + contraseña** (el sistema arma internamente `usuario@inv19h.app`; no necesitan correo real).

## Paso 3 — Publicar las reglas de seguridad (1 min)
1. Abre el **Panel de Licencia nuevo** (`PRIVADO/panel-licencia.html`).
2. En "🛡️ Reglas de seguridad" toca **Copiar reglas**.
3. Firebase → Realtime Database → **Reglas** → pega → **Publicar**.

Qué hacen:
- Todas tus apps actuales (embarques, cargadores, Silver Kan) siguen funcionando igual: obedecen a `licencia/activa` y `hasta`.
- El nodo `inv` (inventarios) además exige usuario activo y rol: compras no ve conteos, el almacenista no ve el teórico ni el físico (conteo ciego), producción solo ve su almacén PT y sus solicitudes, nadie más que el master ve usuarios.

## Paso 4 — Licencia
En el Panel de Licencia nuevo aparecen tres interruptores: **Inventarios · Programa principal**, **App Almacenista** y **App Producción** (`licencia/apps/inventarios`, `inventarios_almacen`, `inventarios_produccion`). Sin nodo propio heredan la licencia general; "Apagar TODO" también los apaga. Las apps revisan la licencia al abrir y cada 10 minutos.

## Paso 5 — Primer arranque
1. Abre el programa principal → **"Primer uso: crear usuario master"** (solo funciona una vez).
2. Entra con tu usuario. En el Tablero toca **"Cargar datos iniciales de mis archivos"** y elige `PRIVADO/carga-inicial.json`. Trae:
   - Catálogo por familias (Empaque, Macro, Micro, Grasas y digestas, Cribas, Otros) con ubicaciones de rack/almacén.
   - Existencia física (Control de Empaque) separada en MDE y almacén PT (Inventario Mascotas).
   - Consumos mensuales, lead times y 30 % de seguridad (hoja Costal-Bobina).
   - Pedidos fincados y por comprar (hoja Proyección).
   - Silos y tanques con geometría y densidades (Dashboard SCADA).
   - Reporte de Odoo del 8 de octubre con costo promedio.
3. **Usuarios** → crea al jefe de inventarios, compras, almacenista(s) y supervisores de producción con su rol.

## Paso 6 — Tablet y celulares
Abre `almacen.html` o `produccion.html` en Chrome y usa **"Agregar a pantalla de inicio"**: queda como app.

## Paso 7 — IA, recordatorio de las 8 am y restablecer contraseñas (Cloud Functions)
Usa el mismo procedimiento con el que activaste el asistente de ventas (Cloud Shell):
1. Sube `inventarios/firebase/functions/index.js` y `package.json` a la carpeta `functions/` de Cloud Shell (reemplaza el index.js: **conserva tu `vzAsk` tal cual** y agrega `invAsk`, `invAdmin` e `invRecordatorio`). Si modificaste `vzAsk` directamente en Cloud Shell después de subirlo a GitHub, mejor copia solo el bloque que empieza en "INVENTARIOS PET FOOD" y pégalo al final de tu index.js.
2. Ejecuta: `cd functions && npm install && cd .. && firebase deploy --only functions`
3. Tu llave de IA ya está guardada como secreto `ANTHROPIC_API_KEY`; no hay que volver a capturarla.

- **IA**: solo el master. Tope de 400 preguntas al mes (red de seguridad). Revisa la licencia antes de responder.
- **Recordatorio**: corre cada 15 min y manda la notificación a producción a la hora que pongas en Configuración (8:00 por defecto, lunes a sábado).

## Paso 8 — Notificaciones push (opcional)
Firebase → Configuración del proyecto → **Cloud Messaging → Certificados push web → Generar par de claves**. Pega la clave en `VAPID_KEY` de `config.js`, vuelve a subir ese archivo y pide a producción que toque 🔔 en su app.
Sin este paso, la app de producción igual muestra el recordatorio en pantalla y como notificación cuando está abierta.

---

## Flujo diario
1. **Llega material al MDE** → Jefe: *Entradas MDE* (puede ligarla a un pedido fincado para que la proyección lo descuente).
2. **8:00 am** → Producción captura lo que va a necesitar (empaque u otros insumos).
3. **Almacenista** surte desde su tablet y reporta lo que entregó (pacas/piezas).
4. **Jefe** valida en *Transferencias a PT* (si cambia cantidades debe dejar nota) → se mueve MDE → PT y queda en el historial con la marca "reflejada en Odoo" para cuadrar.
5. **Salidas de PT**: el jefe carga la existencia de Odoo del almacén PT; la diferencia se registra como consumo.
6. **Conteo cíclico**: el almacenista elige familias, captura por ubicación en vivo y confirma "los datos son reales y los respaldo". El jefe compara contra Odoo, marca qué ajustar en Odoo, exporta la lista y aplica el físico.
7. **Silos**: el almacenista captura el vacío láser; el jefe aplica los niveles al físico.
8. **Compras** ve la proyección y las alertas calculadas siempre sobre el físico. Cualquier edición manual del físico pide nota y queda en la bitácora.

## Archivos
- `config.js` — conexión (único archivo a editar).
- `core.js` — datos, usuarios, licencia y cálculos compartidos.
- `app.js` / `index.html` — programa principal.
- `almacen.html`, `produccion.html` — apps de piso.
- `sw.js`, `manifest-*.json`, `icons/` — instalación como app y notificaciones.
- `firebase/database.rules.json` — reglas (las mismas que copia el Panel).
- `firebase/functions/` — funciones de Firebase (las tuyas + inventarios).

## Cambios 9-oct-2026
- **Transferencias a PT en 3 pasos:** almacén entrega → producción confirma lo recibido (app producción, pestaña "Recibir") → jefe de inventarios acepta. Excepción: "Aceptar sin confirmación" con motivo obligatorio.
- **Pacas = informativas.** Lo que mueve inventario son los sacos/piezas.
- **Silos:** motivos de calidad editables en Configuración (OK, Contaminado, Cuarentena, Pegado, Humedad alta, Plaga, Mezcla, Fuera de especificación, Rancidez, Pendiente de análisis, Otro). Todo lo distinto de OK pide nota.
- **Conteos cíclicos:** incluyen materias de silo (se captura el vacío del láser y el sistema calcula kg); alcance por familias o artículos; "Ajustar alcance", "Terminar con lo capturado" y "Cancelar conteo".
- **Catálogo:** columnas 📋 Contar (app almacén) y 🏭 Solicitar (app producción), con cambio masivo para lo filtrado.
- **Usuario Compras:** ve Tablero, Silos, Proyección y Alertas; puede registrar OC colocadas (entran como fincadas) y agregar notas/estatus de seguimiento. No edita existencias.
