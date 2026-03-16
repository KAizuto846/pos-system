// ============ PUNTO DE VENTA (POS) - CON PAGO EFECTIVO PREDETERMINADO ============

let searchTimeout;

async function renderPOS() {
  const wrapper = document.getElementById('content-wrapper');
  // NO limpiar el carrito cuando se vuelve a renderizar
  // state.cart = [];
  await loadPaymentMethods();

  // Buscar el ID del método de pago "Efectivo"
  const efectivoMethod = state.data.paymentMethods.find(p =>
    p.active && (p.name.toLowerCase().includes('efectivo') || p.name.toLowerCase().includes('cash'))
  );
  const defaultPaymentId = efectivoMethod ? efectivoMethod.id : (state.data.paymentMethods.find(p => p.active)?.id || '');

  wrapper.innerHTML = `
    <div class="section-header">
      <div>
        <h1>🛒 Punto de Venta</h1>
        <p>Registra nuevas ventas</p>
      </div>
      <button class="btn btn-danger" onclick="clearCart()">
        🗑️ Limpiar Todo
      </button>
    </div>

    <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 20px;">
      <div>
        <div class="table-container" style="margin-bottom: 20px;">
          <div style="padding: 20px;">
            <div class="search-box" style="margin-bottom: 0;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                type="text"
                placeholder="Buscar por nombre o código de barras (F2)"
                id="pos-search"
                onkeyup="searchProducts(event)"
                autofocus
              >
            </div>
          </div>
        </div>

        <div id="search-results" style="display: none;" class="table-container">
          <div class="table-header">
            <h3>Resultados de búsqueda</h3>
          </div>
          <div id="search-results-list" style="max-height: 300px; overflow-y: auto;"></div>
        </div>

        <div class="table-container">
          <div class="table-header">
            <h2>🛍️ Carrito de Compra</h2>
          </div>
          <div id="cart-items" class="table-wrapper">
            <div style="padding: 40px; text-align: center; color: var(--text-light);">
              <p>🛒 El carrito está vacío</p>
              <p style="font-size: 14px; margin-top: 10px;">Busca productos arriba para agregar al carrito</p>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div class="table-container" style="margin-bottom: 20px;">
          <div class="table-header">
            <h2>💰 Resumen</h2>
          </div>
          <div style="padding: 20px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid var(--border-color);">
              <span style="color: var(--text-light);">Items:</span>
              <strong id="summary-items">0</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid var(--border-color);">
              <span style="color: var(--text-light);">Subtotal:</span>
              <strong id="summary-subtotal">$0.00</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 20px; padding: 15px; background: var(--primary-color); color: white; border-radius: 8px; font-size: 20px;">
              <span>TOTAL:</span>
              <strong id="summary-total">$0.00</strong>
            </div>

            <div class="form-group">
              <label>Forma de Pago *</label>
              <select id="payment-method" required>
                <option value="">Seleccionar...</option>
                ${state.data.paymentMethods.filter(p => p.active).map(p => `
                  <option value="${p.id}" ${p.id === defaultPaymentId ? 'selected' : ''}>${p.name}</option>
                `).join('')}
              </select>
            </div>

            <button
              class="btn btn-primary"
              onclick="completeSale()"
              id="complete-sale-btn"
              style="width: 100%; padding: 15px; font-size: 18px; margin-top: 10px;"
              disabled
            >
              ✅ Completar Venta (F3)
            </button>
          </div>
        </div>

        <div class="table-container">
          <div class="table-header">
            <h3>⌨️ Atajos de Teclado</h3>
          </div>
          <div style="padding: 20px; font-size: 14px; line-height: 2;">
            <div><kbd>F2</kbd> - Enfocar búsqueda</div>
            <div><kbd>Enter</kbd> - Agregar producto</div>
            <div><kbd>Esc</kbd> - Limpiar búsqueda</div>
            <div><kbd>F3</kbd> - Completar venta</div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.addEventListener('keydown', handlePOSKeyboard);
  updateCartDisplay();
  setTimeout(() => document.getElementById('pos-search')?.focus(), 100);
}

function handlePOSKeyboard(e) {
  if (state.currentModule !== 'sales') return;

  if (e.key === 'F2') {
    e.preventDefault();
    document.getElementById('pos-search')?.focus();
  } else if (e.key === 'F3') {
    e.preventDefault();
    if (state.cart.length > 0) completeSale();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const searchInput = document.getElementById('pos-search');
    const resultsList = document.getElementById('search-results-list');

    if (searchInput === document.activeElement) {
      // Si hay resultados visibles, agregar el primero
      const firstProduct = resultsList.querySelector('div');
      if (firstProduct) {
        firstProduct.click();
      }
    }
  } else if (e.key === 'Escape') {
    document.getElementById('pos-search').value = '';
    document.getElementById('search-results').style.display = 'none';
  }
}

async function searchProducts(event) {
  const query = event.target.value.trim();
  const resultsDiv = document.getElementById('search-results');
  const resultsList = document.getElementById('search-results-list');

  if (!query) {
    resultsDiv.style.display = 'none';
    return;
  }

  clearTimeout(searchTimeout);

  searchTimeout = setTimeout(async () => {
    try {
      const products = await apiGet(`/api/products/search?q=${encodeURIComponent(query)}`);

      if (products.length === 0) {
        resultsDiv.style.display = 'none';
        return;
      }

      resultsDiv.style.display = 'block';
      resultsList.innerHTML = products.map(p => `
        <div
          onclick="addToCart(${p.id}, '${p.name.replace(/'/g, "\\'").replace(/"/g, '&quot;')}', ${p.price}, ${p.stock})"
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

