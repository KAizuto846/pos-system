// ============ DEVOLUCIONES ============
async function renderReturns() {
  const wrapper = document.getElementById('content-wrapper');
  await loadProducts();

  wrapper.innerHTML = `
    <div class="section-header">
      <div>
        <h1>🔄 Devoluciones</h1>
        <p>Procesa devoluciones de productos vendidos</p>
      </div>
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
                placeholder="Buscar producto por nombre o código"
                id="return-search"
                onkeyup="searchReturnProducts(event)"
                autofocus
              >
            </div>
          </div>
        </div>

        <div id="return-search-results" style="display: none;" class="table-container">
          <div class="table-header">
            <h3>Resultados de búsqueda</h3>
          </div>
          <div id="return-search-list" style="max-height: 300px; overflow-y: auto;"></div>
        </div>

        <div class="table-container">
          <div class="table-header">
            <h2>🛒 Carrito de Devoluciones</h2>
          </div>
          <div id="return-items" class="table-wrapper">
            <div style="padding: 40px; text-align: center; color: var(--text-light);">
              <p>🛒 El carrito está vacío</p>
              <p style="font-size: 14px; margin-top: 10px;">Busca productos arriba para agregar a devoluciones</p>
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
              <strong id="return-summary-items">0</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 20px; padding: 15px; background: var(--primary-color); color: white; border-radius: 8px; font-size: 20px;">
              <span>TOTAL DEVOLUCIÓN:</span>
              <strong id="return-summary-total">$0.00</strong>
            </div>

            <div class="form-group">
              <label>Motivo de Devolución *</label>
              <select id="return-reason" required>
                <option value="">Seleccionar...</option>
                <option value="defective">Producto Defectuoso</option>
                <option value="wrong">Producto Incorrecto</option>
                <option value="damaged">Producto Dañado</option>
                <option value="expired">Producto Vencido</option>
                <option value="customer-request">Solicitud del Cliente</option>
                <option value="other">Otro</option>
              </select>
            </div>

            <div class="form-group">
              <label>Notas (Opcional)</label>
              <textarea id="return-notes" rows="3" placeholder="Detalles adicionales sobre la devolución..."></textarea>
            </div>

            <button
              class="btn btn-primary"
              onclick="completeReturn()"
              id="complete-return-btn"
              style="width: 100%; padding: 15px; font-size: 18px; margin-top: 10px;"
              disabled
            >
              ✅ Procesar Devolución
            </button>

            <button
              class="btn btn-secondary"
              onclick="clearReturnCart()"
              style="width: 100%; padding: 12px; font-size: 16px; margin-top: 10px;"
            >
              🗑️ Limpiar
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Inicializar estado para devoluciones
  if (!state.returnCart) {
    state.returnCart = [];
  }
  updateReturnCartDisplay();
}

function searchReturnProducts(event) {
  const query = event.target.value.trim();
  const resultsDiv = document.getElementById('return-search-results');
  const resultsList = document.getElementById('return-search-list');

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
          onclick="addToReturnCart(${p.id}, '${p.name.replace(/'/g, "\\'").replace(/"/g, '&quot;')}', ${p.price})"
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
                Código: ${p.barcode || 'N/A'} | Precio: $${parseFloat(p.price).toFixed(2)}
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

function addToReturnCart(productId, productName, price) {
  if (!state.returnCart) {
    state.returnCart = [];
  }

  const existing = state.returnCart.find(item => item.productId === productId);

  if (existing) {
    existing.quantity++;
  } else {
    state.returnCart.push({
      productId,
      name: productName,
      price,
      quantity: 1
    });
  }

  updateReturnCartDisplay();
  document.getElementById('return-search').value = '';
  document.getElementById('return-search-results').style.display = 'none';
  document.getElementById('return-search').focus();
}

function updateReturnCartDisplay() {
  const cartDiv = document.getElementById('return-items');

  if (!state.returnCart || state.returnCart.length === 0) {
    cartDiv.innerHTML = `
      <div style="padding: 40px; text-align: center; color: var(--text-light);">
        <p>🛒 El carrito está vacío</p>
        <p style="font-size: 14px; margin-top: 10px;">Busca productos arriba para agregar a devoluciones</p>
      </div>
    `;
    document.getElementById('complete-return-btn').disabled = true;
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
          ${state.returnCart.map((item, index) => `
            <tr>
              <td>
                <strong>${item.name}</strong>
              </td>
              <td>
                <div style="display: flex; align-items: center; gap: 5px;">
                  <button
                    onclick="updateReturnQuantity(${index}, -1)"
                    class="btn btn-small btn-secondary"
                    style="padding: 2px 8px; font-size: 16px;"
                  >-</button>
                  <span style="font-weight: bold; min-width: 20px; text-align: center;">${item.quantity}</span>
                  <button
                    onclick="updateReturnQuantity(${index}, 1)"
                    class="btn btn-small btn-secondary"
                    style="padding: 2px 8px; font-size: 16px;"
                  >+</button>
                </div>
              </td>
              <td>$${item.price.toFixed(2)}</td>
              <td><strong>$${(item.price * item.quantity).toFixed(2)}</strong></td>
              <td>
                <button
                  onclick="removeFromReturnCart(${index})"
                  class="btn btn-small btn-danger"
                  style="padding: 4px 8px;"
                >🗑️</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    document.getElementById('complete-return-btn').disabled = false;
  }

  updateReturnSummary();
}

