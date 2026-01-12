# 💰 Sistema POS (Punto de Venta)

Sistema de punto de venta rápido, robusto y completamente local. Diseñado para funcionar en GitHub Codespaces y ser fácil de actualizar.

## ✨ Características

- ✅ **100% Local**: Base de datos SQLite, sin dependencias cloud
- 🚀 **Rápido**: Node.js + Express, sin frameworks pesados
- 🔒 **Seguro**: Autenticación con bcrypt y sesiones
- 💻 **Codespaces Ready**: Funciona perfectamente en GitHub Codespaces
- 🔄 **Fácil de actualizar**: Solo `git pull` y listo
- 🎨 **Interfaz Moderna**: Dashboard responsive con navegación intuitiva

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
├── database/
│   ├── init.js         # Inicialización de SQLite
│   └── pos.db          # Base de datos (auto-generada)
├── public/
│   ├── index.html      # Interfaz de login
│   ├── dashboard.html  # Dashboard principal
│   ├── dashboard.css   # Estilos del dashboard
│   ├── dashboard.js    # Lógica del dashboard
│   ├── styles.css      # Estilos del login
│   └── login.js        # Lógica del login
├── server.js           # Servidor Express + APIs REST
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

- **Dashboard**: Estadísticas en tiempo real y accesos rápidos
- **Usuarios**: CRUD completo de usuarios con roles (Admin/Cajero)
- **Formas de Pago**: Gestión de métodos de pago (Efectivo, Tarjeta, etc.)
- **Líneas (Proveedores)**: Administración de proveedores con datos de contacto
- **Departamentos**: Organización de productos por categorías
- **Productos**: Próximamente
- **Ventas (POS)**: Próximamente

## 🔄 Actualización

Para actualizar a la última versión:

```bash
git pull origin main
npm install  # Solo si hay nuevas dependencias
```

**Nota**: La base de datos está en `.gitignore`, por lo que tus datos NO se sobrescribirán al actualizar.

## 📦 API Endpoints

### Autenticación
- `GET /api/check-admin` - Verifica si existe administrador
- `POST /api/create-admin` - Crea el primer administrador
- `POST /api/login` - Inicia sesión
- `POST /api/logout` - Cierra sesión
- `GET /api/session` - Verifica sesión actual

### Estadísticas

- `GET /api/stats` - Obtiene estadísticas del dashboard

### Usuarios

- `GET /api/users` - Lista todos los usuarios
- `POST /api/users/create` - Crea un nuevo usuario
- `POST /api/users/update` - Actualiza un usuario existente
- `POST /api/users/delete` - Elimina un usuario

### Formas de Pago

- `GET /api/payment-methods` - Lista formas de pago
- `POST /api/payment-methods/create` - Crea nueva forma de pago
- `POST /api/payment-methods/update` - Actualiza forma de pago
- `POST /api/payment-methods/delete` - Elimina forma de pago

### Proveedores

- `GET /api/suppliers` - Lista proveedores
- `POST /api/suppliers/create` - Crea nuevo proveedor
- `POST /api/suppliers/update` - Actualiza proveedor
- `POST /api/suppliers/delete` - Elimina proveedor

### Departamentos

- `GET /api/departments` - Lista departamentos
- `POST /api/departments/create` - Crea nuevo departamento
- `POST /api/departments/update` - Actualiza departamento
- `POST /api/departments/delete` - Elimina departamento

## 👨‍💻 Tecnologías

- **Backend**: Node.js + Express
- **Base de datos**: SQLite (better-sqlite3)
- **Seguridad**: bcrypt + express-session
- **Frontend**: HTML5 + CSS3 + JavaScript Vanilla (sin frameworks)

## 🔐 Seguridad

- Contraseñas hasheadas con bcrypt (10 rounds)
- Sesiones seguras con express-session
- Validaciones en cliente y servidor
- Control de acceso por roles
- Usuarios inactivos no pueden iniciar sesión
- Base de datos local protegida

## 📊 Base de Datos

### Tablas Principales

- **users**: Usuarios del sistema (admin, cajero)
- **payment_methods**: Métodos de pago disponibles
- **suppliers**: Proveedores de productos
- **departments**: Departamentos/categorías
- **products**: Catálogo de productos
- **sales**: Registro de ventas
- **sale_items**: Detalle de cada venta

## 🛣️ Checklist de Progreso

### ✅ Fase 1 - Fundación (COMPLETADA)
- [x] Repositorio creado
- [x] Estructura base del proyecto
- [x] Base de datos SQLite configurada
- [x] Sistema de autenticación
- [x] Interfaz de login responsive
- [x] Detección de primer administrador
- [x] API de autenticación
- [x] Configuración para Codespaces

### ✅ Fase 2 - Dashboard (COMPLETADA)
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

### 🔄 Fase 3 - Productos (PENDIENTE)
- [ ] CRUD de productos
- [ ] Búsqueda por código de barras
- [ ] Asignación de departamento y proveedor
- [ ] Control de stock
- [ ] Alertas de stock mínimo
- [ ] Importación/exportación de productos
- [ ] Gestión de precios (costo/venta)

### 📅 Fase 4 - Ventas (PENDIENTE)
- [ ] Interfaz de punto de venta
- [ ] Carrito de compra
- [ ] Búsqueda rápida de productos
- [ ] Selección de forma de pago
- [ ] Cálculo automático de totales
- [ ] Registro de ventas en BD
- [ ] Actualización automática de inventario
- [ ] Historial de ventas

### 📊 Fase 5 - Reportes (PENDIENTE)
- [ ] Ventas por día/semana/mes
- [ ] Productos más vendidos
- [ ] Reporte de inventario
- [ ] Historial completo
- [ ] Exportar reportes a CSV
- [ ] Gráficas y visualizaciones

### 🔧 Fase 6 - Mejoras (PENDIENTE)
- [ ] Impresión de tickets
- [ ] Respaldo de base de datos
- [ ] Temas claro/oscuro
- [ ] Atajos de teclado
- [ ] Múltiples cajas/tiendas
- [ ] App móvil (PWA)

## 👥 Autor

**Victor Rivera** - [KAizuto846](https://github.com/KAizuto846)

## 📝 Licencia

MIT License - Puedes usar este proyecto libremente

---

🚀 **Desarrollado con velocidad y robustez en mente**
