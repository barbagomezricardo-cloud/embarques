#!/usr/bin/env bash
# =====================================================================
#  ACCESO 19H · usuarios seguros para Programador y Cargadores
#  Se pega en Cloud Shell de Firebase (consola → ícono >_ ), en 2 pasos:
#
#  PASO 1 (antes de publicar las apps nuevas):
#    curl -sL https://raw.githubusercontent.com/barbagomezricardo-cloud/embarques/acceso-19h/acceso/instalar.sh | bash
#      · Activa usuario/contraseña en Firebase Authentication.
#      · Agrega a las reglas el nodo /acceso (no cierra nada todavía).
#      · Despliega embAdmin y la versión nueva de cliApi.
#      · Crea tu cuenta master (te pide usuario y contraseña) y una
#        cuenta por cada contraseña vieja de /config, marcada «debe
#        cambiar»: al primer ingreso cada quien crea la suya.
#
#  PASO 2 (cuando las apps nuevas ya estén publicadas):
#    curl -sL .../acceso/instalar.sh | FASE=cerrar bash
#      · Borra las contraseñas viejas de /config.
#      · Cierra /config, /audit y /flota: solo usuarios con sesión.
#
#  Se puede volver a correr sin dañar nada. Antes de tocar las reglas
#  guarda un respaldo en tu carpeta de Cloud Shell.
# =====================================================================
set -uo pipefail
PROY="embarques-mascotas"
DB="https://embarques-mascotas-default-rtdb.firebaseio.com"
RAMA="${RAMA:-acceso-19h}"
FASE="${FASE:-instalar}"
RAW="https://raw.githubusercontent.com/barbagomezricardo-cloud/embarques/${RAMA}"
API="https://us-central1-${PROY}.cloudfunctions.net/embAdmin"
ok(){ printf '\n\033[1;32m✓ %s\033[0m\n' "$*"; }
paso(){ printf '\n\033[1;31m▶ %s\033[0m\n' "$*"; }
aviso(){ printf '\033[1;33m! %s\033[0m\n' "$*"; }

TOKEN="$(gcloud auth print-access-token 2>/dev/null)"
[ -z "$TOKEN" ] && { echo "No hay sesión de Google en Cloud Shell. Ejecuta: gcloud auth login"; exit 1; }
gcloud config set project "$PROY" >/dev/null 2>&1

# ---------- reglas: lee, cambia con python y publica (con respaldo) ----------
reglas(){   # $1 = instalar | cerrar
  curl -s "$DB/.settings/rules.json?access_token=$TOKEN" -o /tmp/acc_rules_actual.json
  python3 -c 'import json,sys;json.load(open("/tmp/acc_rules_actual.json"))["rules"]' 2>/dev/null || { aviso "No pude leer tus reglas actuales (¿tienen comentarios?). No toqué nada."; return 1; }
  RESP="$HOME/reglas-respaldo-$(date +%Y%m%d-%H%M%S).json"; cp /tmp/acc_rules_actual.json "$RESP"
  python3 - "$1" <<'PY' || return 1
import json,sys
fase=sys.argv[1]
d=json.load(open('/tmp/acc_rules_actual.json')); R=d['rules']
LIC="root.child('licencia/activa').val() === true && now < root.child('licencia/hasta').val()"
P="root.child('acceso/usuarios/' + auth.uid + '/prog').val()"
U="auth != null && root.child('acceso/usuarios/' + auth.uid + '/activo').val() === true"
MASTER=U+" && "+P+" === 'master'"
ESCRIBE=U+" && ("+P+" === 'master' || "+P+" === 'su' || "+P+" === 'basc' || root.child('acceso/usuarios/' + auth.uid + '/carg').val() === true)"
R['acceso']={
  "directorio": {".read": LIC, ".write": False},
  "usuarios": {".read": LIC+" && "+MASTER, ".write": False,
    "$uid": {".read": "auth != null && auth.uid === $uid",
      "debeCambiar": {".write": "auth != null && auth.uid === $uid && newData.val() === false"},
      "ultimoAcceso": {".write": "auth != null && auth.uid === $uid && newData.isNumber()"}}},
  "bitacora": {".read": LIC+" && "+MASTER, ".write": False}}
if fase in ('cerrar','cerrar2'):
  for n in ['config','audit','flota']:
    R[n]={".read": LIC+" && "+U, ".write": LIC+" && "+ESCRIBE}
if fase=='cerrar2':   # ola 2: lo que leen Ventas, Maestra, Vendedor y Cuadre de báscula, solo con sesión
  for n in ['embarques','skan','visits','locks','cuadreBascula']:
    v=R.get(n) or {}
    for op in ('.read','.write'):
      e=v.get(op, LIC) if isinstance(v,dict) else LIC
      e=LIC if e is True else e
      if e is False: continue
      if 'acceso/usuarios' not in e: v[op]='('+e+') && '+U
    R[n]=v
json.dump(d,open('/tmp/acc_rules_nuevas.json','w'),indent=2,ensure_ascii=False)
PY
  R=$(curl -s -o /tmp/acc_put.json -w '%{http_code}' -X PUT --data-binary @/tmp/acc_rules_nuevas.json "$DB/.settings/rules.json?access_token=$TOKEN")
  if [ "$R" = "200" ]; then ok "Reglas publicadas (respaldo: $RESP)"; else aviso "No se publicaron (código $R)"; cat /tmp/acc_put.json; return 1; fi
  aviso "Si algún día publicas reglas desde el Panel de Licencia, primero dime: su plantilla vieja volvería a abrir /config."
}

