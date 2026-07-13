# POS System - Plan de Implementacion

## Contexto del Proyecto

Sistema de Punto de Venta (POS) para pequenas y medianas empresas. Stack: Next.js 16 + React 19 + Prisma + SQLite + Electron. Escrito en espanol, interfaz oscura por defecto.

**Objetivo:** Integrar a Windows con instalador unico + auto-update, y soporte multi-dispositivo con sincronizacion en tiempo real.

---

## Arquitectura Final

```
┌─────────────────────────────────────────────────────┐
│              SERVIDOR (PC Windows o Debian)          │
│  ┌─────────────┐  ┌──────────┐  ┌───────────────┐  │
│  │  Next.js    │  │  SQLite  │  │  SSE Events   │  │
│  │  API Server │──│  (WAL)   │──│  Broadcaster  │  │
│  └──────┬──────┘  └──────────┘  └───────┬───────┘  │
│         │                               │           │
│  ┌──────┴──────┐                        │           │
│  │  Electron   │                        │           │
│  │  (Server)   │                        │           │
│  └─────────────┘                        │           │
└─────────┬───────────────────────────────┬───────────┘
          │ HTTP (port 3000)              │ SSE Stream
          │                               │
    ┌─────┴─────┐                  ┌──────┴──────┐
    │  Phone    │                  │  PC Client  │
    │  (PWA)    │◄────────────────►│  (Electron) │
    │  Browser  │   Same API       │  Mode: client│
    └───────────┘                  └─────────────┘
```

**Modelo:** Servidor compartido. Un dispositivo ejecuta el servidor, los demas se conectan como clientes. Todos comparten la misma base de datos SQLite via API REST.

**Acceso por internet:** Cloudflare Tunnel o ngrok (documentacion en `docs/INTERNET-ACCESS.md`).

**Datos compartidos:** Todo (inventario, ventas, usuarios, proveedores, reportes, metodos de pago).

**Maximo dispositivos:** <10. SSE en memoria es suficiente.

---

## Fases de Implementacion

### Fase 1: Server-Sent Events (SSE) - Sincronizacion en Tiempo Real

**Prioridad:** ALTA - Fundamento para todo lo demas.

#### 1.1 Crear libreria de broadcast

**Archivo nuevo:** `src/lib/broadcast.ts`

```typescript
// Singleton que maneja conexiones SSE activas
// Memoria: Map<string, ReadableStreamDefaultController>
// Funcion principal: broadcast(event: string, data: any)
// Heartbeat cada 30s para mantener conexiones vivas
// Maximo 50 conexiones simultaneas (para <10 dispositivos es mas que suficiente)
```

Patron a seguir:
```typescript
type SSEClient = {
  id: string;
  controller: ReadableStreamDefaultController;
  connectedAt: Date;
};

const clients = new Map<string, SSEClient>();

export function addClient(id: string, controller: ReadableStreamDefaultController) {
  clients.set(id, { id, controller, connectedAt: new Date() });
}

export function removeClient(id: string) {
  clients.delete(id);
}

export function broadcast(event: string, data: unknown) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [id, client] of clients) {
    try {
      client.controller.enqueue(new TextEncoder().encode(message));
    } catch {
      clients.delete(id);
    }
  }
}

export function getClientCount() {
  return clients.size;
}
```

#### 1.2 Crear endpoint SSE

**Archivo nuevo:** `src/app/api/events/route.ts`

- GET `/api/events` - Streaming connection
- Headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
- Generar ID unico por conexion (usar `crypto.randomUUID()`)
- Enviar heartbeat `:ping\n\n` cada 30 segundos
- On close: llamar `removeClient()`
- No requiere autenticacion (es solo un stream de eventos, no expone datos sensibles)

#### 1.3 Modificar API routes para broadcast

Despues de cada operacion de escritura exitosa, llamar:

```typescript
import { broadcast } from "@/lib/broadcast";
```

Archivos a modificar y eventos a emitir:

