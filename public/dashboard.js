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
  orderDrafts: [] // Barra lateral / Memoria de pedidos
};

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  loadCartFromStorage(); // Persistencia de carrito
  loadModule('dashboard');
  setupEventListeners();
  updateCartIndicator();
});

// ============ PERSISTENCIA DEL CARRITO ============
function saveCartToStorage() {
  localStorage.setItem('pos_cart', JSON.stringify(state.cart));
  updateCartIndicator();
}

function loadCartFromStorage() {
  const saved = localStorage.getItem('pos_cart');
  if (saved) state.cart = JSON.parse(saved);
}

function updateCartIndicator() {
  const indicator = document.getElementById('cart-indicator');
  if (indicator) {
    indicator.textContent = state.cart.length;
    indicator.style.display = state.cart.length > 0 ? 'inline-block' : 'none';
  }
}

// Verificar autenticación
async function checkAuth() {
  try {
    const response = await fetch('/api/session');
    const data = await response.json();
    if (!data.authenticated) { window.location.href = '/index.html'; return; }
    state.currentUser = data.user;
    document.getElementById('username-display').textContent = data.user.username;
    document.getElementById('role-display').textContent = data.user.role === 'admin' ? 'Administrador' : 'Cajero';
  } catch (error) { window.location.href = '/index.html'; }
}

// Event Listeners Globales
function setupEventListeners() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      loadModule(item.dataset.module);
    });
  });
  document.getElementById('logout-btn').addEventListener('click', () => fetch('/api/logout', { method: 'POST' }).then(() => window.location.href = '/index.html'));
  document.getElementById('modal-close').addEventListener('click', closeModal);
}

function closeModal() { document.getElementById('modal').classList.remove('active'); }
function openModal() { document.getElementById('modal').classList.add('active'); }

function showNotification(message, type = 'success') {
  const div = document.createElement('div');
  div.className = `alert ${type} show`;
  div.style.cssText = 'position:fixed;top:20px;right:20px;z-index:10000;padding:15px;border-radius:8px;background:white;box-shadow:0 4px 6px rgba(0,0,0,0.1);';
  div.textContent = message;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 3000);
}

// Cargar módulo
async function loadModule(moduleName) {
  state.currentModule = moduleName;
  const wrapper = document.getElementById('content-wrapper');
  wrapper.innerHTML = '<div style="padding:20px;">Cargando...</div>';
  
  switch(moduleName) {
    case 'dashboard': await renderDashboard(); break;
    case 'sales': await renderPOS(); break;
    case 'returns': await renderReturns(); break;
    case 'quick-receive': await renderQuickReceive(); break;
    case 'products': await renderProducts(); break;
    case 'reports': await renderReports(); break;
    case 'users': await renderUsers(); break;
    case 'payment-methods': await renderPaymentMethods(); break;
    case 'suppliers': await renderSuppliers(); break;
    case 'departments': await renderDepartments(); break;
    default: wrapper.innerHTML = '<h1>Módulo no encontrado</h1>';
  }
}

