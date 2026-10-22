#!/usr/bin/env bash
# =====================================================================
#  App Clientes 19 Hermanos — instalación del servidor (una sola vez)
#  Se pega en Cloud Shell de Firebase (consola → ícono >_ ):
#
#    curl -sL https://raw.githubusercontent.com/barbagomezricardo-cloud/embarques/app-clientes/clientes/instalar.sh | bash
#
#  Qué hace, en orden (y se puede volver a correr sin dañar nada):
#   1. Activa el acceso por SMS en Firebase Authentication.
#   2. Cierra el nodo /cli en las reglas de Realtime Database (guarda respaldo).
#   3. Copia el servidor de clientes a tu carpeta de funciones y lo conecta.
#   4. Crea la llave maestra (si no existe) y despliega SOLO cliApi y cliEmbarque
#      (tus funciones de IA y correo no se tocan).
#   5. Da de alta al personal con PIN: un usuario por vendedor publicado,
#      ADMINISTRACION y GERENCIA. Imprime la tabla de PIN para repartir.
# =====================================================================
set -uo pipefail
PROY="embarques-mascotas"
DB="https://embarques-mascotas-default-rtdb.firebaseio.com"
RAMA="${RAMA:-app-clientes}"
RAW="https://raw.githubusercontent.com/barbagomezricardo-cloud/embarques/${RAMA}/clientes"
API="https://us-central1-${PROY}.cloudfunctions.net/cliApi"
ok(){ printf '\n\033[1;32m✓ %s\033[0m\n' "$*"; }
paso(){ printf '\n\033[1;31m▶ %s\033[0m\n' "$*"; }
aviso(){ printf '\033[1;33m! %s\033[0m\n' "$*"; }

TOKEN="$(gcloud auth print-access-token 2>/dev/null)"
[ -z "$TOKEN" ] && { echo "No hay sesión de Google en Cloud Shell. Ejecuta: gcloud auth login"; exit 1; }
gcloud config set project "$PROY" >/dev/null 2>&1

# ---------------------------------------------------------------- 1
paso "1/5 Activando acceso por SMS (Authentication → Teléfono)"
R=$(curl -s -o /tmp/cli_auth.json -w '%{http_code}' -X PATCH \
  -H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: $PROY" -H "Content-Type: application/json" \
  "https://identitytoolkit.googleapis.com/admin/v2/projects/$PROY/config?updateMask=signIn.phoneNumber.enabled" \
  -d '{"signIn":{"phoneNumber":{"enabled":true}}}')
if [ "$R" = "200" ]; then ok "SMS activado"
  DOM=$(curl -s -H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: $PROY" "https://identitytoolkit.googleapis.com/admin/v2/projects/$PROY/config" | python3 -c 'import sys,json;print(" ".join(json.load(sys.stdin).get("authorizedDomains",[])))')
  case " $DOM " in *" barbagomezricardo-cloud.github.io "*) ok "Dominio de GitHub autorizado";;
    *) NUEVOS=$(python3 -c 'import sys,json;d=sys.argv[1].split();d.append("barbagomezricardo-cloud.github.io");print(json.dumps({"authorizedDomains":d}))' "$DOM")
       curl -s -o /dev/null -X PATCH -H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: $PROY" -H "Content-Type: application/json" \
         "https://identitytoolkit.googleapis.com/admin/v2/projects/$PROY/config?updateMask=authorizedDomains" -d "$NUEVOS" && ok "Dominio de GitHub agregado";;
  esac
else aviso "No se pudo activar por aquí (código $R). Hazlo a mano: Authentication → Método de acceso → Teléfono → Habilitar."; cat /tmp/cli_auth.json | head -c 400; echo; fi

# ---------------------------------------------------------------- 2
paso "2/5 Cerrando los datos de clientes en las reglas (/cli)"
REGLAS=$(curl -s "$DB/.settings/rules.json?access_token=$TOKEN")
if echo "$REGLAS" | grep -q '"rules"'; then
  echo "$REGLAS" > "$HOME/reglas-respaldo-$(date +%Y%m%d-%H%M).json"
  if echo "$REGLAS" | grep -q '"cli"'; then ok "Las reglas ya cierran /cli"
  else
    NUEVAS=$(printf '%s' "$REGLAS" | python3 -c 'import sys,re;s=sys.stdin.read();print(re.sub(r"(\"rules\"\s*:\s*\{)", r"\1\n    \"cli\": { \".read\": false, \".write\": false },", s, count=1))')
    R=$(curl -s -o /tmp/cli_rules.json -w '%{http_code}' -X PUT --data-binary "$NUEVAS" "$DB/.settings/rules.json?access_token=$TOKEN")
    [ "$R" = "200" ] && ok "Reglas publicadas con /cli cerrado (respaldo en tu carpeta de Cloud Shell)" || { aviso "No se publicaron (código $R)"; cat /tmp/cli_rules.json; }
  fi
  aviso "Agrega también el bloque \"cli\": {\".read\": false, \".write\": false} en tu Panel de Licencia, para que no se pierda la próxima vez que publiques reglas desde ahí."
else aviso "No pude leer las reglas. Agrégalo a mano: \"cli\": {\".read\": false, \".write\": false}"; fi

# ---------------------------------------------------------------- 3
paso "3/5 Copiando el servidor de clientes a tu carpeta de funciones"
CARP=""
for f in $(find "$HOME" -maxdepth 4 -name index.js -path '*functions*' -not -path '*/node_modules/*' 2>/dev/null); do
  if grep -q "vzAsk" "$f"; then CARP="$(dirname "$f")"; break; fi