| Archivo | Evento | Data |
|---------|--------|------|
| `src/app/api/products/route.ts` POST | `product:create` | `{ id }` |
| `src/app/api/products/[id]/route.ts` PUT | `product:update` | `{ id }` |
| `src/app/api/products/[id]/route.ts` DELETE | `product:delete` | `{ id }` |
| `src/app/api/products/[id]/stock/route.ts` POST | `product:stock` | `{ id, stock }` |
| `src/app/api/sales/route.ts` POST | `sale:create` | `{ id, total }` |
| `src/app/api/refunds/route.ts` POST | `refund:create` | `{ id, saleId }` |
| `src/app/api/departments/route.ts` POST/PUT/DELETE | `department:change` | `{ id }` |
| `src/app/api/suppliers/route.ts` POST/PUT/DELETE | `supplier:change` | `{ id }` |
| `src/app/api/orders/[id]/receive/route.ts` POST | `order:receive` | `{ id }` |
| `src/app/api/users/route.ts` POST/PUT/DELETE | `user:change` | `{ id }` |
| `src/app/api/payment-methods/route.ts` POST/PUT/DELETE | `payment:change` | `{ id }` |

Patron de modificacion (ejemplo para products):
```typescript
// Despues del exito en POST:
broadcast("product:create", { id: newProduct.id });
```

#### 1.4 Crear hook del cliente SSE

**Archivo nuevo:** `src/hooks/useRealtimeSync.ts`

```typescript
// Hook React que:
// - Se conecta a /api/events al montar
// - Reconexion automatica con backoff exponencial (1s, 2s, 4s, max 30s)
// - Callbacks por tipo de evento
// - Invalidacion automatica de React Query cache
// - Estado de conexion (connected/disconnected/reconnecting)
```

Uso en componentes:
```typescript
useRealtimeSync({
  onProductChange: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  onSaleChange: () => queryClient.invalidateQueries({ queryKey: ["sales"] }),
  // ...
});
```

#### 1.5 Integrar en la app

**Archivo a modificar:** `src/app/layout.tsx` o `src/components/providers.tsx`

- Agregar `RealtimeSyncProvider` que use el hook `useRealtimeSync`
- Envolver la app con el provider

**Archivo a modificar:** `src/components/SyncStatusBadge.tsx`

- Mostrar estado de conexion SSE en tiempo real
- Mostrar numero de dispositivos conectados
- Indicador verde/rojo/amarillo segun estado

---

### Fase 2: Correccion de Condiciones de Carrera

**Prioridad:** ALTA - Seguridad de datos.

#### 2.1 Stock updates atomicos

**Archivo:** `src/app/api/sales/route.ts`

Problema actual (lineas 57-71 y 99-104): Lee stock, verifica, luego decrementa. Dos ventas simultaneas pueden pasar ambas la verificacion.

Solucion - usar UPDATE atomico con condicion:
```typescript
// Dentro de la transaccion, reemplazar el loop de verificacion + decremento:
for (const item of data.items) {
  const result = await tx.$executeRaw`
    UPDATE products SET stock = stock - ${item.quantity}
    WHERE id = ${item.productId} AND stock >= ${item.quantity}
  `;
  if (result === 0) {
    throw new Error(`Stock insuficiente para producto ${item.productId}`);
  }
}
```

Eliminar el loop de verificacion previo (lineas 57-71) ya que la verificacion ahora es atomica.

**Archivo:** `src/app/api/products/[id]/stock/route.ts`

Problema actual (lineas 31-46): Lee stock, calcula nuevo, escribe sin transaccion.

Solucion:
```typescript
// Reemplazar las lineas 31-52 con:
const result = await prisma.$executeRaw`
  UPDATE products SET stock = stock + ${quantity}
  WHERE id = ${productId} AND (stock + ${quantity}) >= 0
`;
if (result === 0) {
  return Response.json(
    { error: "Stock insuficiente. El stock no puede ser negativo." },
    { status: 400 }
  );
}
const updated = await prisma.product.findUnique({
  where: { id: productId },
  include: { department: true, supplier: true },
});
```

**Archivo:** `src/app/api/refunds/route.ts`

Problema actual (lineas 47-58): Calcula reembolsos existentes fuera de locking.

