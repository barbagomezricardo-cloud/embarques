# Cómo activar la IA — guía paso a paso (para Ricardo)

Esto es lo único que falta para que la IA funcione de verdad en tus apps. Yo ya dejé todo el código listo; estos pasos los tienes que hacer tú porque necesitan tu cuenta y tu método de pago (no puedo hacerlos por ti).

Son ~15-20 minutos la primera vez. Después de esto, nunca más tienes que tocarlo (solo si algún día quieres cambiar el tope de gasto o el modelo, y eso sí se hace desde ventas.html, sin volver a hacer nada de esto).

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

   ```
   cd functions && npm install && cd ..
   ```

   ```
   firebase deploy --only functions
   ```

4. Al terminar, la terminal te va a mostrar una línea como:
   ```
   Function URL (vzAsk): https://us-central1-embarques-mascotas.cloudfunctions.net/vzAsk
   ```
   **Copia esa URL completa** — es lo único que necesitas del despliegue.

## Paso 4 — Actívalo en tu app

1. Abre **ventas.html**, desbloquea el modo super-usuario (el candado de arriba).
2. Baja hasta el panel **"Sincronización automática (nube)"**.
3. En el bloque nuevo de **IA**: marca "Activar", pega la URL del Paso 3 en "Función de IA", elige el modelo (Económico recomendado para empezar), deja los topes por defecto o ajústalos, y da clic en **Guardar**.
4. Listo — vuelve a publicar (☁️ Publicar a la nube) y a partir de ahí vendedor.html y maestra.html ya usan la IA cuando la pregunta lo amerita.

---

### Si algo falla

- **"No autorizado" / la IA nunca responde**: revisa que la URL que pegaste en ventas.html sea exactamente la que te dio `firebase deploy` (con `https://` al inicio, sin espacios).
- **La terminal dice que falta `firebase`**: escribe `npm install -g firebase-tools` primero, luego repite desde `firebase login`.
- **Quieres cambiar el tope de gasto más adelante**: no repitas nada de esto — solo cambia los números en el panel de IA de ventas.html y guarda.
- **Quieres revisar cuánto se ha gastado**: en https://console.cloud.anthropic.com (o platform.claude.com) hay una sección de uso/facturación con el gasto del mes en tiempo real.
