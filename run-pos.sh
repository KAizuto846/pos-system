#!/bin/bash
# Lanzador del POS - Punto de Venta (Next.js)
# Uso: run-pos.sh start | stop | status
# El puerto 3000 lo ocupa Gitea, asi que el POS corre en 3001.

# Detectar la carpeta del proyecto segun donde este este script (funciona con
# enlaces simbolicos y sin importar el nombre de la carpeta del usuario).
SOURCE="${BASH_SOURCE[0]}"
while [ -L "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
PROJECT="$(cd -P "$(dirname "$SOURCE")" && pwd)"

PORT=3001
URL="http://localhost:$PORT"
LOG="$HOME/.local/state/pos-server.log"
PIDFILE="$HOME/.local/state/pos-server.pid"

mkdir -p "$(dirname "$LOG")"

is_up() { curl -s -o /dev/null --max-time 3 "$URL"; }

# Abre el navegador con un parametro anti-cache: evita que el navegador
# reutilice el HTML/JS guardado de una instancia anterior (misma URL, otro
# servidor) y muestre una pantalla en blanco.
open_browser() {
  xdg-open "$URL/?_=$RANDOM$RANDOM" >/dev/null 2>&1 &
}

start() {
  if is_up; then
    echo "El POS ya esta corriendo en $URL"
    open_browser
    exit 0
  fi
  echo "Arrancando POS en $URL (log: $LOG)..."
  cd "$PROJECT" || { echo "ERROR: no existe $PROJECT"; exit 1; }
  # -P hace que npm herede este directorio aunque el shell cambie de cwd
  setsid nohup env PORT=$PORT npm --prefix "$PROJECT" run dev > "$LOG" 2>&1 < /dev/null &
  echo $! > "$PIDFILE"
  # Esperar hasta 90s a que responda (primera compilacion tarda)
  for _ in $(seq 1 30); do
    sleep 3
    if is_up; then
      echo "Listo en $URL"
      open_browser
      exit 0
    fi
  done
  if ss -tln 2>/dev/null | grep -q ":$PORT "; then
    echo "AVISO: el puerto $PORT esta ocupado por otro programa y no responde como POS."
    echo "Prueba: $0 stop  (o revisa: ss -tlnp | grep $PORT)"
  else
    echo "ERROR: el servidor no respondio. Revisa: $LOG"
  fi
  exit 1
}

stop() {
  stopped=0
  if [ -f "$PIDFILE" ]; then
    PID=$(cat "$PIDFILE")
    # El servidor se lanza con setsid: es lider de su propio grupo de
    # procesos. Matar el grupo (-PID) detiene npm, next y next-server juntos.
    kill -- -"$PID" 2>/dev/null || kill "$PID" 2>/dev/null
    rm -f "$PIDFILE"
    stopped=1
  fi
  # Red de seguridad: por si quedo una instancia de otro arranque.
  if pgrep -f "next dev" >/dev/null 2>&1; then
    pkill -f "next dev" 2>/dev/null
    stopped=1
  fi
  pkill -f "next-server" 2>/dev/null
  sleep 1
  if ss -tln 2>/dev/null | grep -q ":$PORT "; then
    sleep 2
  fi
  if ss -tln 2>/dev/null | grep -q ":$PORT "; then
    echo "AVISO: el puerto $PORT sigue ocupado. Revisa: ss -tlnp | grep $PORT"
  elif [ "$stopped" = 1 ]; then
    echo "POS detenido"
  else
    echo "El POS no estaba corriendo"
  fi
}

status() {
  if is_up; then
    echo "POS corriendo en $URL"
  else
    echo "POS detenido"
  fi
}

case "${1:-start}" in
  start)  start ;;
  stop)   stop ;;
  status) status ;;
  *) echo "Uso: $0 start|stop|status" ;;
esac