Solucion: Usar transaccion interactiva de Prisma para asegurar que el calculo de reembolsos existentes y la creacion del nuevo reembolso sean atomicos.

#### 2.2 Campo de version (optimistic locking)

**Archivo:** `prisma/schema.prisma`

Agregar a tablas criticas:
```prisma
model Product {
  // ... campos existentes
  version Int @default(1)  // NUEVO CAMPO
}

model Sale {
  // ... campos existentes  
  version Int @default(1)  // NUEVO CAMPO
}
```

En updates, verificar version:
```typescript
await prisma.product.update({
  where: { id, version: expectedVersion },
  data: { stock: newStock, version: { increment: 1 } },
});
// Si affected rows === 0, significa que otro usuario modifico el registro
```

**Nota:** Despues de agregar el campo, ejecutar `npx prisma db push` para actualizar la DB.

---

### Fase 3: Auto-Update Silencioso

**Prioridad:** MEDIA - Funcionalidad de distribucion.

#### 3.1 Reescribir electron/updater.js

**Archivo:** `electron/updater.js` (reescritura completa)

Usar `electron-updater` (ya instalado como dependencia) en lugar del script custom que solo abre el navegador.

```javascript
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const { dialog, BrowserWindow } = require('electron');

let mainWindow = null;
let installUpdateCallback = null;

function setupAutoUpdater(win) {
  mainWindow = win;
  
  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;
  autoUpdater.forceDevUpdateConfig = false;

  // Verificar al iniciar y cada 4 horas
  autoUpdater.checkForUpdates();
  setInterval(() => autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1000);

  autoUpdater.on('update-available', (info) => {
    if (mainWindow) {
      mainWindow.webContents.send('update-status', {
        type: 'available',
        version: info.version,
        releaseDate: info.releaseDate,
      });
    }
  });

  autoUpdater.on('download-progress', (progress) => {
    if (mainWindow) {
      mainWindow.webContents.send('update-status', {
        type: 'downloading',
        percent: Math.round(progress.percent),
        bytesPerSecond: progress.bytesPerSecond,
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow) {
      mainWindow.webContents.send('update-status', {
        type: 'ready',
        version: info.version,
      });
    }
    // Preguntar al usuario si quiere reiniciar
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['Reiniciar ahora', 'Mas tarde'],
      title: 'Actualizacion lista',
      message: `Version ${info.version} descargada`,
      detail: 'La actualizacion se instalara al reiniciar. Desea reiniciar ahora?',
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  autoUpdater.on('error', (err) => {
    log.error('Auto-updater error:', err);
  });
}

function checkForUpdates() {
  return autoUpdater.checkForUpdates();
}

function installUpdate() {
  autoUpdater.quitAndInstall();
}

module.exports = { setupAutoUpdater, checkForUpdates, installUpdate };
```

#### 3.2 Integrar updater en main.js

**Archivo:** `electron/main.js`

Cambios:
1. Importar updater al inicio:
```javascript
const { setupAutoUpdater } = require('./updater');
```

2. Llamar `setupAutoUpdater(mainWindow)` despues de crear la ventana y cuando esta lista (en el evento `ready-to-show` o despues de `loadPOS()` exitoso).

3. Agregar IPC handler para actualizacion forzada:
```javascript
ipcMain.handle('install-update', () => {
  const { installUpdate } = require('./updater');
  installUpdate();
});
```

4. Agregar opcion en menu de tray:
```javascript
{ label: 'Buscar actualizaciones', click: () => {
  const { checkForUpdates } = require('./updater');
  checkForUpdates();
}},
```

#### 3.3 UI de actualizacion

**Archivo nuevo:** `src/components/UpdateNotification.tsx`

- Banner discreto en la parte superior cuando hay actualizacion disponible
- Barra de progreso durante descarga
- Boton "Reiniciar ahora" / "Mas tarde"
- Se muestra solo cuando el evento `update-status` se recibe via IPC
- En clientes remotos (phone), mostrar notificacion de que hay nueva version disponible en el servidor

---

### Fase 4: Instalador NSIS con Wizard

