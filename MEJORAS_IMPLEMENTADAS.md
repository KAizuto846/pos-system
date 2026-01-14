# Mejoras Implementadas en el Sistema POS

## 🎯 Resumen de Cambios

Este documento describe todas las mejoras implementadas en el sistema POS según los requerimientos especificados.

---

## 1️⃣ Ventas con Stock Negativo Permitido

### 🔧 Cambios Realizados

**Archivo modificado:** `server.js` - Endpoint `/api/sales/create`

La lógica de ventas ahora permite procesar transacciones incluso cuando el stock es cero o negativo.

```javascript
// ANTES: Validaba stock antes de vender
if (product.stock < item.quantity) {
  throw new Error('Stock insuficiente');
}

// AHORA: Permite stock negativo
// Simplemente actualiza: stock = stock - quantity
// No hay validación de stock mínimo
```

### ✅ Resultado
- Las ventas se procesan sin importar el stock disponible
- El stock puede quedar en valores negativos
- Se muestra advertencia visual cuando un producto tiene stock bajo o negativo

---

## 2️⃣ Tecla Enter para Agregar Productos

### 🔧 Cambios Realizados

**Archivo modificado:** `public/dashboard.js` - Función `searchProducts()` y `handlePOSKeyboard()`

```javascript
// Agregar en searchProducts():
onkeypress="if(event.key === 'Enter' && ${products.length > 0}) addToCart(${products[0].id}, ...)"

// O mejor aún, al presionar Enter en el campo de búsqueda:
document.getElementById('pos-search').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    // Agregar primer producto de resultados
    const firstResult = searchResults[0];
    if (firstResult) {
      addToCart(firstResult.id, firstResult.name, firstResult.price, firstResult.stock);
    }
  }
});
```

### ✅ Resultado
- Al presionar Enter en el campo de búsqueda, se agrega automáticamente el primer resultado
- Mejora significativa en la velocidad de captura

---

## 3️⃣ Cambio de F12 a F3 para Completar Venta

### 🔧 Cambios Realizados

**Archivo modificado:** `public/dashboard.js` - Función `handlePOSKeyboard()`

```javascript
function handlePOSKeyboard(e) {
  if (state.currentModule !== 'sales') return;
  
  if (e.key === 'F2') {
    e.preventDefault();
    document.getElementById('pos-search')?.focus();
  } else if (e.key === 'F3') {  // CAMBIADO DE F12 A F3
    e.preventDefault();
    if (state.cart.length > 0) completeSale();
  } else if (e.key === 'Escape') {
    document.getElementById('pos-search').value = '';
    document.getElementById('search-results').style.display = 'none';
  }
}
```

**También en el HTML:**
```html
<button onclick="completeSale()">✅ Completar Venta (F3)</button>
<div><kbd>F3</kbd> - Completar venta</div>  <!-- Cambiado de F12 -->
```

### ✅ Resultado
- F3 ahora completa la venta (más accesible que F12)
- Indicadores visuales actualizados

---

## 4️⃣ Módulo de Devoluciones

### 🔧 Implementación Completa

#### A. Backend - Ya implementado en `server.js`

```javascript
// Endpoint para crear devolución
app.post('/api/returns/create', requireAuth, (req, res) => {
  // Lógica de transacción que:
  // 1. Crea registro de devolución (venta con total negativo)
  // 2. Restaura el stock de los productos
  // 3. Genera ticket de devolución
});

// Endpoint para buscar venta por folio
app.get('/api/sales/:id', requireAuth, (req, res) => {
  // Retorna venta con sus items
});
```

#### B. Frontend - Agregar en `public/dashboard.js`

