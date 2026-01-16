# Guía de Uso - Nuevos Módulos

## 1. Variables de Entorno (.env)

### Cómo cambiar configuraciones

```bash
# Editar archivo .env
nano .env

# Cambiar puerto
PORT=5000

# Cambiar ruta BD
DATABASE_PATH=./my-database.db

# Cambiar secret de sesión
SESSION_SECRET=mi-clave-super-segura-123
```

**Cambios toman efecto al reiniciar el servidor.**

---

## 2. Módulo config.js (Backend)

Ya no necesitas editar valores en el código. Todo está centralizado.

### Antes (Hardcodeado)
```javascript
const PORT = 3000;
const db = new Database('./database/pos.db');
const SESSION_SECRET = 'pos-secret-key-change-in-production';
```

### Después (Limpio)
```javascript
const config = require('./config');
const PORT = config.server.port;
const dbPath = config.database.path;
const SESSION_SECRET = config.session.secret;
```

---

## 3. Cliente API (public/api.js)

Centraliza todos los llamados al servidor. **Evita repetir `fetch()` en todo el código.**

### Uso Básico

```javascript
// ✅ CORRECTO (Nuevo)
try {
  const products = await API.getProducts();
  console.log(products);
} catch (error) {
  Utils.showError('Error: ' + error.message);
}

// ❌ VIEJO (Hardcodeado)
try {
  const response = await fetch('/api/products');
  if (!response.ok) throw new Error('Error HTTP');
  const products = await response.json();
  console.log(products);
} catch (error) {
  alert('Error al cargar productos');
}
```

### Ejemplos de API

```javascript
// USUARIOS
await API.login(username, password);
await API.createAdmin(username, password);
await API.checkAdmin();
await API.logout();

// PRODUCTOS
await API.getProducts();
await API.searchProducts('samsung');
await API.createProduct({ name: 'Producto', price: 100 });
await API.updateProduct({ id: 1, price: 150 });
await API.deleteProduct(1);

// VENTAS
await API.createSale({
  items: [...],
  total: 500,
  paymentMethodId: 1
});

// REPORTES
await API.getSalesReport({ startDate: '2026-01-01', endDate: '2026-01-16' });
await API.getTopProducts({ startDate: '2026-01-01' });

// PROVEEDORES
await API.getSuppliers();
await API.createSupplierOrder({ productId: 1, supplierId: 2, quantity: 10 });
await API.markOrderAsReceived(orderId, receivedQuantity);
```

---

## 4. Utilidades (public/utils.js)

Funciones comunes para evitar repetir código.

### Notificaciones

```javascript
Utils.showSuccess('✅ Pedido creado exitosamente');
Utils.showError('❌ Error al procesar');
Utils.showInfo('ℹ️ Información importante');

// Personalizado
Utils.showNotification('Mensaje', 'success', 5000); // 5 segundos
```

### Formatos

```javascript
// Moneda
Utils.formatCurrency(1234.56);  // $1,234.56

// Fechas
Utils.formatDate('2026-01-16T10:30:00');  // 16 de enero de 2026 10:30
Utils.formatTime('2026-01-16T10:30:00');  // 10:30:00
```

### Validaciones

```javascript
if (!Utils.validateEmail('user@example.com')) {
  Utils.showError('Email inválido');
}

if (!Utils.validatePassword(password)) {
  Utils.showError('Contraseña debe tener mínimo 6 caracteres');
}

if (!Utils.validateUsername(username)) {
  Utils.showError('Usuario debe tener mínimo 3 caracteres');
}
```

### Almacenamiento Local

```javascript
// Guardar
Utils.storage.set('currentUser', { id: 1, name: 'Juan' });

// Obtener
const user = Utils.storage.get('currentUser');

// Obtener con valor por defecto
const user = Utils.storage.get('currentUser', null);

// Eliminar
Utils.storage.remove('currentUser');

// Limpiar todo
Utils.storage.clear();
```

### Manipulación de Arrays