function addToCart(productId, productName, price, stock) {
  const existing = state.cart.find(item => item.productId === productId);

  if (existing) {
    // Permitir agregar productos sin límite de stock
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
  document.getElementById('pos-search').value = '';
  document.getElementById('search-results').style.display = 'none';
  document.getElementById('pos-search').focus();
}

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
                    ${item.quantity >= item.stock ? 'disabled' : ''}
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
}

function updateQuantity(index, change) {
  const item = state.cart[index];
  const newQuantity = item.quantity + change;

  if (newQuantity <= 0) {
    removeFromCart(index);
    return;
  }

  // Permitir cantidades ilimitadas (sin restricción de stock)
  item.quantity = newQuantity;
  updateCartDisplay();
}

function removeFromCart(index) {
  state.cart.splice(index, 1);
  updateCartDisplay();
}

function clearCart() {
  if (state.cart.length === 0) return;

  if (confirm('¿Deseas limpiar todo el carrito?')) {
    state.cart = [];
    updateCartDisplay();
    document.getElementById('pos-search').focus();
  }
}

function updateSummary() {
  const totalItems = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  document.getElementById('summary-items').textContent = totalItems;
  document.getElementById('summary-subtotal').textContent = `$${total.toFixed(2)}`;
  document.getElementById('summary-total').textContent = `$${total.toFixed(2)}`;
}

async function completeSale() {
  const paymentMethodId = document.getElementById('payment-method').value;

  if (!paymentMethodId) {
    showNotification('Selecciona una forma de pago', 'error');
    return;
  }

  if (state.cart.length === 0) {
    showNotification('El carrito está vacío', 'error');
    return;
  }

  const total = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const saleData = {
    items: state.cart.map(item => ({
      product_id: item.productId,
      quantity: item.quantity,
      price: item.price
    })),
    payment_method_id: parseInt(paymentMethodId),
    total
  };

  try {
    const btn = document.getElementById('complete-sale-btn');
    btn.disabled = true;
    btn.textContent = '⏳ Procesando...';

    const result = await apiPost('/api/sales/create', saleData);

    showNotification(`✅ Venta completada: $${total.toFixed(2)}`, 'success');

    showTicket(result.saleId, state.cart, total, paymentMethodId);

    state.cart = [];

    // Restablecer al método de pago predeterminado (Efectivo)
    const efectivoMethod = state.data.paymentMethods.find(p =>
      p.active && (p.name.toLowerCase().includes('efectivo') || p.name.toLowerCase().includes('cash'))
    );
    if (efectivoMethod) {
      document.getElementById('payment-method').value = efectivoMethod.id;
    }

    updateCartDisplay();
    document.getElementById('pos-search').focus();

    btn.disabled = false;
    btn.textContent = '✅ Completar Venta (F3)';
  } catch (error) {
    console.error('Error:', error);
    showNotification(error.data?.error || 'Error al procesar venta', 'error');
    btn.disabled = false;
    btn.textContent = '✅ Completar Venta (F3)';
  }
}

function showTicket(saleId, items, total, paymentMethodId) {
  const paymentMethod = state.data.paymentMethods.find(p => p.id == paymentMethodId);
  const now = new Date();

  document.getElementById('modal-title').textContent = '🧾 Ticket de Venta';
  document.getElementById('modal-body').innerHTML = `
    <div style="font-family: monospace; font-size: 14px; line-height: 1.6;">
      <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px dashed #333; padding-bottom: 10px;">
        <h2 style="margin: 0;">TICKET DE VENTA</h2>
        <p style="margin: 5px 0;">Folio: #${saleId}</p>
        <p style="margin: 5px 0;">${now.toLocaleString('es-MX')}</p>
        <p style="margin: 5px 0;">Cajero: ${state.currentUser.username}</p>
      </div>

      <table style="width: 100%; margin-bottom: 20px;">
        <thead>
          <tr style="border-bottom: 1px solid #333;">
            <th style="text-align: left; padding: 5px;">Producto</th>
            <th style="text-align: center; padding: 5px;">Cant</th>
            <th style="text-align: right; padding: 5px;">Precio</th>
            <th style="text-align: right; padding: 5px;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => `
            <tr>
              <td style="padding: 5px;">${item.name}</td>
              <td style="text-align: center; padding: 5px;">${item.quantity}</td>
              <td style="text-align: right; padding: 5px;">$${item.price.toFixed(2)}</td>
              <td style="text-align: right; padding: 5px;">$${(item.price * item.quantity).toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div style="border-top: 2px solid #333; padding-top: 10px; margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; font-size: 18px; font-weight: bold;">
          <span>TOTAL:</span>
          <span>$${total.toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-top: 5px;">
          <span>Forma de Pago:</span>
          <span>${paymentMethod.name}</span>
        </div>
      </div>

      <div style="text-align: center; border-top: 2px dashed #333; padding-top: 10px;">
        <p>¡Gracias por su compra!</p>
      </div>
    </div>

    <div class="form-actions" style="margin-top: 20px;">
      <button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>
      <button class="btn btn-primary" onclick="window.print()">🖨️ Imprimir</button>
    </div>
  `;

  openModal();
}