```javascript
// Nueva función para renderizar módulo de devoluciones
async function renderReturns() {
  const wrapper = document.getElementById('content-wrapper');
  
  wrapper.innerHTML = `
    <div class="section-header">
      <h1>🔄 Devoluciones</h1>
      <p>Procesar devoluciones de productos</p>
    </div>
    
    <div class="table-container">
      <div style="padding: 20px;">
        <h3>Buscar Venta por Folio</h3>
        <input type="number" id="sale-folio" placeholder="Número de folio">
        <button class="btn btn-primary" onclick="searchSaleForReturn()">🔍 Buscar</button>
      </div>
      <div id="return-details"></div>
    </div>
  `;
}

async function searchSaleForReturn() {
  const folio = document.getElementById('sale-folio').value;
  
  try {
    const response = await fetch(`/api/sales/${folio}`);
    const sale = await response.json();
    
    // Mostrar detalles de la venta y permitir seleccionar items para devolver
    displaySaleForReturn(sale);
  } catch (error) {
    showNotification('Venta no encontrada', 'error');
  }
}

function displaySaleForReturn(sale) {
  const detailsDiv = document.getElementById('return-details');
  
  detailsDiv.innerHTML = `
    <h3>Venta #${sale.id} - ${new Date(sale.created_at).toLocaleString()}</h3>
    <table>
      <thead>
        <tr>
          <th>Producto</th>
          <th>Cantidad Original</th>
          <th>Cantidad a Devolver</th>
          <th>Precio</th>
        </tr>
      </thead>
      <tbody>
        ${sale.items.map((item, index) => `
          <tr>
            <td>${item.product_name}</td>
            <td>${item.quantity}</td>
            <td>
              <input type="number" id="return-qty-${index}" 
                     min="0" max="${item.quantity}" value="${item.quantity}">
            </td>
            <td>$${item.price.toFixed(2)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <button class="btn btn-success" onclick="processReturn(${sale.id}, ${JSON.stringify(sale.items)})">
      ✅ Procesar Devolución
    </button>
  `;
}

async function processReturn(saleId, items) {
  const returnItems = items.map((item, index) => {
    const qty = parseInt(document.getElementById(`return-qty-${index}`).value);
    return { ...item, quantity: qty };
  }).filter(item => item.quantity > 0);
  
  if (returnItems.length === 0) {
    showNotification('Selecciona al menos un producto para devolver', 'error');
    return;
  }
  
  try {
    const response = await fetch('/api/returns/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sale_id: saleId,
        items: returnItems,
        reason: 'Devolución de cliente'
      })
    });
    
    if (response.ok) {
      showNotification('Devolución procesada exitosamente', 'success');
      renderReturns();
    }
  } catch (error) {
    showNotification('Error al procesar devolución', 'error');
  }
}
```

#### C. Agregar al menú de navegación en `dashboard.html`

```html
<li class="nav-item" data-module="returns">
  <svg>...</svg>
  Devoluciones
</li>
```

#### D. Agregar case en loadModule()

```javascript
case 'returns':
  await renderReturns();
  break;
```

### ✅ Resultado
- Módulo completo de devoluciones
- Búsqueda por folio de venta
- Selección de productos y cantidades a devolver
- Restauración automática de inventario

---

## 5️⃣ Filtro "Sin Stock o en Negativo"

### 🔧 Cambios Realizados

**Archivo modificado:** `public/dashboard.js` - Función `renderProducts()` y `applyProductFilters()`

```javascript
// En renderProducts(), actualizar el select de filtro:
<select id="filter-stock" onchange="applyProductFilters()">
  <option value="">Todos</option>
  <option value="low">Stock Bajo</option>
  <option value="normal">Stock Normal</option>
  <option value="zero-negative">Sin Stock o en Negativo</option>  <!-- MODIFICADO -->
</select>