// ============ PUNTO DE VENTA (POS) ============
async function renderPOS() {
  const wrapper = document.getElementById('content-wrapper');
  await loadPaymentMethods();
  
  wrapper.innerHTML = `
    <div class="section-header">
      <h1>🛒 Punto de Venta</h1>
      <button class="btn btn-danger" onclick="clearCart()">🗑️ Vaciar Carrito</button>
    </div>
    <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 20px;">
      <div>
        <div class="table-container" style="margin-bottom: 20px;">
          <div style="padding: 20px;">
            <input type="text" id="pos-search" class="form-control" placeholder="Escanear producto o buscar... (Enter)" autofocus style="width:100%;font-size:18px;padding:12px;">
            <div id="pos-results" style="background:white;border:1px solid #ddd;max-height:300px;overflow-y:auto;display:none;position:absolute;z-index:100;width:50%;"></div>
          </div>
        </div>
        <div class="table-container" id="cart-container"></div>
      </div>
      <div class="table-container" style="padding:20px;">
        <h2 style="margin-top:0;">💰 Resumen</h2>
        <div id="cart-totals" style="font-size:20px;margin:20px 0;line-height:2;"></div>
        <select id="payment-method-select" class="form-control" style="margin-bottom:20px;padding:10px;">
          ${state.data.paymentMethods.map(m => `<option value="${m.id}">${m.name}</option>`).join('')}
        </select>
        <button class="btn btn-primary" onclick="completeSale()" style="width:100%;font-size:24px;padding:20px;">✅ COBRAR (F3)</button>
        <div style="margin-top:20px;color:#666;">
          <p><kbd>Enter</kbd>: Agregar producto</p>
          <p><kbd>F3</kbd>: Finalizar venta</p>
        </div>
      </div>
    </div>
  `;

  const searchInput = document.getElementById('pos-search');
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && searchInput.value) {
      e.preventDefault();
      quickAddProduct(searchInput.value);
    }
  });

  window.onkeydown = (e) => {
    if (state.currentModule === 'sales') {
      if (e.key === 'F3') { e.preventDefault(); completeSale(); }
    }
  };

  updateCartDisplay();
}

async function quickAddProduct(query) {
  try {
    const res = await fetch(`/api/products/search?q=${encodeURIComponent(query)}`);
    const products = await res.json();
    if (products.length > 0) {
      addToCart(products[0]);
      document.getElementById('pos-search').value = '';
    } else {
      showNotification('Producto no encontrado', 'error');
    }
  } catch (e) { console.error(e); }
}

function addToCart(product) {
  const existing = state.cart.find(i => i.product_id === product.id);
  if (existing) {
    existing.quantity++;
  } else {
    state.cart.push({
      product_id: product.id,
      name: product.name,
      price: product.price,
      quantity: 1,
      stock: product.stock
    });
  }
  saveCartToStorage();
  updateCartDisplay();
}

function updateCartDisplay() {
  const container = document.getElementById('cart-container');
  if (!container) return;
  
  if (state.cart.length === 0) {
    container.innerHTML = '<div style="padding:40px;text-align:center;color:#94a3b8;">Carrito vacío</div>';
    document.getElementById('cart-totals').innerHTML = 'Total: $0.00';
    return;
  }

  container.innerHTML = `
    <table class="report-table">
      <thead><tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Total</th><th></th></tr></thead>
      <tbody>
        ${state.cart.map((item, idx) => `
          <tr>
            <td>${item.name} <br><small style="color:${item.stock <= 0 ? 'red' : '#666'}">Stock: ${item.stock}</small></td>
            <td><input type="number" value="${item.quantity}" onchange="updateCartQty(${idx}, this.value)" style="width:60px;"></td>
            <td>$${item.price.toFixed(2)}</td>
            <td>$${(item.price * item.quantity).toFixed(2)}</td>
            <td><button class="btn btn-small btn-danger" onclick="removeFromCart(${idx})">🗑️</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  const total = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  document.getElementById('cart-totals').innerHTML = `
    <div style="display:flex;justify-content:space-between;"><span>Items:</span> <span>${state.cart.length}</span></div>
    <div style="display:flex;justify-content:space-between;font-weight:bold;color:var(--primary-color);"><span>TOTAL:</span> <span>$${total.toFixed(2)}</span></div>
  `;
}

function updateCartQty(idx, val) {
  state.cart[idx].quantity = parseInt(val) || 1;
  saveCartToStorage();
  updateCartDisplay();
}

function removeFromCart(idx) {
  state.cart.splice(idx, 1);
  saveCartToStorage();
  updateCartDisplay();
}

function clearCart() {
  if (confirm('¿Vaciar carrito?')) {
    state.cart = [];
    saveCartToStorage();
    updateCartDisplay();
  }
}

