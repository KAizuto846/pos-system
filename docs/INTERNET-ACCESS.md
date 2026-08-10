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

## Opcion 3: Tailscale Funnel (elegida)

Tailscale crea una red privada entre tus equipos (VPN mesh) y con **Funnel** publica
tu POS en una URL `https://<equipo>.<red>.ts.net` accesible desde **cualquier WiFi**
sin instalar nada en los dispositivos que la abren (celulares, tablets, laptops).

### Requisitos
- Cuenta gratuita en [Tailscale](https://tailscale.com) (hasta 100 dispositivos)
- El equipo donde corre el POS (Linux/Windows)

### Pasos

1. **Instalar Tailscale** (una vez por equipo que quieras en la red privada):
   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   ```

2. **Iniciar sesion y conectar:**
   ```bash
   sudo tailscale up
   ```
   Imprime una URL `https://login.tailscale.com/a/...` — abrela en tu navegador
   e inicia sesion con Google/GitHub/Microsoft.

3. **Autorizar HTTPS publico (una sola vez, en la consola de Tailscale):**
   - Abre el enlace que muestra el paso 5 si falta el permiso (o directamente
     `tailscale funnel --bg http://127.0.0.1:3000` y sigue el enlace que imprime)
   - Activa **Serve** y **Funnel** para el dispositivo en
     https://login.tailscale.com/admin

4. **Verificar conexion:**
   ```bash
   tailscale status
   tailscale ip -4      # ej: 100.84.232.66
   ```
   Con esto ya puedes acceder **en privado** desde cualquier dispositivo con
   Tailscale instalado: `http://100.x.y.z:3000`

5. **Publicar con Funnel (acceso desde cualquier WiFi, sin Tailscale en el cliente):**
   ```bash
   bash scripts/setup-funnel.sh
   ```
   El script verifica la app en `:3000`, configura `serve` + `funnel` y muestra la
   URL publica. Si el permiso del paso 3 aun no esta activado, imprime el enlace
   para habilitarlo y se puede volver a correr.

6. **Acceder desde el celular:**
   Abre `https://<equipo>.<red>.ts.net` con datos moviles (WiFi apagado) o
   cualquier red. Entra con tu usuario admin.

### Notas
- La configuracion de serve/funnel **persiste** en el daemon: sobrevive reinicios
  del equipo sin volver a ejecutar nada.
- La URL publica expone la pagina de **login** a cualquiera que la encuentre:
  usa contraseñas fuertes.
- Para dejar de publicar:
  ```bash
  tailscale funnel off
  tailscale serve off
  ```

### Acceso privado (alternativa sin Funnel)
Si solo necesitas acceso entre tus propios equipos, instala Tailscale en cada uno
(pasos 1-2) y accede con `http://<ip-100.x>:3000`. Mas privado, pero requiere
Tailscale instalado en cada dispositivo.

### Automatizado en la app de escritorio (Windows)

La app de Windows integra Tailscale en el wizard de primer arranque:

1. **Wizard de configuracion inicial** (`electron/setup.html`): seccion opcional
   "Conectar a la red remota (Tailscale)" con dos campos:
   - **Auth key de Tailscale**: la genera el administrador en
     https://login.tailscale.com/admin/settings/keys (scope: dispositivo,
     epirable). No se guarda en el equipo.
   - **Publicar con Funnel** (checkbox): activa la URL publica.
2. Al continuar, la app hace todo sola (`electron/tailscale.js`):
   - Instala Tailscale via `winget install Tailscale.Tailscale --silent` si falta
   - `tailscale up --authkey=... --hostname=POS-<equipo>` (se une a tu red)
   - `tailscale serve --bg` + `tailscale funnel --bg` apuntando a la app
   - Muestra el progreso en el wizard; al terminar, el estado queda en
     Configuracion > Sincronizacion (card "Acceso desde cualquier WiFi").
3. **Estado y URL**: la pagina de Sincronizacion muestra IP privada y URL publica
   (`https://<equipo>.<red>.ts.net`), con boton para copiarla.

Requisitos del dueno de la red (una sola vez):
- Activar "Serve" y "Funnel" para los dispositivos en la consola de Tailscale
  (o usar auth keys con tag + ACL `nodeAttrs: funnel` para habilitarlo
  automaticamente en todos los equipos nuevos).
- La authkey debe ser **reutilizable o de un lote** para que sirva en varias
  instalaciones; renovala periodicamente.

Para desplegar la app empaquetada con estos cambios en Windows:
```bash
npm run electron:build
```

---

## Opcion 4: Port Forwarding (Avanzado)

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

| Caracteristica | Cloudflare Tunnel | ngrok | Port Forwarding | Tailscale Funnel |
|----------------|-------------------|-------|-----------------|------------------|
| Dificultad | Facil | Muy facil | Dificil | Muy facil |
| Costo | Gratis | Gratis (limitado) | Gratis | Gratis (100 disp.) |
| HTTPS automatico | Si | Si | No (configurar) | Si |
| URL estable | Si (con dominio) | No (plan gratis) | Si (con DNS) | Si |
| Velocidad | Rapida | Rapida | Depende del ISP | Rapida (mesh) |
| Seguridad | Excelente | Buena | Depende de config | Excelente |
| Requiere instalar algo en el cliente | No | No | No | No (solo Funnel) |

---

## Recomendacion

Para la mayoria de usuarios, **Tailscale Funnel** es la mejor opcion (la elegida
para este proyecto):
- Gratis y sin dominio propio
- HTTPS automatico con URL estable
- Sin configurar el router ni abrir puertos
- La red privada (VPN mesh) queda lista para conectar todos tus equipos
- Seguro por defecto; el acceso publico se apaga con un comando

Alternativas: **Cloudflare Tunnel** si ya tienes dominio en Cloudflare; **ngrok**
solo para pruebas rapidas; **Port Forwarding** si controlas el router y no quieres
dependencias externas.