llave(){ firebase functions:secrets:access CLI_MAESTRO --project "$PROY" 2>/dev/null; }
llamar(){ curl -s -X POST "$API" -H "Content-Type: application/json" -H "X-Cli-Maestro: $LLAVE" -d "$1"; }

if [ "$FASE" = "ola2" ]; then
  paso "Ola 2 · 1/1 Tu master en todas las apps y una cuenta por vendedor"
  LLAVE="$(llave)"; [ -z "$LLAVE" ] && { echo "No pude leer la llave CLI_MAESTRO."; exit 1; }
  if [ "${SINDESPLIEGUE:-}" != "1" ]; then
    CARP=""; for f in $(find "$HOME" -maxdepth 4 -name index.js -path '*functions*' -not -path '*/node_modules/*' 2>/dev/null); do grep -q "require('./acceso')" "$f" && { CARP="$(dirname "$f")"; break; }; done
    [ -z "$CARP" ] && { aviso "No encontré tu carpeta de funciones."; exit 1; }
    curl -sfL "$RAW/acceso/funciones/acceso.js" -o "$CARP/acceso.js" || { echo "No pude descargar acceso.js"; exit 1; }
    (cd "$CARP/.." && firebase deploy --only functions:embAdmin --force) || { aviso "El despliegue falló. Mándame el error."; exit 1; }
    sleep 5
  fi
  llamar '{"accion":"ola2"}' | python3 -c '
import json,sys
r=json.load(sys.stdin)
if not r.get("ok"): print("No se pudo:", r.get("message")); sys.exit(1)
print("\n  Tu usuario master ya entra también a Ventas, Maestra y Cargadores.\n")
print("  %-26s %-22s %-16s %s" % ("VENDEDOR","USUARIO","CARTERA","NIP TEMPORAL"))
for h in r["hechos"]: print("  %-26s %-22s %-16s %s" % (h["nombre"][:26], h["usuario"], h["vend"], h["nip"]))
if r.get("omitidos"): print("\n  Omitidos:", "; ".join(r["omitidos"]))
print("\n  Copia esta tabla: los NIP no se vuelven a mostrar. Al entrar, cada vendedor crea el suyo.")
' || exit 1
  ok "Cuentas listas. Avísame para publicar Ventas, Maestra, Vendedor y Cuadre de báscula; luego corre FASE=cerrar2."
  exit 0
fi

if [ "$FASE" = "actualizar" ]; then
  paso "Actualizando embAdmin (acceso a Cuadre de báscula y panel por programa)"
  LLAVE="$(llave)"; [ -z "$LLAVE" ] && { echo "No pude leer la llave CLI_MAESTRO."; exit 1; }
  CARP=""; for f in $(find "$HOME" -maxdepth 4 -name index.js -path '*functions*' -not -path '*/node_modules/*' 2>/dev/null); do grep -q "require('./acceso')" "$f" && { CARP="$(dirname "$f")"; break; }; done
  [ -z "$CARP" ] && { aviso "No encontré tu carpeta de funciones."; exit 1; }
  curl -sfL "$RAW/acceso/funciones/acceso.js" -o "$CARP/acceso.js" || { echo "No pude descargar acceso.js"; exit 1; }
  (cd "$CARP/.." && firebase deploy --only functions:embAdmin --force) || { aviso "El despliegue falló. Mándame el error."; exit 1; }
  sleep 5; llamar '{"accion":"directorio"}'; echo
  ok "Listo. Avísame para publicar el panel nuevo."
  exit 0