**Prioridad:** MEDIA - Experiencia de instalacion.

#### 4.1 Generar icono .ico

**Archivo nuevo:** `scripts/create-icon.js`

Script que convierte `public/icons/icon-512.png` a `.ico` usando canvas (node-canvas) o sharp.

Alternativa: usar ImageMagick si esta disponible:
```bash
convert public/icons/icon-512.png -define icon:auto-resize=16,32,48,64,128,256 public/icons/icon-512.ico
```

Tambien generar `.bmp` para el header del NSIS:
```bash
convert public/icons/icon-512.png -resize 150x57 public/icons/installer-header.bmp
```

#### 4.2 Reescribir NSIS installer

**Archivo:** `electron/nsis/installer.nsi` (reescritura completa)

Paginas del wizard:

1. **Bienvenida**
   - Logo del producto (icon-512.bmp)
   - Texto: "Asistente de instalacion de POS System"
   - Boton "Siguiente"

2. **Licencia**
   - Mostrar contenido de LICENSE (MIT)
   - Aceptar / No aceptar

3. **Directorio de instalacion**
   - Default: `$PROGRAMFILES64\POS System`
   - Permitir cambiar

4. **Configuracion del Negocio** (pagina custom)
   - Campo texto: "Nombre del negocio" (default: "Mi Negocio")
   - Campo texto: "Nombre del dispositivo" (default: `%COMPUTERNAME%`)

5. **Modo de Operacion** (pagina custom)
   - Radio buttons:
     - "Servidor" (ejecuta la base de datos local)
     - "Cliente" (se conecta a otro servidor)
     - "Automatico" (detecta automaticamente)
   - Campo numero: "Puerto del servidor" (default: 3000)
   - Campo texto: "IP del servidor" (solo visible en modo Cliente)

6. **Opciones**
   - Checkbox: "Iniciar con Windows" (default: SI)
   - Checkbox: "Acceso directo en escritorio" (default: SI)
   - Checkbox: "Acceso directo en Menu Inicio" (default: SI)

7. **Instalando**
   - Barra de progreso
   - Mostrar archivos being copied

8. **Completado**
   - Checkbox: "Ejecutar POS System ahora"
   - Boton "Finalizar"

**Guardado de configuracion:** Despues de la instalacion, crear `%APPDATA%\POS System\config.json`:
```json
{
  "businessName": "Mi Negocio",
  "deviceName": "PC-Caja",
  "mode": "server",
  "serverPort": 3000,
  "serverIP": ""
}
```

**Registro de Windows:** Crear entrada en `HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall\com.possystem.app` con DisplayName, DisplayVersion, Publisher, InstallLocation, UninstallString.

**Accesos directos:**
- `%APPDATA%\Microsoft\Windows\Start Menu\Programs\POS System\POS System.lnk`
- `%APPDATA%\Microsoft\Windows\Start Menu\Programs\POS System\Desinstalar.lnk`
- `%USERPROFILE%\Desktop\POS System.lnk`

#### 4.3 Configurar electron-builder

**Archivo:** `package.json` - campo `build.nsis`

```json
{
  "nsis": {
    "oneClick": false,
    "perMachine": true,
    "allowToChangeInstallationDirectory": true,
    "createDesktopShortcut": true,
    "createStartMenuShortcut": true,
    "shortcutName": "POS System",
    "installerIcon": "public/icons/icon-512.ico",
    "uninstallerIcon": "public/icons/icon-512.ico",
    "installerHeader": "public/icons/installer-header.bmp",
    "license": "LICENSE",
    "include": "electron/nsis/installer.nsi",
    "deleteAppDataOnUninstall": false
  }
}
```

---

### Fase 5: Configuracion Inicial en App Web

**Prioridad:** MEDIA - Facilidad de uso.

#### 5.1 Pagina de setup inicial

**Archivo nuevo:** `src/app/setup/page.tsx`

Pagina que se muestra solo la primera vez (si no hay configuracion). Wizard con pasos:

