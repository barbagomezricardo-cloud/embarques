# Cómo activar la IA y el resumen semanal automático — guía paso a paso (para Ricardo)

Esto es lo único que falta para que la IA y el correo semanal automático funcionen de verdad. Yo ya dejé todo el código listo; estos pasos los tienes que hacer tú porque necesitan tu cuenta y tu método de pago (no puedo hacerlos por ti).

Son ~20-25 minutos la primera vez (un poco más si ya hiciste la parte de la IA antes — en ese caso solo te falta el Paso 3-B de abajo, el del correo). Después de esto, nunca más tienes que tocarlo (solo si algún día quieres cambiar el tope de gasto, el modelo, o a quién le llega el correo, y eso se hace desde ventas.html, sin volver a hacer nada de esto).

Hay DOS funciones en el mismo archivo, y se despliegan juntas con un solo comando:
- **vzAsk** — el asistente de IA que ya conoces (vendedor.html, maestra.html, "Pregúntame").
- **weeklyResumenEmail** — nueva: manda por correo, cada lunes en la mañana, el mismo "Resumen semanal" de ventas.html (con lectura + sugerencias de IA si la tienes activada), sin que nadie tenga que dar clic en nada. Se basa en el último reporte de Odoo que hayas cargado — si un lunes no has cargado nada nuevo esa semana, te llega el resumen del último reporte que sí cargaste.

---

## Paso 1 — Crea tu cuenta de IA y consigue tu llave (API key)

1. Ve a **https://platform.claude.com** y crea una cuenta (o entra con la que ya usas para hablar conmigo).
2. Ve a la sección de **Billing** (facturación) y agrega una tarjeta. Ahí mismo puedes poner un **límite de gasto mensual** (te recomiendo poner $10-15 USD como tope de seguridad, aunque esperamos gastar mucho menos — así nunca te puede sorprender un cargo).
3. Ve a **API Keys**, crea una nueva llave, y **cópiala en un lugar seguro** (solo se muestra una vez). Se ve algo así: `sk-ant-...`

## Paso 2 — Activa el plan de pago de Firebase (Blaze)

Tu base de datos (`embarques-mascotas`) ya existe, pero para que la función pueda "salir a internet" a hablar con la IA, Firebase requiere el plan **Blaze** (pago por uso — sigue siendo prácticamente gratis para lo que vamos a usar, solo se necesita tarjeta registrada).

1. Ve a **https://console.firebase.google.com**, entra a tu proyecto (`embarques-mascotas` o como se llame).
2. Abajo a la izquierda, botón **"Actualizar" / "Upgrade"** junto al nombre del plan.
3. Elige **Blaze (pago por uso)** y agrega tu método de pago.

No te va a cobrar nada extra por esto en sí — el plan gratuito de funciones (2 millones de llamadas al mes) sigue siendo gratis, Blaze solo te da acceso a usarlo con internet de salida.

## Paso 3 — Sube y despliega la función (sin instalar nada, usando Cloud Shell)

1. En https://console.firebase.google.com con tu proyecto abierto, busca el ícono de **terminal ">_"** arriba a la derecha (Cloud Shell) y ábrelo. Es una terminal en el navegador, ya conectada a tu cuenta — no necesitas instalar nada en tu computadora.
2. Sube los 3 archivos que te dejé (`functions/index.js`, `functions/package.json`, `firebase.json`) usando el botón de subir archivos de Cloud Shell (⋮ → Upload), manteniendo la carpeta `functions/` (o crea la carpeta y mete ahí los dos archivos .js/.json).
3. En la terminal de Cloud Shell, escribe estos comandos uno por uno:

   ```
   firebase login
   ```
   (te va a pedir confirmar con tu cuenta de Google — di que sí)

   ```
   firebase use --add
   ```
   (elige tu proyecto `embarques-mascotas` de la lista)

   ```
   firebase functions:secrets:set ANTHROPIC_API_KEY
   ```
   (aquí pega la llave `sk-ant-...` que copiaste en el Paso 1, y presiona Enter)

### Paso 3-B — Solo si quieres el correo semanal automático (weeklyResumenEmail)

Si no te interesa el correo automático todavía, sáltate esto y sigue directo con `npm install` más abajo — la IA (vzAsk) funciona igual sin esto. Si sí lo quieres:

