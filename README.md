# 💰 Sistema POS (Punto de Venta)

Sistema de punto de venta rápido, robusto y completamente local. Diseñado para funcionar en GitHub Codespaces y ser fácil de actualizar.

## ✨ Características

- ✅ **100% Local**: Base de datos SQLite, sin dependencias cloud
- 🚀 **Rápido**: Node.js + Express, sin frameworks pesados
- 🔒 **Seguro**: Autenticación con bcrypt, sesiones y middleware de protección
- 💻 **Codespaces Ready**: Funciona perfectamente en GitHub Codespaces
- 🔄 **Fácil de actualizar**: Solo `git pull` y listo
- 🎨 **Interfaz Moderna**: Dashboard responsive con navegación intuitiva
- 📊 **Estadísticas Avanzadas**: Total en caja, ventas por cajero, alertas de stock

## 🛠️ Instalación

### En GitHub Codespaces

1. Abre este repositorio en Codespaces
2. Instala dependencias:
```bash
npm install
```

3. Inicia el servidor:
```bash
npm start
```

4. Abre el puerto 3000 en tu navegador

### Local

1. Clona el repositorio:
```bash
git clone https://github.com/KAizuto846/pos-system.git
cd pos-system
```

2. Instala dependencias:
```bash
npm install
```

3. Inicia el servidor:
```bash
npm start
```

4. Abre http://localhost:3000

## 📚 Estructura del Proyecto

```
pos-system/
├── constants/
│   ├── roles.js              # Constantes de roles (ADMIN, CASHIER)
│   └── orderStatus.js        # Constantes de estados de pedidos
├── middleware/
│   └── auth.js               # requireAuth y requireRole middleware
├── routes/
│   ├── auth.routes.js        # Login, logout, sesión, crear admin
│   ├── users.routes.js       # CRUD de usuarios
│   ├── suppliers.routes.js   # CRUD de proveedores
│   ├── departments.routes.js # CRUD de departamentos
│   ├── paymentMethods.routes.js # CRUD de formas de pago
│   ├── products.routes.js    # CRUD de productos, stock, importación
│   ├── sales.routes.js       # Registro de ventas
│   ├── returns.routes.js     # Devoluciones
│   ├── reports.routes.js     # Reportes y analíticas
│   └── supplierOrders.routes.js # Pedidos a proveedores
├── database/
│   ├── init.js               # Inicialización de SQLite
│   └── pos.db                # Base de datos (auto-generada)
├── public/
│   ├── index.html            # Interfaz de login
│   ├── login.js              # Lógica del login
│   ├── styles.css            # Estilos del login
│   ├── dashboard.html        # Dashboard principal
│   ├── dashboard.css         # Estilos del dashboard
│   ├── sidebar-pedidos.js    # Barra lateral de pedidos (IIFE)
│   └── js/
│       ├── state.js          # Estado global de la aplicación
│       ├── utils.js          # Utilidades (showNotification, etc.)
│       ├── api.js            # Cliente API centralizado (apiFetch, apiGet, apiPost)
│       ├── dashboard.js      # Estadísticas del dashboard
│       ├── pos.js            # Punto de venta
│       ├── products.js       # Gestión de productos
│       ├── users.js          # Gestión de usuarios
│       ├── suppliers.js      # Gestión de proveedores
│       ├── departments.js    # Gestión de departamentos
│       ├── paymentMethods.js # Gestión de formas de pago
│       ├── reports.js        # Reportes y analíticas
│       ├── returns.js        # Devoluciones
│       ├── quickEntry.js     # Alta rápida de productos
│       └── app.js            # Inicialización, navegación, auth
├── server.js                 # Entry point (Express setup + montaje de rutas)
├── config.js                 # Configuración del servidor
├── package.json
└── README.md
```

## 📝 Uso

### Primera Vez

1. Al abrir la aplicación por primera vez, se te pedirá crear un administrador
2. Ingresa un usuario y contraseña (mínimo 6 caracteres)
3. El administrador quedará guardado en la base de datos local

### Dashboard

Después de iniciar sesión, tendrás acceso a:

#### 📊 Dashboard Principal
- **Estadísticas en tiempo real**: usuarios, productos, ventas del día, ingresos
- **Total en caja**: suma solo de métodos de pago que afectan caja (efectivo)
- **Ventas por cajero**: desglose de ventas y totales por cada usuario
- **Alertas de stock**: productos con stock bajo o mínimo
- **Accesos rápidos**: botones directos a módulos principales

#### 👥 Usuarios
- CRUD completo de usuarios
- Roles: Administrador y Cajero
- Control de estado (activo/inactivo)
- Cambio de contraseña
- Búsqueda de usuarios

#### 💳 Formas de Pago
- CRUD completo de métodos de pago
- **Nuevo**: Campo "Afecta Caja" para distinguir efectivo de otros métodos
- Control de estado activo/inactivo
- Ejemplos: Efectivo (afecta caja), Tarjeta (no afecta), Transferencia (no afecta)

