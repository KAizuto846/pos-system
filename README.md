# 🏪 POS System — Sistema de Punto de Venta

[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat&logo=next.js&logoColor=white)](https://nextjs.org/)
[![Prisma](https://img.shields.io/badge/Prisma-5-2D3748?style=flat&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat&logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![Electron](https://img.shields.io/badge/Electron-47848F?style=flat&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![PWA](https://img.shields.io/badge/PWA-5A0FC8?style=flat&logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)
[![MIT License](https://img.shields.io/badge/License-MIT-green?style=flat)](LICENSE)

Sistema de **Punto de Venta (POS)** moderno, rápido y robusto construido con **Next.js 16** y **TypeScript**, empaquetado como **aplicación de escritorio (Electron)** para Windows y Linux. Diseñado para pequeñas y medianas empresas que necesitan una solución completa de gestión de ventas, inventario, proveedores y reportes, con **sincronización P2P entre dispositivos** funcionando en la misma red local — sin servidor central.

> 🌐 **Idioma:** Español  
> 🖥️ **Escritorio:** Aplicación Electron auto-instalable con actualizaciones automáticas  
> 📱 **PWA:** Instalable como aplicación nativa en dispositivos móviles y de escritorio  
> 🔄 **Sincronización P2P:** Todos los equipos son pares iguales; cada uno guarda su propia base de datos y comparten cambios automaticamente  
> 🔒 **Autenticación:** Segura con NextAuth + credenciales encriptadas

---

## ✨ Características

- 🛒 **Punto de Venta (POS)** — Interfaz rápida para registrar ventas con búsqueda de productos y carrito en tiempo real
- 🔄 **Sincronización P2P** — Cada equipo ejecuta su propia base de datos y se sincroniza de igual a igual (malla) cada 30 segundos via UDP discovery + HTTP pull/push; página dedicada de "Sincronización" en la barra lateral
- 📦 **Gestión de Productos** — CRUD completo con control de stock y precio por producto
- 🏷️ **Departamentos** — Organización de productos por categorías
- 🤝 **Proveedores** — Administración de contactos y órdenes de compra
- 📋 **Órdenes a Proveedores** — Creación, envío y recepción parcial de pedidos
- 👥 **Clientes** — Gestión de clientes con niveles (Bronce/Plata/Oro)
- 💳 **Métodos de Pago** — Configuración flexible (efectivo, tarjeta, transferencia, etc.)
- 👥 **Usuarios y Roles** — Sistema de autenticación con roles (ADMIN / CASHIER)
- 🏦 **Finanzas** — Entradas y salidas de caja
- 📊 **Reportes y Estadísticas** — Dashboard con métricas de ventas, productos más vendidos y tendencias
- 🖥️ **Electron** — Aplicación nativa con actualizaciones automáticas desde GitHub Releases
- 🎨 **Interfaz Moderna** — UI con TailwindCSS 4, shadcn/ui y modo oscuro

---

## 🛠️ Stack Tecnológico

| Tecnología | Versión | Propósito |
|---|---|---|
| **TypeScript** | ^5 | Tipado estático y seguridad en el código |
| **Next.js** | 16.2.6 | Framework React full-stack con App Router (`output: standalone`) |
| **Electron** | — | Shell + proceso principal (UDP discovery, P2P sync, updater, bandeja) |
| **Prisma** | ^5.22.0 | ORM con esquema declarativo |
| **SQLite** | — | Base de datos embebida sin servidor (WAL), una DB por equipo |
| **TailwindCSS** | ^4 | Framework de estilos utilitario |
| **shadcn/ui** | — | Componentes de UI reutilizables y accesibles |
| **Zustand** | ^5.0.13 | Estado global ligero para el carrito POS |
| **NextAuth** | ^5.0.0-beta.31 | Autenticación con JWT y adaptador Prisma |
| **TanStack Query** | ^5.100.10 | Fetching y caché de datos del servidor |
| **Recharts** | ^3.8.1 | Gráficos y visualizaciones para reportes |
| **electron-builder** | ^26 | Empaquetado NSIS (Windows) y AppImage/deb (Linux) |

---

## 🚀 Inicio Rápido

### Requisitos previos

- **Node.js** 20 o superior
- **npm** 10 o superior

### Ejecutar la aplicación de escritorio (recomendado)

Descarga el instalador `.exe` desde los **GitHub Releases** del proyecto. La aplicación gestiona su propia instancia de Next.js, su base de datos y la sincronización P2P.

### Instalación local (desarrollo)

```bash
git clone https://github.com/KAizuto846/pos-system.git
cd pos-system
npm install
npx prisma migrate deploy
npm run dev
```

La aplicación web estará disponible en [http://localhost:3000](http://localhost:3000).

### Variables de entorno

Copia el archivo de ejemplo y ajústalo:

```bash
cp .env.example .env
```

Variables disponibles:

| Variable | Descripción | Ejemplo |
|---|---|---|
| `AUTH_SECRET` | Secreto para cifrar sesiones JWT | `cambiar-por-un-secreto-seguro` |
| `DATABASE_URL` | Ruta al archivo SQLite | `file:./prisma/dev.db` |
| `AUTH_URL` | URL base para autenticación | `http://localhost:3000` |
| `NEXT_PUBLIC_APP_URL` | URL pública de la app | `http://localhost:3000` |
| `SYNC_SECRET` | (Opcional) Secreto compartido para sincronización P2P | `mi-secreto-sync` |

---

## 🔄 Sincronización P2P

El sistema usa **sincronización entre pares (P2P mesh)** de igual a igual, sin servidor central ni "PC proveedora". Cada dispositivo (Electron o PWA) ejecuta su propia instancia de Next.js y su propia base de datos SQLite.

1. **Descubrimiento:** cada equipo anuncia su presencia por **UDP multicast/broadcast** en el puerto `9876` (mensaje `pos-server-announce` con nombre, puerto y `deviceId`).
2. **Sync automatico:** cada **30 segundos** el proceso principalmente Electron recorre los pares descubiertos y hace `pull/push` bidireccional de cambios via HTTP (`/api/sync/pull` y `/api/sync/push`).
3. **Cursors:** cada par trackea el mayor `syncVersion` recibido/enviado (`pullSince`/`pushSince`) para solo transferir lo nuevo y hacer **acks** que eviten reenvíos.
4. **Conflictos:** Last-Write-Wins por timestamp. Los CREATE se re-aplican de forma idempotente.
5. **Página de control:** en la barra lateral → **Sincronización** puedes ver los dispositivos detectados, forzar un sync manual (bandeja o botón), y consultar el registro de cambios.

> 💡 Todos los equipos deben estar en la misma red local (o con UDP habilitado). La sincronización no requiere configuración manual: se detectan solos.

---

## 📁 Estructura del Proyecto

```
pos-system/
├── prisma/
│   ├── migrations/            # Migraciones Prisma
│   └── schema.prisma          # Esquema de base de datos
├── electron/
│   ├── main.js                # Proceso principal (UDP discovery, P2P sync, updater)
│   ├── preload.js             # Context bridge
│   ├── updater.js             # Auto-updates (electron-updater)
│   ├── init-db.js             # Creación/actualización de la DB en primer arranque
│   ├── setup.html             # Wizard de configuración inicial
│   ├── loading.html           # Pantalla de carga
│   └── nsis/                  # Instalador NSIS
├── public/
│   ├── icons/                 # Iconos para PWA y app
│   └── manifest.json          # Manifiesto de PWA
├── scripts/
│   ├── build-electron.js      # Build Electron
│   └── create-icon.js         # Generador de iconos .ico/.bmp
├── src/
│   ├── app/
│   │   ├── (auth)/            # Layout de páginas de autenticación
│   │   ├── (dashboard)/       # Layout + páginas del dashboard
│   │   │   ├── page.tsx       # Dashboard principal
│   │   │   ├── customers/     # Clientes
│   │   │   ├── departments/   # Departamentos
│   │   │   ├── finance/       # Finanzas
│   │   │   ├── importar/      # Importar datos
│   │   │   ├── orders/        # Órdenes a proveedores
│   │   │   ├── payment-methods/ # Métodos de pago
│   │   │   ├── pos/           # Punto de venta
│   │   │   ├── products/      # Productos
│   │   │   ├── reports/       # Reportes
│   │   │   ├── sales/         # Ventas
│   │   │   ├── suppliers/     # Proveedores
│   │   │   ├── sync/          # Sincronización P2P
│   │   │   └── users/         # Usuarios
│   │   ├── api/
│   │   │   ├── auth/          # NextAuth + registro
│   │   │   ├── sync/          # P: pull, push, ack, stats
│   │   │   ├── events/        # SSE (tiempo real)
│   │   │   └── ...            # CRUD de cada módulo
│   │   ├── layout.tsx         # Layout raíz
│   │   ├── login/             # Login
│   │   ├── register/          # Registro
│   │   ├── settings/          # Configuración
│   │   └── setup/             # Setup inicial
│   ├── components/
│   │   ├── layout/            # Header + Sidebar
│   │   ├── ui/                # Componentes shadcn/ui
│   │   ├── RealtimeProvider.tsx
│   │   ├── SyncStatusBadge.tsx
│   │   ├── UpdateNotification.tsx
│   │   └── ...
│   └── lib/
│       ├── auth.ts            # Configuración de NextAuth
│       ├── prisma.ts / db.ts  # Cliente Prisma singleton (con PRAGMAs SQLite)
│       ├── sync-engine.ts     # Log, pull/push, LWW, cursor
│       ├── broadcast.ts       # SSE broadcaster
│       └── utils.ts           # Utilidades
├── .github/workflows/release.yml # CI: build + auto-release Windows
├── package.json
└── deploy.sh                  # Script de deploy (build + tag)
```

---

## 📡 API Endpoints

### 🔐 Autenticación

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/auth/register` | Registrar un nuevo usuario |
| `*` | `/api/auth/[...nextauth]` | Rutas de NextAuth (login, logout, sesión) |

### 👥 Usuarios

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/users` | Listar todos los usuarios |
| `POST` | `/api/users` | Crear un nuevo usuario |
| `GET` | `/api/users/[id]` | Obtener un usuario por ID |
| `PUT` | `/api/users/[id]` | Actualizar un usuario |
| `DELETE` | `/api/users/[id]` | Eliminar un usuario |

### 📦 Productos

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/products` | Listar productos (filtro por departamento, búsqueda) |
| `POST` | `/api/products` | Crear un nuevo producto |
| `GET` | `/api/products/[id]` | Obtener un producto por ID |
| `PUT` | `/api/products/[id]` | Actualizar un producto |
| `DELETE` | `/api/products/[id]` | Eliminar un producto |
| `PUT` | `/api/products/[id]/stock` | Actualizar el stock de un producto |

### 🏷️ Departamentos

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/departments` | Listar todos los departamentos |
| `POST` | `/api/departments` | Crear un nuevo departamento |
| `GET` | `/api/departments/[id]` | Obtener un departamento por ID |
| `PUT` | `/api/departments/[id]` | Actualizar un departamento |
| `DELETE` | `/api/departments/[id]` | Eliminar un departamento |

### 🤝 Proveedores

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/suppliers` | Listar todos los proveedores |
| `POST` | `/api/suppliers` | Crear un nuevo proveedor |
| `GET` | `/api/suppliers/[id]` | Obtener un proveedor por ID |
| `PUT` | `/api/suppliers/[id]` | Actualizar un proveedor |
| `DELETE` | `/api/suppliers/[id]` | Eliminar un proveedor |

### 💳 Métodos de Pago

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/payment-methods` | Listar todos los métodos de pago |
| `POST` | `/api/payment-methods` | Crear un nuevo método de pago |
| `GET` | `/api/payment-methods/[id]` | Obtener un método por ID |
| `PUT` | `/api/payment-methods/[id]` | Actualizar un método de pago |
| `DELETE` | `/api/payment-methods/[id]` | Eliminar un método de pago |

### 🛒 Ventas

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/sales` | Listar ventas (filtro por fecha) |
| `POST` | `/api/sales` | Registrar una nueva venta |
| `GET` | `/api/sales/[id]` | Obtener una venta por ID con sus items |
| `DELETE` | `/api/sales/[id]` | Anular una venta |

### 📋 Órdenes a Proveedores

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/orders` | Listar todas las órdenes |
| `POST` | `/api/orders` | Crear una nueva orden |
| `GET` | `/api/orders/[id]` | Obtener una orden por ID |
| `PUT` | `/api/orders/[id]` | Actualizar una orden |
| `DELETE` | `/api/orders/[id]` | Eliminar una orden |
| `PUT` | `/api/orders/[id]/receive` | Recibir productos de una orden (parcial/total) |

### 🔄 Sincronización P2P

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/sync/pull` | Obtener cambios de un peer (filtro `since`) |
| `POST` | `/api/sync/push` | Aplicar cambios de un peer |
| `POST` | `/api/sync/ack` | Marcar cambios locales como recibidos por un peer |
| `GET` | `/api/sync/stats` | Estadísticas del log de sincronización |
| `GET` | `/api/sync` | Health check + stats de la DB |
| `GET` | `/api/events` | SSE: eventos en tiempo real (tabs del mismo equipo) |

### 📊 Reportes y Estadísticas

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/reports` | Reportes de ventas (rango de fechas) |
| `GET` | `/api/stats` | Estadísticas del dashboard (ventas hoy, productos bajos en stock, etc.) |

---

## 🖥️ Aplicación de Escritorio (Electron)

La versión de escritorio (Windows) es el principal objetivo del proyecto. Características:

- **Instalador único NSIS** — Asistente de instalación con configuración del negocio y puerto
- **Auto-update** — Se actualiza automáticamente desde los GitHub Releases (electron-updater)
- **Proceso principal** — Arranca el servidor Next.js standalone, gestiona la base de datos, el tray y la sincronización P2P
- **Bandeja del sistema** — Mostrar/ocultar la app, sincronizar ahora, reiniciar servidor, buscar actualizaciones, salir

### Desarrollo con Electron

```bash
npm run electron:dev        # Electron + Next.js en paralelo
```

### Build de la app

```bash
npm run build               # Build Next.js standalone
npm run electron:build      # Build Windows (NSIS + zip)
npm run electron:build:linux
```

La base de datos SQLite se guarda en `%APPDATA%/POS System/pos.db` (Windows) o `~/.config/POS System/pos.db` (Linux).

---

## 📦 Módulos

### 🛒 Punto de Venta (POS)
El módulo principal para registrar ventas. Incluye:
- Búsqueda de productos por nombre o código de barras
- Carrito de compras con estado global (Zustand)
- Ajuste de cantidades y eliminación de items
- Selección de método de pago
- Registro con descuento automático de stock

### 📦 Gestión de Productos
Administración completa del catálogo:
- Creación, edición y eliminación de productos
- Control de precio, costo y stock mínimo
- Asignación a departamentos y proveedores
- Actualización de stock manual o por recepción de órdenes

### 🤝 Proveedores y Órdenes
Gestión de la cadena de suministro:
- Registro de proveedores con datos de contacto
- Creación de órdenes de compra con múltiples items
- Envío de órdenes (cambio de estado a `sent`)
- Recepción parcial o total con actualización automática de stock

### 📊 Dashboard y Reportes
Panel de control con:
- Ventas del día, semana y mes
- Productos con bajo stock
- Ranking de productos más vendidos
- Métodos de pago más utilizados
- Gráficos interactivos (Recharts)

### 👥 Usuarios y Roles
Sistema de autenticación:
- Login con credenciales (username + contraseña)
- Roles: **ADMIN** (acceso completo) y **CASHIER** (solo POS y consultas)
- Registro de nuevos usuarios (solo administradores)
- Contraseñas encriptadas con bcrypt

---

## 📱 PWA (Progressive Web App)

Además de la app de escritorio, el proyecto es una **PWA**. Apunta un navegador a la dirección de cualquiera de tus equipos (p. ej. `http://192.168.1.50:3000`) y podrás instalarla como app nativa. Los datos se sincronizan vía el mismo protocolo P2P de los demás dispositivos.

### Características PWA

- 📲 **Instalable** — Agrega un acceso directo a tu pantalla de inicio
- 🚀 **Modo standalone** — Se abre sin la interfaz del navegador
- 🎨 **Iconos personalizados** — Iconos adaptables para todas las resoluciones

### Cómo instalar

**Escritorio (Chrome/Edge/Brave):**
1. Abre la aplicación en el navegador
2. Haz clic en el icono de instalación en la barra de direcciones
3. Confirma la instalación

**Móvil (Android - Chrome):**
1. Abre la aplicación
2. Presiona el menú (tres puntos)
3. Selecciona "Instalar aplicación" o "Agregar a pantalla de inicio"

**iOS (Safari):**
1. Abre la aplicación en Safari
2. Presiona el botón de compartir
3. Desplázate y selecciona "Agregar a pantalla de inicio"

---

## 🤝 Contribuciones

¡Las contribuciones son bienvenidas! Si deseas contribuir:

1. Haz un **fork** del repositorio
2. Crea una rama para tu funcionalidad (`git checkout -b feature/nueva-funcionalidad`)
3. Realiza tus cambios y haz commit (`git commit -m 'Añadir nueva funcionalidad'`)
4. Sube los cambios (`git push origin feature/nueva-funcionalidad`)
5. Abre un **Pull Request**

Por favor, asegúrate de que el código pasa las verificaciones de lint y TypeScript antes de enviar tu PR.

---

## 📄 Licencia

Este proyecto está bajo la licencia **MIT**. Consulta el archivo [LICENSE](LICENSE) para más detalles.

---

<div align="center">
  <sub>Construido con ❤️ usando <a href="https://nextjs.org">Next.js</a>, <a href="https://www.prisma.io">Prisma</a> y <a href="https://tailwindcss.com">TailwindCSS</a></sub>
  <br/>
  <sub>© 2026 POS System</sub>
</div>
