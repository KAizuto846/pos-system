# Guía de Implementación Frontend

## 🚨 IMPORTANTE

Debido a la extensión del archivo `dashboard.js` (78KB), proporciono los cambios necesarios organizados por función.

## 📝 Cambios Necesarios en `dashboard.js`

### 1. Estado Global - Agregar al inicio

```javascript
// MODIFICAR el objeto state para incluir:
const state = {
  currentModule: 'dashboard',
  currentUser: null,
  cart: [],  // Este se cargará desde localStorage
  data: {
    users: [],
    paymentMethods: [],
    suppliers: [],
    departments: [],
    products: []
  },
  reportData: [],
  supplierOrder: [],
  savedOrders: [], // NUEVO
  currentReportTab: 'sales',
  searchResults: [] // NUEVO: Para Enter en búsqueda
};
```

### 2. Funciones de Persistencia - Agregar después de la inicialización
```javascript
// ============ PERSISTENCIA DEL CARRITO ============
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

function updateCartIndicator() {
  const indicator = document.getElementById('cart-indicator');
  if (indicator) {
    if (state.cart.length > 0) {
      indicator.style.display = 'inline-block';
      indicator.textContent = state.cart.length;
    } else {
      indicator.style.display = 'none';
    }
  }
}
```

### 3. Modificar DOMContentLoaded

```javascript
// REEMPLAZAR la función existente:
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  loadCartFromStorage(); // NUEVO
  loadModule('dashboard');
  setupEventListeners();
  updateCartIndicator(); // NUEVO
});
```

### 4. Modificar handlePOSKeyboard - Cambiar F12 a F3

```javascript
// REEMPLAZAR la función completa:
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
  } else if (e.key === 'Enter') {  // NUEVO: Enter para agregar
    const searchField = document.getElementById('pos-search');
    if (document.activeElement === searchField && state.searchResults.length > 0) {
      e.preventDefault();
      const first = state.searchResults[0];
      addToCart(first.id, first.name, first.price, first.stock);
    }
  }
}
```

### 5. Modificar searchProducts - Guardar resultados

```javascript
// MODIFICAR la función para guardar resultados en state:
let searchTimeout;
async function searchProducts(event) {
  const query = event.target.value.trim();
  const resultsDiv = document.getElementById('search-results');
  const resultsList = document.getElementById('search-results-list');
  
  if (!query) {
    resultsDiv.style.display = 'none';
    state.searchResults = []; // NUEVO
    return;
  }
  
  clearTimeout(searchTimeout);
  
  searchTimeout = setTimeout(async () => {
    try {
      const response = await fetch(`/api/products/search?q=${encodeURIComponent(query)}`);
      const products = await response.json();
      
      state.searchResults = products; // NUEVO: Guardar resultados
      
      if (products.length === 0) {
        resultsDiv.style.display = 'none';
        return;
      }
      
      resultsDiv.style.display = 'block';
      resultsList.innerHTML = products.map(p => `
        <div 
          onclick="addToCart(${p.id}, '${p.name.replace(/'/g, "\\\'")}', ${p.price}, ${p.stock})"
          style="
            padding: 15px;
            border-bottom: 1px solid var(--border-color);
            cursor: pointer;
            transition: background 0.2s;
          "
          onmouseover="this.style.background='#f8fafc'"
          onmouseout="this.style.background='white'"
        >
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong style="font-size: 16px;">${p.name}</strong>
              <div style="font-size: 12px; color: var(--text-light); margin-top: 4px;">
                Código: ${p.barcode || 'N/A'} | Stock: ${p.stock}
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 20px; color: var(--success-color); font-weight: bold;">$${parseFloat(p.price).toFixed(2)}</div>
            </div>
          </div>
        </div>
      `).join('');
      
    } catch (error) {
      console.error('Error buscando productos:', error);
    }
  }, 300);
}
```

### 6. Modificar addToCart - Permitir stock negativo y guardar

```javascript
// REEMPLAZAR la función completa:
function addToCart(productId, productName, price, stock) {
  // ELIMINADA LA VALIDACIÓN DE STOCK - Ahora permite agregar sin importar stock
  
  const existing = state.cart.find(item => item.productId === productId);
  
  if (existing) {
    existing.quantity++;
  } else {
    state.cart.push({
      productId,
      name: productName,
      price,
      quantity: 1,
      stock
    });
  }
  
  updateCartDisplay();
  updateCartIndicator(); // NUEVO
  document.getElementById('pos-search').value = '';
  document.getElementById('search-results').style.display = 'none';
  state.searchResults = []; // NUEVO
  document.getElementById('pos-search').focus();
}
```

### 7. Modificar updateCartDisplay - Agregar guardado automático