#### 📦 Líneas (Proveedores)
- CRUD completo de proveedores
- Datos de contacto: nombre, teléfono, email, dirección
- Control de estado

#### 🏷️ Departamentos
- CRUD completo de departamentos/categorías
- Organización de productos
- Descripción opcional

#### 📎 Productos (NUEVO)
- **CRUD completo** de productos
- Código de barras único
- Precio de venta y costo
- **Control de inventario**: stock actual y stock mínimo
- **Ajuste de stock**: agregar o restar unidades fácilmente
- Asignación a departamentos y proveedores
- **Alertas visuales**: productos con stock bajo se resaltan
- Búsqueda de productos
- Estado activo/inactivo

#### 🛒 Ventas (POS)
- Próximamente

## 🔄 Actualización

Para actualizar a la última versión:

```bash
git pull origin main
npm install  # Solo si hay nuevas dependencias
```

**Nota**: La base de datos está en `.gitignore`, por lo que tus datos NO se sobrescribirán al actualizar.

## 📦 API Endpoints

### Autenticación (Públicas)
- `GET /api/check-admin` - Verifica si existe administrador
- `POST /api/create-admin` - Crea el primer administrador
- `POST /api/login` - Inicia sesión
- `POST /api/logout` - Cierra sesión
- `GET /api/session` - Verifica sesión actual

### Estadísticas (Protegida)
- `GET /api/stats` - Estadísticas del dashboard (usuarios, productos, ventas, ingresos, total en caja, stock bajo, ventas por cajero)

### Usuarios (Protegidas)
- `GET /api/users` - Lista todos los usuarios
- `POST /api/users/create` - Crea un nuevo usuario
- `POST /api/users/update` - Actualiza un usuario existente
- `POST /api/users/delete` - Elimina un usuario

### Formas de Pago (Protegidas)
- `GET /api/payment-methods` - Lista formas de pago
- `POST /api/payment-methods/create` - Crea nueva forma de pago
- `POST /api/payment-methods/update` - Actualiza forma de pago
- `POST /api/payment-methods/delete` - Elimina forma de pago

### Proveedores (Protegidas)
- `GET /api/suppliers` - Lista proveedores
- `POST /api/suppliers/create` - Crea nuevo proveedor
- `POST /api/suppliers/update` - Actualiza proveedor
- `POST /api/suppliers/delete` - Elimina proveedor

### Departamentos (Protegidas)
- `GET /api/departments` - Lista departamentos
- `POST /api/departments/create` - Crea nuevo departamento
- `POST /api/departments/update` - Actualiza departamento
- `POST /api/departments/delete` - Elimina departamento

### Productos (Protegidas - NUEVO)
- `GET /api/products` - Lista todos los productos con relaciones
- `GET /api/products/search?q=` - Búsqueda de productos por nombre o código
- `POST /api/products/create` - Crea nuevo producto
- `POST /api/products/update` - Actualiza producto
- `POST /api/products/delete` - Elimina producto
- `POST /api/products/adjust-stock` - Ajusta el stock de un producto

## 👨‍💻 Tecnologías

- **Backend**: Node.js + Express
- **Base de datos**: SQLite (better-sqlite3)
- **Seguridad**: bcrypt + express-session + middleware de autenticación
- **Frontend**: HTML5 + CSS3 + JavaScript Vanilla (sin frameworks)

## 🏗️ Arquitectura

### Backend
- **Entry point** (`server.js`): Configuración de Express, sesiones, middleware y montaje de rutas
- **Rutas** (`routes/`): Cada dominio tiene su propio archivo de rutas con validaciones y lógica de negocio
- **Middleware** (`middleware/auth.js`): `requireAuth` verifica sesión activa; `requireRole(...roles)` restringe por rol
- **Constantes** (`constants/`): Roles y estados de pedidos centralizados, eliminando strings hardcodeados

### Frontend
- **Sin frameworks ni bundler**: Vanilla JS con funciones globales en `window`
- **Módulos** (`public/js/`): El monolítico `dashboard.js` fue dividido en 13 módulos especializados
- **API centralizada** (`public/js/api.js`): `apiFetch`, `apiGet` y `apiPost` reemplazan todas las llamadas `fetch()` directas, con manejo de errores consistente
- **Estado global** (`public/js/state.js`): Objeto mutable `state` compartido entre módulos
- **Carga por scripts**: `dashboard.html` carga los módulos en orden de dependencia (state → utils → api → módulos → app)

## 🔐 Seguridad

- **Middleware de autenticación**: Todas las rutas protegidas requieren sesión activa
- Contraseñas hasheadas con bcrypt (10 rounds)
- Sesiones seguras con express-session
- Validaciones en cliente y servidor
- Control de acceso por roles
- Usuarios inactivos no pueden iniciar sesión
- Protección contra eliminación del propio usuario
- Base de datos local protegida

## 📊 Base de Datos

### Tablas Principales

- **users**: Usuarios del sistema (admin, cajero)
  - id, username, password, role, active, created_at
  