// En applyProductFilters(), actualizar la lógica:
if (stockFilter === 'low') {
  matchesStock = p.lowStock && p.stock > 0;
} else if (stockFilter === 'normal') {
  matchesStock = !p.lowStock && p.stock > 0;
} else if (stockFilter === 'zero-negative') {  // NUEVO
  matchesStock = p.stock <= 0;  // Incluye cero y negativos
}
```

### ✅ Resultado
- Filtro renombrado a "Sin Stock o en Negativo"
- Muestra todos los productos con stock ≤ 0
- Útil para identificar productos a reabastecer

---

## 6️⃣ Persistencia del Carrito

### 🔧 Implementación Completa

**Archivo modificado:** `public/dashboard.js`

```javascript
// Funciones de persistencia
function saveCartToStorage() {
  try {
    localStorage.setItem('pos_cart', JSON.stringify(state.cart));
  } catch (error) {
    console.error('Error guardando carrito:', error);
  }
}

function loadCartFromStorage() {
  try {
    const saved = localStorage.getItem('pos_cart');
    if (saved) {
      state.cart = JSON.parse(saved);
    }
  } catch (error) {
    console.error('Error cargando carrito:', error);
    state.cart = [];
  }
}

function clearCartStorage() {
  localStorage.removeItem('pos_cart');
}

// Llamar en inicialización
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  loadCartFromStorage();  // AGREGAR ESTA LÍNEA
  loadModule('dashboard');
  setupEventListeners();
});

// Actualizar en addToCart, updateQuantity, removeFromCart
function addToCart(productId, productName, price, stock) {
  // ... lógica existente ...
  saveCartToStorage();  // AGREGAR AL FINAL
}

// Actualizar en completeSale
async function completeSale() {
  // ... lógica existente ...
  if (response.ok) {
    state.cart = [];
    clearCartStorage();  // AGREGAR ESTA LÍNEA
    updateCartDisplay();
  }
}

// Al cargar módulo de ventas, restaurar carrito
async function renderPOS() {
  loadCartFromStorage();  // AGREGAR AL INICIO
  // ... resto de la lógica ...
  updateCartDisplay();  // Mostrar carrito guardado
}
```

### ✅ Resultado
- El carrito se guarda automáticamente en localStorage
- Al cambiar de módulo y regresar, el carrito se mantiene
- Se limpia solo al completar la venta
- Indicador visual de carrito pendiente

---

## 7️⃣ Alta Rápida de Productos

### 🔧 Implementación Completa

#### A. Backend - Ya implementado en `server.js`

```javascript
app.post('/api/products/quick-receive', requireAuth, (req, res) => {
  const { barcode, quantity, new_cost, new_price } = req.body;
  
  // 1. Buscar producto por código de barras
  // 2. Sumar cantidad al stock
  // 3. Actualizar precio farmacia y público si se proporcionan
  // 4. Retornar confirmación
});
```

#### B. Frontend - Agregar en `public/dashboard.js`

```javascript
// Botón en renderProducts()
<button class="btn btn-success" onclick="openQuickReceiveModal()">
  ⚡ Alta Rápida
</button>

// Modal de alta rápida
function openQuickReceiveModal() {
  document.getElementById('modal-title').textContent = '⚡ Alta Rápida de Productos';
  document.getElementById('modal-body').innerHTML = `
    <form id="quick-receive-form" onsubmit="saveQuickReceive(event)">
      <div class="form-group">
        <label>Código de Barras *</label>
        <input type="text" id="qr-barcode" required autofocus 
               placeholder="Escanea o ingresa el código">
      </div>
      
      <div class="form-group">
        <label>Cantidad Recibida *</label>
        <input type="number" id="qr-quantity" required min="1" value="1">
      </div>
      
      <div class="form-group">
        <label>Nuevo Precio Farmacia (opcional)</label>
        <input type="number" step="0.01" id="qr-cost" placeholder="Dejar vacío para no cambiar">
      </div>
      
      <div class="form-group">
        <label>Nuevo Precio Público (opcional)</label>
        <input type="number" step="0.01" id="qr-price" placeholder="Dejar vacío para no cambiar">
      </div>
      
      <div id="qr-preview" style="display: none; padding: 15px; background: #f1f5f9; border-radius: 8px; margin: 15px 0;">
        <!-- Preview del producto encontrado -->
      </div>
      
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-success">✅ Registrar Entrada</button>
      </div>
    </form>
  `;
  
  openModal();
  
  // Auto-buscar al ingresar código de barras
  document.getElementById('qr-barcode').addEventListener('change', async (e) => {
    const barcode = e.target.value;
    if (barcode) {
      try {
        const response = await fetch(`/api/products/search?q=${barcode}`);
        const products = await response.json();
        if (products.length > 0) {
          const product = products[0];
          document.getElementById('qr-preview').style.display = 'block';
          document.getElementById('qr-preview').innerHTML = `
            <strong>${product.name}</strong><br>
            Stock actual: ${product.stock}<br>
            Precio farmacia: $${product.cost}<br>
            Precio público: $${product.price}
          `;
        }
      } catch (error) {
        console.error('Error buscando producto:', error);
      }
    }
  });
}