async function completeSale() {
  if (state.cart.length === 0) return;
  const total = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const data = {
    items: state.cart,
    payment_method_id: parseInt(document.getElementById('payment-method-select').value),
    total
  };
  
  const res = await fetch('/api/sales/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  
  if (res.ok) {
    showNotification('Venta completada');
    state.cart = [];
    saveCartToStorage();
    loadModule('sales');
  } else {
    showNotification('Error al procesar venta', 'error');
  }
}

// ============ DEVOLUCIONES ============
async function renderReturns() {
  const wrapper = document.getElementById('content-wrapper');
  wrapper.innerHTML = `
    <div class="section-header"><h1>🔄 Devoluciones</h1></div>
    <div class="table-container" style="padding:20px;">
      <div style="display:flex;gap:10px;margin-bottom:20px;">
        <input type="number" id="return-folio" class="form-control" placeholder="Folio de venta (ID)">
        <button class="btn btn-primary" onclick="searchForReturn()">🔍 Buscar</button>
      </div>
      <div id="return-content"></div>
    </div>
  `;
}

async function searchForReturn() {
  const id = document.getElementById('return-folio').value;
  const res = await fetch(`/api/sales/${id}`);
  if (!res.ok) return showNotification('Venta no encontrada', 'error');
  const sale = await res.json();
  
  const container = document.getElementById('return-content');
  container.innerHTML = `
    <h3>Venta #${sale.id} - Total: $${sale.total.toFixed(2)}</h3>
    <table class="report-table">
      <thead><tr><th>Producto</th><th>Cantidad</th><th>Precio</th><th>Devolver</th></tr></thead>
      <tbody>
        ${sale.items.map((item, idx) => `
          <tr>
            <td>${item.product_name}</td>
            <td>${item.quantity}</td>
            <td>$${item.price.toFixed(2)}</td>
            <td><input type="number" id="ret-qty-${idx}" value="0" min="0" max="${item.quantity}" style="width:60px;"></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <button class="btn btn-danger" onclick="processReturn(${sale.id}, ${JSON.stringify(sale.items).replace(/"/g, '&quot;')})">Confirmar Devolución</button>
  `;
}

async function processReturn(saleId, items) {
  const returnItems = items.map((item, idx) => ({
    ...item,
    quantity: parseInt(document.getElementById(`ret-qty-${idx}`).value)
  })).filter(i => i.quantity > 0);
  
  if (returnItems.length === 0) return showNotification('Selecciona productos', 'error');
  
  const res = await fetch('/api/returns/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sale_id: saleId, items: returnItems })
  });
  
  if (res.ok) { showNotification('Devolución procesada'); renderReturns(); }
}

// ============ ALTA RÁPIDA ============
async function renderQuickReceive() {
  const wrapper = document.getElementById('content-wrapper');
  wrapper.innerHTML = `
    <div class="section-header"><h1>⚡ Alta Rápida de Inventario</h1></div>
    <div class="table-container" style="padding:20px;max-width:600px;margin:0 auto;">
      <div class="form-group">
        <label>Escanea o escribe código de barras</label>
        <input type="text" id="qr-barcode" class="form-control" autofocus style="font-size:24px;">
      </div>
      <div id="qr-product-info" style="margin:20px 0;padding:20px;background:#f8fafc;border-radius:8px;display:none;"></div>
      <div id="qr-form" style="display:none;">
        <div class="form-group"><label>Cantidad que llega</label><input type="number" id="qr-qty" value="1" class="form-control"></div>
        <div class="form-group"><label>Nuevo Precio Farmacia (Costo)</label><input type="number" id="qr-cost" class="form-control"></div>
        <div class="form-group"><label>Nuevo Precio Público</label><input type="number" id="qr-price" class="form-control"></div>
        <button class="btn btn-success" style="width:100%;padding:15px;margin-top:20px;" onclick="submitQuickReceive()">✅ REGISTRAR ENTRADA</button>
      </div>
    </div>
  `;

  document.getElementById('qr-barcode').addEventListener('change', async (e) => {
    const res = await fetch(`/api/products/search?q=${e.target.value}`);
    const products = await res.json();
    const product = products.find(p => p.barcode === e.target.value);
    if (product) {
      document.getElementById('qr-product-info').innerHTML = `<strong>${product.name}</strong><br>Stock Actual: ${product.stock}`;
      document.getElementById('qr-product-info').style.display = 'block';
      document.getElementById('qr-form').style.display = 'block';
      document.getElementById('qr-cost').value = product.cost;
      document.getElementById('qr-price').value = product.price;
      state.currentQRProduct = product;
    } else {
      showNotification('Producto no encontrado', 'error');
      document.getElementById('qr-form').style.display = 'none';
      document.getElementById('qr-product-info').style.display = 'none';
    }
  });
}

async function submitQuickReceive() {
  const data = {
    barcode: state.currentQRProduct.barcode,
    quantity: parseInt(document.getElementById('qr-qty').value),
    new_cost: parseFloat(document.getElementById('qr-cost').value),
    new_price: parseFloat(document.getElementById('qr-price').value)
  };
  const res = await fetch('/api/products/quick-receive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (res.ok) { showNotification('Inventario actualizado'); renderQuickReceive(); }
}

// ============ PRODUCTOS (FILTROS) ============
async function renderProducts() {
  const wrapper = document.getElementById('content-wrapper');
  await loadProducts();
  wrapper.innerHTML = `
    <div class="section-header">
      <h1>📦 Productos</h1>
      <button class="btn btn-primary" onclick="openProductModal()">+ Nuevo</button>
    </div>
    <div class="table-container" style="margin-bottom:20px;padding:20px;">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:15px;">
        <input type="text" id="p-filter-text" placeholder="Buscar..." class="form-control" onkeyup="filterProducts()">
        <select id="p-filter-stock" class="form-control" onchange="filterProducts()">
          <option value="all">Todos</option>
          <option value="low">Stock Bajo</option>
          <option value="zero-negative">Sin stock o en negativo</option>
        </select>
      </div>
    </div>
    <div class="table-container" id="products-table-container"></div>
  `;
  filterProducts();
}

async function loadProducts() { const res = await fetch('/api/products'); state.data.products = await res.json(); }

function filterProducts() {
  const text = document.getElementById('p-filter-text').value.toLowerCase();
  const stock = document.getElementById('p-filter-stock').value;
  
  const filtered = state.data.products.filter(p => {
    const matchesText = p.name.toLowerCase().includes(text) || (p.barcode && p.barcode.includes(text));
    let matchesStock = true;
    if (stock === 'low') matchesStock = p.stock <= p.min_stock;
    if (stock === 'zero-negative') matchesStock = p.stock <= 0;
    return matchesText && matchesStock;
  });

  const container = document.getElementById('products-table-container');
  container.innerHTML = `
    <table class="report-table">
      <thead><tr><th>Producto</th><th>Barras</th><th>Precio</th><th>Costo</th><th>Stock</th><th>Acciones</th></tr></thead>
      <tbody>
        ${filtered.map(p => `
          <tr style="background:${p.stock <= 0 ? '#fff1f2' : (p.stock <= p.min_stock ? '#fffbeb' : 'white')}">
            <td>${p.name}</td><td>${p.barcode || '-'}</td><td>$${p.price.toFixed(2)}</td><td>$${p.cost.toFixed(2)}</td>
            <td><strong>${p.stock}</strong></td>
            <td><button class="btn btn-small btn-primary" onclick="addToOrderDraft(${p.id})">🛒 Pedir</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ============ REPORTES (PEDIDO PROVEEDOR + SIDEBAR) ============
async function renderReports() {
  const wrapper = document.getElementById('content-wrapper');
  await loadSuppliers();
  await refreshOrderDrafts();
  
  wrapper.innerHTML = `
    <div style="display:grid;grid-template-columns: 300px 1fr;gap:20px;height:calc(100vh - 100px);">
      <!-- Sidebar de Memoria / Borradores -->
      <div class="table-container" style="padding:15px;display:flex;flex-direction:column;">
        <h3>📋 Pedidos Pendientes</h3>
        <p style="font-size:12px;color:#666;">Productos para pedir (Arrastra o pulsa)</p>
        <div id="drafts-container" style="flex:1;overflow-y:auto;border-top:1px solid #eee;padding-top:10px;"></div>
        <div style="padding-top:10px;">
          <select id="draft-supplier-select" class="form-control" style="margin-bottom:10px;">
            <option value="">Seleccionar Proveedor...</option>
            ${state.data.suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
          </select>
          <button class="btn btn-success" style="width:100%;" onclick="createOrderFromSelected()">Generar Pedido Seleccionado</button>
        </div>
      </div>

      <!-- Área de Reportes -->
      <div class="table-container" style="padding:20px;">
        <h2>📊 Reportes</h2>
        <p>Selecciona un tipo de reporte o usa la barra lateral para gestionar pedidos.</p>
        <!-- (Lógica de reportes estándar aquí) -->
      </div>
    </div>
  `;
  renderDraftsList();
}

async function refreshOrderDrafts() {
  const res = await fetch('/api/supplier-orders/drafts');
  state.orderDrafts = await res.json();
}

function renderDraftsList() {
  const container = document.getElementById('drafts-container');
  if (state.orderDrafts.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:20px;color:#94a3b8;">No hay productos en memoria</div>';
    return;
  }
  container.innerHTML = state.orderDrafts.map(d => `
    <div style="padding:10px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:8px;background:white;font-size:13px;">
      <div style="display:flex;justify-content:space-between;">
        <strong>${d.product_name}</strong>
        <button onclick="removeFromDraft(${d.id})" style="background:none;border:none;cursor:pointer;">❌</button>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:5px;">
        <input type="number" value="${d.quantity}" style="width:50px;" onchange="updateDraftQty(${d.id}, this.value)">
        <small>${d.supplier_name || 'Sin prov.'}</small>
      </div>
    </div>
  `).join('');
}

async function addToOrderDraft(productId) {
  await fetch('/api/supplier-orders/drafts/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: productId })
  });
  showNotification('Producto agregado a la lista de pedidos');
  if (state.currentModule === 'reports') { await refreshOrderDrafts(); renderDraftsList(); }
}

async function updateDraftQty(id, qty) {
  await fetch('/api/supplier-orders/drafts/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, quantity: parseInt(qty) })
  });
}

async function removeFromDraft(id) {
  await fetch('/api/supplier-orders/drafts/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  });
  await refreshOrderDrafts();
  renderDraftsList();
}

async function createOrderFromSelected() {
  const supplierId = document.getElementById('draft-supplier-select').value;
  if (!supplierId) return showNotification('Selecciona un proveedor', 'error');
  
  const draftIds = state.orderDrafts.filter(d => !d.supplier_id || d.supplier_id == supplierId).map(d => d.id);
  if (draftIds.length === 0) return showNotification('No hay productos para este proveedor', 'error');

  const res = await fetch('/api/supplier-orders/create-from-drafts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ supplier_id: parseInt(supplierId), draft_ids: draftIds })
  });
  
  if (res.ok) {
    showNotification('Pedido generado exitosamente');
    await refreshOrderDrafts();
    renderDraftsList();
  }
}

// BÁSICOS (USUARIOS, PAGOS, PROVEEDORES, DEPARTAMENTOS)
async function loadPaymentMethods() { const res = await fetch('/api/payment-methods'); state.data.paymentMethods = await res.json(); }
async function loadSuppliers() { const res = await fetch('/api/suppliers'); state.data.suppliers = await res.json(); }
async function loadUsers() { const res = await fetch('/api/users'); state.data.users = await res.json(); }
async function loadDepartments() { const res = await fetch('/api/departments'); state.data.departments = await res.json(); }

// [Otras funciones de renderizado de usuarios, etc. se asumen presentes o se simplifican aquí]
async function renderDashboard() {
  const wrapper = document.getElementById('content-wrapper');
  wrapper.innerHTML = '<h1>Bienvenido al Dashboard</h1>';
}