1. **Bienvenida** - Descripcion del sistema
2. **Datos del negocio** - Nombre, moneda, timezone
3. **Crear usuario admin** - Username, password, nombre
4. **Configuracion de red** - Modo (servidor/cliente), puerto, IP
5. **Completado** - Resumen y boton para ir al dashboard

**Verificacion:** Si ya existe un usuario admin, redirigir a `/login`.

#### 5.2 Pagina de configuracion en settings

**Archivo nuevo o modificar existente:** `src/app/(dashboard)/settings/page.tsx`

Seccion "Red y Sincronizacion":
- Modo actual (servidor/cliente/auto)
- Estado de conexion
- Dispositivos conectados (si SSE esta activo)
- Boton "Cambiar modo"
- Configuracion de Puerto e IP

---

### Fase 6: Offline Support

**Prioridad:** BAJA - Funcionalidad futura.

#### 6.1 Service Worker para PWA

**Archivo:** `public/sw.js` (verificar si existe, crear si no)

- Cache de assets estaticos (CSS, JS, icons)
- Cache de API responses criticas (productos, metodos de pago)
- Estrategia: Network First, fallback a cache
- Background sync para enviar ventas cuando se reconecte

#### 6.2 Cola de operaciones offline

**Archivo nuevo:** `src/lib/offline-queue.ts`

```typescript
// Cola de operaciones pendientes cuando no hay conexion
// Almacena en localStorage/IndexedDB:
// - Ventas realizadas offline
// - Ajustes de stock offline
// - Cualquier operacion de escritura
// Al reconectar: envia operaciones en orden
// Manejo de conflictos: last-write-wins con timestamp
```

#### 6.3 Indicador de modo offline

**Archivo a modificar:** `src/components/SyncStatusBadge.tsx`

- Detectar `navigator.onLine`
- Mostrar "Modo offline" cuando no hay conexion
- Mostrar "X operaciones pendientes" cuando hay cola
- Sincronizar automaticamente al reconectar

---

### Fase 7: Documentacion y Deployment

#### 7.1 Documentacion de acceso por internet

**Archivo nuevo:** `docs/INTERNET-ACCESS.md`

Instrucciones para:
- Cloudflare Tunnel (recomendado, gratis, HTTPS automatico)
- ngrok (alternativa simple)
- Port forwarding manual (avanzado)
- Configuracion de firewall

#### 7.2 Script de instalacion Debian

**Archivo nuevo:** `scripts/install-debian.sh`

- Instala Node.js 20
- Copia build standalone
- Crea servicio systemd
- Configura nginx como reverse proxy
- Configura Cloudflare Tunnel (opcional)
- Configura backup automatico de SQLite

#### 7.3 Documentacion de produccion

**Archivo nuevo:** `docs/DEBIAN-SETUP.md`

- Requisitos del servidor
- Instalacion paso a paso
- Configuracion de SQLite para produccion
- Monitoreo
- Backups
- Actualizaciones

---

## Archivos Clave del Proyecto

### Estructura de directorios
```
src/
├── app/
│   ├── api/                    # API routes (Next.js App Router)
│   │   ├── auth/               # NextAuth
│   │   ├── events/             # NUEVO: SSE endpoint
│   │   ├── products/           # CRUD productos + stock
│   │   ├── sales/              # CRUD ventas
│   │   ├── refunds/            # CRUD reembolsos
│   │   ├── departments/        # CRUD departamentos
│   │   ├── suppliers/          # CRUD proveedores
│   │   ├── orders/             # Ordenes a proveedores
│   │   ├── users/              # CRUD usuarios
│   │   ├── payment-methods/    # Metodos de pago
│   │   ├── sync/               # Health check + export
│   │   ├── import/             # Importacion Excel/CSV
│   │   ├── reports/            # Reportes
│   │   ├── finance/            # Finanzas
│   │   ├── stats/              # Estadisticas
│   │   └── shift-reports/      # Reportes de turno
│   ├── (dashboard)/            # Paginas del dashboard
│   ├── login/                  # Login
│   ├── register/               # Registro
│   └── setup/                  # NUEVO: Setup inicial
├── components/                 # Componentes React
│   ├── ui/                     # shadcn/ui components
│   └── SyncStatusBadge.tsx     # Estado de conexion
├── lib/
│   ├── auth.ts                 # NextAuth config
│   ├── db.ts                   # Prisma client (singleton)
│   ├── prisma.ts               # Prisma client con PRAGMAs
│   ├── broadcast.ts            # NUEVO: SSE broadcaster
│   ├── validations.ts          # Zod schemas
│   └── offline-queue.ts        # NUEVO: Cola offline
└── hooks/
    └── useRealtimeSync.ts      # NUEVO: Hook SSE

electron/
├── main.js                     # Electron main process
├── preload.js                  # Context bridge
├── updater.js                  # Auto-updater (REESCRIBIR)
├── loading.html                # Loading screen
└── nsis/
    └── installer.nsi           # NSIS installer (REESCRIBIR)

prisma/
└── schema.prisma               # Database schema

scripts/
├── build-electron.js           # Build script
├── create-icon.js              # NUEVO: Generador de .ico
└── install-debian.sh           # NUEVO: Instalador Debian

docs/
├── INTERNET-ACCESS.md          # NUEVO
└── DEBIAN-SETUP.md             # NUEVO
```

