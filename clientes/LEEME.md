# App de Clientes · Los 19 Hermanos División Pet Food

La app es para los clientes. Ahí ven su avance, su histórico y sus descuentos, hacen prepedidos y siguen cada pedido hasta que se factura. Está conectada a las apps que ya usas: vendedor, Administración, programación de embarques, cargadores y ventas/gerencia.

| Qué | Archivo | Quién lo usa |
|---|---|---|
| **App del cliente** (web instalable y base de las apps de tienda) | `clientes/index.html` | Clientes |
| **Panel «Clientes»** (botón rojo abajo a la izquierda) | `clientes/cli-staff.js`, ya integrado en `vendedor.html`, `ventas.html` y `maestra.html` | Vendedores, Administración y gerencia |
| **Pestaña «💲 Fletes y precios»** | `programador.html` | Programación de embarques |
| **Consola del personal** (página sola) | `clientes/personal.html` | Quien prefiera abrir el panel aparte |
| **Servidor** | `clientes/funciones/clientes.js` + `cli-core.js` | Firebase (Cloud Functions) |
| **Apps de tienda** | `clientes/tiendas/` | App Store y Google Play (Capacitor) |
| **Aviso de privacidad** | `clientes/privacidad.html` | Requisito de las tiendas |

Direcciones, una vez publicadas en GitHub Pages:
- Clientes: https://barbagomezricardo-cloud.github.io/embarques/clientes/
- Consola del personal: https://barbagomezricardo-cloud.github.io/embarques/clientes/personal.html
- **Demostración, sin tocar datos reales:** agrega `?demo=1` a la app del cliente y `?clidemo=1` a cualquiera de tus apps o a la consola. Por ejemplo, abre `clientes/?demo=1` y `clientes/personal.html?clidemo=1` en el mismo navegador para ver el flujo completo. El código SMS de prueba es 123456. Los usuarios del personal en la demostración son DEMO, ADMINISTRACION, PROGRAMACION y GERENCIA, todos con PIN 123456.

---

## Flujo completo

1. **Registro del cliente.** El cliente entra con su celular y recibe un código por SMS. Después captura su nombre completo, razón social, número de cliente (opcional), teléfono de contacto y su negocio. La ubicación la puede registrar de tres formas: «Estoy aquí» (GPS), marcándola en el mapa o escribiendo solo la dirección.
2. **Validación por Ventas.** El registro llega a **Registros → Por validar** con posibles coincidencias en el catálogo, por teléfono y por nombre. Administración o gerencia busca al cliente en las carteras publicadas y pulsa **Vincular y activar**. Al cliente le llega el aviso de que su cuenta está activa.
3. **El cliente ve su avance.** Ve su nivel, el descuento que paga este mes y lo que va ganando para el siguiente: crecimiento, Premium base y Premium+, con barras de avance. También ve cuánto le falta para mantener o subir de nivel y su histórico por producto y mes. Son los mismos números que ve su vendedor, porque salen de lo que ventas publica.
4. **Prepedido.** El cliente elige productos y sacos y escoge si recoge en planta o le entregan, según la ruta. Si los precios están habilitados, ve el precio por saco, el IVA y el flete. Antes de enviar ve el **simulador**: cómo cambiaría su descuento del siguiente mes si ese pedido se factura en el mes y qué le faltaría para el siguiente bono.
5. **Alerta.** Al enviarlo, el vendedor recibe la alerta en su app (botón rojo con contador, sonido y aviso del navegador). Además, el cliente tiene un botón para **avisar a su vendedor por WhatsApp** con el mensaje ya armado.
6. **El vendedor confirma.** Llama al cliente, ajusta cantidades si hace falta y pulsa **«Ya lo validé por teléfono · Confirmar»**. Desde ahí puede avisar a Administración por WhatsApp.
7. **Administración finca en Odoo.** Las asistentes ven **Por fincar en Odoo**, lo capturan en Odoo y escriben el **número de pedido o remisión**. El pedido queda con el sello verde «✓ Fincado en Odoo · número», que es el control visual. Si el número cambia, **Editar número** pide el motivo y guarda el historial.
8. **Cargadores libera.** Cuando Cargadores pulsa «Finalizar carga» en una unidad cuyo **pedido** coincide con ese número, el servidor marca el prepedido como **liberado** con los lotes, la unidad y la hora. Al cliente le llega el aviso «Tu pedido va en camino». Si una carga no se ligó, Administración tiene **Liberar manualmente**.
9. **Facturación.** El cliente ve «En proceso de facturación: al facturarse se suma a tu avance». Su avance solo cambia cuando ventas publica la facturación, igual que hoy. Cuando el reporte publicado ya incluye esos sacos, el pedido pasa solo a **Facturado**. Administración también lo puede marcar a mano.
10. **Mensaje a gerencia.** Desde **Más → Mensaje a gerencia**, el cliente escribe y la gerencia contesta en **Mensajes**. La respuesta le llega al cliente en su app.