fi

if [ "$FASE" = "ola3" ]; then
  paso "Ola 3 · 1/2 Servidor: embAdmin y cliApi"
  LLAVE="$(llave)"; [ -z "$LLAVE" ] && { echo "No pude leer la llave CLI_MAESTRO."; exit 1; }
  CARP=""; for f in $(find "$HOME" -maxdepth 4 -name index.js -path '*functions*' -not -path '*/node_modules/*' 2>/dev/null); do grep -q "require('./acceso')" "$f" && { CARP="$(dirname "$f")"; break; }; done
  [ -z "$CARP" ] && { aviso "No encontré tu carpeta de funciones."; exit 1; }
  for a in "acceso/funciones/acceso.js:acceso.js" "clientes/funciones/clientes.js:clientes.js" "clientes/funciones/cli-core.js:cli-core.js"; do
    curl -sfL "$RAW/${a%%:*}" -o "$CARP/${a##*:}" || { echo "No pude descargar ${a%%:*}"; exit 1; }
  done
  (cd "$CARP/.." && firebase deploy --only functions:embAdmin,functions:cliApi --force) || { aviso "El despliegue falló. Mándame el error."; exit 1; }
  sleep 5
  paso "Ola 3 · 2/2 Tu usuario master entra también a Inventarios, RH y Centro de Mando"
  llamar '{"accion":"ola3"}'; echo
  ok "Listo. Avísame para publicar las apps."
  exit 0
fi

if [ "$FASE" = "cerrar2" ]; then
  paso "Ola 2 · Cerrando embarques, ventas (skan), visitas, candados y cuadre de báscula"
  reglas cerrar2 || exit 1
  ok "Listo. Ya nada se lee sin usuario."
  exit 0
fi

if [ "$FASE" = "cerrar" ]; then
  paso "1/3 Revisando estado"
  LLAVE="$(llave)"; [ -z "$LLAVE" ] && { echo "No pude leer la llave CLI_MAESTRO."; exit 1; }
  EST=$(llamar '{"accion":"estado"}'); echo "$EST"
  echo "$EST" | grep -q '"cuentas":[1-9]' || { aviso "Aún no hay cuentas: corre primero el PASO 1."; exit 1; }
  paso "2/3 Borrando contraseñas viejas de /config"
  llamar '{"accion":"cerrar"}'; echo
  paso "3/3 Cerrando /config, /audit y /flota (solo con sesión)"
  reglas cerrar || exit 1
  ok "Listo. Las contraseñas viejas ya no existen y esos datos ya no se leen sin usuario."
  exit 0
fi

# ---------------------------------------------------------------- 1
paso "1/4 Activando usuario y contraseña (Authentication)"
R=$(curl -s -o /tmp/acc_auth.json -w '%{http_code}' -X PATCH \
  -H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: $PROY" -H "Content-Type: application/json" \
  "https://identitytoolkit.googleapis.com/admin/v2/projects/$PROY/config?updateMask=signIn.email.enabled,signIn.email.passwordRequired" \
  -d '{"signIn":{"email":{"enabled":true,"passwordRequired":true}}}')
[ "$R" = "200" ] && ok "Usuario y contraseña activos" || { aviso "No pude confirmarlo (código $R). Revísalo en Authentication → Método de acceso."; }

# ---------------------------------------------------------------- 2
paso "2/4 Reglas: agregando el nodo /acceso (todavía no se cierra nada)"
reglas instalar || exit 1

# ---------------------------------------------------------------- 3
paso "3/4 Servidor: embAdmin y cliApi nuevo"
CARP=""
for f in $(find "$HOME" -maxdepth 4 -name index.js -path '*functions*' -not -path '*/node_modules/*' 2>/dev/null); do
  if grep -q "require('./clientes')\|require(\"./clientes\")" "$f"; then CARP="$(dirname "$f")"; break; fi
