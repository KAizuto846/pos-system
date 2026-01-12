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
  reportData: [] // Para exportación
};

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  loadModule('dashboard');
  setupEventListeners();
});

// Verificar autenticación
async function checkAuth() {
  try {
    const response = await fetch('/api/session');
    const data = await response.json();
    
    if (!data.authenticated) {
      window.location.href = '/index.html';
      return;
    }
    
    state.currentUser = data.user;
    document.getElementById('username-display').textContent = data.user.username;
    document.getElementById('role-display').textContent = data.user.role === 'admin' ? 'Administrador' : 'Cajero';
  } catch (error) {
    window.location.href = '/index.html';
  }
}

// Event Listeners
function setupEventListeners() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const module = item.dataset.module;
      loadModule(module);
      
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
    });
  });
  
  document.getElementById('logout-btn').addEventListener('click', logout);
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') closeModal();
  });
}

// Logout
async function logout() {
  try {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/index.html';
  } catch (error) {
    console.error('Error al cerrar sesión:', error);
  }
}

// Cargar módulo
async function loadModule(moduleName) {
  state.currentModule = moduleName;
  
  switch(moduleName) {
    case 'dashboard':
      await renderDashboard();
      break;
    case 'users':
      await renderUsers();
      break;
    case 'payment-methods':
      await renderPaymentMethods();
      break;
    case 'suppliers':
      await renderSuppliers();
      break;
    case 'departments':
      await renderDepartments();
      break;
    case 'products':
      await renderProducts();
      break;
    case 'sales':
      await renderPOS();
      break;
    case 'reports':
      await renderReports();
      break;
    default:
      document.getElementById('content-wrapper').innerHTML = '<h1>Módulo no encontrado</h1>';
  }
}