1. Necesitas una cuenta de Gmail desde la que se manden los correos (puede ser la misma que usas siempre, o una nueva tipo "reportes.silverkan@gmail.com" — como prefieras).
2. Esa cuenta necesita verificación en 2 pasos activada (Google ya no deja mandar correos con solo la contraseña normal). Actívala en **https://myaccount.google.com/security** si no la tienes.
3. Ahí mismo, ve a **"Contraseñas de aplicaciones"** (busca "App passwords" si no lo ves en español) → crea una nueva → ponle un nombre como "Silver Kan resumen" → Google te da una contraseña de 16 letras. **Cópiala** (no es tu contraseña normal, es una nueva solo para esto).
4. En la misma terminal de Cloud Shell:

   ```
   firebase functions:secrets:set GMAIL_USER
   ```
   (pega el correo de Gmail del paso 1, ej: `reportes.silverkan@gmail.com`)

   ```
   firebase functions:secrets:set GMAIL_APP_PASSWORD
   ```
   (pega la contraseña de 16 letras del paso 3, sin espacios)

### Ahora sí, instala y despliega (siempre, tengas o no el correo activado)

   ```
   cd functions && npm install && cd ..
   ```

   ```
   firebase deploy --only functions
   ```

   La primera vez que despliegues `weeklyResumenEmail`, Firebase puede pedirte confirmar que se active la API de **Cloud Scheduler** (di que sí — sigue siendo gratis para 1 tarea a la semana).

4. Al terminar, la terminal te va a mostrar una línea como:
   ```
   Function URL (vzAsk): https://us-central1-embarques-mascotas.cloudfunctions.net/vzAsk
   ```
   **Copia esa URL completa** — es lo único que necesitas del despliegue. `weeklyResumenEmail` no te da URL (no se llama desde la app, corre sola cada semana), así que no busques esa parte.

## Paso 4 — Actívalo en tu app

1. Abre **ventas.html**, desbloquea el modo super-usuario (el candado de arriba).
2. Baja hasta el panel **"Sincronización automática (nube)"**.
3. En el bloque de **IA**: marca "Activar", pega la URL del Paso 3 en "Función de IA", elige el modelo (Económico recomendado para empezar), deja los topes por defecto o ajústalos, y da clic en **Guardar**.
4. Si hiciste el Paso 3-B: baja hasta la tarjeta **"📆 Resumen semanal"** → en **"✉️ Envío automático por correo"**, marca la casilla, escribe a quién(es) les llega (tu correo, el de gerencia, el que quieras — separados por coma) y da clic en **Guardar correo automático**.
5. Listo — vuelve a publicar (☁️ Publicar a la nube) y a partir de ahí: vendedor.html y maestra.html ya usan la IA cuando la pregunta lo amerita, y (si lo activaste) el resumen te llega solo por correo cada lunes en la mañana usando el último reporte que hayas cargado.

---

### Si algo falla

- **"No autorizado" / la IA nunca responde**: revisa que la URL que pegaste en ventas.html sea exactamente la que te dio `firebase deploy` (con `https://` al inicio, sin espacios).
- **La terminal dice que falta `firebase`**: escribe `npm install -g firebase-tools` primero, luego repite desde `firebase login`.
- **El correo semanal nunca llega**: revisa 3 cosas — (1) que activaste la casilla y guardaste al menos un correo en el panel de ventas.html, (2) que hayas cargado al menos un reporte de Odoo alguna vez (sin eso no hay nada que mandar), (3) en Firebase Console → Functions → busca `weeklyResumenEmail` → pestaña "Registros/Logs", ahí dice exactamente por qué no mandó nada esa semana.
- **El correo llega marcado como spam**: es normal las primeras veces con Gmail básico — dile a tu correo "No es spam" una vez y ya no debería repetirse.
- **Quieres cambiar el día/hora del correo**: hoy está puesto para lunes 8am hora Ciudad de México — si quieres otro día/hora, dime y te actualizo la línea `schedule` en `functions/index.js` (no se puede cambiar desde la app, solo desde el código).
- **Quieres cambiar el tope de gasto más adelante**: no repitas nada de esto — solo cambia los números en el panel de IA de ventas.html y guarda.
- **Quieres revisar cuánto se ha gastado**: en https://console.cloud.anthropic.com (o platform.claude.com) hay una sección de uso/facturación con el gasto del mes en tiempo real.
