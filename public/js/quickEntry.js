// ============ ALTA RÁPIDA DE PRODUCTOS ============
async function renderQuickEntry() {
  const wrapper = document.getElementById('content-wrapper');
  await loadSuppliers();
  await loadDepartments();

  // Inicializar estado para entrada rápida
  if (!state.quickEntryQueue) {
    state.quickEntryQueue = [];
  }

  wrapper.innerHTML = `
    <div class="section-header">
      <div>
        <h1>📦 Alta Rápida de Productos</h1>
        <p>Registra productos que llegan del proveedor escanendo códigos de barras</p>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 20px;">
      <div>
        <div class="table-container" style="margin-bottom: 20px;">
          <div class="table-header">
            <h3>📱 Escanear Código de Barras</h3>
          </div>
          <div style="padding: 20px;">
            <div class="form-group">
              <label>Código de Barras / Producto *</label>
              <input
                type="text"
                id="quick-barcode"
                placeholder="Escanea o escribe el código de barras"
                onkeyup="handleQuickEntryInput(event)"
                autofocus
              >
            </div>
            <div class="form-group">
              <label>Cantidad que llega *</label>
              <input
                type="number"
                id="quick-quantity"
                min="1"
                value="1"
                placeholder="1"
              >
            </div>
            <button class="btn btn-primary" onclick="addToQuickQueue()" style="width: 100%; padding: 12px;">
              ➕ Agregar a Cola
            </button>
          </div>
        </div>

        <div class="table-container">
          <div class="table-header">
            <h2>📋 Cola de Entrada</h2>
          </div>
          <div id="quick-entry-queue" class="table-wrapper">
            <div style="padding: 40px; text-align: center; color: var(--text-light);">
              <p>📦 No hay productos en la cola</p>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div class="table-container" style="margin-bottom: 20px;">
          <div class="table-header">
            <h2>✏️ Detalles del Producto</h2>
          </div>
          <div id="quick-product-details" style="padding: 20px;">
            <div style="text-align: center; color: var(--text-light);">
              Selecciona un producto para editar
            </div>
          </div>
        </div>

        <div class="table-container">
          <div class="table-header">
            <h3>📊 Resumen</h3>
          </div>
          <div style="padding: 20px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid var(--border-color);">
              <span style="color: var(--text-light);">Productos:</span>
              <strong id="quick-summary-count">0</strong>
            </div>

            <button
              class="btn btn-primary"
              onclick="processQuickEntry()"
              id="process-quick-btn"
              style="width: 100%; padding: 15px; font-size: 18px; margin-top: 10px;"
              disabled
            >
              ✅ Procesar Entrada
            </button>

            <button
              class="btn btn-secondary"
              onclick="clearQuickQueue()"
              style="width: 100%; padding: 12px; font-size: 16px; margin-top: 10px;"
            >
              🗑️ Limpiar Cola
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  updateQuickEntryDisplay();
}

async function handleQuickEntryInput(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    addToQuickQueue();
  }
}

async function addToQuickQueue() {
  const barcode = document.getElementById('quick-barcode').value.trim();
  const quantity = parseInt(document.getElementById('quick-quantity').value) || 1;

  if (!barcode) {
    showNotification('Ingresa un código de barras', 'error');
    return;
  }

  if (quantity <= 0) {
    showNotification('La cantidad debe ser mayor a 0', 'error');
    return;
  }

  // Buscar el producto
  try {
    const products = await apiGet(`/api/products/search?q=${encodeURIComponent(barcode)}`);

    if (products.length === 0) {
      showNotification('Producto no encontrado', 'error');
      return;
    }

    const product = products[0];

    if (!state.quickEntryQueue) {
      state.quickEntryQueue = [];
    }

    const existing = state.quickEntryQueue.find(item => item.productId === product.id);

    if (existing) {
      existing.quantity += quantity;
    } else {
      state.quickEntryQueue.push({
        productId: product.id,
        name: product.name,
        barcode: product.barcode,
        currentPrice: product.price,
        newPharmacyPrice: product.cost || 0,
        newPublicPrice: product.price,
        quantity: quantity,
        department: product.department_id,
        supplier: product.supplier_id
      });
    }

    updateQuickEntryDisplay();
    document.getElementById('quick-barcode').value = '';
    document.getElementById('quick-quantity').value = '1';
    document.getElementById('quick-barcode').focus();

  } catch (error) {
    console.error('Error:', error);
    showNotification('Error al buscar el producto', 'error');
  }
}

function updateQuickEntryDisplay() {
  const queueDiv = document.getElementById('quick-entry-queue');
  const summaryCount = document.getElementById('quick-summary-count');

  if (!state.quickEntryQueue || state.quickEntryQueue.length === 0) {
    queueDiv.innerHTML = `
      <div style="padding: 40px; text-align: center; color: var(--text-light);">
        <p>📦 No hay productos en la cola</p>
      </div>
    `;
    summaryCount.textContent = '0';
    document.getElementById('process-quick-btn').disabled = true;
  } else {
    queueDiv.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Producto</th>
            <th style="width: 80px;">Cantidad</th>
            <th>Acción</th>
          </tr>
        </thead>
        <tbody>
          ${state.quickEntryQueue.map((item, index) => `
            <tr>
              <td>
                <strong>${item.name}</strong>
                <div style="font-size: 12px; color: var(--text-light);">
                  ${item.barcode || 'N/A'}
                </div>
              </td>
              <td>
                <div style="display: flex; align-items: center; gap: 5px;">
                  <button
                    onclick="updateQuickQuantity(${index}, -1)"
                    class="btn btn-small btn-secondary"
                    style="padding: 2px 8px; font-size: 16px;"
                  >-</button>
                  <span style="font-weight: bold; min-width: 20px; text-align: center;">${item.quantity}</span>
                  <button
                    onclick="updateQuickQuantity(${index}, 1)"
                    class="btn btn-small btn-secondary"
                    style="padding: 2px 8px; font-size: 16px;"
                  >+</button>
                </div>
              </td>
              <td>
                <button
                  onclick="editQuickEntry(${index})"
                  class="btn btn-small btn-secondary"
                  style="padding: 4px 8px;"
                >✏️</button>
                <button
                  onclick="removeFromQuickQueue(${index})"
                  class="btn btn-small btn-danger"
                  style="padding: 4px 8px;"
                >🗑️</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    summaryCount.textContent = state.quickEntryQueue.length;
    document.getElementById('process-quick-btn').disabled = false;
  }
}