// ============ REPORTES (FASE 5) ============
async function renderReports() {
  const wrapper = document.getElementById('content-wrapper');
  
  // Cargar datos necesarios para filtros
  await loadSuppliers();
  await loadUsers();
  await loadPaymentMethods();

  const today = new Date().toISOString().split('T')[0];

  wrapper.innerHTML = `
    <div class="section-header">
      <div>
        <h1>📊 Reportes y Analíticas</h1>
        <p>Análisis detallado de ventas e inventario</p>
      </div>
    </div>
    
    <div class="report-tabs" style="display: flex; gap: 10px; margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">
      <button class="btn btn-secondary active" onclick="switchReportTab('sales', this)">Ventas Detalladas</button>
      <button class="btn btn-secondary" onclick="switchReportTab('inventory', this)">Inventario Completo</button>
      <button class="btn btn-secondary" onclick="switchReportTab('suppliers', this)">Por Proveedor</button>
      <button class="btn btn-secondary" onclick="switchReportTab('history', this)">Historial Ventas</button>
    </div>

    <!-- Filtros Generales -->
    <div class="report-filters" style="background: white; padding: 20px; border-radius: 12px; margin-bottom: 20px; box-shadow: var(--shadow);">
      <h3 style="margin-bottom: 15px;">🔍 Filtros</h3>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
        <div class="form-group">
          <label>Fecha Inicio</label>
          <input type="date" id="startDate" value="${today}">
        </div>
        <div class="form-group">
          <label>Fecha Fin</label>
          <input type="date" id="endDate" value="${today}">
        </div>
        <div class="form-group">
          <label>Proveedor (Línea)</label>
          <select id="filterSupplier">
            <option value="">Todos</option>
            ${state.data.suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Cajero</label>
          <select id="filterUser">
            <option value="">Todos</option>
            ${state.data.users.map(u => `<option value="${u.id}">${u.username}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-actions" style="margin-top: 15px;">
        <button class="btn btn-primary" onclick="generateReport()">Generar Reporte</button>
        <button class="btn btn-success" onclick="exportReportCSV()">Exportar a CSV</button>
      </div>
    </div>

    <!-- Contenedor de Reportes -->
    <div id="report-content" class="table-container">
      <div style="padding: 40px; text-align: center; color: var(--text-light);">
        Selecciona filtros y haz clic en "Generar Reporte"
      </div>
    </div>
  `;
  
  // Inicializar primer reporte
  state.currentReportTab = 'sales';
}

function switchReportTab(tab, btn) {
  state.currentReportTab = tab;
  document.querySelectorAll('.report-tabs button').forEach(b => b.classList.remove('active', 'btn-primary'));
  document.querySelectorAll('.report-tabs button').forEach(b => b.classList.add('btn-secondary'));
  btn.classList.remove('btn-secondary');
  btn.classList.add('btn-primary', 'active');
  
  // Limpiar vista
  document.getElementById('report-content').innerHTML = `
    <div style="padding: 40px; text-align: center; color: var(--text-light);">
      Selecciona filtros y haz clic en "Generar Reporte" para ver: ${btn.textContent}
    </div>
  `;
}

async function generateReport() {
  const type = state.currentReportTab;
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;
  const supplierId = document.getElementById('filterSupplier').value;
  const userId = document.getElementById('filterUser').value;
  
  const container = document.getElementById('report-content');
  container.innerHTML = '<div style="padding: 40px; text-align: center;">⏳ Cargando datos...</div>';
  
  try {
    const params = new URLSearchParams({ startDate, endDate, supplierId, userId });
    let data;
    let html = '';
    
    switch(type) {
      case 'sales':
        const resSales = await fetch(`/api/reports/detailed-sales?${params}`);
        data = await resSales.json();
        state.reportData = data;
        html = renderDetailedSales(data);
        break;
        
      case 'inventory':
        const resInv = await fetch(`/api/reports/inventory?${params}`);
        data = await resInv.json();
        state.reportData = data;
        html = renderInventoryReport(data);
        break;
        
      case 'suppliers':
        const resSupp = await fetch(`/api/reports/supplier-sales?${params}`);
        data = await resSupp.json();
        state.reportData = data;
        html = renderSupplierReport(data);
        break;
        
      case 'history':
        const resHist = await fetch(`/api/reports/history?${params}`);
        data = await resHist.json();
        state.reportData = data;
        html = renderHistoryReport(data);
        break;
    }
    
    container.innerHTML = html;
    
  } catch (error) {
    console.error(error);
    container.innerHTML = `<div style="padding: 20px; color: red;">Error al generar reporte: ${error.message}</div>`;
  }
}

function renderDetailedSales(data) {
  if (!data || data.length === 0) return '<div style="padding: 40px; text-align: center;">No hay datos</div>';
  
  let totalCost = 0;
  let totalPrice = 0;
  let totalQty = 0;
  
  const rows = data.map(row => {
    const totalRowCost = row.quantity * row.cost;
    const totalRowPrice = row.quantity * row.price;
    totalCost += totalRowCost;
    totalPrice += totalRowPrice;
    totalQty += row.quantity;
    
    return `
      <tr>
        <td>${row.created_at.split('T')[0]}</td>
        <td>${row.product_name}</td>
        <td>${row.barcode || '-'}</td>
        <td>${row.supplier_name || '-'}</td>
        <td style="text-align: center;">${row.quantity}</td>
        <td style="text-align: right;">$${row.cost.toFixed(2)}</td>
        <td style="text-align: right;">$${row.price.toFixed(2)}</td>
        <td style="text-align: right;">$${totalRowCost.toFixed(2)}</td>
        <td style="text-align: right;"><strong>$${totalRowPrice.toFixed(2)}</strong></td>
      </tr>
    `;
  }).join('');
  
  return `
    <div class="table-wrapper">
      <table class="report-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Producto</th>
            <th>Código</th>
            <th>Proveedor</th>
            <th>Cant.</th>
            <th>P. Farmacia</th>
            <th>P. Público</th>
            <th>Total Farm.</th>
            <th>Total Púb.</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
        <tfoot>
          <tr style="background: #f8fafc; font-weight: bold;">
            <td colspan="4" style="text-align: right;">TOTALES:</td>
            <td style="text-align: center;">${totalQty}</td>
            <td></td>
            <td></td>
            <td style="text-align: right;">$${totalCost.toFixed(2)}</td>
            <td style="text-align: right;">$${totalPrice.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

function renderInventoryReport(data) {
  let totalValorCosto = 0;
  let totalValorVenta = 0;
  
  const rows = data.map(p => {
    const valCosto = p.stock * p.cost;
    const valVenta = p.stock * p.price;
    totalValorCosto += valCosto;
    totalValorVenta += valVenta;
    
    return `
      <tr>
        <td>${p.name}</td>
        <td>${p.barcode || '-'}</td>
        <td>${p.supplier_name || '-'}</td>
        <td style="text-align: center;">${p.stock}</td>
        <td style="text-align: right;">$${p.cost.toFixed(2)}</td>
        <td style="text-align: right;">$${p.price.toFixed(2)}</td>
        <td style="text-align: right;">$${valCosto.toFixed(2)}</td>
        <td style="text-align: right;">$${valVenta.toFixed(2)}</td>
      </tr>
    `;
  }).join('');
  
  return `
    <div style="padding: 20px; background: #f0fdf4; margin-bottom: 20px; border-radius: 8px;">
      <h3>📦 Valor del Inventario</h3>
      <p>Costo Total: <strong>$${totalValorCosto.toLocaleString('es-MX')}</strong> | Venta Total: <strong>$${totalValorVenta.toLocaleString('es-MX')}</strong></p>
    </div>
    <div class="table-wrapper">
      <table class="report-table">
        <thead>
          <tr>
            <th>Producto</th>
            <th>Código</th>
            <th>Proveedor</th>
            <th>Stock</th>
            <th>Costo U.</th>
            <th>Precio U.</th>
            <th>Valor Costo</th>
            <th>Valor Venta</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

function renderSupplierReport(data) {
  let grandTotal = 0;
  
  const rows = data.map(r => {
    grandTotal += r.total;
    return `
      <tr>
        <td>${r.supplier_name}</td>
        <td>${r.product_count}</td>
        <td style="text-align: center;">${r.items_sold}</td>
        <td style="text-align: right;"><strong>$${r.total.toFixed(2)}</strong></td>
      </tr>
    `;
  }).join('');
  
  return `
    <div class="table-wrapper">
      <table class="report-table">
        <thead>
          <tr>
            <th>Proveedor</th>
            <th>Productos Únicos Vendidos</th>
            <th>Unidades Vendidas</th>
            <th>Total Ventas</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
        <tfoot>
          <tr style="font-weight: bold; background: #f8fafc;">
            <td colspan="3" style="text-align: right;">GRAN TOTAL:</td>
            <td style="text-align: right;">$${grandTotal.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

function renderHistoryReport(data) {
  const rows = data.map(sale => `
    <tr>
      <td>${new Date(sale.created_at).toLocaleString()}</td>
      <td>#${sale.id}</td>
      <td>${sale.username}</td>
      <td>${sale.payment_method}</td>
      <td style="text-align: right;"><strong>$${sale.total.toFixed(2)}</strong></td>
      <td>
        <button class="btn btn-small btn-secondary" onclick="reprintTicket(${sale.id})">🖨️</button>
      </td>
    </tr>
  `).join('');
  
  return `
    <div class="table-wrapper">
      <table class="report-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Folio</th>
            <th>Cajero</th>
            <th>Método Pago</th>
            <th>Total</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

function exportReportCSV() {
  if (!state.reportData || state.reportData.length === 0) {
    showNotification('No hay datos para exportar', 'error');
    return;
  }
  
  let csvContent = "data:text/csv;charset=utf-8,";
  const type = state.currentReportTab;
  
  if (type === 'sales') {
    csvContent += "Fecha,Producto,Codigo,Proveedor,Cantidad,Costo U,Precio U,Total Costo,Total Venta\n";
    state.reportData.forEach(row => {
      csvContent += `${row.created_at.split('T')[0]},"${row.product_name}",${row.barcode || ''},"${row.supplier_name || ''}",${row.quantity},${row.cost},${row.price},${row.quantity * row.cost},${row.quantity * row.price}\n`;
    });
  } else if (type === 'inventory') {
    csvContent += "Producto,Codigo,Proveedor,Stock,Costo,Precio,Valor Costo,Valor Venta\n";
    state.reportData.forEach(row => {
      csvContent += `"${row.name}",${row.barcode || ''},"${row.supplier_name || ''}",${row.stock},${row.cost},${row.price},${row.stock * row.cost},${row.stock * row.price}\n`;
    });
  }
  
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `reporte_${type}_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ============ DASHBOARD ============
async function renderDashboard() {
  const wrapper = document.getElementById('content-wrapper');
  const stats = await fetchStats();
  
  wrapper.innerHTML = `
    <div class="section-header">
      <div>
        <h1>Dashboard</h1>
        <p>Bienvenido al sistema POS</p>
      </div>
    </div>
    
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon blue">👥</div>
        <div class="stat-details">
          <h3>${stats.users}</h3>
          <p>Usuarios</p>
        </div>
      </div>
      
      <div class="stat-card">
        <div class="stat-icon green">🏷️</div>
        <div class="stat-details">
          <h3>${stats.products}</h3>
          <p>Productos Activos</p>
        </div>
      </div>
      
      <div class="stat-card">
        <div class="stat-icon orange">🛒</div>
        <div class="stat-details">
          <h3>${stats.sales}</h3>
          <p>Ventas Hoy</p>
        </div>
      </div>
      
      <div class="stat-card">
        <div class="stat-icon red">💰</div>
        <div class="stat-details">
          <h3>$${stats.revenue.toLocaleString('es-MX', {minimumFractionDigits: 2})}</h3>
          <p>Ingresos Totales Hoy</p>
        </div>
      </div>
    </div>
    
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
      <div class="table-container">
        <div class="table-header">
          <h2>💵 Total en Caja</h2>
        </div>
        <div style="padding: 30px; text-align: center;">
          <h1 style="font-size: 36px; color: var(--success-color); margin: 0;">$${stats.cashTotal.toLocaleString('es-MX', {minimumFractionDigits: 2})}</h1>
          <p style="color: var(--text-light); margin-top: 8px;">Solo métodos que afectan caja</p>
        </div>
      </div>
      
      <div class="table-container">
        <div class="table-header">
          <h2>⚠️ Stock Bajo</h2>
        </div>
        <div style="padding: 30px; text-align: center;">
          <h1 style="font-size: 36px; color: var(--warning-color); margin: 0;">${stats.lowStock || 0}</h1>
          <p style="color: var(--text-light); margin-top: 8px;">Productos con stock mínimo</p>
        </div>
      </div>
    </div>
    
    <div class="table-container" style="margin-bottom: 20px;">
      <div class="table-header">
        <h2>📊 Ventas por Cajero Hoy</h2>
      </div>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Cajero</th>
              <th>Número de Ventas</th>
              <th>Total Vendido</th>
            </tr>
          </thead>
          <tbody>
            ${stats.salesByCashier && stats.salesByCashier.length > 0 ? 
              stats.salesByCashier.map(c => `
                <tr>
                  <td><strong>${c.username}</strong></td>
                  <td>${c.sales_count}</td>
                  <td>$${parseFloat(c.total).toLocaleString('es-MX', {minimumFractionDigits: 2})}</td>
                </tr>
              `).join('') :
              '<tr><td colspan="3" style="text-align: center; padding: 20px;">No hay ventas registradas hoy</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </div>
    
    <div class="table-container">
      <div class="table-header">
        <h2>Accesos Rápidos</h2>
      </div>
      <div style="padding: 20px; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
        <button class="btn btn-primary" onclick="loadModule('sales')" style="justify-content: center; padding: 20px;">
          🛒 Nueva Venta
        </button>
        <button class="btn btn-primary" onclick="loadModule('products')" style="justify-content: center; padding: 20px;">
          📦 Productos
        </button>
        <button class="btn btn-primary" onclick="loadModule('reports')" style="justify-content: center; padding: 20px;">
          📊 Reportes
        </button>
      </div>
    </div>
  `;
}

async function fetchStats() {
  try {
    const response = await fetch('/api/stats');
    return await response.json();
  } catch (error) {
    return { users: 0, products: 0, sales: 0, revenue: 0, cashTotal: 0, lowStock: 0, salesByCashier: [] };
  }
}

// ============ PUNTO DE VENTA (POS) ============
async function renderPOS() {
  const wrapper = document.getElementById('content-wrapper');
  state.cart = [];
  await loadPaymentMethods();
  
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
      <!-- Panel izquierdo: Búsqueda y productos -->
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
      
      <!-- Panel derecho: Resumen y pago -->
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
                  <option value="${p.id}">${p.name}</option>
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
              ✅ Completar Venta (F12)
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
            <div><kbd>F12</kbd> - Completar venta</div>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Configurar atajos de teclado
  document.addEventListener('keydown', handlePOSKeyboard);
  
  // Auto-focus en búsqueda
  setTimeout(() => document.getElementById('pos-search')?.focus(), 100);
}

function handlePOSKeyboard(e) {
  if (state.currentModule !== 'sales') return;
  
  if (e.key === 'F2') {
    e.preventDefault();
    document.getElementById('pos-search')?.focus();
  } else if (e.key === 'F12') {
    e.preventDefault();
    if (state.cart.length > 0) completeSale();
  } else if (e.key === 'Escape') {
    document.getElementById('pos-search').value = '';
    document.getElementById('search-results').style.display = 'none';
  }
}

let searchTimeout;
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
      const response = await fetch(`/api/products/search?q=${encodeURIComponent(query)}`);
      const products = await response.json();
      
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
  if (stock <= 0) {
    showNotification('Producto sin stock disponible', 'error');
    return;
  }
  
  const existing = state.cart.find(item => item.productId === productId);
  
  if (existing) {
    if (existing.quantity >= stock) {
      showNotification('No hay suficiente stock', 'error');
      return;
    }
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
  
  if (newQuantity > item.stock) {
    showNotification('No hay suficiente stock', 'error');
    return;
  }
  
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
    
    const response = await fetch('/api/sales/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(saleData)
    });
    
    const result = await response.json();
    
    if (response.ok) {
      showNotification(`✅ Venta completada: $${total.toFixed(2)}`, 'success');
      
      // Mostrar ticket
      showTicket(result.saleId, state.cart, total, paymentMethodId);
      
      // Limpiar carrito
      state.cart = [];
      document.getElementById('payment-method').value = '';
      updateCartDisplay();
      document.getElementById('pos-search').focus();
    } else {
      showNotification(result.error || 'Error al procesar venta', 'error');
    }
    
    btn.disabled = false;
    btn.textContent = '✅ Completar Venta (F12)';
  } catch (error) {
    console.error('Error:', error);
    showNotification('Error al conectar con el servidor', 'error');
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

// ============ USUARIOS ============
async function renderUsers() {
  const wrapper = document.getElementById('content-wrapper');
  await loadUsers();
  
  wrapper.innerHTML = `
    <div class="section-header">
      <div>
        <h1>Gestión de Usuarios</h1>
        <p>Administra los usuarios del sistema</p>
      </div>
      <button class="btn btn-primary" onclick="openUserModal()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Nuevo Usuario
      </button>
    </div>
    
    <div class="table-container">
      <div class="table-header">
        <div class="search-box">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
          </svg>
          <input type="text" placeholder="Buscar usuarios..." id="search-users" onkeyup="filterTable('users-table', 'search-users')">
        </div>
      </div>
      
      <div class="table-wrapper">
        <table id="users-table">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Fecha Creación</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${renderUsersRows()}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderUsersRows() {
  if (state.data.users.length === 0) {
    return '<tr><td colspan="5" style="text-align: center; padding: 40px; color: #94a3b8;">No hay usuarios registrados</td></tr>';
  }
  
  return state.data.users.map(user => `
    <tr>
      <td><strong>${user.username}</strong></td>
      <td><span class="badge ${user.role}">${user.role === 'admin' ? 'Administrador' : 'Cajero'}</span></td>
      <td><span class="badge ${user.active ? 'active' : 'inactive'}">${user.active ? 'Activo' : 'Inactivo'}</span></td>
      <td>${new Date(user.created_at).toLocaleDateString()}</td>
      <td>
        <button class="btn btn-small btn-secondary" onclick='editUser(${JSON.stringify(user).replace(/'/g, "&apos;")})'>✏️ Editar</button>
        ${user.id !== state.currentUser?.id ? `<button class="btn btn-small btn-danger" onclick="deleteUser(${user.id})">🗑️ Eliminar</button>` : ''}
      </td>
    </tr>
  `).join('');
}

async function loadUsers() {
  try {
    const response = await fetch('/api/users');
    state.data.users = await response.json();
  } catch (error) {
    console.error('Error cargando usuarios:', error);
  }
}

function openUserModal(user = null) {
  const isEdit = !!user;
  
  document.getElementById('modal-title').textContent = isEdit ? 'Editar Usuario' : 'Nuevo Usuario';
  document.getElementById('modal-body').innerHTML = `
    <form id="user-form" onsubmit="saveUser(event, ${isEdit})">
      <input type="hidden" id="user-id" value="${user?.id || ''}">
      
      <div class="form-group">
        <label>Usuario *</label>
        <input type="text" id="user-username" value="${user?.username || ''}" required ${isEdit ? 'readonly' : ''}>
      </div>
      
      <div class="form-group">
        <label>Contraseña ${isEdit ? '(dejar vacío para no cambiar)' : '*'}</label>
        <input type="password" id="user-password" ${isEdit ? '' : 'required'}>
      </div>
      
      <div class="form-group">
        <label>Rol *</label>
        <select id="user-role" required>
          <option value="admin" ${user?.role === 'admin' ? 'selected' : ''}>Administrador</option>
          <option value="cashier" ${user?.role === 'cashier' ? 'selected' : ''}>Cajero</option>
        </select>
      </div>
      
      <div class="form-group">
        <label>Estado *</label>
        <select id="user-active" required>
          <option value="1" ${user?.active !== false ? 'selected' : ''}>Activo</option>
          <option value="0" ${user?.active === false ? 'selected' : ''}>Inactivo</option>
        </select>
      </div>
      
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">💾 Guardar</button>
      </div>
    </form>
  `;
  
  openModal();
}

async function saveUser(event, isEdit) {
  event.preventDefault();
  
  const data = {
    id: document.getElementById('user-id').value,
    username: document.getElementById('user-username').value,
    password: document.getElementById('user-password').value,
    role: document.getElementById('user-role').value,
    active: document.getElementById('user-active').value === '1'
  };
  
  try {
    const url = isEdit ? '/api/users/update' : '/api/users/create';
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    const result = await response.json();
    
    if (response.ok) {
      closeModal();
      await renderUsers();
      showNotification('Usuario guardado exitosamente', 'success');
    } else {
      showNotification(result.error || 'Error al guardar usuario', 'error');
    }
  } catch (error) {
    showNotification('Error al conectar con el servidor', 'error');
  }
}

function editUser(user) {
  openUserModal(user);
}

async function deleteUser(id) {
  if (!confirm('¿Estás seguro de eliminar este usuario?')) return;
  
  try {
    const response = await fetch('/api/users/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    
    if (response.ok) {
      await renderUsers();
      showNotification('Usuario eliminado', 'success');
    }
  } catch (error) {
    showNotification('Error al eliminar usuario', 'error');
  }
}

// ============ FORMAS DE PAGO ============
async function renderPaymentMethods() {
  const wrapper = document.getElementById('content-wrapper');
  await loadPaymentMethods();
  
  wrapper.innerHTML = `
    <div class="section-header">
      <div>
        <h1>Formas de Pago</h1>
        <p>Administra los métodos de pago disponibles</p>
      </div>
      <button class="btn btn-primary" onclick="openPaymentMethodModal()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Nueva Forma de Pago
      </button>
    </div>
    
    <div class="table-container">
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Afecta Caja</th>
              <th>Estado</th>
              <th>Fecha Creación</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${renderPaymentMethodsRows()}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderPaymentMethodsRows() {
  if (state.data.paymentMethods.length === 0) {
    return '<tr><td colspan="5" style="text-align: center; padding: 40px; color: #94a3b8;">No hay formas de pago registradas</td></tr>';
  }
  
  return state.data.paymentMethods.map(pm => `
    <tr>
      <td><strong>${pm.name}</strong></td>
      <td>
        ${pm.affects_cash ? 
          '<span class="badge active">✅ Sí afecta</span>' : 
          '<span class="badge inactive">❌ No afecta</span>'
        }
      </td>
      <td><span class="badge ${pm.active ? 'active' : 'inactive'}">${pm.active ? 'Activo' : 'Inactivo'}</span></td>
      <td>${new Date(pm.created_at).toLocaleDateString()}</td>
      <td>
        <button class="btn btn-small btn-secondary" onclick='editPaymentMethod(${JSON.stringify(pm).replace(/'/g, "&apos;")})'>✏️ Editar</button>
        <button class="btn btn-small btn-danger" onclick="deletePaymentMethod(${pm.id})">🗑️ Eliminar</button>
      </td>
    </tr>
  `).join('');
}

async function loadPaymentMethods() {
  try {
    const response = await fetch('/api/payment-methods');
    state.data.paymentMethods = await response.json();
  } catch (error) {
    console.error('Error cargando formas de pago:', error);
  }
}

function openPaymentMethodModal(pm = null) {
  const isEdit = !!pm;
  
  document.getElementById('modal-title').textContent = isEdit ? 'Editar Forma de Pago' : 'Nueva Forma de Pago';
  document.getElementById('modal-body').innerHTML = `
    <form id="payment-method-form" onsubmit="savePaymentMethod(event, ${isEdit})">
      <input type="hidden" id="pm-id" value="${pm?.id || ''}">
      
      <div class="form-group">
        <label>Nombre *</label>
        <input type="text" id="pm-name" value="${pm?.name || ''}" required placeholder="Ej: Efectivo, Tarjeta, Transferencia">
      </div>
      
      <div class="form-group">
        <label>¿Afecta el total en caja? *</label>
        <select id="pm-affects-cash" required>
          <option value="1" ${pm?.affects_cash !== false ? 'selected' : ''}>✅ Sí (Efectivo)</option>
          <option value="0" ${pm?.affects_cash === false ? 'selected' : ''}>❌ No (Tarjeta/Transfer)</option>
        </select>
        <small style="color: var(--text-light); display: block; margin-top: 4px;">
          Marca "Sí" para pagos en efectivo que incrementan el dinero físico en caja.
        </small>
      </div>
      
      <div class="form-group">
        <label>Estado *</label>
        <select id="pm-active" required>
          <option value="1" ${pm?.active !== false ? 'selected' : ''}>Activo</option>
          <option value="0" ${pm?.active === false ? 'selected' : ''}>Inactivo</option>
        </select>
      </div>
      
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">💾 Guardar</button>
      </div>
    </form>
  `;
  
  openModal();
}

async function savePaymentMethod(event, isEdit) {
  event.preventDefault();
  
  const data = {
    id: document.getElementById('pm-id').value,
    name: document.getElementById('pm-name').value,
    affects_cash: document.getElementById('pm-affects-cash').value === '1',
    active: document.getElementById('pm-active').value === '1'
  };
  
  try {
    const url = isEdit ? '/api/payment-methods/update' : '/api/payment-methods/create';
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    if (response.ok) {
      closeModal();
      await renderPaymentMethods();
      showNotification('Forma de pago guardada', 'success');
    }
  } catch (error) {
    showNotification('Error al guardar', 'error');
  }
}

function editPaymentMethod(pm) {
  openPaymentMethodModal(pm);
}

async function deletePaymentMethod(id) {
  if (!confirm('¿Eliminar esta forma de pago?')) return;
  
  try {
    await fetch('/api/payment-methods/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    await renderPaymentMethods();
    showNotification('Forma de pago eliminada', 'success');
  } catch (error) {
    showNotification('Error al eliminar', 'error');
  }
}

// ============ PROVEEDORES ============
async function renderSuppliers() {
  const wrapper = document.getElementById('content-wrapper');
  await loadSuppliers();
  
  wrapper.innerHTML = `
    <div class="section-header">
      <div>
        <h1>Líneas (Proveedores)</h1>
        <p>Administra los proveedores de productos</p>
      </div>
      <button class="btn btn-primary" onclick="openSupplierModal()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Nuevo Proveedor
      </button>
    </div>
    
    <div class="table-container">
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Contacto</th>
              <th>Teléfono</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${renderSuppliersRows()}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderSuppliersRows() {
  if (state.data.suppliers.length === 0) {
    return '<tr><td colspan="5" style="text-align: center; padding: 40px; color: #94a3b8;">No hay proveedores registrados</td></tr>';
  }
  
  return state.data.suppliers.map(s => `
    <tr>
      <td><strong>${s.name}</strong></td>
      <td>${s.contact || '-'}</td>
      <td>${s.phone || '-'}</td>
      <td><span class="badge ${s.active ? 'active' : 'inactive'}">${s.active ? 'Activo' : 'Inactivo'}</span></td>
      <td>
        <button class="btn btn-small btn-secondary" onclick='editSupplier(${JSON.stringify(s).replace(/'/g, "&apos;")})'>✏️ Editar</button>
        <button class="btn btn-small btn-danger" onclick="deleteSupplier(${s.id})">🗑️ Eliminar</button>
      </td>
    </tr>
  `).join('');
}

async function loadSuppliers() {
  try {
    const response = await fetch('/api/suppliers');
    state.data.suppliers = await response.json();
  } catch (error) {
    console.error('Error cargando proveedores:', error);
  }
}

function openSupplierModal(supplier = null) {
  const isEdit = !!supplier;
  
  document.getElementById('modal-title').textContent = isEdit ? 'Editar Proveedor' : 'Nuevo Proveedor';
  document.getElementById('modal-body').innerHTML = `
    <form id="supplier-form" onsubmit="saveSupplier(event, ${isEdit})">
      <input type="hidden" id="supplier-id" value="${supplier?.id || ''}">
      
      <div class="form-group">
        <label>Nombre *</label>
        <input type="text" id="supplier-name" value="${supplier?.name || ''}" required placeholder="Nombre del proveedor">
      </div>
      
      <div class="form-group">
        <label>Contacto</label>
        <input type="text" id="supplier-contact" value="${supplier?.contact || ''}" placeholder="Nombre del contacto">
      </div>
      
      <div class="form-group">
        <label>Teléfono</label>
        <input type="tel" id="supplier-phone" value="${supplier?.phone || ''}" placeholder="Teléfono">
      </div>
      
      <div class="form-group">
        <label>Email</label>
        <input type="email" id="supplier-email" value="${supplier?.email || ''}" placeholder="Email">
      </div>
      
      <div class="form-group">
        <label>Dirección</label>
        <textarea id="supplier-address" rows="3" placeholder="Dirección completa">${supplier?.address || ''}</textarea>
      </div>
      
      <div class="form-group">
        <label>Estado *</label>
        <select id="supplier-active" required>
          <option value="1" ${supplier?.active !== false ? 'selected' : ''}>Activo</option>
          <option value="0" ${supplier?.active === false ? 'selected' : ''}>Inactivo</option>
        </select>
      </div>
      
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">💾 Guardar</button>
      </div>
    </form>
  `;
  
  openModal();
}

async function saveSupplier(event, isEdit) {
  event.preventDefault();
  
  const data = {
    id: document.getElementById('supplier-id').value,
    name: document.getElementById('supplier-name').value,
    contact: document.getElementById('supplier-contact').value,
    phone: document.getElementById('supplier-phone').value,
    email: document.getElementById('supplier-email').value,
    address: document.getElementById('supplier-address').value,
    active: document.getElementById('supplier-active').value === '1'
  };
  
  try {
    const url = isEdit ? '/api/suppliers/update' : '/api/suppliers/create';
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    if (response.ok) {
      closeModal();
      await renderSuppliers();
      showNotification('Proveedor guardado', 'success');
    }
  } catch (error) {
    showNotification('Error al guardar', 'error');
  }
}

function editSupplier(supplier) {
  openSupplierModal(supplier);
}

async function deleteSupplier(id) {
  if (!confirm('¿Eliminar este proveedor?')) return;
  
  try {
    await fetch('/api/suppliers/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    await renderSuppliers();
    showNotification('Proveedor eliminado', 'success');
  } catch (error) {
    showNotification('Error al eliminar', 'error');
  }
}

// ============ DEPARTAMENTOS ============
async function renderDepartments() {
  const wrapper = document.getElementById('content-wrapper');
  await loadDepartments();
  
  wrapper.innerHTML = `
    <div class="section-header">
      <div>
        <h1>Departamentos</h1>
        <p>Organiza tus productos por departamentos</p>
      </div>
      <button class="btn btn-primary" onclick="openDepartmentModal()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Nuevo Departamento
      </button>
    </div>
    
    <div class="table-container">
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Descripción</th>
              <th>Estado</th>
              <th>Fecha Creación</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${renderDepartmentsRows()}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderDepartmentsRows() {
  if (state.data.departments.length === 0) {
    return '<tr><td colspan="5" style="text-align: center; padding: 40px; color: #94a3b8;">No hay departamentos registrados</td></tr>';
  }
  
  return state.data.departments.map(d => `
    <tr>
      <td><strong>${d.name}</strong></td>
      <td>${d.description || '-'}</td>
      <td><span class="badge ${d.active ? 'active' : 'inactive'}">${d.active ? 'Activo' : 'Inactivo'}</span></td>
      <td>${new Date(d.created_at).toLocaleDateString()}</td>
      <td>
        <button class="btn btn-small btn-secondary" onclick='editDepartment(${JSON.stringify(d).replace(/'/g, "&apos;")})'>✏️ Editar</button>
        <button class="btn btn-small btn-danger" onclick="deleteDepartment(${d.id})">🗑️ Eliminar</button>
      </td>
    </tr>
  `).join('');
}

async function loadDepartments() {
  try {
    const response = await fetch('/api/departments');
    state.data.departments = await response.json();
  } catch (error) {
    console.error('Error cargando departamentos:', error);
  }
}

function openDepartmentModal(dept = null) {
  const isEdit = !!dept;
  
  document.getElementById('modal-title').textContent = isEdit ? 'Editar Departamento' : 'Nuevo Departamento';
  document.getElementById('modal-body').innerHTML = `
    <form id="department-form" onsubmit="saveDepartment(event, ${isEdit})">
      <input type="hidden" id="dept-id" value="${dept?.id || ''}">
      
      <div class="form-group">
        <label>Nombre *</label>
        <input type="text" id="dept-name" value="${dept?.name || ''}" required placeholder="Nombre del departamento">
      </div>
      
      <div class="form-group">
        <label>Descripción</label>
        <textarea id="dept-description" rows="3" placeholder="Descripción del departamento">${dept?.description || ''}</textarea>
      </div>
      
      <div class="form-group">
        <label>Estado *</label>
        <select id="dept-active" required>
          <option value="1" ${dept?.active !== false ? 'selected' : ''}>Activo</option>
          <option value="0" ${dept?.active === false ? 'selected' : ''}>Inactivo</option>
        </select>
      </div>
      
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">💾 Guardar</button>
      </div>
    </form>
  `;
  
  openModal();
}

async function saveDepartment(event, isEdit) {
  event.preventDefault();
  
  const data = {
    id: document.getElementById('dept-id').value,
    name: document.getElementById('dept-name').value,
    description: document.getElementById('dept-description').value,
    active: document.getElementById('dept-active').value === '1'
  };
  
  try {
    const url = isEdit ? '/api/departments/update' : '/api/departments/create';
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    if (response.ok) {
      closeModal();
      await renderDepartments();
      showNotification('Departamento guardado', 'success');
    }
  } catch (error) {
    showNotification('Error al guardar', 'error');
  }
}

function editDepartment(dept) {
  openDepartmentModal(dept);
}

async function deleteDepartment(id) {
  if (!confirm('¿Eliminar este departamento?')) return;
  
  try {
    await fetch('/api/departments/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    await renderDepartments();
    showNotification('Departamento eliminado', 'success');
  } catch (error) {
    showNotification('Error al eliminar', 'error');
  }
}

// ============ PRODUCTOS ============
async function renderProducts() {
  const wrapper = document.getElementById('content-wrapper');
  await loadProducts();
  await loadDepartments();
  await loadSuppliers();
  
  wrapper.innerHTML = `
    <div class="section-header">
      <div>
        <h1>Gestión de Productos</h1>
        <p>Administra tu inventario de productos</p>
      </div>
      <div style="display: flex; gap: 10px;">
        <button class="btn" style="background: var(--success-color);" onclick="openImportModal()">
          📎 Importar Excel
        </button>
        <button class="btn btn-primary" onclick="openProductModal()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Nuevo Producto
        </button>
      </div>
    </div>
    
    <div class="table-container">
      <div class="table-header">
        <div class="search-box">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
          </svg>
          <input type="text" placeholder="Buscar productos..." id="search-products" onkeyup="filterTable('products-table', 'search-products')">
        </div>
      </div>
      
      <div class="table-wrapper">
        <table id="products-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Código</th>
              <th>Precio</th>
              <th>Stock</th>
              <th>Departamento</th>
              <th>Proveedor</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${renderProductsRows()}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderProductsRows() {
  if (state.data.products.length === 0) {
    return '<tr><td colspan="8" style="text-align: center; padding: 40px; color: #94a3b8;">No hay productos registrados</td></tr>';
  }
  
  return state.data.products.map(p => `
    <tr ${p.lowStock ? 'style="background: #fef3c7;"' : ''}>
      <td><strong>${p.name}</strong></td>
      <td>${p.barcode || '-'}</td>
      <td>$${parseFloat(p.price).toLocaleString('es-MX', {minimumFractionDigits: 2})}</td>
      <td>
        <span class="badge ${p.lowStock ? 'inactive' : 'active'}">
          ${p.stock} ${p.lowStock ? '⚠️' : ''}
        </span>
      </td>
      <td>${p.department_name || '-'}</td>
      <td>${p.supplier_name || '-'}</td>
      <td><span class="badge ${p.active ? 'active' : 'inactive'}">${p.active ? 'Activo' : 'Inactivo'}</span></td>
      <td>
        <button class="btn btn-small btn-secondary" onclick='editProduct(${JSON.stringify(p).replace(/'/g, "&apos;")})'>✏️</button>
        <button class="btn btn-small btn-primary" onclick='adjustStock(${p.id}, "${p.name}", ${p.stock})'>📊</button>
        <button class="btn btn-small btn-danger" onclick="deleteProduct(${p.id})">🗑️</button>
      </td>
    </tr>
  `).join('');
}

async function loadProducts() {
  try {
    const response = await fetch('/api/products');
    state.data.products = await response.json();
  } catch (error) {
    console.error('Error cargando productos:', error);
  }
}

function openProductModal(product = null) {
  const isEdit = !!product;
  
  document.getElementById('modal-title').textContent = isEdit ? 'Editar Producto' : 'Nuevo Producto';
  document.getElementById('modal-body').innerHTML = `
    <form id="product-form" onsubmit="saveProduct(event, ${isEdit})">
      <input type="hidden" id="product-id" value="${product?.id || ''}">
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div class="form-group">
          <label>Nombre *</label>
          <input type="text" id="product-name" value="${product?.name || ''}" required placeholder="Nombre del producto">
        </div>
        
        <div class="form-group">
          <label>Código de Barras</label>
          <input type="text" id="product-barcode" value="${product?.barcode || ''}" placeholder="Código">
        </div>
      </div>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div class="form-group">
          <label>Precio de Venta *</label>
          <input type="number" step="0.01" id="product-price" value="${product?.price || ''}" required placeholder="0.00">
        </div>
        
        <div class="form-group">
          <label>Costo</label>
          <input type="number" step="0.01" id="product-cost" value="${product?.cost || 0}" placeholder="0.00">
        </div>
      </div>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div class="form-group">
          <label>Stock Inicial</label>
          <input type="number" id="product-stock" value="${product?.stock || 0}" placeholder="0">
        </div>
        
        <div class="form-group">
          <label>Stock Mínimo</label>
          <input type="number" id="product-min-stock" value="${product?.min_stock || 5}" placeholder="5">
        </div>
      </div>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div class="form-group">
          <label>Departamento</label>
          <select id="product-department">
            <option value="">Sin departamento</option>
            ${state.data.departments.filter(d => d.active).map(d => `
              <option value="${d.id}" ${product?.department_id === d.id ? 'selected' : ''}>${d.name}</option>
            `).join('')}
          </select>
        </div>
        
        <div class="form-group">
          <label>Proveedor</label>
          <select id="product-supplier">
            <option value="">Sin proveedor</option>
            ${state.data.suppliers.filter(s => s.active).map(s => `
              <option value="${s.id}" ${product?.supplier_id === s.id ? 'selected' : ''}>${s.name}</option>
            `).join('')}
          </select>
        </div>
      </div>
      
      <div class="form-group">
        <label>Estado *</label>
        <select id="product-active" required>
          <option value="1" ${product?.active !== false ? 'selected' : ''}>Activo</option>
          <option value="0" ${product?.active === false ? 'selected' : ''}>Inactivo</option>
        </select>
      </div>
      
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">💾 Guardar</button>
      </div>
    </form>
  `;
  
  openModal();
}

async function saveProduct(event, isEdit) {
  event.preventDefault();
  
  const data = {
    id: document.getElementById('product-id').value,
    name: document.getElementById('product-name').value,
    barcode: document.getElementById('product-barcode').value,
    price: parseFloat(document.getElementById('product-price').value),
    cost: parseFloat(document.getElementById('product-cost').value) || 0,
    stock: parseInt(document.getElementById('product-stock').value) || 0,
    min_stock: parseInt(document.getElementById('product-min-stock').value) || 5,
    department_id: document.getElementById('product-department').value || null,
    supplier_id: document.getElementById('product-supplier').value || null,
    active: document.getElementById('product-active').value === '1'
  };
  
  try {
    const url = isEdit ? '/api/products/update' : '/api/products/create';
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    const result = await response.json();
    
    if (response.ok) {
      closeModal();
      await renderProducts();
      showNotification('Producto guardado exitosamente', 'success');
    } else {
      showNotification(result.error || 'Error al guardar producto', 'error');
    }
  } catch (error) {
    showNotification('Error al conectar con el servidor', 'error');
  }
}

function editProduct(product) {
  openProductModal(product);
}

async function deleteProduct(id) {
  if (!confirm('¿Estás seguro de eliminar este producto?')) return;
  
  try {
    const response = await fetch('/api/products/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    
    if (response.ok) {
      await renderProducts();
      showNotification('Producto eliminado', 'success');
    }
  } catch (error) {
    showNotification('Error al eliminar producto', 'error');
  }
}

function adjustStock(id, name, currentStock) {
  document.getElementById('modal-title').textContent = 'Ajustar Stock';
  document.getElementById('modal-body').innerHTML = `
    <form id="stock-form" onsubmit="saveStockAdjustment(event, ${id})">
      <p style="margin-bottom: 20px;"><strong>Producto:</strong> ${name}</p>
      <p style="margin-bottom: 20px;"><strong>Stock actual:</strong> ${currentStock}</p>
      
      <div class="form-group">
        <label>Ajuste (positivo para agregar, negativo para restar)</label>
        <input type="number" id="stock-adjustment" required placeholder="Ej: 10 o -5" autofocus>
      </div>
      
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">💾 Ajustar</button>
      </div>
    </form>
  `;
  
  openModal();
}

async function saveStockAdjustment(event, productId) {
  event.preventDefault();
  
  const adjustment = parseInt(document.getElementById('stock-adjustment').value);
  
  try {
    const response = await fetch('/api/products/adjust-stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: productId, adjustment })
    });
    
    const result = await response.json();
    
    if (response.ok) {
      closeModal();
      await renderProducts();
      showNotification(`Stock actualizado a ${result.newStock}`, 'success');
    } else {
      showNotification(result.error || 'Error al ajustar stock', 'error');
    }
  } catch (error) {
    showNotification('Error al conectar con el servidor', 'error');
  }
}

// ============ IMPORTACIÓN MASIVA ============
function openImportModal() {
  document.getElementById('modal-title').textContent = '📎 Importar Productos desde Excel';
  document.getElementById('modal-body').innerHTML = `
    <div style="padding: 20px;">
      <div style="background: #f1f5f9; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h3 style="margin-top: 0; color: var(--primary-color);">ℹ️ Instrucciones</h3>
        <ul style="margin: 10px 0; padding-left: 20px; line-height: 1.8;">
          <li>El archivo debe ser un Excel (.xlsx)</li>
          <li>Debe contener las columnas: <strong>Clave, Descripción, Línea, Existencias, Precio público</strong></li>
          <li>Stock mínimo se establecerá automáticamente en <strong>1</strong> para todos</li>
          <li>Las líneas se mapearán a proveedores automáticamente</li>
          <li>La importación es rápida gracias a transacciones en lote</li>
        </ul>
      </div>
      
      <form id="import-form" onsubmit="importExcel(event)">
        <div class="form-group">
          <label>Seleccionar archivo Excel *</label>
          <input type="file" id="excel-file" accept=".xlsx, .xls" required style="padding: 10px; border: 2px dashed var(--border-color); border-radius: 8px; width: 100%; cursor: pointer;">
        </div>
        
        <div id="import-progress" style="display: none; margin: 20px 0;">
          <div style="background: var(--primary-color); height: 4px; border-radius: 2px; width: 0%; transition: width 0.3s;" id="progress-bar"></div>
          <p id="progress-text" style="text-align: center; margin-top: 10px; color: var(--text-light);">Procesando...</p>
        </div>
        
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary" id="import-btn">🚀 Importar</button>
        </div>
      </form>
    </div>
  `;
  
  openModal();
}

async function importExcel(event) {
  event.preventDefault();
  
  const fileInput = document.getElementById('excel-file');
  const file = fileInput.files[0];
  
  if (!file) {
    showNotification('Selecciona un archivo', 'error');
    return;
  }
  
  const formData = new FormData();
  formData.append('file', file);
  
  const importBtn = document.getElementById('import-btn');
  const progressDiv = document.getElementById('import-progress');
  const progressBar = document.getElementById('progress-bar');
  const progressText = document.getElementById('progress-text');
  
  try {
    importBtn.disabled = true;
    importBtn.textContent = '⏳ Importando...';
    progressDiv.style.display = 'block';
    progressBar.style.width = '50%';
    progressText.textContent = 'Procesando archivo Excel...';
    
    const response = await fetch('/api/products/import', {
      method: 'POST',
      body: formData
    });
    
    const result = await response.json();
    
    progressBar.style.width = '100%';
    
    if (response.ok) {
      progressText.textContent = `✅ Éxito: ${result.imported} productos importados en ${result.duration}`;
      setTimeout(() => {
        closeModal();
        renderProducts();
        showNotification(`${result.imported} productos importados exitosamente`, 'success');
      }, 2000);
    } else {
      progressText.textContent = `❌ Error: ${result.error}`;
      showNotification(result.error || 'Error al importar', 'error');
      importBtn.disabled = false;
      importBtn.textContent = '🚀 Importar';
    }
  } catch (error) {
    console.error('Error:', error);
    progressText.textContent = '❌ Error de conexión';
    showNotification('Error al conectar con el servidor', 'error');
    importBtn.disabled = false;
    importBtn.textContent = '🚀 Importar';
  }
}

// ============ UTILIDADES ============
function filterTable(tableId, searchId) {
  const search = document.getElementById(searchId).value.toLowerCase();
  const rows = document.querySelectorAll(`#${tableId} tbody tr`);
  
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(search) ? '' : 'none';
  });
}

function openModal() {
  document.getElementById('modal').classList.add('active');
}

function closeModal() {
  document.getElementById('modal').classList.remove('active');
}

function showNotification(message, type) {
  const notification = document.createElement('div');
  notification.className = `alert ${type} show`;
  notification.textContent = message;
  notification.style.position = 'fixed';
  notification.style.top = '20px';
  notification.style.right = '20px';
  notification.style.zIndex = '10000';
  notification.style.minWidth = '300px';
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 3000);
}