function updateReturnQuantity(index, change) {
  const item = state.returnCart[index];
  const newQuantity = item.quantity + change;

  if (newQuantity <= 0) {
    removeFromReturnCart(index);
    return;
  }

  item.quantity = newQuantity;
  updateReturnCartDisplay();
}

function removeFromReturnCart(index) {
  state.returnCart.splice(index, 1);
  updateReturnCartDisplay();
}

function clearReturnCart() {
  if (!state.returnCart || state.returnCart.length === 0) return;

  if (confirm('¿Deseas limpiar todo el carrito de devoluciones?')) {
    state.returnCart = [];
    updateReturnCartDisplay();
    document.getElementById('return-search').focus();
  }
}

function updateReturnSummary() {
  const totalItems = state.returnCart ? state.returnCart.reduce((sum, item) => sum + item.quantity, 0) : 0;
  const total = state.returnCart ? state.returnCart.reduce((sum, item) => sum + (item.price * item.quantity), 0) : 0;

  document.getElementById('return-summary-items').textContent = totalItems;
  document.getElementById('return-summary-total').textContent = `$${total.toFixed(2)}`;
}

async function completeReturn() {
  const reason = document.getElementById('return-reason').value;
  const notes = document.getElementById('return-notes').value;

  if (!reason) {
    showNotification('Selecciona un motivo de devolución', 'error');
    return;
  }

  if (!state.returnCart || state.returnCart.length === 0) {
    showNotification('El carrito está vacío', 'error');
    return;
  }

  const total = state.returnCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const returnData = {
    items: state.returnCart.map(item => ({
      product_id: item.productId,
      quantity: item.quantity,
      price: item.price
    })),
    reason,
    notes,
    total
  };

  try {
    const btn = document.getElementById('complete-return-btn');
    btn.disabled = true;
    btn.textContent = '⏳ Procesando...';

    const result = await apiPost('/api/returns/create', returnData);

    showNotification(`✅ Devolución procesada: $${total.toFixed(2)}`, 'success');

    // Mostrar recibo de devolución
    showReturnReceipt(result.returnId, state.returnCart, total, reason);

    state.returnCart = [];
    document.getElementById('return-reason').value = '';
    document.getElementById('return-notes').value = '';

    updateReturnCartDisplay();
    document.getElementById('return-search').focus();

    btn.disabled = false;
    btn.textContent = '✅ Procesar Devolución';
  } catch (error) {
    console.error('Error:', error);
    showNotification(error.data?.error || 'Error al procesar devolución', 'error');
    btn.disabled = false;
    btn.textContent = '✅ Procesar Devolución';
  }
}

function showReturnReceipt(returnId, items, total, reason) {
  const now = new Date();

  document.getElementById('modal-title').textContent = '🧾 Recibo de Devolución';
  document.getElementById('modal-body').innerHTML = `
    <div style="font-family: monospace; font-size: 14px; line-height: 1.6;">
      <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px dashed #333; padding-bottom: 10px;">
        <h2 style="margin: 0;">RECIBO DE DEVOLUCIÓN</h2>
        <p style="margin: 5px 0;">Folio: #${returnId}</p>
        <p style="margin: 5px 0;">${now.toLocaleString('es-MX')}</p>
        <p style="margin: 5px 0;">Recibido por: ${state.currentUser.username}</p>
      </div>

      <div style="margin-bottom: 15px; padding: 10px; background: #f1f5f9; border-radius: 4px;">
        <p style="margin: 0;"><strong>Motivo:</strong> ${reason}</p>
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
          <span>TOTAL DEVOLUCIÓN:</span>
          <span>$${total.toFixed(2)}</span>
        </div>
      </div>

      <div style="text-align: center; border-top: 2px dashed #333; padding-top: 10px;">
        <p>Devolución procesada correctamente</p>
      </div>
    </div>

    <div class="form-actions" style="margin-top: 20px;">
      <button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>
      <button class="btn btn-primary" onclick="window.print()">🖨️ Imprimir</button>
    </div>
  `;

  openModal();
}