> **Importante para que la liberación se ligue sola:** Programación debe capturar en el embarque (campo «Pedido») el mismo número que Administración escribió al fincar. Si un embarque lleva varios pedidos, se separan con coma. El número se reconoce aunque cambie el prefijo (por ejemplo, «S00124», «PEDIDO 124» o «124»).

---

## Puesta en marcha (una sola vez, unos 40 minutos)

### Paso 1. Publicar en GitHub
Los cambios están en la rama **`app-clientes`** con un Pull Request abierto. Revísalo y pulsa **Merge**. Te sugiero hacerlo **después del paso 4**, para que el botón «Clientes» no aparezca a tu equipo antes de que el servidor esté listo.

### Paso 2. Activar el acceso por SMS (Firebase Authentication)
Consola de Firebase → proyecto **embarques-mascotas**:
1. **Authentication → Método de acceso → Teléfono → Habilitar → Guardar.**
2. **Authentication → Configuración → Dominios autorizados:** confirma que esté `barbagomezricardo-cloud.github.io`.
3. (Recomendado) **Teléfono → Números de teléfono para pruebas:** agrega uno con un código fijo. Te sirve para probar sin gastar SMS y para la revisión de Apple.

El SMS de verificación tiene costo por mensaje en el plan Blaze, que ya tienes por la IA. Revisa la tarifa vigente para México en la página de precios de Firebase Authentication. Cada cliente lo usa al registrarse y cuando cambia de teléfono, no cada vez que abre la app.

### Paso 3. Reglas de seguridad
Los datos de clientes viven en el nodo **`/cli`**, que debe estar **cerrado al público**: solo el servidor entra. En tu **Panel de Licencia → Reglas de seguridad** agrega este bloque junto a `"licencia"`. Ya está en `inventarios/inventarios/firebase/database.rules.json`.
```json
"cli": { ".read": false, ".write": false },
```
Copia las reglas y publícalas en Firebase → Realtime Database → Reglas. Si algún día publicas reglas viejas sin ese bloque, el panel **🔑 Accesos** te muestra una alerta roja.

### Paso 4. Subir el servidor (Cloud Shell, como hiciste con la IA)
1. Sube a la carpeta `functions/` de Cloud Shell los archivos **`clientes/funciones/clientes.js`** y **`clientes/funciones/cli-core.js`**.
2. Al **final** de tu `functions/index.js` agrega esta línea:
   ```js
   Object.assign(exports, require('./clientes'));
   ```
3. Crea la llave maestra. Es una frase larga que solo tú conoces, por ejemplo cuatro palabras y un número:
   ```
   firebase functions:secrets:set CLI_MAESTRO
   ```
4. Despliega:
   ```
   cd functions && npm install && cd .. && firebase deploy --only functions
   ```
5. Confirma que la URL de `cliApi` que te muestra la terminal coincide con `api` en `clientes/config.js`. Si no coincide, cámbiala ahí.

Se crean dos funciones: **cliApi**, la puerta de entrada de la app y del panel, y **cliEmbarque**, que escucha a Cargadores y avisa al cliente.

