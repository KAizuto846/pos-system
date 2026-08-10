#!/usr/bin/env bash
# Activa el acceso remoto al POS por Tailscale Funnel (opción C).
# Publica la app (localhost:3001) en una URL https://<equipo>.<red>.ts.net
# accesible desde cualquier WiFi, sin instalar nada en los dispositivos.

set -u
PORT="${PORT:-3001}"

if ! command -v tailscale >/dev/null 2>&1; then
  echo "Tailscale no está instalado. Instálalo y conéctalo:"
  echo "  curl -fsSL https://tailscale.com/install.sh | sh"
  echo "  sudo tailscale up"
  exit 1
fi

if ! tailscale status >/dev/null 2>&1; then
  echo "Tailscale no está conectado. Ejecuta: sudo tailscale up"
  exit 1
fi

echo "== 1) Verificando que la app escucha en :$PORT =="
if ! ss -tln 2>/dev/null | grep -q ":$PORT"; then
  echo "ADVERTENCIA: nada escucha en :$PORT. Inicia el POS antes de continuar."
  read -rp "¿Continuar de todos modos? (s/N) " -n 1 ok; echo
  [[ "$ok" =~ ^[sSyY]$ ]] || exit 1
fi

echo "== 2) Habilitando serve (HTTPS del tailnet) =="
if tailscale serve status 2>/dev/null | grep -q ':443'; then
  echo "  serve ya está configurado."
else
  OUT=$(timeout 10 tailscale serve --bg "http://127.0.0.1:$PORT" 2>&1 || true)
  if tailscale serve status 2>/dev/null | grep -q ':443'; then
    echo "  serve activo."
  else
    echo "$OUT"
    echo "  ------------------------------------------------------------------"
    echo "  Abre el enlace de arriba en tu navegador (sesión de Tailscale),"
    echo "  activa 'Serve' y 'Funnel', y vuelve a correr este script:"
    echo "      bash scripts/setup-funnel.sh"
    exit 0
  fi
fi

echo "== 3) Habilitando Funnel público =="
if tailscale funnel status 2>/dev/null | grep -q ':443'; then
  echo "  Funnel ya está configurado."
else
  OUT=$(timeout 10 tailscale funnel --bg "http://127.0.0.1:$PORT" 2>&1 || true)
  if tailscale funnel status 2>/dev/null | grep -q ':443'; then
    echo "  Funnel activo."
  else
    echo "$OUT"
    echo "  ------------------------------------------------------------------"
    echo "  Si aún no lo haces: abras el enlace de arriba y activa 'Funnel'"
    echo "  en la consola de Tailscale, luego vuelve a correr este script:"
    echo "      bash scripts/setup-funnel.sh"
    exit 0
  fi
fi

echo
echo "== Estado final =="
tailscale funnel status 2>&1 | sed 's/^/  /'
echo
echo "URL pública (desde cualquier WiFi):"
DNS=$(tailscale status --json 2>/dev/null | grep -oP '"DNSName":\s*"\K[^"]+' | head -1)
echo "  https://${DNS%/}"
echo
echo "Notas:"
echo "  - Para quitarlo más adelante:  tailscale funnel off && tailscale serve off"