- **payment_methods**: Métodos de pago disponibles
  - id, name, **affects_cash** (nuevo), active, created_at
  
- **suppliers**: Proveedores de productos
  - id, name, contact, phone, email, address, active, created_at
  
- **departments**: Departamentos/categorías
  - id, name, description, active, created_at
  
- **products**: Catálogo de productos
  - id, name, barcode, price, cost, stock, min_stock, department_id, supplier_id, active, created_at, updated_at
  
- **sales**: Registro de ventas
  - id, total, payment_method_id, user_id, created_at
  
- **sale_items**: Detalle de cada venta
  - id, sale_id, product_id, quantity, price

### Índices para Rendimiento
- idx_products_barcode
- idx_products_department
- idx_products_supplier
- idx_products_active
- idx_sales_date
- idx_sales_user
- idx_sales_payment

## 🛣️ Checklist de Progreso

### ✅ Fase 1 - Fundación (100%)
- [x] Repositorio creado
- [x] Estructura base del proyecto
- [x] Base de datos SQLite configurada
- [x] Sistema de autenticación
- [x] Interfaz de login responsive
- [x] Detección de primer administrador
- [x] API de autenticación
- [x] Configuración para Codespaces
- [x] Middleware de protección de rutas

### ✅ Fase 2 - Dashboard (100%)
- [x] Página principal del dashboard
- [x] Navegación entre módulos
- [x] Estadísticas básicas
- [x] Gestión de usuarios (CRUD completo)
- [x] Control de permisos por rol
- [x] Gestión de formas de pago (CRUD)
- [x] Líneas/Proveedores (CRUD)
- [x] Departamentos (CRUD)
- [x] Interfaz moderna y responsive
- [x] Sistema de modales
- [x] Notificaciones de éxito/error
- [x] **Total en caja** (solo métodos que afectan caja)
- [x] **Ventas por cajero** (desglose diario)

### ✅ Fase 3 - Productos (100%)
- [x] CRUD completo de productos
- [x] Búsqueda por código de barras y nombre
- [x] Asignación de departamento y proveedor
- [x] Control de stock
- [x] Alertas de stock mínimo (visuales y estadísticas)
- [x] Ajuste rápido de stock
- [x] Gestión de precios (costo/venta)
- [x] Validación de códigos únicos
- [x] Relaciones con departamentos y proveedores

### 🔄 Fase 4 - Ventas (PENDIENTE)
- [ ] Interfaz de punto de venta
- [ ] Carrito de compra
- [ ] Búsqueda rápida de productos
- [ ] Selección de forma de pago
- [ ] Cálculo automático de totales
- [ ] Registro de ventas en BD
- [ ] Actualización automática de inventario
- [ ] Historial de ventas
- [ ] Impresión de tickets

### 📅 Fase 5 - Reportes (PENDIENTE)
- [ ] Ventas por día/semana/mes
- [ ] Productos más vendidos
- [ ] Reporte de inventario
- [ ] Historial completo
- [ ] Exportar reportes a CSV
- [ ] Gráficas y visualizaciones
- [ ] Comparativa de cajeros

### 🔧 Fase 6 - Mejoras (PENDIENTE)
- [ ] Respaldo de base de datos
- [ ] Restauración de respaldos
- [ ] Temas claro/oscuro
- [ ] Atajos de teclado
- [ ] Múltiples cajas/tiendas
- [ ] App móvil (PWA)
- [ ] Sistema de descuentos
- [ ] Clientes frecuentes

## 🎓 Novedades de la Última Versión

### ✨ Fase 3 - Productos Completada

**Módulo de Productos**
- ✅ CRUD completo con validaciones
- ✅ Códigos de barras únicos
- ✅ Control de inventario (stock actual vs mínimo)
- ✅ Ajuste rápido de stock con botón dedicado
- ✅ Alertas visuales para productos con stock bajo
- ✅ Relación con departamentos y proveedores
- ✅ Búsqueda en tiempo real

**Mejoras en Formas de Pago**
- ✅ Campo "Afecta Caja" para diferenciar efectivo de otros métodos
- ✅ Visualización clara del comportamiento de cada método

**Estadísticas Mejoradas**
- ✅ **Total en Caja**: Suma solo de ventas en efectivo o métodos que afectan caja
- ✅ **Ventas por Cajero**: Tabla con número de ventas y total por cada cajero del día
- ✅ **Productos con Stock Bajo**: Contador de productos en alerta
- ✅ Dashboard más informativo y útil

**Seguridad**
- ✅ Middleware de autenticación en todas las rutas protegidas
- ✅ Protección mejorada contra accesos no autorizados

## 👥 Autor

**Victor Rivera** - [KAizuto846](https://github.com/KAizuto846)

## 📝 Licencia

MIT License - Puedes usar este proyecto libremente

---

🚀 **Desarrollado con velocidad, robustez y seguridad en mente**

📊 **Fase 3 completada - Sistema de productos e inventario totalmente funcional**
