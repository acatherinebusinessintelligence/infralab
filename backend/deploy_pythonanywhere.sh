#!/bin/bash
# InfraLab · instalación / actualización en PythonAnywhere
#
# Uso, en una consola Bash de PythonAnywhere:
#   git clone https://github.com/<usuario>/<repositorio>.git ~/infralab     (solo la primera vez)
#   bash ~/infralab/backend/deploy_pythonanywhere.sh "https://<usuario>.github.io"
#
# El argumento es el origen del sitio en GitHub Pages (para CORS). Es seguro volver a ejecutarlo:
# actualiza dependencias y recarga la aplicación, sin tocar un .env ni una base de datos existentes.
set -e

ORIGIN="${1:-}"
PYVER="python3.11"
APP_DIR="$HOME/infralab"
VENV_DIR="$HOME/.virtualenvs/infralab"
WSGI_FILE="/var/www/$(whoami)_pythonanywhere_com_wsgi.py"

echo "== 1/5 Código"
if [ -d "$APP_DIR/.git" ]; then git -C "$APP_DIR" pull --ff-only; else echo "Falta $APP_DIR: clona primero el repositorio."; exit 1; fi

echo "== 2/5 Entorno virtual ($PYVER)"
[ -d "$VENV_DIR" ] || $PYVER -m venv "$VENV_DIR"
"$VENV_DIR/bin/pip" install -q --upgrade pip
"$VENV_DIR/bin/pip" install -q -r "$APP_DIR/backend/requirements.txt"

echo "== 3/5 Configuración (.env)"
ENV_FILE="$APP_DIR/backend/.env"
if [ ! -f "$ENV_FILE" ]; then
  [ -n "$ORIGIN" ] || { echo "Indica el origen de GitHub Pages, p. ej.: bash $0 https://usuario.github.io"; exit 1; }
  gen() { $PYVER -c "import secrets; print(secrets.token_urlsafe($1))"; }
  ADMIN_PW="$(gen 12)"
  cat > "$ENV_FILE" <<EOF
DEEPSEEK_API_KEY=PEGA-AQUI-TU-CLAVE-DE-DEEPSEEK
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
ADMIN_PASSWORD=$ADMIN_PW
SECRET_KEY=$(gen 48)
TEACHER_TOKEN=$(gen 32)
REQUIRE_TEAM_LOGIN=1
ALLOWED_ORIGINS=$ORIGIN
SESSION_COOKIE_SECURE=1
RATE_LIMIT_PER_HOUR=15
MAX_INPUT_CHARS=24000
EOF
  chmod 600 "$ENV_FILE"
  echo ""
  echo "  *** Contraseña del panel /admin: $ADMIN_PW"
  echo "  *** Guárdala ahora. Puedes cambiarla editando $ENV_FILE"
  echo ""
else
  echo "  .env existente: se conserva."
fi

echo "== 4/5 Archivo WSGI"
if [ -f "$WSGI_FILE" ]; then
  cat > "$WSGI_FILE" <<EOF
import sys
path = "$APP_DIR/backend"
if path not in sys.path:
    sys.path.insert(0, path)
from flask_app import app as application  # noqa
EOF
  echo "  $WSGI_FILE actualizado."
else
  echo "  No existe $WSGI_FILE: crea primero la web app (pestaña Web → Add a new web app → Manual configuration → Python 3.11) y vuelve a ejecutar este script."
  exit 1
fi

echo "== 5/5 Recarga"
touch "$WSGI_FILE"   # tocar el WSGI recarga la aplicación en PythonAnywhere
echo ""
echo "Listo. Verifica: https://$(whoami).pythonanywhere.com/api/health"
grep -q "PEGA-AQUI" "$ENV_FILE" && echo "Falta la clave de DeepSeek: nano $ENV_FILE  (luego: touch $WSGI_FILE)" || true
