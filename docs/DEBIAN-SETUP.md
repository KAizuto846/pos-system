# Instalacion en Debian/Ubuntu - POS System

Guia para instalar POS System en un servidor Debian o Ubuntu como servicio permanente.

## Requisitos

- Debian 11+ o Ubuntu 20.04+
- 2GB RAM minimo (4GB recomendado)
- 20GB de espacio en disco
- Acceso SSH con permisos sudo
- Puerto 3000 abierto (o el que configures)

## Instalacion Automatica

```bash
# Descargar e ejecutar el script de instalacion
curl -L https://raw.githubusercontent.com/KAizuto846/pos-system/main/scripts/install-debian.sh | sudo bash
```

## Instalacion Manual

### 1. Actualizar el sistema

```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Instalar Node.js 20

```bash
# Instalar nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc

# Instalar Node.js 20
nvm install 20
nvm use 20
nvm alias default 20

# Verificar
node --version  # Debe mostrar v20.x.x
```

### 3. Instalar dependencias del sistema

```bash
sudo apt install -y git build-essential
```

### 4. Clonar el repositorio

```bash
cd /opt
sudo git clone https://github.com/KAizuto846/pos-system.git
sudo chown -R $USER:$USER /opt/pos-system
cd /opt/pos-system
```

### 5. Instalar dependencias

```bash
npm ci
```

### 6. Configurar variables de entorno

```bash
cat > .env << EOF
# Base de datos SQLite
DATABASE_URL="file:./prisma/prod.db"

# Auth
AUTH_SECRET="$(openssl rand -hex 32)"
AUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Produccion
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0
EOF
```

### 7. Generar cliente Prisma y crear base de datos

```bash
npx prisma generate
npx prisma db push
```

### 8. Crear usuario admin

```bash
npx prisma db seed
```

O crea uno manualmente:
```bash
npx prisma studio
```

### 9. Build de produccion

```bash
npm run build
```

### 10. Copiar prisma al standalone

```bash
cp -r prisma .next/standalone/prisma
cp .env .next/standalone/.env
```

### 11. Crear servicio systemd

```bash
sudo tee /etc/systemd/system/pos-system.service > /dev/null << EOF
[Unit]
Description=POS System - Punto de Venta
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/opt/pos-system/.next/standalone
ExecStart=/usr/local/bin/node server.js
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
```

### 12. Habilitar e iniciar el servicio

```bash
sudo systemctl daemon-reload
sudo systemctl enable pos-system
sudo systemctl start pos-system
```

### 13. Verificar que funciona

```bash
sudo systemctl status pos-system
curl http://localhost:3000/api/sync
```

---

## Configurar Nginx (Recomendado)

Nginx actua como reverse proxy, maneja HTTPS y distribuye la carga.

### 1. Instalar Nginx

```bash
sudo apt install -y nginx
```

### 2. Configurar Nginx

```bash
sudo tee /etc/nginx/sites-available/pos-system > /dev/null << 'EOF'
server {
    listen 80;
    server_name pos.tudominio.com;

    # Redirigir a HTTPS (despues de configurar certbot)
    # return 301 https://$host$request_uri;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
        
        # SSE support
        proxy_buffering off;
        proxy_cache off;
    }
}
EOF
```

### 3. Habilitar el sitio

```bash
sudo ln -s /etc/nginx/sites-available/pos-system /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 4. Configurar HTTPS con Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d pos.tudominio.com
```

---

## Configurar Firewall

```bash
# Habilitar UFW
sudo ufw enable

# Permitir SSH
sudo ufw allow ssh

# Permitir HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Verificar estado
sudo ufw status
```

---

## Backups Automaticos

### Script de backup

```bash
sudo tee /opt/pos-system/backup.sh > /dev/null << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/pos-system/backups"
DB_PATH="/opt/pos-system/.next/standalone/prisma/prod.db"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Copiar base de datos
cp $DB_PATH "$BACKUP_DIR/pos_$DATE.db"

# Comprimir
gzip "$BACKUP_DIR/pos_$DATE.db"

# Eliminar backups antiguos (mantener ultimos 30)
find $BACKUP_DIR -name "*.db.gz" -mtime +30 -delete

echo "Backup completado: pos_$DATE.db.gz"
EOF

chmod +x /opt/pos-system/backup.sh
```

### Cron job diario

```bash
# Editar crontab
crontab -e

# Agregar linea (backup a las 2 AM)
0 2 * * * /opt/pos-system/backup.sh
```

---

## Monitoreo

### Ver logs en tiempo real

```bash
sudo journalctl -u pos-system -f
```

### Reiniciar el servicio

```bash
sudo systemctl restart pos-system
```

### Verificar estado

```bash
sudo systemctl status pos-system
curl http://localhost:3000/api/sync
```

---

## Actualizar POS System

```bash
cd /opt/pos-system

# Detener servicio
sudo systemctl stop pos-system

# Actualizar codigo
git pull origin main

# Instalar nuevas dependencias
npm ci

# Generar Prisma
npx prisma generate

# Build
npm run build

# Copiar recursos
cp -r prisma .next/standalone/prisma
cp .env .next/standalone/.env

# Reiniciar servicio
sudo systemctl start pos-system
```

---

## Solucion de Problemas

### El servicio no inicia

```bash
# Ver logs de error
sudo journalctl -u pos-system -n 50

# Verificar que el puerto no este en uso
sudo lsof -i :3000
```

### Error de permisos

```bash
# Asegurar que el usuario puede escribir
sudo chown -R $USER:$USER /opt/pos-system
```

### Error de base de datos

```bash
# Recrear la base de datos
cd /opt/pos-system/.next/standalone
rm -f prisma/prod.db
npx prisma db push
```

### La app no carga en el celular

1. Verificar que el firewall permita el puerto 3000
2. Verificar que Nginx este configurado correctamente
3. Verificar que Cloudflare Tunnel este activo (si lo usas)
4. Verificar que la URL sea correcta (https://, no http://)