```javascript
// Sumar valores
const total = Utils.sumBy(products, 'price');  // suma de todos los precios

// Agrupar
const grouped = Utils.groupBy(products, 'category');
// { 'Electrónica': [...], 'Ropa': [...] }

// Buscar por ID
const product = Utils.findById(products, 5);
```

### DOM

```javascript
// Crear elemento
const div = Utils.createElement('<div class="card">Hola</div>');
document.body.appendChild(div);

// Mostrar/Ocultar
const btn = document.querySelector('button');
Utils.toggleVisibility(btn, true);   // Mostrar
Utils.toggleVisibility(btn, false);  // Ocultar

// Loading
Utils.setLoading(btn, true);   // "⏳ Cargando..."
Utils.setLoading(btn, false);  // Restaura texto original
```

---

## 5. Ejemplo Completo: Crear Producto

### Antes (Mezclado)
```javascript
async function crearProducto() {
  const nombre = document.getElementById('nombre').value;
  const precio = document.getElementById('precio').value;
  
  if (!nombre || !precio) {
    alert('Completa todos los campos');
    return;
  }
  
  const btn = document.querySelector('button');
  btn.disabled = true;
  btn.textContent = 'Procesando...';
  
  try {
    const response = await fetch('/api/products/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nombre, price: precio })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      alert('✅ Producto creado!');
      // Cargar productos nuevamente
      const resp = await fetch('/api/products');
      const products = await resp.json();
      renderizar(products);
    } else {
      alert('❌ ' + data.error);
    }
  } catch (error) {
    alert('Error: ' + error.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Crear Producto';
  }
}
```

### Después (Limpio)
```javascript
async function crearProducto() {
  const nombre = document.getElementById('nombre').value;
  const precio = document.getElementById('precio').value;
  
  // Validar
  if (!nombre || !precio) {
    Utils.showError('Completa todos los campos');
    return;
  }
  
  const btn = document.querySelector('button');
  Utils.setLoading(btn, true);
  
  try {
    // Crear producto
    await API.createProduct({ name: nombre, price: precio });
    Utils.showSuccess('✅ Producto creado!');
    
    // Cargar productos nuevamente
    const products = await API.getProducts();
    renderizar(products);
  } catch (error) {
    Utils.showError('Error: ' + error.message);
  } finally {
    Utils.setLoading(btn, false);
  }
}
```

**Diferencias:**
- ✅ Menos código
- ✅ Más legible
- ✅ Manejo de errores consistente
- ✅ Reutilizable

---

## 6. Checklist para Refactorizar Código Existente

Cuando modifiques código viejo, reemplaza:

- [ ] `fetch()` → `API.nombreFuncion()`
- [ ] `alert()` → `Utils.showError()` / `Utils.showSuccess()`
- [ ] Formato manual → `Utils.formatCurrency()`, `Utils.formatDate()`
- [ ] `localStorage.setItem()` → `Utils.storage.set()`
- [ ] Validaciones manuales → `Utils.validate*()`
- [ ] Strings de HTML → Separar en templates (próximo paso)

---

## 7. Recomendaciones

✅ **Usa API.js** para todas las comunicaciones con backend  
✅ **Usa Utils.js** para funciones comunes  
✅ **Usa .env** para configuraciones (nunca hardcodear)  
✅ **Separa HTML** en templates (no en strings de JS)  
✅ **Comenta tu código** cuando uses nuevas funciones  

❌ **No** hardcodees URLs, puertos o claves  
❌ **No** repitas código (refactoriza a utilidades)  
❌ **No** mezles HTML con JavaScript (próximo paso)

---

## 8. Próximas Mejoras

Cuando estés listo:

1. **Separar HTML en templates**
   - Crear `templates/` con archivos `.html`
   - Cargar con `fetch()` o framework

2. **Modularizar dashboard.js**
   - Crear `modules/products.js`, `modules/sales.js`, etc.
   - Cada módulo maneja su funcionalidad

3. **Patrón MVC**
   - Modelos (lógica de negocio)
   - Controladores (manejadores de eventos)
   - Vistas (renderizado HTML)

---

**¡Tu código ahora es más mantenible y escalable! 🎉**
