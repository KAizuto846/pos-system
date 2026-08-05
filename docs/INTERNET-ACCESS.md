# Acceso por Internet - POS System

Guia para acceder a tu sistema POS desde internet (celulares, tablets, otras PCs).

## Opcion 1: Cloudflare Tunnel (Recomendada)

Cloudflare Tunnel es la forma mas segura y facil de exponer tu servidor a internet.

### Requisitos
- Cuenta gratuita en [Cloudflare](https://dash.cloudflare.com)
- Dominio propio (opcional, puedes usar el subdominio gratuito de Cloudflare)

### Pasos

1. **Instalar cloudflared:**
   ```bash
   # Windows
   winget install Cloudflare.cloudflared

   # Linux (Debian/Ubuntu)
   curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
   chmod +x /usr/local/bin/cloudflared
   ```

2. **Autenticar con Cloudflare:**
   ```bash
   cloudflared tunnel login
   ```
   Esto abrira un navegador para autorizar.

3. **Crear un tunnel:**
   ```bash
   cloudflared tunnel create pos-system
   ```

4. **Configurar el tunnel:**
   Crea el archivo `~/.cloudflared/config.yml`:
   ```yaml
   tunnel: <TUNNEL_ID>
   credentials-file: ~/.cloudflared/<TUNNEL_ID>.json
   
   ingress:
     - hostname: pos.tudominio.com
       service: http://localhost:3000
     - service: http_status:404
   ```

5. **DNS (opcional, si tienes dominio):**
   ```bash
   cloudflared tunnel route dns pos-system pos.tudominio.com
   ```

6. **Iniciar el tunnel:**
   ```bash
   cloudflared tunnel run pos-system
   ```

7. **Acceder desde el celular:**
   Abre `https://pos.tudominio.com` en el navegador del celular.

### Como servicio (Windows)
```bash
# Instalar como servicio de Windows
cloudflared service install
```

### Como servicio (Linux)
```bash
# Crear archivo /etc/systemd/system/cloudflared.service
[Unit]
Description=Cloudflare Tunnel for POS System
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/cloudflared tunnel run pos-system
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target

# Habilitar e iniciar
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
```

---

## Opcion 2: ngrok

ngrok es mas simple pero tiene limitaciones en el plan gratuito.

### Pasos

1. **Instalar ngrok:**
   ```bash
   # Windows
   winget install ngrok.ngrok

   # Linux
   snap install ngrok
   ```

2. **Configurar token:**
   ```bash
   ngrok config add-authtoken <TU_TOKEN>
   ```

3. **Iniciar tunel:**
   ```bash
   ngrok http 3000
   ```

4. **Acceder:**
   ngrok mostrara una URL como `https://abc123.ngrok.io`. Abre esa URL en el celular.

### Limitaciones del plan gratuito
- URL cambia cada vez que reinicias ngrok
- Limite de conexiones
- No puedes usar tu propio dominio

---

## Opcion 3: Port Forwarding (Avanzado)

Requiere acceso al router y configuracion manual.

### Pasos

1. **Configurar el router:**
   - Accede a la configuracion del router (usualmente `192.168.1.1`)
   - Busca "Port Forwarding" o "Virtual Server"
   - Crea una regla:
     - Puerto externo: 3000
     - IP interna: IP de tu PC (ej: 192.168.1.100)
     - Puerto interno: 3000
     - Protocolo: TCP

2. **Obtener IP publica:**
   ```bash
   # Busca tu IP publica
   curl https://api.ipify.org
   ```

3. **Configurar DNS dinamico (opcional):**
   Si tu IP publica cambia, usa un servicio de DNS dinamico:
   - [No-IP](https://www.noip.com)
   - [DuckDNS](https://www.duckdns.org)
   - [Dynu](https://www.dynu.com)

4. **Acceder desde el celular:**
   Abre `http://TU_IP_PUBLICA:3000` en el navegador.

### Seguridad recomendada
- Cambia el puerto por algo no estandar (ej: 8443)
- Configura HTTPS con Let's Encrypt
- Configura firewall en la PC

---

## Comparativa

| Caracteristica | Cloudflare Tunnel | ngrok | Port Forwarding |
|----------------|-------------------|-------|-----------------|
| Dificultad | Facil | Muy facil | Dificil |
| Costo | Gratis | Gratis (limitado) | Gratis |
| HTTPS automatico | Si | Si | No (configurar) |
| URL estable | Si (con dominio) | No (plan gratis) | Si (con DNS) |
| Velocidad | Rapida | Rapida | Depende del ISP |
| Seguridad | Excelente | Buena | Depende de config |

---

## Recomendacion

Para la mayoria de usuarios, **Cloudflare Tunnel** es la mejor opcion:
- Gratis
- HTTPS automatico
- URL estable
- Sin configurar el router
- Seguro por defecto

Si solo necesitas probar rapidamente, usa **ngrok**.
Si tienes experiencia tecnica y control del router, usa **Port Forwarding**.
