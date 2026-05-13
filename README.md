# 🏪 POS System — Sistema de Punto de Venta

[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat&logo=next.js&logoColor=white)](https://nextjs.org/)
[![Prisma](https://img.shields.io/badge/Prisma-5-2D3748?style=flat&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat&logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![PWA](https://img.shields.io/badge/PWA-5A0FC8?style=flat&logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)
[![MIT License](https://img.shields.io/badge/License-MIT-green?style=flat)](LICENSE)

Sistema de **Punto de Venta (POS)** moderno, rápido y robusto construido con **Next.js 16** y **TypeScript**. Diseñado para pequeñas y medianas empresas que necesitan una solución completa de gestión de ventas, inventario, proveedores y reportes, todo desde el navegador.

> 🌐 **Idioma:** Español  
> 📱 **PWA:** Instalable como aplicación nativa en dispositivos móviles y de escritorio  
> 🔒 **Autenticación:** Segura con NextAuth + credenciales encriptadas

---

## ✨ Características

- 🛒 **Punto de Venta (POS)** — Interfaz rápida para registrar ventas con búsqueda de productos y carrito en tiempo real
- 📦 **Gestión de Productos** — CRUD completo con control de stock y precio por producto
- 🏷️ **Departamentos** — Organización de productos por categorías
- 🤝 **Proveedores** — Administración de contactos y órdenes de compra
- 📋 **Órdenes a Proveedores** — Creación, envío y recepción parcial de pedidos
- 💳 **Métodos de Pago** — Configuración flexible (efectivo, tarjeta, transferencia, etc.)
- 👥 **Usuarios y Roles** — Sistema de autenticación con roles (ADMIN / CASHIER)
- 📊 **Reportes y Estadísticas** — Dashboard con métricas de ventas, productos más vendidos y tendencias
- 📱 **PWA** — Instalable en cualquier dispositivo, funciona offline parcialmente
- 🎨 **Interfaz Moderna** — UI con TailwindCSS 4, shadcn/ui y modo oscuro
- 🐳 **Docker** — Despliegue sencillo con contenedores

---

## 🛠️ Stack Tecnológico

| Tecnología | Versión | Propósito |
|---|---|---|
| **TypeScript** | ^5 | Tipado estático y seguridad en el código |
| **Next.js** | 16.2.6 | Framework React full-stack con App Router |
| **Prisma** | ^5.22.0 | ORM multibase de datos con esquema declarativo |
| **SQLite** | — | Base de datos embebida sin servidor |
| **TailwindCSS** | ^4 | Framework de estilos utilitario |
| **shadcn/ui** | — | Componentes de UI reutilizables y accesibles |
| **Zustand** | ^5.0.13 | Estado global ligero para el carrito POS |
| **NextAuth** | ^5.0.0-beta.31 | Autenticación con JWT y adaptador Prisma |
| **TanStack Query** | ^5.100.10 | Fetching y caché de datos del servidor |
| **Recharts** | ^3.8.1 | Gráficos y visualizaciones para reportes |
| **Docker** | — | Contenedorización y despliegue |
| **PWA** | — | Instalación como app nativa |

---

## 🚀 Inicio Rápido

### Requisitos previos

- **Node.js** 20 o superior
- **npm** 9 o superior

### Instalación local

```bash
git clone https://github.com/KAizuto846/pos-system.git
cd pos-system
npm install
npx prisma db push
npm run dev
```

La aplicación estará disponible en [http://localhost:3000](http://localhost:3000).

### Variables de entorno

Copia el archivo de ejemplo y ajústalo:

```bash
cp .env.example .env
```

Variables disponibles:

| Variable | Descripción | Ejemplo |
|---|---|---|
| `AUTH_SECRET` | Secreto para cifrar sesiones JWT | `cambiar-por-un-secreto-seguro` |
| `DATABASE_URL` | Ruta al archivo SQLite | `file:./dev.db` |
| `AUTH_URL` | URL base para autenticación | `http://localhost:3000` |
| `NEXT_PUBLIC_APP_URL` | URL pública de la app | `http://localhost:3000` |

---

## 📁 Estructura del Proyecto

```
pos-system-new/
├── prisma/
│   └── schema.prisma          # Esquema de base de datos
├── public/
│   ├── icons/                 # Iconos para PWA
│   ├── manifest.json          # Manifiesto de PWA
│   └── ...                    # Assets estáticos
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   └── layout.tsx     # Layout de páginas de autenticación
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx     # Layout del dashboard (sidebar + header)
│   │   │   ├── page.tsx       # Dashboard principal con estadísticas
│   │   │   ├── departments/   # Gestión de departamentos
│   │   │   ├── orders/        # Órdenes a proveedores
│   │   │   ├── payment-methods/ # Métodos de pago
│   │   │   ├── pos/           # Punto de venta
│   │   │   ├── products/      # Gestión de productos
│   │   │   ├── reports/       # Reportes y analíticas
│   │   │   ├── sales/         # Historial de ventas
│   │   │   ├── suppliers/     # Gestión de proveedores
│   │   │   └── users/         # Gestión de usuarios
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   ├── [...nextauth]/  # Rutas NextAuth
│   │   │   │   └── register/       # Registro de usuarios
│   │   │   ├── departments/   # CRUD departamentos
│   │   │   ├── orders/        # CRUD órdenes + recepción
│   │   │   ├── payment-methods/ # CRUD métodos de pago
│   │   │   ├── products/      # CRUD productos + stock
│   │   │   ├── reports/       # Endpoints de reportes
│   │   │   ├── sales/         # CRUD ventas
│   │   │   ├── stats/         # Estadísticas del dashboard
│   │   │   ├── suppliers/     # CRUD proveedores
│   │   │   └── users/         # CRUD usuarios
│   │   ├── layout.tsx         # Layout raíz
│   │   ├── login/page.tsx     # Página de inicio de sesión
│   │   ├── register/page.tsx  # Página de registro
│   │   └── page.tsx           # Página de inicio
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx     # Barra de navegación superior
│   │   │   └── Sidebar.tsx    # Menú lateral
│   │   ├── ui/                # Componentes shadcn/ui
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── input.tsx
│   │   │   ├── select.tsx
│   │   │   ├── table.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── label.tsx
│   │   │   ├── separator.tsx
│   │   │   ├── skeleton.tsx
│   │   │   ├── toast.tsx
│   │   │   └── command.tsx
│   │   └── SessionProvider.tsx
│   ├── lib/
│   │   ├── auth.ts            # Configuración de NextAuth
│   │   ├── db.ts              # Cliente Prisma singleton
│   │   ├── utils.ts           # Utilidades (cn, etc.)
│   │   └── validations.ts     # Esquemas Zod
│   └── store/
│       └── pos-store.ts       # Estado global Zustand (carrito POS)
├── Dockerfile                 # Construcción multi-etapa
├── docker-compose.yml         # Orquestación de contenedores
├── next.config.ts             # Configuración de Next.js
├── package.json
└── tsconfig.json
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

### 📊 Reportes y Estadísticas

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/reports` | Reportes de ventas (rango de fechas) |
| `GET` | `/api/stats` | Estadísticas del dashboard (ventas hoy, productos bajos en stock, etc.) |

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

## 🐳 Docker

### Requisitos
- Docker Engine 24+
- Docker Compose v2+

### Construcción y ejecución

```bash
# Construir y levantar el contenedor
docker compose up -d

# Ver los logs
docker compose logs -f

# Detener el contenedor
docker compose down
```

La aplicación estará disponible en [http://localhost:3000](http://localhost:3000).

### Variables de entorno para Docker

```bash
# Crear un archivo .env para Docker
cp .env.example .env

# Opcional: personalizar variables
AUTH_SECRET=mi-secreto-seguro
DATABASE_URL=file:./prisma/dev.db
AUTH_URL=http://localhost:3000
```

La base de datos SQLite se persiste en un volumen Docker (`pos-system-data`) para que los datos no se pierdan al reconstruir el contenedor.

### Construcción manual

```bash
docker build -t pos-system .
docker run -p 3000:3000 \
  -e AUTH_SECRET=mi-secreto \
  -e DATABASE_URL=file:./prisma/dev.db \
  -e AUTH_URL=http://localhost:3000 \
  pos-system
```

### Estructura del Dockerfile

El `Dockerfile` usa construcción **multi-etapa**:

1. **deps** — Instala dependencias de producción y sharp para optimización de imágenes
2. **builder** — Genera el cliente Prisma y compila la aplicación Next.js
3. **runner** — Imagen minimalista con el servidor standalone listo para ejecutarse

---

## 📱 PWA (Progressive Web App)

Esta aplicación es una **PWA completamente funcional**. Puedes instalarla en tu dispositivo como si fuera una app nativa.

### Características PWA

- 📲 **Instalable** — Agrega un acceso directo a tu pantalla de inicio
- 🚀 **Modo standalone** — Se abre sin la interfaz del navegador
- 🌙 **Tema oscuro** — Diseñada con modo oscuro nativo
- 🎨 **Iconos personalizados** — Iconos adaptables para todas las resoluciones
- ⚡ **Rápida** — Carga instantánea desde la caché del service worker

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
