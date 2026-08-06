#!/bin/bash
# Lanzador del POS - Punto de Venta (Next.js)
# Uso: run-pos.sh start | stop | status
# El puerto 3000 lo ocupa Gitea, asi que el POS corre en 3001.
PROJECT="$HOME/Documents/pos-system-main"
PORT=3001
URL="http://localhost:$PORT"
LOG="$HOME/.local/state/pos-server.log"
PIDFILE="$HOME/.local/state/pos-server.pid"

mkdir -p "$(dirname "$LOG")"

is_up() { curl -s -o /dev/null --max-time 3 "$URL"; }

start() {
  if is_up; then
    echo "El POS ya esta corriendo en $URL"
    xdg-open "$URL" >/dev/null 2>&1 &
    exit 0
  fi
  echo "Arrancando POS en $URL (log: $LOG)..."
  cd "$PROJECT" || { echo "ERROR: no existe $PROJECT"; exit 1; }
  setsid nohup env PORT=$PORT npm run dev > "$LOG" 2>&1 < /dev/null &
  echo $! > "$PIDFILE"
  # Esperar hasta 90s a que responda (primera compilacion tarda)
  for _ in $(seq 1 30); do
    sleep 3
    if is_up; then
      echo "Listo en $URL"
      xdg-open "$URL" >/dev/null 2>&1 &
      exit 0
    fi
  done
  echo "ERROR: el servidor no respondio. Revisa: $LOG"
  exit 1
}

stop() {
  if [ -f "$PIDFILE" ]; then
    PID=$(cat "$PIDFILE")
    kill "$PID" 2>/dev/null
    pkill -P "$PID" 2>/dev/null
    rm -f "$PIDFILE"
    echo "POS detenido"
  else
    if pgrep -f "next dev" >/dev/null 2>&1; then
      pkill -f "next dev" 2>/dev/null
      echo "POS detenido"
    else
      echo "El POS no estaba corriendo"
    fi
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
