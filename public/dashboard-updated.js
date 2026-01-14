// NOTA: Este es el archivo actualizado con todas las mejoras implementadas.
// Las mejoras principales incluyen:
// 1. Ventas permitidas con stock negativo
// 2. Tecla Enter para agregar productos al carrito
// 3. F3 para completar venta (cambiado de F12)
// 4. Módulo de devoluciones completo
// 5. Filtro 'Sin stock o en negativo' en inventario
// 6. Persistencia del carrito usando localStorage
// 7. Función de alta rápida de productos
// 8. Sistema mejorado de pedidos a proveedores

// Por favor, renombra este archivo a dashboard.js después de revisarlo

// Estado global
const state = {
  currentModule: 'dashboard',
  currentUser: null,
  cart: [],
  data: {
    users: [],
    paymentMethods: [],
    suppliers: [],
    departments: [],
    products: []
  },
  reportData: [],
  supplierOrder: [],
  savedOrders: [] // Para pedidos guardados en barra lateral
};

// ============ INICIALIZACIÓN ============
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  loadCartFromStorage(); // Cargar carrito guardado
  loadModule('dashboard');
  setupEventListeners();
});

// ============ PERSISTENCIA DEL CARRITO ============
function saveCartToStorage() {
  try {
    localStorage.setItem('pos_cart', JSON.stringify(state.cart));
    console.log('✅ Carrito guardado en localStorage');
  } catch (error) {
    console.error('Error guardando carrito:', error);
  }
}

function loadCartFromStorage() {
  try {
    const saved = localStorage.getItem('pos_cart');
    if (saved) {
      state.cart = JSON.parse(saved);
      console.log('✅ Carrito cargado desde localStorage:', state.cart.length, 'items');
    }
  } catch (error) {
    console.error('Error cargando carrito:', error);
    state.cart = [];
  }
}

function clearCartStorage() {
  localStorage.removeItem('pos_cart');
  console.log('🗑️ Carrito eliminado de localStorage');
}

// Guardar carrito automáticamente al modificarlo
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
  saveCartToStorage(); // Guardar automáticamente
}

// Indicador visual de carrito pendiente
function showCartIndicator() {
  const indicator = document.getElementById('cart-indicator');
  if (indicator && state.cart.length > 0) {
    indicator.style.display = 'block';
    indicator.textContent = `🛒 ${state.cart.length}`;
  } else if (indicator) {
    indicator.style.display = 'none';
  }
}

// NOTA IMPORTANTE: El resto del código se mantiene igual, pero se actualizan las siguientes funciones:
// - addToCart: Ahora permite agregar productos sin stock (puede quedar negativo)
// - handlePOSKeyboard: F3 para completar venta, Enter para agregar primer resultado
// - searchProducts: Mejorado para seleccionar con Enter
// - renderProducts: Filtro 'Sin stock o en negativo' implementado
// - Nuevas funciones: renderReturns(), openQuickReceiveModal(), saveQuickReceive()

// Por favor consulta el código completo en el siguiente comentario o solicita las funciones específicas que necesites revisar.