done
if [ -z "$CARP" ]; then
  aviso "No encontré tu carpeta de funciones (la del asistente de IA). La creo nueva en ~/clientes-fn."
  CARP="$HOME/clientes-fn/functions"; mkdir -p "$CARP"
  printf 'Object.assign(exports, require("./clientes"));\n' > "$CARP/index.js"
  printf '{"name":"cli-fn","engines":{"node":"20"},"main":"index.js","dependencies":{"firebase-admin":"^12.0.0","firebase-functions":"^5.0.0"},"private":true}\n' > "$CARP/package.json"
  printf '{"functions":[{"source":"functions","codebase":"clientes"}]}\n' > "$CARP/../firebase.json"
  printf '{"projects":{"default":"%s"}}\n' "$PROY" > "$CARP/../.firebaserc"
fi
RAIZ="$(cd "$CARP/.." && pwd)"
echo "Carpeta: $CARP"
curl -sfL "$RAW/funciones/clientes.js" -o "$CARP/clientes.js" && curl -sfL "$RAW/funciones/cli-core.js" -o "$CARP/cli-core.js" \
  || { echo "No pude descargar los archivos del servidor."; exit 1; }
grep -q "require('./clientes')\|require(\"./clientes\")" "$CARP/index.js" || { cp "$CARP/index.js" "$CARP/index.js.antes-clientes"; printf "\n// App Clientes 19 Hermanos\nObject.assign(exports, require('./clientes'));\n" >> "$CARP/index.js"; }
ok "Servidor copiado y conectado a index.js"
(cd "$CARP" && npm install --silent >/dev/null 2>&1) && ok "Dependencias listas"

# ---------------------------------------------------------------- 4
paso "4/5 Llave maestra y despliegue"
cd "$RAIZ"
firebase use "$PROY" >/dev/null 2>&1 || true
NUEVA_LLAVE=""
if ! firebase functions:secrets:access CLI_MAESTRO >/dev/null 2>&1; then
  NUEVA_LLAVE="19H-$(python3 -c 'import secrets;print("-".join(secrets.token_urlsafe(6) for _ in range(4)))')"
  printf '%s' "$NUEVA_LLAVE" | firebase functions:secrets:set CLI_MAESTRO --data-file=- --force >/dev/null && ok "Llave maestra creada"
else ok "La llave maestra ya existía (no se cambia)"; fi
LLAVE="${NUEVA_LLAVE:-$(firebase functions:secrets:access CLI_MAESTRO 2>/dev/null)}"
firebase deploy --only functions:cliApi,functions:cliEmbarque --force || { aviso "El despliegue falló. Copia el error de arriba y mándamelo."; exit 1; }
ok "Funciones cliApi y cliEmbarque en línea"

# ---------------------------------------------------------------- 5
paso "5/5 Alta del personal"
sleep 8
llamar(){ curl -s -X POST "$API" -H "Content-Type: application/json" -H "X-Cli-Maestro: $LLAVE" -d "$1"; }
EST=$(llamar '{"modo":"maestro","accion":"estado","datos":{}}'); echo "Estado: $EST"
VS=$(llamar '{"modo":"maestro","accion":"vendedores","datos":{}}')
YA=$(llamar '{"modo":"maestro","accion":"listarStaff","datos":{}}')
python3 - "$VS" "$YA" > /tmp/cli_altas.txt <<'PY'
import sys, json, secrets
vs = json.loads(sys.argv[1]).get("vendors", [])
ya = {u["u"] for u in json.loads(sys.argv[2]).get("staff", [])}
alta = []
for v in vs:
    if v in ya: continue
    rol = "admin" if v.startswith("ADMINISTRACI") else "vendedor"
    alta.append((v, v.title(), rol, "" if rol == "admin" else v))
if "ADMINISTRACION" not in ya and not any(a[0].startswith("ADMINISTRACI") for a in alta): alta.append(("ADMINISTRACION", "Administración", "admin", ""))
if "GERENCIA" not in ya: alta.append(("GERENCIA", "Lic. Ricardo Barba Gómez", "gerencia", ""))
for u, n, r, vk in alta:
    pin = "".join(secrets.choice("0123456789") for _ in range(6))
    print(json.dumps({"modo": "maestro", "accion": "guardarStaff", "datos": {"usuario": u, "nombre": n, "rol": r, "vk": vk, "pin": pin, "activo": True}}))
PY
printf '\n%-28s %-12s %s\n' "USUARIO" "ROL" "PIN"
while IFS= read -r L; do
  R=$(llamar "$L"); U=$(echo "$L" | python3 -c 'import sys,json;d=json.load(sys.stdin)["datos"];print(d["usuario"],d["rol"],d["pin"])')
  set -- $U; if echo "$R" | grep -q '"ok":true'; then printf '%-28s %-12s %s\n' "$1" "$2" "$3"; else printf '%-28s %-12s ERROR %s\n' "$1" "$2" "$R"; fi
done < /tmp/cli_altas.txt
[ -s /tmp/cli_altas.txt ] || echo "(el personal ya estaba dado de alta; no se cambió ningún PIN)"

printf '\n\033[1;32m================ LISTO ================\033[0m\n'
[ -n "$NUEVA_LLAVE" ] && printf 'LLAVE MAESTRA (guárdala en un lugar seguro, no se vuelve a mostrar):\n\n    %s\n\n' "$NUEVA_LLAVE"
echo "Guarda también la tabla de PIN de arriba y repártela a cada persona."
echo "Programación entra a «Fletes y precios» con su contraseña de superusuario o master del programador."
