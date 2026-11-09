# Acceso 19H · usuarios seguros para Programador y Cargadores

## Qué cambia

| Antes | Ahora |
|---|---|
| Contraseñas master, superusuario, báscula y PIN de cargadores en `/config`, legibles sin sesión | Cada persona tiene **su usuario y su contraseña** en Firebase Authentication. Nadie las puede ver, ni el master |
| Contraseñas de ejemplo en el código público (`master-2026`, `admin123`, PIN `2468`) | Fuera del código |
| Se entraba solo con contraseña | Se elige el **usuario** y se escribe la contraseña (o el NIP de 6 números, en Cargadores) |
| Para cambiar una contraseña había que editarla en Configuración | Si alguien la olvida, el master toca **Restablecer**, le da una temporal y al entrar la persona crea la suya |

## Cómo entra cada quien la primera vez

1. Elige su nombre en la lista.
2. Escribe **su contraseña o PIN de siempre**.
3. El sistema le pide crear una nueva y ya no deja usar la anterior.

El master entra con la cuenta que creó en el Paso 1 del instalador.

## Instalación (Cloud Shell de Firebase)

| Paso | Comando | Efecto |
|---|---|---|
| 1 | `curl -sL https://raw.githubusercontent.com/barbagomezricardo-cloud/embarques/acceso-19h/acceso/instalar.sh \| bash` | Crea las cuentas y despliega `embAdmin` y el `cliApi` nuevo. No cierra nada |
| — | Publicar las apps nuevas en GitHub (rama `main`) | Programador y Cargadores ya piden usuario |
| 2 | `curl -sL .../acceso/instalar.sh \| FASE=cerrar bash` | Borra las contraseñas viejas y cierra `/config`, `/audit` y `/flota` |

Antes de tocar las reglas, el instalador guarda un respaldo en tu carpeta de Cloud Shell (`reglas-respaldo-…json`).

## Archivos

| Archivo | Qué es |
|---|---|
| `acceso-19h.js` | Inicio de sesión, cambio obligatorio y panel de usuarios del master (lo usan `programador.html` e `index.html`) |
| `acceso/funciones/acceso.js` | Función `embAdmin`: crear, restablecer, dar de baja y migrar |
| `acceso/instalar.sh` | Instalador en 2 pasos |

## Pendiente (ola 2)

`/embarques`, `/skan`, `/visits`, `/locks` y `/cuadreBascula` siguen legibles sin sesión, porque Ventas, Maestra, Vendedor y Cuadre de báscula todavía leen sin usuario. Se cierran cuando esas apps pasen a este mismo acceso.
