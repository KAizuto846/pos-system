# Documentación del Sistema POS (Point of Sale)

**Fecha de Documentación:** 16 de enero de 2026  
**Autor del Proyecto:** Victor E.  
**Ubicación:** Magdalena, Jalisco, MX  
**Estado del Proyecto:** MVP (Producto Mínimo Viable)

---

## Tabla de Contenidos

1. [Descripción General del Proyecto](#descripción-general-del-proyecto)
2. [Requisitos Previos](#requisitos-previos)
3. [Estructura de Directorios](#estructura-de-directorios)
4. [Arquitectura del Sistema](#arquitectura-del-sistema)
5. [Documentación de Backend](#documentación-de-backend)
6. [Documentación de Frontend](#documentación-de-frontend)
7. [Base de Datos](#base-de-datos)
8. [Flujos de Trabajo Principales](#flujos-de-trabajo-principales)
9. [Guía de Instalación y Ejecución](#guía-de-instalación-y-ejecución)
10. [Problemas Conocidos y Soluciones](#problemas-conocidos-y-soluciones)
11. [Roadmap de Mejoras](#roadmap-de-mejoras)

---

## 1. Descripción General del Proyecto

El **Sistema POS** es una aplicación web para la gestión de punto de venta que permite:

- **Gestión de Pedidos:** Crear, modificar y eliminar pedidos en tiempo real
- **Gestión de Inventario:** Control de productos y su disponibilidad
- **Gestión de Proveedores:** Registro y administración de proveedores
- **Gestión de Usuarios:** Autenticación y control de acceso
- **Generación de Reportes:** Visualización de ventas, inventario y análisis
- **Interfaz Dinámina:** Dashboard interactivo con múltiples pestañas de funcionalidad

### Tecnologías Utilizadas

| Componente | Tecnología |
|-----------|-----------|
| **Backend** | Node.js + Express.js |
| **Base de Datos** | SQLite3 |
| **Frontend** | HTML5 + CSS3 + JavaScript (Vanilla) |
| **Autenticación** | Sessions (Express-session) |
| **Servidor** | HTTP local (puerto 3000) |

---

## 2. Requisitos Previos

### Software Requerido

```bash
- Node.js (v14 o superior)
- npm (Node Package Manager)
- Git (para control de versiones)
```

### Dependencias del Proyecto

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "sqlite3": "^5.1.6",
    "express-session": "^1.17.3",
    "body-parser": "^1.20.2"
  },
  "devDependencies": {
    "nodemon": "^2.0.20"
  }
}
```

### Instalación de Dependencias

```bash
npm install
```

---

## 3. Estructura de Directorios

```
proyecto-pos/
├── server.js                 # Archivo principal del backend
├── init.js                   # Inicializador de base de datos
├── dashboard.js              # Lógica principal del frontend
├── package.json              # Configuración de dependencias
├── package-lock.json         # Lock de versiones
├── pos.db                    # Base de datos SQLite
├── .gitignore               # Archivos ignorados por Git
└── README.md                # Información general del proyecto
```

### Descripción de Archivos Clave

| Archivo | Propósito | Tipo |
|---------|----------|------|
| `server.js` | Servidor Express, rutas API, lógica de negocio | Backend |
| `init.js` | Creación y población inicial de base de datos | Backend |
| `dashboard.js` | Interfaz de usuario, manejo de eventos, renderizado | Frontend |
| `pos.db` | Base de datos SQLite con todas las tablas | Base de Datos |

---

## 4. Arquitectura del Sistema

### Diagrama de Capas

```
┌─────────────────────────────────────────────────────────┐
│          CAPA DE PRESENTACIÓN (Frontend)                │
│  - dashboard.js (HTML dinámico renderizado)             │
│  - Eventos del usuario (clicks, inputs)                 │
│  - Renderizado de tablas y formularios                  │
└──────────────────┬──────────────────────────────────────┘
                   │ Solicitudes HTTP (fetch API)
                   ▼
┌─────────────────────────────────────────────────────────┐
│          CAPA DE LÓGICA DE NEGOCIO (Backend)            │
│  - server.js (Express.js)                               │
│  - Rutas API (/api/*)                                   │
│  - Validación de datos                                  │
│  - Autenticación y autorización                         │
└──────────────────┬──────────────────────────────────────┘
                   │ Consultas SQL
                   ▼
┌─────────────────────────────────────────────────────────┐
│          CAPA DE DATOS (Base de Datos)                  │
│  - SQLite3 (pos.db)                                     │
│  - Tablas: usuarios, productos, pedidos, etc.          │
│  - Persistencia de datos                                │
└─────────────────────────────────────────────────────────┘
```

### Flujo de Datos

```
Usuario interactúa → dashboard.js detecta evento
                        ↓
                fetch() envía solicitud HTTP
                        ↓
                server.js recibe la solicitud
                        ↓
                Valida y procesa datos
                        ↓
                Ejecuta consulta SQL en pos.db
                        ↓
                Retorna JSON con respuesta
                        ↓
                dashboard.js recibe respuesta
                        ↓
                Actualiza interfaz dinámicamente
```

---

## 5. Documentación de Backend

### 5.1 Archivo: `server.js`

**Propósito:** Servidor Express que maneja todas las rutas API y lógica de negocio.

#### Configuración Inicial

```javascript
const express = require('express');
const sqlite3 = require('sqlite3');
const session = require('express-session');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;
const db = new sqlite3.Database('./pos.db');
```

**Variables Clave:**
- `app`: Instancia de Express
- `PORT`: Puerto de ejecución (3000)
- `db`: Conexión a base de datos SQLite

#### Middleware

```javascript
// Body parser para JSON
app.use(bodyParser.json());

// Sesiones
app.use(session({
  secret: 'pos-secret-key-very-secure-string-2026',
  resave: false,
  saveUninitialized: true
}));

// Archivos estáticos
app.use(express.static('public'));
```

**Explicación:**
- `bodyParser.json()`: Convierte el body de las solicitudes a JSON
- `session`: Maneja autenticación de usuarios
- `express.static()`: Sirve archivos HTML/CSS/JS estáticos

#### Rutas Principales

##### 1. **GET `/` - Página Principal**

```javascript
app.get('/', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  res.sendFile(__dirname + '/index.html');
});
```

**Flujo:**
- Verifica si el usuario está autenticado (`req.session.userId`)
- Si NO está autenticado → redirige a login
- Si SÍ está autenticado → envía el archivo `index.html`

---

##### 2. **POST `/api/login` - Autenticación**

```javascript
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  // Consulta usuario en base de datos
  db.get('SELECT * FROM usuarios WHERE username = ? AND password = ?',
    [username, password],
    (err, user) => {
      if (err || !user) {
        return res.json({ success: false, message: 'Credenciales inválidas' });
      }
      
      // Establece sesión
      req.session.userId = user.id;
      req.session.username = user.username;
      res.json({ success: true, message: 'Login exitoso' });
    }
  );
});
```

**Parámetros de Entrada:**
- `username` (string): Nombre de usuario
- `password` (string): Contraseña

**Respuesta:**
```json
{
  "success": true/false,
  "message": "Descripción del resultado"
}
```

**Lógica:**
1. Recibe credenciales del frontend
2. Busca en tabla `usuarios` coincidencia exacta
3. Si NO existe → retorna error
4. Si SÍ existe → crea sesión y retorna éxito

---

##### 3. **GET `/api/pedidos` - Obtener Pedidos**

```javascript
app.get('/api/pedidos', (req, res) => {
  db.all('SELECT * FROM pedidos ORDER BY fecha DESC', (err, rows) => {
    if (err) {
      return res.json({ success: false, error: err.message });
    }
    res.json({ success: true, data: rows });
  });
});
```

**Respuesta:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "numero": "PED-001",
      "cliente": "Juan Pérez",
      "total": 150.00,
      "fecha": "2026-01-16",
      "estado": "completado"
    }
  ]
}
```

**Lógica:**
1. Consulta tabla `pedidos`
2. Ordena por fecha descendente (más recientes primero)
3. Retorna array de pedidos

---

##### 4. **POST `/api/pedidos` - Crear Pedido**

```javascript
app.post('/api/pedidos', (req, res) => {
  const { numero, cliente, items, total } = req.body;
  
  db.run(
    'INSERT INTO pedidos (numero, cliente, items, total, fecha, estado) VALUES (?, ?, ?, ?, DATE("now"), ?)',
    [numero, cliente, JSON.stringify(items), total, 'pendiente'],
    function(err) {
      if (err) {
        return res.json({ success: false, error: err.message });
      }
      res.json({ success: true, id: this.lastID });
    }
  );
});
```

**Parámetros de Entrada:**
```json
{
  "numero": "PED-001",
  "cliente": "Juan Pérez",
  "items": [
    { "producto_id": 1, "cantidad": 2, "precio": 50.00 }
  ],
  "total": 100.00
}
```

**Lógica:**
1. Valida datos recibidos
2. Inserta en tabla `pedidos`
3. Guarda items como JSON
4. Retorna ID del pedido creado

---

##### 5. **DELETE `/api/pedidos/:id` - Eliminar Pedido**

```javascript
app.delete('/api/pedidos/:id', (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM pedidos WHERE id = ?', [id], (err) => {
    if (err) {
      return res.json({ success: false, error: err.message });
    }
    res.json({ success: true, message: 'Pedido eliminado' });
  });
});
```

**Parámetro URL:**
- `id` (int): ID del pedido a eliminar

**Lógica:**
1. Extrae ID de la URL
2. Ejecuta DELETE en tabla `pedidos`
3. Retorna confirmación

---

##### 6. **GET `/api/productos` - Obtener Productos**

```javascript
app.get('/api/productos', (req, res) => {
  db.all('SELECT * FROM productos', (err, rows) => {
    if (err) {
      return res.json({ success: false, error: err.message });
    }
    res.json({ success: true, data: rows });
  });
});
```

**Respuesta:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "codigo": "PRD-001",
      "nombre": "Producto A",
      "precio": 50.00,
      "stock": 100,
      "categoria": "Electrónica"
    }
  ]
}
```

---

##### 7. **POST `/api/productos` - Crear Producto**

```javascript
app.post('/api/productos', (req, res) => {
  const { codigo, nombre, precio, stock, categoria, proveedor_id } = req.body;
  
  db.run(
    'INSERT INTO productos (codigo, nombre, precio, stock, categoria, proveedor_id) VALUES (?, ?, ?, ?, ?, ?)',
    [codigo, nombre, precio, stock, categoria, proveedor_id],
    function(err) {
      if (err) {
        return res.json({ success: false, error: err.message });
      }
      res.json({ success: true, id: this.lastID });
    }
  );
});
```

---

##### 8. **GET `/api/proveedores` - Obtener Proveedores**

```javascript
app.get('/api/proveedores', (req, res) => {
  db.all('SELECT * FROM proveedores', (err, rows) => {
    if (err) {
      return res.json({ success: false, error: err.message });
    }
    res.json({ success: true, data: rows });
  });
});
```

---

##### 9. **GET `/api/reportes/ventas` - Reporte de Ventas**

```javascript
app.get('/api/reportes/ventas', (req, res) => {
  db.all(
    'SELECT DATE(fecha) as fecha, COUNT(*) as cantidad, SUM(total) as total FROM pedidos GROUP BY DATE(fecha)',
    (err, rows) => {
      if (err) {
        return res.json({ success: false, error: err.message });
      }
      res.json({ success: true, data: rows });
    }
  );
});
```

**Respuesta:**
```json
{
  "success": true,
  "data": [
    {
      "fecha": "2026-01-16",
      "cantidad": 5,
      "total": 750.50
    }
  ]
}
```

---

##### 10. **GET `/api/reportes/inventario` - Reporte de Inventario**

```javascript
app.get('/api/reportes/inventario', (req, res) => {
  db.all(
    'SELECT nombre, stock, precio, (stock * precio) as valor_total FROM productos',
    (err, rows) => {
      if (err) {
        return res.json({ success: false, error: err.message });
      }
      res.json({ success: true, data: rows });
    }
  );
});
```

---

##### 11. **POST `/api/logout` - Cerrar Sesión**

```javascript
app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.json({ success: false, error: err.message });
    }
    res.json({ success: true, message: 'Sesión cerrada' });
  });
});
```

---

### 5.2 Archivo: `init.js`

**Propósito:** Crear la estructura de base de datos e insertar datos iniciales.

#### Función Principal

```javascript
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('./pos.db');

// Crear tablas
db.serialize(() => {
  // Tabla usuarios
  db.run(`CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    nombre TEXT NOT NULL,
    rol TEXT DEFAULT 'vendedor'
  )`);

  // Tabla productos
  db.run(`CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    precio REAL NOT NULL,
    stock INTEGER NOT NULL,
    categoria TEXT,
    proveedor_id INTEGER
  )`);

  // Tabla pedidos
  db.run(`CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT UNIQUE NOT NULL,
    cliente TEXT NOT NULL,
    items TEXT,
    total REAL NOT NULL,
    fecha TEXT,
    estado TEXT
  )`);

  // Tabla proveedores
  db.run(`CREATE TABLE IF NOT EXISTS proveedores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    contacto TEXT,
    telefono TEXT,
    email TEXT
  )`);

  // Insertar datos iniciales
  db.run(`INSERT OR IGNORE INTO usuarios (username, password, nombre, rol) 
          VALUES ('admin', 'admin123', 'Administrador', 'admin')`);
});

db.close();
```

#### Tablas Creadas

##### **Tabla: usuarios**
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | INTEGER PK | Identificador único |
| `username` | TEXT UNIQUE | Nombre de usuario |
| `password` | TEXT | Contraseña (en producción: hasheada) |
| `nombre` | TEXT | Nombre completo |
| `rol` | TEXT | Rol del usuario (admin, vendedor) |

##### **Tabla: productos**
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | INTEGER PK | Identificador único |
| `codigo` | TEXT UNIQUE | Código del producto |
| `nombre` | TEXT | Nombre del producto |
| `precio` | REAL | Precio unitario |
| `stock` | INTEGER | Cantidad disponible |
| `categoria` | TEXT | Categoría del producto |
| `proveedor_id` | INTEGER FK | Referencia al proveedor |

##### **Tabla: pedidos**
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | INTEGER PK | Identificador único |
| `numero` | TEXT UNIQUE | Número del pedido |
| `cliente` | TEXT | Nombre del cliente |
| `items` | TEXT (JSON) | Array de items en formato JSON |
| `total` | REAL | Total del pedido |
| `fecha` | TEXT | Fecha de creación |
| `estado` | TEXT | Estado (pendiente, completado, cancelado) |

##### **Tabla: proveedores**
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | INTEGER PK | Identificador único |
| `nombre` | TEXT | Nombre del proveedor |
| `contacto` | TEXT | Persona de contacto |
| `telefono` | TEXT | Teléfono de contacto |
| `email` | TEXT | Email de contacto |

---

## 6. Documentación de Frontend

### 6.1 Archivo: `dashboard.js`

**Propósito:** Interfaz de usuario interactiva, manejo de eventos y renderizado dinámico.

#### Estructura General

```javascript
// 1. Variables globales
let usuarioActual = null;
let pedidosActuales = [];
let productosActuales = [];
let pedidoActual = null;

// 2. Inicialización
document.addEventListener('DOMContentLoaded', inicializar);

// 3. Funciones de pantalla
function mostrarPantalla(pantalla) { }
function renderizarPedidos() { }
function renderizarProductos() { }

// 4. Funciones de API
async function obtenerPedidos() { }
async function crearPedido() { }
async function eliminarPedido() { }

// 5. Funciones de utilidad
function mostrarMensaje(mensaje) { }
function validarFormulario(datos) { }
```

---

#### 6.1.1 Variables Globales

```javascript
let usuarioActual = null;        // Información del usuario autenticado
let pedidosActuales = [];        // Array de todos los pedidos
let productosActuales = [];      // Array de todos los productos
let proveedoresActuales = [];    // Array de todos los proveedores
let pedidoActual = null;         // Pedido en edición
let itemsPedidoActual = [];      // Items del pedido actual
```

**Uso:** Almacenan el estado de la aplicación en memoria.

---

#### 6.1.2 Función: `inicializar()`

```javascript
async function inicializar() {
  // Verificar sesión
  const respuesta = await fetch('/api/usuario');
  const datos = await respuesta.json();
  
  if (!datos.success) {
    window.location.href = '/login';
    return;
  }
  
  usuarioActual = datos.usuario;
  
  // Cargar datos iniciales
  await obtenerPedidos();
  await obtenerProductos();
  await obtenerProveedores();
  
  // Mostrar pantalla inicial
  mostrarPantalla('pedidos');
}
```

**Flujo:**
1. Verifica si el usuario está autenticado
2. Si NO → redirige a login
3. Si SÍ → carga datos de todas las entidades
4. Renderiza la pantalla de pedidos

---

#### 6.1.3 Función: `mostrarPantalla(pantalla)`

```javascript
function mostrarPantalla(pantalla) {
  // Ocultar todas las pantallas
  document.querySelectorAll('.pantalla').forEach(p => p.style.display = 'none');
  
  // Mostrar pantalla solicitada
  const elemento = document.getElementById(`pantalla-${pantalla}`);
  if (elemento) {
    elemento.style.display = 'block';
  }
  
  // Renderizar contenido según pantalla
  switch(pantalla) {
    case 'pedidos':
      renderizarPedidos();
      break;
    case 'productos':
      renderizarProductos();
      break;
    case 'reportes':
      renderizarReportes();
      break;
  }
}
```

**Parámetro:**
- `pantalla` (string): Identificador de pantalla ('pedidos', 'productos', 'reportes')

**Lógica:**
1. Oculta todas las pantallas
2. Muestra la pantalla solicitada
3. Renderiza el contenido dinámicamente

---

#### 6.1.4 Función: `renderizarPedidos()`

```javascript
function renderizarPedidos() {
  const contenedor = document.getElementById('contenedor-pedidos');
  
  if (!pedidosActuales || pedidosActuales.length === 0) {
    contenedor.innerHTML = '<p>No hay pedidos</p>';
    return;
  }
  
  let html = '<table><thead><tr>';
  html += '<th>ID</th><th>Número</th><th>Cliente</th><th>Total</th><th>Fecha</th><th>Estado</th><th>Acciones</th>';
  html += '</tr></thead><tbody>';
  
  pedidosActuales.forEach(pedido => {
    html += `<tr>
      <td>${pedido.id}</td>
      <td>${pedido.numero}</td>
      <td>${pedido.cliente}</td>
      <td>$${pedido.total.toFixed(2)}</td>
      <td>${pedido.fecha}</td>
      <td>${pedido.estado}</td>
      <td>
        <button onclick="editarPedido(${pedido.id})">Editar</button>
        <button onclick="eliminarPedido(${pedido.id})">Eliminar</button>
      </td>
    </tr>`;
  });
  
  html += '</tbody></table>';
  contenedor.innerHTML = html;
}
```

**Lógica:**
1. Obtiene referencia al contenedor
2. Si NO hay pedidos → muestra mensaje
3. Si HAY pedidos → construye tabla HTML dinámicamente
4. Para cada pedido → crea fila con botones de acción

---

#### 6.1.5 Función: `crearPedido()`

```javascript
async function crearPedido() {
  // Obtener datos del formulario
  const numero = document.getElementById('input-numero').value;
  const cliente = document.getElementById('input-cliente').value;
  
  // Validar
  if (!numero || !cliente) {
    alert('Complete todos los campos');
    return;
  }
  
  // Calcular total
  let total = 0;
  itemsPedidoActual.forEach(item => {
    total += item.cantidad * item.precio;
  });
  
  // Enviar al servidor
  const respuesta = await fetch('/api/pedidos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      numero,
      cliente,
      items: itemsPedidoActual,
      total
    })
  });
  
  const datos = await respuesta.json();
  
  if (datos.success) {
    mostrarMensaje('Pedido creado exitosamente');
    limpiarFormulario();
    await obtenerPedidos();
    renderizarPedidos();
  } else {
    mostrarMensaje('Error: ' + datos.error);
  }
}
```

**Flujo:**
1. Obtiene valores del formulario
2. Valida que campos no estén vacíos
3. Calcula total sumando items
4. Envía POST a `/api/pedidos`
5. Si éxito → actualiza tabla
6. Si error → muestra mensaje

---

#### 6.1.6 Función: `agregarItemPedido()`

```javascript
function agregarItemPedido() {
  const productoId = document.getElementById('select-producto').value;
  const cantidad = parseInt(document.getElementById('input-cantidad').value);
  
  if (!productoId || !cantidad || cantidad <= 0) {
    alert('Seleccione producto y cantidad válida');
    return;
  }
  
  // Encontrar producto
  const producto = productosActuales.find(p => p.id == productoId);
  
  if (!producto) {
    alert('Producto no encontrado');
    return;
  }
  
  // Verificar stock
  if (producto.stock < cantidad) {
    alert('Stock insuficiente');
    return;
  }
  
  // Agregar a items actuales
  itemsPedidoActual.push({
    producto_id: producto.id,
    nombre: producto.nombre,
    cantidad: cantidad,
    precio: producto.precio,
    subtotal: cantidad * producto.precio
  });
  
  // Actualizar vista
  renderizarItemsPedido();
}
```

**Lógica:**
1. Obtiene producto ID y cantidad
2. Valida inputs
3. Busca producto en array
4. Verifica disponibilidad en stock
5. Agrega item al array temporal
6. Actualiza tabla de items

---

#### 6.1.7 Función: `eliminarItemPedido(index)`

```javascript
function eliminarItemPedido(index) {
  if (index >= 0 && index < itemsPedidoActual.length) {
    itemsPedidoActual.splice(index, 1);
    renderizarItemsPedido();
  }
}
```

**Parámetro:**
- `index` (int): Posición del item a eliminar

**Lógica:**
1. Valida que index sea válido
2. Elimina item del array
3. Actualiza visualización

---

#### 6.1.8 Función: `eliminarPedido(id)`

```javascript
async function eliminarPedido(id) {
  if (!confirm('¿Está seguro de que desea eliminar este pedido?')) {
    return;
  }
  
  const respuesta = await fetch(`/api/pedidos/${id}`, {
    method: 'DELETE'
  });
  
  const datos = await respuesta.json();
  
  if (datos.success) {
    mostrarMensaje('Pedido eliminado exitosamente');
    await obtenerPedidos();
    renderizarPedidos();
  } else {
    mostrarMensaje('Error: ' + datos.error);
  }
}
```

**Flujo:**
1. Solicita confirmación
2. Si NO confirma → retorna
3. Si SÍ → envía DELETE a servidor
4. Actualiza tabla

---

#### 6.1.9 Función: `obtenerPedidos()`

```javascript
async function obtenerPedidos() {
  try {
    const respuesta = await fetch('/api/pedidos');
    const datos = await respuesta.json();
    
    if (datos.success) {
      pedidosActuales = datos.data;
    }
  } catch (error) {
    console.error('Error al obtener pedidos:', error);
  }
}
```

**Lógica:**
1. Hace GET a `/api/pedidos`
2. Si éxito → almacena en variable global
3. Si error → lo registra en consola

---

#### 6.1.10 Función: `renderizarReportes()`

```javascript
async function renderizarReportes() {
  // Obtener reporte de ventas
  const ventasResp = await fetch('/api/reportes/ventas');
  const ventasDatos = await ventasResp.json();
  
  // Obtener reporte de inventario
  const inventarioResp = await fetch('/api/reportes/inventario');
  const inventarioDatos = await inventarioResp.json();
  
  // Renderizar tablas
  renderizarReporteVentas(ventasDatos.data);
  renderizarReporteInventario(inventarioDatos.data);
}
```

**Flujo:**
1. Obtiene datos de ambos reportes
2. Renderiza tablas dinámicamente

---

#### 6.1.11 Función: `limpiarFormulario()`

```javascript
function limpiarFormulario() {
  document.getElementById('input-numero').value = '';
  document.getElementById('input-cliente').value = '';
  document.getElementById('select-producto').value = '';
  document.getElementById('input-cantidad').value = '';
  itemsPedidoActual = [];
  renderizarItemsPedido();
}
```

---

#### 6.1.12 Función: `mostrarMensaje(mensaje)`

```javascript
function mostrarMensaje(mensaje) {
  const div = document.createElement('div');
  div.className = 'mensaje';
  div.textContent = mensaje;
  div.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #4CAF50;
    color: white;
    padding: 15px 20px;
    border-radius: 5px;
    z-index: 9999;
  `;
  
  document.body.appendChild(div);
  
  setTimeout(() => div.remove(), 3000);
}
```

**Lógica:**
1. Crea elemento DIV dinámicamente
2. Lo posiciona en esquina superior derecha
3. Desaparece automáticamente después de 3 segundos

---

## 7. Base de Datos

### 7.1 Esquema Relacional

```
┌──────────────┐         ┌──────────────┐
│   usuarios   │         │  productos   │
├──────────────┤         ├──────────────┤
│ id (PK)      │         │ id (PK)      │
│ username     │         │ codigo       │
│ password     │         │ nombre       │
│ nombre       │         │ precio       │
│ rol          │         │ stock        │
│              │         │ categoria    │
│              │         │ proveedor_id │
└──────────────┘         └──────────────┘
                                │
                                │ FK
                                ▼
                         ┌──────────────┐
                         │ proveedores  │
                         ├──────────────┤
                         │ id (PK)      │
                         │ nombre       │
                         │ contacto     │
                         │ telefono     │
                         │ email        │
                         └──────────────┘

┌──────────────┐
│   pedidos    │
├──────────────┤
│ id (PK)      │
│ numero       │
│ cliente      │
│ items (JSON) │─── Referencia a productos
│ total        │
│ fecha        │
│ estado       │
└──────────────┘
```

### 7.2 Consultas SQL Frecuentes

#### Obtener todos los pedidos
```sql
SELECT * FROM pedidos ORDER BY fecha DESC;
```

#### Obtener productos por categoría
```sql
SELECT * FROM productos WHERE categoria = 'Electrónica';
```

#### Reporte de ventas por fecha
```sql
SELECT 
  DATE(fecha) as fecha,
  COUNT(*) as cantidad,
  SUM(total) as total 
FROM pedidos 
GROUP BY DATE(fecha)
ORDER BY fecha DESC;
```

#### Productos con bajo stock
```sql
SELECT nombre, stock, precio FROM productos WHERE stock < 10;
```

#### Valor total del inventario
```sql
SELECT SUM(stock * precio) as valor_total FROM productos;
```

---

## 8. Flujos de Trabajo Principales

### 8.1 Flujo: Crear Pedido

```
Usuario accede a "Crear Pedido"
    ↓
Sistema carga lista de productos
    ↓
Usuario selecciona producto y cantidad
    ↓
Sistema valida stock disponible
    ↓
Usuario agrega item a carrito
    ↓
Usuario repite (puede agregar múltiples items)
    ↓
Usuario ingresa datos del cliente
    ↓
Usuario hace clic en "Crear Pedido"
    ↓
Frontend calcula total
    ↓
Frontend envía POST a /api/pedidos
    ↓
Backend valida datos
    ↓
Backend inserta en base de datos
    ↓
Backend retorna confirmación
    ↓
Frontend actualiza tabla de pedidos
    ↓
Sistema muestra mensaje de éxito
```

---

### 8.2 Flujo: Generar Reporte

```
Usuario accede a "Reportes"
    ↓
Frontend carga múltiples endpoints API
    ↓
Backend consulta base de datos
    ↓
Backend aplica agregaciones (COUNT, SUM, GROUP BY)
    ↓
Backend retorna datos procesados
    ↓
Frontend construye tablas HTML dinámicamente
    ↓
Usuario visualiza reportes
    ↓
Usuario puede descargar o imprimir (opcional)
```

---

### 8.3 Flujo: Login

```
Usuario accede a página
    ↓
Sistema verifica sesión (/api/usuario)
    ↓
Si sesión válida → muestra dashboard
    ↓
Si no válida → redirige a /login
    ↓
Usuario ingresa username y password
    ↓
Frontend envía POST a /api/login
    ↓
Backend busca en tabla usuarios
    ↓
Si credenciales válidas → crea sesión
    ↓
Backend retorna { success: true }
    ↓
Frontend redirige a /
    ↓
Dashboard se carga con datos
```

---

## 9. Guía de Instalación y Ejecución

### 9.1 Requisitos Previos

```bash
# Verificar Node.js
node --version  # Debe ser v14 o superior

# Verificar npm
npm --version
```

### 9.2 Instalación

```bash
# 1. Clonar o descargar el proyecto
git clone https://github.com/usuario/proyecto-pos.git
cd proyecto-pos

# 2. Instalar dependencias
npm install

# 3. Crear base de datos inicial
node init.js

# Verifica que se creó pos.db
ls -la pos.db
```

### 9.3 Ejecución

#### Opción A: Ejecución Simple

```bash
node server.js
```

#### Opción B: Con Nodemon (Recargar automáticamente)

```bash
npm install --save-dev nodemon
npx nodemon server.js
```

#### Verificar que está corriendo

```bash
# En otra terminal, prueba la API
curl http://localhost:3000/

# Debería redirigir a login o mostrar HTML
```

### 9.4 Acceso a la Aplicación

```
URL: http://localhost:3000
Credenciales por defecto:
  - Usuario: admin
  - Contraseña: admin123
```

---

## 10. Problemas Conocidos y Soluciones

### 10.1 Error: "EADDRINUSE: address already in use :::3000"

**Problema:** El puerto 3000 ya está siendo utilizado por otra aplicación.

**Soluciones:**

```bash
# Opción 1: Usar otro puerto
PORT=3001 node server.js

# Opción 2: Matar proceso en puerto 3000
# En Windows:
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# En Mac/Linux:
lsof -i :3000
kill -9 <PID>
```

---

### 10.2 Error: "SQLITE_CANTOPEN: unable to open database file"

**Problema:** No se puede acceder a pos.db.

**Soluciones:**

```bash
# Verificar permisos
ls -la pos.db

# Recrear base de datos
rm pos.db
node init.js
```

---

### 10.3 Error: "Cannot find module 'express'"

**Problema:** Las dependencias no están instaladas.

**Solución:**

```bash
npm install
```

---

### 10.4 Sesión se pierde después de recargar página

**Problema:** La configuración de sesión no es persistente.

**Contexto:** Express-session por defecto usa MemoryStore (almacenamiento en RAM), que se pierde cuando el servidor se reinicia.

**Solución para desarrollo:** Es comportamiento normal. En producción, usar base de datos para sesiones.

```javascript
// Para producción - agregar a server.js
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);

app.use(session({
  store: new SQLiteStore({ db: 'sessions.db' }),
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // true si usa HTTPS
}));
```

---

### 10.5 Cambios en código no se reflejan sin recargar

**Problema:** Frontend cacheado por navegador.

**Solución:**

```bash
# Vaciar cache del navegador
- Chrome: Ctrl+Shift+Delete
- Firefox: Ctrl+Shift+Delete
- Safari: Cmd+Shift+Delete

# O desabilitar cache en desarrollo
# En Chrome DevTools → Settings → Network → Disable cache
```

---

### 10.6 Error: "TypeError: Cannot read property 'map' of undefined"

**Problema:** Los datos retornados por la API son null o undefined.

**Solución:**

```javascript
// Agregar validación
if (!datos || !datos.data) {
  console.error('Datos no disponibles');
  return;
}

// O usar optional chaining (ES2020)
const items = datos?.data?.map(item => item.nombre) || [];
```

---

## 11. Roadmap de Mejoras

### Fase 1: Refactorización (Recomendado Prioritario)

- [ ] **Modularizar Frontend**
  - Separar `dashboard.js` en múltiples archivos
  - Crear módulos: `pedidos.js`, `productos.js`, `reportes.js`
  - Usar patrón modular o webpack

- [ ] **Separar HTML del JavaScript**
  - Crear archivo `index.html` separado
  - Usar plantillas (EJS, Handlebars o similar)
  - Mejorar mantenibilidad

- [ ] **Validación en Backend**
  - Agregar validación de inputs
  - Sanitizar datos para prevenir SQL injection
  - Implementar rate limiting

---

### Fase 2: Seguridad

- [ ] **Hasheado de Contraseñas**
  ```bash
  npm install bcrypt
  ```
  ```javascript
  const bcrypt = require('bcrypt');
  const hash = await bcrypt.hash(password, 10);
  const válido = await bcrypt.compare(password, hash);
  ```

- [ ] **Autenticación JWT**
  - Reemplazar sesiones con JSON Web Tokens
  - Mejor para APIs modernas

- [ ] **HTTPS**
  - Usar certificados SSL/TLS en producción
  - Instalar con Let's Encrypt (gratuito)

- [ ] **Protección CSRF**
  - Agregar tokens CSRF a formularios

---

### Fase 3: Funcionalidades

- [ ] **Gestión de Usuarios Avanzada**
  - Crear nuevo usuario (admin only)
  - Cambiar contraseña
  - Roles y permisos granulares

- [ ] **Historial y Auditoría**
  - Registrar quién creó/modificó cada pedido
  - Tabla de logs

- [ ] **Exportación de Datos**
  - Exportar reportes a PDF
  - Exportar a Excel

- [ ] **Dashboard Analítico**
  - Gráficas de ventas
  - KPIs principales
  - Proyecciones

- [ ] **Notificaciones**
  - Email cuando stock es bajo
  - SMS para alertas críticas

---

### Fase 4: DevOps

- [ ] **Dockerizar**
  ```dockerfile
  FROM node:16
  WORKDIR /app
  COPY package*.json ./
  RUN npm install
  COPY . .
  EXPOSE 3000
  CMD ["node", "server.js"]
  ```

- [ ] **CI/CD**
  - GitHub Actions
  - Automated testing
  - Auto-deploy

- [ ] **Base de Datos en Producción**
  - Migrar a PostgreSQL o MySQL
  - Implementar backups automáticos

- [ ] **Monitoreo**
  - Uptime monitoring
  - Error tracking (Sentry)
  - Performance analytics

---

### Fase 5: Experiencia de Usuario

- [ ] **Interfaz Responsiva**
  - Compatibilidad móvil
  - CSS Framework (Bootstrap, Tailwind)

- [ ] **Búsqueda y Filtros Avanzados**
  - Filtrar pedidos por rango de fechas
  - Buscar productos por nombre

- [ ] **Múltiples idiomas**
  - Soporte para ES/EN

- [ ] **Temas**
  - Dark mode / Light mode

---

## Conclusión

Este documento proporciona una guía completa de la arquitectura, instalación y uso del Sistema POS. Para preguntas o reportar errores, abra un issue en el repositorio.

**Última actualización:** 16 de enero de 2026  
**Versión:** 1.0.0-MVP  
**Mantenedor:** Victor E.