function updateQuickQuantity(index, change) {
  const item = state.quickEntryQueue[index];
  const newQuantity = item.quantity + change;

  if (newQuantity <= 0) {
    removeFromQuickQueue(index);
    return;
  }

  item.quantity = newQuantity;
  updateQuickEntryDisplay();
}

function removeFromQuickQueue(index) {
  state.quickEntryQueue.splice(index, 1);
  updateQuickEntryDisplay();
  document.getElementById('quick-product-details').innerHTML = '<div style="text-align: center; color: var(--text-light);">Selecciona un producto para editar</div>';
}

function clearQuickQueue() {
  if (!state.quickEntryQueue || state.quickEntryQueue.length === 0) return;

  if (confirm('¿Deseas limpiar toda la cola?')) {
    state.quickEntryQueue = [];
    updateQuickEntryDisplay();
    document.getElementById('quick-product-details').innerHTML = '<div style="text-align: center; color: var(--text-light);">Selecciona un producto para editar</div>';
    document.getElementById('quick-barcode').focus();
  }
}

function editQuickEntry(index) {
  const item = state.quickEntryQueue[index];

  document.getElementById('quick-product-details').innerHTML = `
    <form onsubmit="saveQuickEntryChanges(event, ${index})">
      <div class="form-group">
        <label><strong>${item.name}</strong></label>
        <small style="color: var(--text-light);">Código: ${item.barcode || 'N/A'}</small>
      </div>

      <div class="form-group">
        <label>Cantidad que llega</label>
        <input type="number" id="quick-qty-edit" value="${item.quantity}" min="1" required>
      </div>

      <div class="form-group">
        <label>Precio Farmacia (Costo)</label>
        <input type="number" step="0.01" id="quick-pharmacy-price" value="${item.newPharmacyPrice.toFixed(2)}" required>
      </div>

      <div class="form-group">
        <label>Precio Público</label>
        <input type="number" step="0.01" id="quick-public-price" value="${item.newPublicPrice.toFixed(2)}" required>
      </div>

      <div style="display: flex; gap: 10px;">
        <button type="submit" class="btn btn-primary" style="flex: 1;">💾 Guardar</button>
        <button type="button" class="btn btn-secondary" onclick="updateQuickEntryDisplay()" style="flex: 1;">Cerrar</button>
      </div>
    </form>
  `;
}

function saveQuickEntryChanges(event, index) {
  event.preventDefault();

  const item = state.quickEntryQueue[index];
  item.quantity = parseInt(document.getElementById('quick-qty-edit').value);
  item.newPharmacyPrice = parseFloat(document.getElementById('quick-pharmacy-price').value);
  item.newPublicPrice = parseFloat(document.getElementById('quick-public-price').value);

  updateQuickEntryDisplay();
  showNotification('Cambios guardados', 'success');
}

async function processQuickEntry() {
  if (!state.quickEntryQueue || state.quickEntryQueue.length === 0) {
    showNotification('No hay productos para procesar', 'error');
    return;
  }

  const btn = document.getElementById('process-quick-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Procesando...';

  try {
    const entries = state.quickEntryQueue.map(item => ({
      product_id: item.productId,
      quantity: item.quantity,
      pharmacy_price: item.newPharmacyPrice,
      public_price: item.newPublicPrice
    }));

    await apiPost('/api/products/quick-entry', { entries });

    showNotification(`✅ ${state.quickEntryQueue.length} producto(s) ingresado(s) al inventario`, 'success');
    state.quickEntryQueue = [];
    updateQuickEntryDisplay();
    document.getElementById('quick-barcode').focus();

    btn.disabled = false;
    btn.textContent = '✅ Procesar Entrada';
  } catch (error) {
    console.error('Error:', error);
    showNotification(error.data?.error || 'Error al procesar entrada', 'error');
    btn.disabled = false;
    btn.textContent = '✅ Procesar Entrada';
  }
}