done
[ -z "$CARP" ] && { aviso "No encontré la carpeta de funciones de la app de Clientes en tu Cloud Shell. Mándame captura de: ls ~"; exit 1; }
echo "Carpeta: $CARP"
for a in "acceso/funciones/acceso.js:acceso.js" "clientes/funciones/clientes.js:clientes.js" "clientes/funciones/cli-core.js:cli-core.js"; do
  src="${a%%:*}"; dst="${a##*:}"
  [ -f "$CARP/$dst" ] && [ ! -f "$CARP/$dst.antes-acceso" ] && cp "$CARP/$dst" "$CARP/$dst.antes-acceso"
  curl -sfL "$RAW/$src" -o "$CARP/$dst" || { echo "No pude descargar $src"; exit 1; }
done
grep -q "require('./acceso')" "$CARP/index.js" || { cp "$CARP/index.js" "$CARP/index.js.antes-acceso"; printf "\n// Acceso 19H (usuarios de Programador y Cargadores)\nObject.assign(exports, require('./acceso'));\n" >> "$CARP/index.js"; }
# Google retiró Node.js 20 (30-oct-2026): se pasa la carpeta de funciones a Node.js 22
python3 - "$CARP" <<'PY'
import json,os,sys
c=sys.argv[1]; pj=os.path.join(c,'package.json'); fj=os.path.join(c,'..','firebase.json')
d=json.load(open(pj)); d.setdefault('engines',{})['node']='22'; json.dump(d,open(pj,'w'),indent=2)
if os.path.exists(fj):
    f=json.load(open(fj)); fs=f.get('functions'); fs=fs if isinstance(fs,list) else [fs] if fs else []
    for x in fs:
        if isinstance(x,dict) and x.get('runtime'): x['runtime']='nodejs22'
    json.dump(f,open(fj,'w'),indent=2)
print('Node.js 22 listo en package.json')
PY
(cd "$CARP" && npm install --silent >/dev/null 2>&1) && ok "Dependencias listas"
cd "$CARP/.."
firebase use "$PROY" >/dev/null 2>&1 || true
firebase deploy --only functions:embAdmin,functions:cliApi --force || { aviso "El despliegue falló. Copia el error de arriba y mándamelo."; exit 1; }
ok "embAdmin y cliApi en línea"

# ---------------------------------------------------------------- 4
paso "4/4 Cuentas"
LLAVE="$(llave)"; [ -z "$LLAVE" ] && { echo "No pude leer la llave CLI_MAESTRO."; exit 1; }
echo "Tu cuenta MASTER (con la que tú entrarás al programador):"
read -r -p "  Usuario (ej. ricardo): " MU < /dev/tty
while :; do
  read -r -s -p "  Contraseña nueva (mín. 8, letras y números): " MP < /dev/tty; echo
  read -r -s -p "  Repítela: " MP2 < /dev/tty; echo
  [ "$MP" = "$MP2" ] && [ ${#MP} -ge 8 ] && break; aviso "No coinciden o es muy corta. Otra vez."
done
sleep 5
BODY=$(python3 -c 'import json,sys;print(json.dumps({"accion":"migrar","datos":{"master":{"usuario":sys.argv[1],"pass":sys.argv[2],"nombre":"Ricardo Barba (master)"}}}))' "$MU" "$MP")
RES=$(llamar "$BODY"); unset MP MP2 BODY
echo "$RES" | python3 -c '
import json,sys
try: r=json.load(sys.stdin)
except Exception: print("Respuesta inesperada:", sys.stdin.read()); sys.exit(1)
if not r.get("ok"): print("No se pudo:", r.get("message")); sys.exit(1)
print("\n  %-38s %-24s %s" % ("NOMBRE","USUARIO","ACCESO"))
for h in r["hechos"]: print("  %-38s %-24s %s" % (h["nombre"][:38], h["usuario"], h["rol"]))
if r.get("omitidos"): print("\n  Omitidos:", "; ".join(r["omitidos"]))
print("\n  Cada quien entra la primera vez con su contraseña o PIN de siempre y el sistema le pide crear la suya.")
' || exit 1
ok "Paso 1 terminado. Avísame para publicar las apps nuevas; luego corre el PASO 2 (FASE=cerrar)."
