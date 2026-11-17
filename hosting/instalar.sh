#!/usr/bin/env bash
# =====================================================================
#  SITIO 19H · las apps de Pet Food en https://embarques-mascotas.web.app
#  Para teléfonos cuya red móvil no alcanza github.io (pantalla que se
#  queda cargando). Se pega en Cloud Shell de Firebase (consola → >_ ):
#
#    curl -sL https://raw.githubusercontent.com/barbagomezricardo-cloud/embarques/main/hosting/instalar.sh | bash
#
#  Qué hace (se puede volver a correr sin dañar nada):
#   1. Publica Firebase Hosting + la función sitio19h, que entrega las
#      apps tomando siempre la versión vigente de GitHub.
#   2. Autoriza el dominio nuevo en la llave de reCAPTCHA (App Check).
#   3. Autoriza el dominio nuevo en embAdmin y cliApi (solo agrega el
#      dominio a la lista permitida; no cambia nada más).
#   4. Prueba que la app del vendedor abra en la dirección nueva.
#  No toca reglas, usuarios ni datos.
# =====================================================================
set -uo pipefail
PROY="embarques-mascotas"
RAW="https://raw.githubusercontent.com/barbagomezricardo-cloud/embarques/${RAMA:-main}"
SITIO="https://${PROY}.web.app"
NUEVOS=("https://${PROY}.web.app" "https://${PROY}.firebaseapp.com")
RECAPTCHA="6Lf4vtQtAAAAABsSvrf7bax_PgYQX1TrT3j6Rmuj"
ok(){ printf '\n\033[1;32m✓ %s\033[0m\n' "$*"; }
paso(){ printf '\n\033[1;31m▶ %s\033[0m\n' "$*"; }
aviso(){ printf '\033[1;33m! %s\033[0m\n' "$*"; }

[ -z "$(gcloud auth print-access-token 2>/dev/null)" ] && { echo "No hay sesión de Google en Cloud Shell. Ejecuta: gcloud auth login"; exit 1; }
gcloud config set project "$PROY" >/dev/null 2>&1
command -v firebase >/dev/null || { echo "Instalando Firebase CLI…"; npm i -g firebase-tools >/dev/null 2>&1; }

# ---------- 1. Hosting + función ----------
paso "1/4 Publicando las apps en $SITIO"
DIR="$HOME/sitio19h"; mkdir -p "$DIR/funcion" "$DIR/public"
for a in firebase.json funcion/index.js funcion/package.json public/robots.txt; do
  curl -sfL "$RAW/hosting/$a" -o "$DIR/$a" || { aviso "No pude descargar hosting/$a"; exit 1; }
done
(cd "$DIR/funcion" && npm install --silent >/dev/null 2>&1) && ok "Dependencias listas"
(cd "$DIR" && firebase deploy --only hosting,functions:sitio --project "$PROY" --force) || { aviso "La publicación falló. Copia el error de arriba y mándamelo."; exit 1; }
ok "Apps publicadas en $SITIO"

# ---------- 2. reCAPTCHA (App Check) ----------
paso "2/4 Autorizando el dominio en reCAPTCHA"
gcloud services enable recaptchaenterprise.googleapis.com >/dev/null 2>&1
INFO="$(gcloud recaptcha keys describe "$RECAPTCHA" --format=json 2>/dev/null)"
if [ -z "$INFO" ]; then
  aviso "No pude leer la llave de reCAPTCHA. Hazlo a mano: Google Cloud → Security → reCAPTCHA → llave ${RECAPTCHA:0:12}… → Dominios → agrega ${PROY}.web.app y ${PROY}.firebaseapp.com"
else
  DOMS="$(python3 - "$INFO" "${PROY}.web.app" "${PROY}.firebaseapp.com" <<'PY'
import json,sys
k=json.loads(sys.argv[1]); w=k.get('webSettings',{})
if w.get('allowAllDomains'): print('TODOS'); sys.exit()
d=list(w.get('allowedDomains',[]))
for x in sys.argv[2:]:
    if x not in d: d.append(x)
print(','.join(d))
PY
)"
  if [ "$DOMS" = "TODOS" ]; then ok "La llave ya acepta cualquier dominio"
  elif gcloud recaptcha keys update "$RECAPTCHA" --web --domains="$DOMS" >/dev/null 2>&1; then ok "Dominios en reCAPTCHA: $DOMS"
  else aviso "No pude actualizar la llave. Hazlo a mano: Google Cloud → Security → reCAPTCHA → llave ${RECAPTCHA:0:12}… → Dominios → agrega ${PROY}.web.app y ${PROY}.firebaseapp.com"; fi
fi

# ---------- 3. embAdmin y cliApi aceptan el dominio nuevo ----------
paso "3/4 Autorizando el dominio en embAdmin y cliApi"
CARP=""
for f in $(find "$HOME" -maxdepth 4 -name index.js -path '*functions*' -not -path '*/node_modules/*' 2>/dev/null); do
  if grep -q "require('./clientes')\|require(\"./clientes\")" "$f"; then CARP="$(dirname "$f")"; break; fi
done
if [ -z "$CARP" ]; then
  aviso "No encontré la carpeta de funciones (la que usó el instalador de Acceso 19H). Las apps abren igual; solo las funciones de Clientes dentro de la app del vendedor podrían no responder en la dirección nueva. Mándame captura de: ls ~"
else
  echo "Carpeta: $CARP"
  CAMBIO="$(python3 - "$CARP" "${NUEVOS[@]}" <<'PY'
import os,re,sys
carp=sys.argv[1]; nuevos=sys.argv[2:]; cambios=[]
for arch,var in (('acceso.js','ORIGENES'),('clientes.js','ALLOWED_ORIGINS')):
    p=os.path.join(carp,arch)
    if not os.path.exists(p): continue
    s=open(p,encoding='utf-8').read()
    m=re.search(r"const\s+"+var+r"\s*=\s*\[", s)
    if not m: continue
    falta=[n for n in nuevos if "'"+n+"'" not in s]
    if not falta: continue
    if not os.path.exists(p+'.antes-sitio'): open(p+'.antes-sitio','w',encoding='utf-8').write(s)
    s=s[:m.end()]+''.join("'"+n+"', " for n in falta)+s[m.end():]
    open(p,'w',encoding='utf-8').write(s); cambios.append(arch)
print(' '.join(cambios))
PY
)"
  if [ -z "$CAMBIO" ]; then ok "embAdmin y cliApi ya aceptaban el dominio"
  else
    echo "Actualizado: $CAMBIO"
    (cd "$CARP/.." && firebase deploy --only functions:embAdmin,functions:cliApi --project "$PROY" --force) && ok "embAdmin y cliApi aceptan ${PROY}.web.app" || aviso "No se pudo publicar embAdmin/cliApi. Las apps abren igual; mándame el error de arriba."
  fi
fi

# ---------- 4. Prueba ----------
paso "4/4 Probando"
sleep 5
T="$(curl -s "$SITIO/vendedor.html" | grep -o '<title>[^<]*' | head -1)"
if [ -n "$T" ]; then ok "La app del vendedor responde en $SITIO/vendedor.html (${T#<title>})"
else aviso "Todavía no responde; espera 1 minuto y abre $SITIO/vendedor.html"; fi
echo
echo "Links nuevos (agrega #v=… del vendedor como en el link de siempre):"
echo "  Vendedor:  $SITIO/vendedor.html"
echo "  Gerencia:  $SITIO/maestra.html"
echo "  Ventas:    $SITIO/ventas.html"
echo "  Cargadores:$SITIO/index.html"