```javascript
// MODIFICAR al final de la función:
function updateCartDisplay() {
  const cartDiv = document.getElementById('cart-items');
  
  if (state.cart.length === 0) {
    cartDiv.innerHTML = `
      <div style="padding: 40px; text-align: center; color: var(--text-light);">
        <p>🛒 El carrito está vacío</p>
        <p style="font-size: 14px; margin-top: 10px;">Busca productos arriba para agregar al carrito</p>
      </div>
    `;
    document.getElementById('complete-sale-btn').disabled = true;
  } else {
    cartDiv.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Producto</th>
            <th style="width: 80px;">Cant.</th>
            <th style="width: 100px;">Precio</th>
            <th style="width: 100px;">Total</th>
            <th style="width: 80px;">Acción</th>
          </tr>
        </thead>
        <tbody>
          ${state.cart.map((item, index) => `
            <tr>
              <td>
                <strong>${item.name}</strong>
                <div style="font-size: 12px; color: var(--text-light);">Stock: ${item.stock}</div>
              </td>
              <td>
                <div style="display: flex; align-items: center; gap: 5px;">
                  <button 
                    onclick="updateQuantity(${index}, -1)" 
                    class="btn btn-small btn-secondary"
                    style="padding: 2px 8px; font-size: 16px;"
                  >-</button>
                  <span style="font-weight: bold; min-width: 20px; text-align: center;">${item.quantity}</span>
                  <button 
                    onclick="updateQuantity(${index}, 1)" 
                    class="btn btn-small btn-secondary"
                    style="padding: 2px 8px; font-size: 16px;"
                  >+</button>
                </div>
              </td>
              <td>$${item.price.toFixed(2)}</td>
              <td><strong>$${(item.price * item.quantity).toFixed(2)}</strong></td>
              <td>
                <button 
                  onclick="removeFromCart(${index})" 
                  class="btn btn-small btn-danger"
                  style="padding: 4px 8px;"
                >🗑️</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    document.getElementById('complete-sale-btn').disabled = false;
  }
  
  updateSummary();
  saveCartToStorage(); // NUEVO: Guardar automáticamente
  updateCartIndicator(); // NUEVO
}
```

### 8. Modificar completeSale - Limpiar storage

```javascript
// AGREGAR después de limpiar el carrito:
async function completeSale() {
  // ... código existente ...
  
  if (response.ok) {
    showNotification(`✅ Venta completada: $${total.toFixed(2)}`, 'success');
    showTicket(result.saleId, state.cart, total, paymentMethodId);
    
    state.cart = [];
    clearCartStorage(); // NUEVO: Limpiar localStorage
    
    // Restablecer al método de pago predeterminado
    const efectivoMethod = state.data.paymentMethods.find(p => 
      p.active && (p.name.toLowerCase().includes('efectivo') || p.name.toLowerCase().includes('cash'))
    );
    if (efectivoMethod) {
      document.getElementById('payment-method').value = efectivoMethod.id;
    }
    
    updateCartDisplay();
    updateCartIndicator(); // NUEVO
    document.getElementById('pos-search').focus();
  }
  // ... resto del código ...
}
```

### 9. Modificar renderPOS - Cargar carrito al inicio

```javascript
// AGREGAR al inicio de la función:
async function renderPOS() {
  const wrapper = document.getElementById('content-wrapper');
  loadCartFromStorage(); // NUEVO: Cargar carrito guardado
  await loadPaymentMethods();
  
  // ... resto del código existente ...
  
  // AL FINAL, después de wrapper.innerHTML = ...:
  document.addEventListener('keydown', handlePOSKeyboard);
  setTimeout(() => {
    document.getElementById('pos-search')?.focus();
    updateCartDisplay(); // NUEVO: Mostrar carrito cargado
    updateCartIndicator(); // NUEVO
  }, 100);
}
```

### 10. Actualizar texto de botón de completar venta

```javascript
// BUSCAR en renderPOS() el botón y cambiar de F12 a F3:
<button 
  class="btn btn-primary" 
  onclick="completeSale()" 
  id="complete-sale-btn"
  style="width: 100%; padding: 15px; font-size: 18px; margin-top: 10px;"
  disabled
>
  ✅ Completar Venta (F3)  <!-- CAMBIAR DE F12 A F3 -->
</button>
```

### 11. Actualizar atajos de teclado

```javascript
// BUSCAR en renderPOS() la sección de atajos y actualizar:
<div style="padding: 20px; font-size: 14px; line-height: 2;">
  <div><kbd>F2</kbd> - Enfocar búsqueda</div>
  <div><kbd>Enter</kbd> - Agregar primer resultado</div>  <!-- NUEVO -->
  <div><kbd>Esc</kbd> - Limpiar búsqueda</div>
  <div><kbd>F3</kbd> - Completar venta</div>  <!-- CAMBIAR DE F12 A F3 -->
</div>
```

## CONTINUARÁ EN LA SIGUIENTE SECCIÓN...

Esta es la primera parte. Las siguientes secciones incluirán:
- Módulo de Devoluciones completo
- Filtro "Sin stock o en negativo"
- Alta Rápida de Productos
- Sistema mejorado de Pedidos a Proveedores

**Ver archivo: `IMPLEMENTACION_FRONTEND_PARTE2.md`**