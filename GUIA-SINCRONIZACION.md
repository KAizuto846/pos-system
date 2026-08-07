# Guia de Sincronizacion

POS System sincroniza los datos (productos, ventas, clientes, etc.) entre todos tus equipos de dos formas:

| Modo | Cuando usarlo | Velocidad |
|------|---------------|-----------|
| **LAN (red local)** | Todos los equipos en la misma red (mismo router/WiFi) | Automatico, cada 30s |
| **Relay (internet)** | Equipos en redes distintas (una tienda y otra ciudad, una casa y el local) | Automatico, cada 30s |

Ambos funcionan en la **aplicacion de escritorio (Windows)** y en la **version web** (Linux/macOS/navegador). No necesitas nada mas que tener el servidor corriendo.

---

## 1. Sincronizacion por red local (LAN)

### Requisitos
- Todos los equipos conectados a la **misma red** (mismo router o mismo WiFi).
- Puertos abiertos: **UDP 9876** (descubrimiento) y **TCP 3000** (sincronizacion) en cada equipo.

### Pasos
1. Inicia POS System en cada equipo.
2. Espera unos segundos: los equipos se detectan solos (UDP) y sincronizan cada 30 segundos.
3. Verificalo en **Sincronizacion** (barra lateral) → "Dispositivos detectados en la red" debe listar los otros equipos.

### Si no aparecen los equipos
- **Firewall:** permite UDP 9876 en ambos equipos.
  - Windows: `netsh advfirewall firewall add rule name="POS UDP" dir=in action=allow protocol=UDP localport=9876`
  - Linux (ufw): `sudo ufw allow 9876/udp && sudo ufw allow 3000/tcp`
- **Misma subred:** ambos equipos deben tener IP del mismo rango (ej. 192.168.1.x).
- **WiFi con aislamiento de clientes:** algunos routers bloquean la comunicacion entre dispositivos WiFi. Prueba con cable, o usa el relay (seccion 2).

---

## 2. Sincronizacion por internet (Relay)

Para equipos que **no** estan en la misma red. Necesitas un **relay**: un servidor en la nube que funciona como buzon central.

### Pasos (en CADA equipo)
1. Abre **Sincronizacion** (barra lateral).
2. En la card **"Sincronizacion por internet (Relay)"**:
   - **URL del relay:** ej. `https://sync.tudominio.com`
   - **Secret:** la contrasena compartida del relay. Debe ser **exactamente la misma** en todos los equipos.
3. Pulsa **Probar conexion** → debe mostrar "Conexion exitosa".
4. Pulsa **Guardar**.
5. Listo. Sincroniza solo cada 30 segundos. Tambien puedes pulsar **Sincronizar ahora** para forzarlo.

> Si ya tienes un relay corriendo (el tuyo o uno compartido), solo necesitas la URL y el secret para configurar cada equipo.

---

## 3. Como funciona el relay (conceptos)

- El relay es un **buzon**: guarda los cambios de todos los equipos.
- Cada equipo **envia** sus cambios al buzon (push) y **recibe** los cambios de los demas (pull).
- No importa si los equipos nunca se ven entre si: todos hablan con el mismo relay.
- Si dos equipos modifican el mismo registro casi al mismo tiempo, gana el cambio mas reciente (Last-Write-Wins).

---

## 4. Desplegar tu propio relay (opcional)

Para usuarios avanzados que quieren su propio relay en un VPS (Debian/Ubuntu).

### Requisitos del VPS
- Debian/Ubuntu con Node.js 18+ y npm.
- Un dominio apuntando al VPS (para HTTPS).

### Instalacion
```bash
apt install -y nodejs npm
mkdir -p /opt/pos-relay && cd /opt/pos-relay
# Copia la carpeta relay/ del proyecto POS System a este directorio
npm install
```

### Servicio systemd
```ini
# /etc/systemd/system/pos-relay.service
[Unit]
Description=POS Relay Server
After=network.target

[Service]
Environment=PORT=8099
Environment=SYNC_SECRET=cambia-por-un-secreto-largo
Environment=DB_PATH=/opt/pos-relay/relay.db
WorkingDirectory=/opt/pos-relay
ExecStart=/usr/bin/node server.js
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload && systemctl enable --now pos-relay
```

### HTTPS (recomendado)
```bash
apt install -y caddy
# /etc/caddy/Caddyfile
sync.tudominio.com {
    reverse_proxy 127.0.0.1:8099
}
systemctl reload caddy
```

La URL del relay para los equipos sera `https://sync.tudominio.com`.

---

## 5. Verificacion rapida

| Sintoma | Que revisar |
|---------|-------------|
| "No se encontraron otros dispositivos en la red local" | Firewall UDP 9876, misma subred, aislamiento WiFi |
| "Sin conexion" al probar el relay | URL correcta (https://...), relay corriendo, secret correcto |
| Cambios pendientes que no bajan | Pulsa "Sincronizar ahora" y revisa "Ultima sincronizacion LAN" |