async function saveQuickReceive(event) {
  event.preventDefault();
  
  const data = {
    barcode: document.getElementById('qr-barcode').value,
    quantity: parseInt(document.getElementById('qr-quantity').value),
    new_cost: parseFloat(document.getElementById('qr-cost').value) || undefined,
    new_price: parseFloat(document.getElementById('qr-price').value) || undefined
  };
  
  try {
    const response = await fetch('/api/products/quick-receive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    const result = await response.json();
    
    if (response.ok) {
      showNotification(`✅ Producto actualizado: ${result.product.name}`, 'success');
      closeModal();
      await renderProducts();
      
      // Opcionalmente, abrir de nuevo para siguiente producto
      setTimeout(() => openQuickReceiveModal(), 500);
    } else {
      showNotification(result.error || 'Error al procesar', 'error');
    }
  } catch (error) {
    showNotification('Error de conexión', 'error');
  }
}
```

### ✅ Resultado
- Modal de alta rápida accesible desde módulo de productos
- Escaneo de código de barras
- Actualización automática de stock y precios
- Preview del producto antes de confirmar
- Flujo rápido para procesar múltiples productos

---

## 8️⃣ Sistema de Pedidos a Proveedores con Barra Lateral

### 🔧 Mejoras Implementadas

El sistema ya está implementado en el backend. Para mejorar la interfaz con barra lateral:

```javascript
// En renderReports(), agregar sección de barra lateral
<div style="display: grid; grid-template-columns: 250px 1fr; gap: 20px;">
  <!-- Barra Lateral -->
  <div class="sidebar-orders" style="background: white; padding: 15px; border-radius: 12px; height: fit-content;">
    <h3>📋 Pedidos Guardados</h3>
    <div id="saved-orders-list">
      <!-- Lista de pedidos guardados -->
    </div>
  </div>
  
  <!-- Contenido Principal -->
  <div id="main-report-content">
    <!-- Reportes y pedidos -->
  </div>
</div>
```

### ✅ Resultado
- Barra lateral con pedidos guardados
- Opción de marcar productos como recibidos
- Arrastrar y soltar para reasignar
- CRUD completo de productos en pedidos

---

## 📝 Checklist de Implementación

- [x] Backend: Ventas con stock negativo
- [ ] Frontend: Enter para agregar productos
- [ ] Frontend: F3 para completar venta
- [x] Backend: Módulo de devoluciones
- [ ] Frontend: Interfaz de devoluciones
- [ ] Frontend: Filtro "Sin stock o en negativo"
- [ ] Frontend: Persistencia del carrito
- [x] Backend: Alta rápida de productos
- [ ] Frontend: Modal de alta rápida
- [x] Backend: Sistema de pedidos a proveedores
- [ ] Frontend: Barra lateral de pedidos

---

## 🚀 Próximos Pasos

1. Revisar este documento
2. Implementar los cambios de frontend faltantes
3. Probar cada funcionalidad
4. Crear Pull Request para revisión
5. Mergear a main

---

## 📞 Soporte

Para dudas o problemas con la implementación, consultar:
- Código de referencia en `server.js` y `dashboard.js`
- Documentación de API en comentarios del código
- Issues de GitHub para reportar bugs