### Paso 5. Licencia
En tu Panel de Licencia puedes agregar dos interruptores: **`clientes`** (la app de clientes) y **`clientes_personal`** (el panel del personal). Si no los agregas, heredan la licencia general, y «Apagar TODO» también los apaga.

### Paso 6. Accesos del personal
Abre `ventas.html` o `maestra.html` → botón **Clientes** → **🔑 Accesos** → escribe tu llave maestra. Ahí das de alta:
- **Cada vendedor**, con rol Vendedor y su **cartera**. Solo ve los prepedidos y clientes de su cartera.
- **Cada asistente de ventas**, con rol Administración. Conviene un usuario por persona, para que quede registrado quién fincó cada pedido.
- **Programación de embarques**, con rol Programación.
- **Tú**, con rol Gerencia. Es el único que ve los mensajes para atención gerencial.

Cada persona recibe un **PIN de 6 a 8 dígitos**. A los vendedores captúrales su **WhatsApp**: así el cliente puede escribirle directo al enviar su prepedido. Cambiar un PIN cierra las sesiones abiertas de esa persona. Después de 5 intentos fallidos, el usuario se bloquea 15 minutos.

### Paso 7. Fletes y precios (Programación)
En `programador.html` → **💲 Fletes y precios**:
1. **Importar del Excel:** elige `PARA IMPLEMENTAR.xlsx`. Trae las rutas con km, casetas, ayudante, seguro y diésel de cada renglón, y el «flete interno» cobrado hoy para compararlo. Revisa y pulsa **Guardar fletes**.
2. **Cargar archivo de listas:** elige el archivo «Clientes y listas de precios 19H» (.html). Carga las 14 listas y el catálogo de clientes con su teléfono, que se usa para sugerir coincidencias al validar registros. Esos datos se guardan en el servidor, **no en GitHub**.
3. **Precio y flete por cliente:** a cada cliente le asignas su lista para «recoge en planta», opcionalmente una lista con flete incluido, las rutas de entrega que puede elegir y si ve precios.
4. **Interruptor general:** «Mostrar precios con IVA y flete» o «Solo productos y sacos». Arranca **apagado**: el cliente pide en productos y sacos hasta que tú decidas encenderlo, para todos o cliente por cliente.

**Corrección respecto al Excel:** en 55 renglones (del 44 al 98, Tortón y Tráiler), la columna «COSTAL 20KG» dividía entre 40, igual que la de 25 kg, y el flete por saco de 20 kg salía 25% alto. La calculadora divide entre 50. El resto da exactamente lo mismo que el Excel. Por ejemplo, David Brambila en Tortón da $4,247.32 por viaje y CEDIS Aztecas en Tráiler $18,623.81. Las rutas donde lo cobrado hoy no cubre el costo calculado se marcan en rojo; en CEDIS Aztecas se cobran $14,256 contra $18,623.81 calculados.

### Paso 8. Compartir con los clientes
Comparte la dirección de la app por WhatsApp o con un código QR en la factura o en el punto de venta. En Android, Chrome ofrece **Instalar app**. En iPhone se instala desde Safari → Compartir → «Agregar a pantalla de inicio»; la app trae las instrucciones en **Más**.

### Paso 9 (opcional). Avisos push en la web
Firebase → Configuración del proyecto → **Cloud Messaging → Certificados push web → Generar par de claves**. Pega la clave en `vapidKey` de `clientes/config.js`. Sin este paso, el cliente ve sus avisos en la campana de la app. En iPhone, el push web solo funciona con la app instalada en la pantalla de inicio.

---

## Apps de App Store y Google Play

La misma app se empaqueta como app nativa con **Capacitor** (carpeta `clientes/tiendas/`). En la versión de tienda, el SMS y los avisos los manejan los plugins nativos de Firebase. El código ya detecta cuándo corre como app nativa.