### API Routes - Patron de modificacion

Todas las API routes siguen este patron:
```typescript
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";  // O "@/lib/db"
import { broadcast } from "@/lib/broadcast";  // NUEVO

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }
    
    // ... logica de negocio ...
    
    broadcast("event:type", { id: result.id });  // NUEVO
    
    return Response.json(result, { status: 201 });
  } catch (error) {
    // ... manejo de errores ...
  }
}
```

### Prisma Client - Dos exports

El proyecto tiene dos archivos de Prisma client:
- `src/lib/db.ts` - `export const prisma` (simple)
- `src/lib/prisma.ts` - `export const prisma` (con PRAGMAs SQLite)

Ambos exportan `prisma`. Usar `@/lib/prisma` para archivos que necesiten las optimizaciones SQLite, `@/lib/db` para los demas. Verificar cual se usa en cada archivo antes de modificar.

---

## Comandos

### Desarrollo
```bash
npm run dev                    # Next.js dev server (puerto 3000)
npm run electron:dev           # Electron + Next.js en paralelo
```

### Build
```bash
npm run build                  # Build Next.js standalone
npm run electron:build         # Build Electron para Windows (NSIS + zip)
npm run electron:build:linux   # Build Electron para Linux
npm run electron:build:all     # Build ambas plataformas
```

### Base de datos
```bash
npx prisma generate            # Generar cliente Prisma
npx prisma db push             # Sincronizar schema con DB
npx prisma db studio           # Abrir Prisma Studio
npx prisma migrate dev         # Crear migracion (dev)
npx prisma migrate deploy     # Aplicar migraciones (prod)
```

### Deploy
```bash
./deploy.sh v1.0.1             # Build + push + tag → GitHub Action
```

### Lint
```bash
npm run lint                   # ESLint
```

---

## Convenciones de Codigo

- **Idioma:** Español en UI,ingles en codigo (nombres de variables, funciones, comentarios)
- **Framework:** Next.js 16 App Router con `output: "standalone"`
- **Componentes:** Functional components con hooks
- **Estado:** Zustand para estado global, React Query para server state
- **Estilos:** TailwindCSS v4, tema oscuro por defecto
- **UI:** shadcn/ui (componentes en `src/components/ui/`)
- **Validacion:** Zod schemas en `src/lib/validations.ts`
- **Auth:** NextAuth v5 beta con JWT strategy
- **DB:** Prisma con SQLite, WAL mode habilitado
- **TypeScript:** Strict mode, target ES2017

### Naming conventions
- Archivos: `camelCase.ts` para lib, `PascalCase.tsx` para componentes
- Variables: `camelCase`
- Funciones: `camelCase`
- Componentes React: `PascalCase`
- API routes: `kebab-case` en URLs
- Prisma models: `PascalCase`
- Prisma fields: `camelCase` con `@@map` a `snake_case` en DB

