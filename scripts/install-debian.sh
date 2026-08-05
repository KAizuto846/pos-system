#!/bin/bash
# POS System - Instalador para Debian/Ubuntu
# Ejecutar como root o con sudo

set -e

echo "=========================================="
echo "  POS System - Instalador Debian/Ubuntu"
echo "=========================================="
echo ""

# Verificar que se ejecuta como root
if [ "$EUID" -ne 0 ]; then
  echo "ERROR: Ejecuta este script como root o con sudo"
  echo "Uso: sudo bash install-debian.sh"
  exit 1
fi

# Variables
INSTALL_DIR="/opt/pos-system"
NODE_VERSION="20"
DB_PATH="$INSTALL_DIR/.next/standalone/prisma/prod.db"

echo "1. Actualizando el sistema..."
apt update && apt upgrade -y

echo ""
echo "2. Instalando dependencias del sistema..."
apt install -y git build-essential curl

echo ""
echo "3. Instalando Node.js $NODE_VERSION..."
if ! command -v nvm &> /dev/null; then
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
fi

nvm install $NODE_VERSION
nvm use $NODE_VERSION
nvm alias default $NODE_VERSION

echo ""
echo "4. Clonando POS System..."
if [ -d "$INSTALL_DIR" ]; then
  echo "   Directorio existente, actualizando..."
  cd "$INSTALL_DIR"
  git pull origin main
else
  git clone https://github.com/KAizuto846/pos-system.git "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

echo ""
echo "5. Instalando dependencias..."
npm ci

echo ""
echo "6. Configurando variables de entorno..."
if [ ! -f ".env" ]; then
  AUTH_SECRET=$(openssl rand -hex 32)
  cat > .env << EOF
DATABASE_URL="file:./prisma/prod.db"
AUTH_SECRET="$AUTH_SECRET"
AUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0
EOF
  echo "   .env creado"
else
  echo "   .env ya existe, omitiendo"
fi

echo ""
echo "7. Generando cliente Prisma..."
npx prisma generate
npx prisma db push

echo ""
echo "8. Build de produccion..."
npm run build

echo ""
echo "9. Copiando recursos al standalone..."
cp -r prisma .next/standalone/prisma
cp .env .next/standalone/.env

echo ""
echo "10. Creando servicio systemd..."
cat > /etc/systemd/system/pos-system.service << EOF
[Unit]
Description=POS System - Punto de Venta
After=network.target

[Service]
Type=simple
User=$SUDO_USER
WorkingDirectory=$INSTALL_DIR/.next/standalone
ExecStart=$(which node) server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOSTNAME=0.0.0.0
Environment=DATABASE_URL=file:./prisma/prod.db
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

echo ""
echo "11. Habilitando e iniciando servicio..."
systemctl daemon-reload
systemctl enable pos-system
systemctl start pos-system

echo ""
echo "12. Verificando instalacion..."
sleep 3
if curl -s http://localhost:3000/api/sync > /dev/null; then
  echo "   [OK] Servidor esta funcionando"
else
  echo "   [WARN] Servidor puede estar iniciando, espera unos segundos"
fi

echo ""
echo "=========================================="
echo "  Instalacion completada!"
echo "=========================================="
echo ""
echo "Servicio: systemctl status pos-system"
echo "Logs:     journalctl -u pos-system -f"
echo "URL:      http://localhost:3000"
echo ""
echo "Para configurar HTTPS, instala Nginx y Certbot:"
echo "  sudo apt install nginx certbot python3-certbot-nginx"
echo "  sudo certbot --nginx -d tudominio.com"
echo ""
echo "Para configurar acceso por internet:"
echo "  Ver docs/INTERNET-ACCESS.md"
echo ""