**Lo que necesitas:**
- **Apple Developer Program**: 99 USD al año. **Google Play Console**: 25 USD una sola vez. Si se publican a nombre de Leche 19 Diecinueve Hermanos, ambas piden el **número D-U-N-S** de la empresa; el trámite toma de 1 a 3 semanas.
- Tu **MacBook Pro** con **Xcode** (para iPhone) y **Android Studio** (para Android).
- En Firebase → Configuración del proyecto → **Agregar app iOS y Android** con el identificador `mx.diecinuevehermanos.clientes`. Descarga `GoogleService-Info.plist` (iOS) y `google-services.json` (Android).
- Para el SMS en Android: registra la huella **SHA-1 y SHA-256** de tu llave de firma en Firebase. Para push en iPhone: sube la **llave APNs** de Apple en Cloud Messaging.

**Pasos (en tu Mac):**
```
cd clientes/tiendas
npm install
npx cap add ios && npx cap add android
npx @capacitor/assets generate        # íconos y pantalla de arranque con el logo
npm run ios                            # abre Xcode
npm run android                        # abre Android Studio
```
Copia `GoogleService-Info.plist` a `ios/App/App/` y `google-services.json` a `android/app/`. En Xcode activa **Push Notifications** y **Background Modes → Remote notifications**.

**Para que Apple la apruebe:**
- La app tiene funciones nativas (SMS nativo, ubicación y avisos push), no es solo una página.
- Incluye **Eliminar mi cuenta** (Más) y **Aviso de privacidad**, que Apple exige.
- Para la revisión, da a Apple un **número de prueba** del paso 2.3 y una cuenta de cliente ya validada.
- En la ficha, el aviso de privacidad va en `.../clientes/privacidad.html`. Te sugiero que el área legal lo revise y que pongas un correo de contacto en `correoPrivacidad` de `config.js`.

La **versión web instalable** queda funcionando en paralelo. Es la que puedes repartir desde ya, mientras las tiendas aprueban, y la que usan los clientes que no quieran descargar nada.

---

## Seguridad: cómo está armada
- **Cada cliente solo ve lo suyo.** Entra con su celular verificado por SMS (Firebase Authentication). El servidor identifica al cliente por su sesión, nunca por lo que mande la app, y solo le entrega su renglón de ventas, sus precios y sus pedidos.
- **Nada de clientes queda abierto en la base de datos.** El nodo `/cli` está cerrado; solo la función del servidor lo lee y lo escribe. Los costos de flete, márgenes y listas completas nunca salen hacia la app del cliente: solo el precio final que le corresponde.
- **Nadie ve datos de clientes sin validación.** Un registro nuevo no ve nada hasta que Ventas lo vincula con su cliente real.
- **El personal entra con usuario y PIN**, y su rol se valida en el servidor. Un vendedor solo ve su cartera, solo gerencia ve los mensajes y solo programación o gerencia cambian fletes y precios. Las sesiones se firman con tu llave maestra.
- **Las acciones del personal quedan en bitácora** (`/cli/audit`): quién confirmó, fincó, cambió una remisión, validó a un cliente o cambió fletes.
- **Límites contra abuso:** máximo de prepedidos y mensajes por día por cliente, 5 prepedidos sin confirmar a la vez, bloqueo por intentos de PIN y licencia revisada en cada llamada.
- **Tu repositorio es público.** Por eso las listas de precios, el catálogo de clientes y el Excel de fletes se cargan desde la app al servidor y **no se suben a GitHub**.

## Pruebas
- `node clientes/pruebas/flujo.test.js` recorre el flujo completo con la lógica real: registro, validación, prepedido, confirmación con ajuste, fincado, cambio de remisión, liberación por Cargadores, facturación, mensajes, interruptor de precios y aislamiento entre clientes. También verifica que la calculadora de fletes coincide con el Excel.

## Para una fase 2
- WhatsApp automático con la API oficial de Meta (número dedicado y plantillas aprobadas). Hoy son botones que arman el mensaje.
- Ligar el prepedido con Odoo directamente, para que el fincado sea automático cuando conectes tus apps a Odoo.
- Usuarios con correo y contraseña para todo el personal en todas tus apps (hoy, el PIN aplica a este módulo).