### Error handling
```typescript
try {
  // ... logica ...
} catch (error) {
  const message = error instanceof Error ? error.message : "Error generico";
  console.error("Contexto del error:", error);
  
  if (message.includes("condicion_especifica")) {
    return Response.json({ error: message }, { status: 400 });
  }
  
  return Response.json({ error: "Error generico" }, { status: 500 });
}
```

---

## Dependencias Existentes (Relevantes)

### Auto-update
- `electron-updater` ^6.6.2 (INSTALADO pero no usado - reemplazar script custom)
- `electron-log` ^5.3.4 (para logging)

### UI
- `@tanstack/react-query` ^5.100.10 (fetching/cache - usar para invalidacion en SSE)
- `zustand` ^5.0.13 (estado global)
- `lucide-react` ^1.14.0 (iconos)
- `react-hot-toast` ^2.6.0 (notificaciones)
- `recharts` ^3.8.1 (graficos)

### Base de datos
- `@prisma/client` ^5.22.0 (ORM)
- `prisma` ^5.22.0 (CLI)
- SQLite via Prisma (WAL mode)

### Auth
- `next-auth` ^5.0.0-beta.31
- `bcrypt-ts` ^8.0.1

---

## Notas Importantes

1. **SQLite y concurrencia:** SQLite WAL permite reads concurrentes pero writes son serializados. Para <10 dispositivos es suficiente, pero las transacciones deben ser cortas.

2. **No usar `@/lib/db` ni `@/lib/prisma` indistintamente.** Verificar cual importa cada archivo. `prisma.ts` tiene PRAGMAs de optimizacion que se ejecutan una vez al conectar.

3. **El `server.js` en la raiz es LEGACY.** No modificar. El servidor real es el standalone de Next.js en `.next/standalone/server.js`.

4. **El updater custom actual (`electron/updater.js`) NO usa `electron-updater`.** Solo hace fetch a la API de GitHub y abre el navegador. Reescribir completamente.

5. **El NSIS script actual (`electron/nsis/installer.nsi`) referencia archivos `.ico` y `.bmp` que NO existen.** Crear estos archivos primero.

6. **El campo `version` no existe en el schema de Prisma.** Agregarlo a Product y Sale antes de implementar optimistic locking.

7. **El SSE endpoint debe ser compatible con el standalone de Next.js.** Verificar que `ReadableStream` funcione correctamente en el entorno standalone.

8. **Para acceso por internet, documentar Cloudflare Tunnel como primera opcion.** Es gratis, tiene HTTPS automatico, y no requiere configurar el router.

---

## Estado de Implementacion

| Fase | Estado | Notas |
|------|--------|-------|
| Fase 1: SSE | COMPLETADA | broadcast.ts, /api/events, hooks, providers |
| Fase 2: Condiciones de carrera | COMPLETADA | Updates atomicos en sales, stock, refunds |
| Fase 3: Auto-update | COMPLETADA | electron-updater integrado en main.js |
| Fase 4: NSIS installer | COMPLETADA | Wizard con 8 paginas + create-icon.js |
| Fase 5: Setup web | COMPLETADA | Pagina /setup con wizard multi-paso |
| Fase 6: Offline | PENDIENTE | Futuro |
| Fase 7: Documentacion | COMPLETADA | INTERNET-ACCESS.md + DEBIAN-SETUP.md |

---

## Preguntas Abiertas

1. **¿El campo `version` debe agregarse a TODAS las tablas o solo a Product y Sale?**
   - Recomendacion: Solo Product y Sale por ahora. Las demas tablas tienen menor riesgo de conflicto.

2. **¿El SSE endpoint debe requerir autenticacion?**
   - Recomendacion: No. Los eventos no contienen datos sensibles (solo IDs y tipos de cambio). La autenticacion ya esta en cada API route individual.

3. **¿El wizard de setup debe crear el usuario admin o asumir que ya existe?**
   - Recomendacion: Crearlo. En la primera ejecucion, si no hay usuarios, el wizard crea el admin.

4. **¿Para offline, usar localStorage o IndexedDB?**
   - Recomendacion: IndexedDB. localStorage tiene limite de 5MB y es sincrono. IndexedDB es mejor para colas de operaciones.
