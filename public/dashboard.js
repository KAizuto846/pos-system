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
  reportData: [], // Para exportación
  supplierOrder: [] // Para pedido proveedor editable
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
    case 'returns':
      await renderReturns();
      break;
    case 'quick-entry':
      await renderQuickEntry();
      break;
    default:
      document.getElementById('content-wrapper').innerHTML = '<h1>Módulo no encontrado</h1>';
  }
}

// ============ REPORTES (FASE 5 - CORREGIDO) ============
async function renderReports() {
  const wrapper = document.getElementById('content-wrapper');
  
  await loadSuppliers();
  await loadUsers();
  await loadPaymentMethods();

  const today = new Date().toISOString().split('T')[0];

  wrapper.innerHTML = `
    <div class="section-header">
      <div>
        <h1>📊 Reportes y Analíticas</h1>
        <p>Análisis detallado de ventas</p>
      </div>
    </div>
    
    <div class="report-tabs" style="display: flex; gap: 10px; margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">
      <button class="btn btn-secondary active" onclick="switchReportTab('sales', this)">Ventas Detalladas</button>
      <button class="btn btn-secondary" onclick="switchReportTab('supplier-order', this)">Pedido Proveedor</button>
      <button class="btn btn-secondary" onclick="switchReportTab('history', this)">Historial Ventas</button>
    </div>

    <!-- Filtros -->
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
        <div class="form-group" id="supplier-filter-container">
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
  
  state.currentReportTab = 'sales';
}

function switchReportTab(tab, btn) {
  state.currentReportTab = tab;
  document.querySelectorAll('.report-tabs button').forEach(b => b.classList.remove('active', 'btn-primary'));
  document.querySelectorAll('.report-tabs button').forEach(b => b.classList.add('btn-secondary'));
  btn.classList.remove('btn-secondary');
  btn.classList.add('btn-primary', 'active');
  
  // Mostrar/ocultar filtro de proveedor según el tab
  const supplierFilter = document.getElementById('supplier-filter-container');
  if (tab === 'supplier-order') {
    supplierFilter.style.display = 'block';
    document.getElementById('filterSupplier').required = true;
  } else {
    supplierFilter.style.display = 'block';
    document.getElementById('filterSupplier').required = false;
  }
  
  document.getElementById('report-content').innerHTML = `
    <div style="padding: 40px; text-align: center; color: var(--text-light);">
      Selecciona filtros y genera el reporte: ${btn.textContent}
    </div>
  `;
}

async function generateReport() {
  const type = state.currentReportTab;
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;
  const supplierId = document.getElementById('filterSupplier').value;
  const userId = document.getElementById('filterUser').value;
  
  if (type === 'supplier-order' && !supplierId) {
    showNotification('Selecciona un proveedor para generar el pedido', 'error');
    return;
  }
  
  const container = document.getElementById('report-content');
  container.innerHTML = '<div style="padding: 40px; text-align: center;">⏳ Cargando datos...</div>';
  
  try {
    const params = new URLSearchParams({ startDate, endDate });
    if (supplierId) params.append('supplierId', supplierId);
    if (userId) params.append('userId', userId);
    
    let data, html = '';
    
    switch(type) {
      case 'sales':
        const resSales = await fetch(`/api/reports/detailed-sales?${params}`);
        data = await resSales.json();
        state.reportData = data;
        html = renderDetailedSales(data);
        break;
        
      case 'supplier-order':
        const resOrder = await fetch(`/api/reports/supplier-order?${params}`);
        data = await resOrder.json();
        state.supplierOrder = JSON.parse(JSON.stringify(data)); // Copia profunda
        state.reportData = data;
        html = renderSupplierOrder(data);
        break;
        
      case 'history':
        const resHist = await fetch(`/api/reports/sales-history?${params}`);
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

// Renderizar Ventas Detalladas
// Columnas: CANTIDAD | PRODUCTO | CODIGO | COSTO UNITARIO FARMACIA | COSTO TOTAL FARMACIA | COSTO UNITARIO | COSTO TOTAL
function renderDetailedSales(data) {
  if (!data || data.length === 0) return '<div style="padding: 40px; text-align: center;">No hay datos</div>';
  
  let totalQty = 0;
  let totalCostFarmacia = 0;
  let totalVenta = 0;
  
  const rows = data.map(row => {
    totalQty += row.quantity;
    totalCostFarmacia += row.cost_farmacia_total;
    totalVenta += row.sale_total;
    
    return `
      <tr>
        <td style="text-align: center;">${row.quantity}</td>
        <td>${row.product_name}</td>
        <td>${row.barcode || '-'}</td>
        <td style="text-align: right;">$${row.cost_farmacia_unit.toFixed(2)}</td>
        <td style="text-align: right;">$${row.cost_farmacia_total.toFixed(2)}</td>
        <td style="text-align: right;">$${row.sale_price_unit.toFixed(2)}</td>
        <td style="text-align: right;"><strong>$${row.sale_total.toFixed(2)}</strong></td>
      </tr>
    `;
  }).join('');
  
  return `
    <div class="table-wrapper">
      <table class="report-table">
        <thead>
          <tr>
            <th>CANTIDAD</th>
            <th>PRODUCTO</th>
            <th>CÓDIGO</th>
            <th>COSTO UNIT. FARMACIA</th>
            <th>COSTO TOTAL FARMACIA</th>
            <th>COSTO UNITARIO</th>
            <th>COSTO TOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
        <tfoot>
          <tr style="background: #f8fafc; font-weight: bold;">
            <td style="text-align: center;">${totalQty}</td>
            <td colspan="3" style="text-align: right;">TOTALES:</td>
            <td style="text-align: right;">$${totalCostFarmacia.toFixed(2)}</td>
            <td></td>
            <td style="text-align: right;">$${totalVenta.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

// Renderizar Pedido Proveedor (editable tipo Excel)
// Columnas: CANTIDAD | PRODUCTO | CÓDIGO
function renderSupplierOrder(data) {
  if (!data || data.length === 0) return '<div style="padding: 40px; text-align: center;">No hay productos vendidos para este proveedor</div>';
  
  const rows = data.map((row, idx) => `
    <tr>
      <td contenteditable="true" class="editable-cell" data-idx="${idx}" data-field="quantity" style="text-align: center; cursor: text;">${row.quantity}</td>
      <td contenteditable="true" class="editable-cell" data-idx="${idx}" data-field="product_name" style="cursor: text;">${row.product_name}</td>
      <td contenteditable="true" class="editable-cell" data-idx="${idx}" data-field="barcode" style="cursor: text;">${row.barcode || '-'}</td>
      <td style="text-align: center;">
        <button class="btn btn-small btn-danger" onclick="deleteOrderRow(${idx})">🗑️</button>
      </td>
    </tr>
  `).join('');
  
  return `
    <div style="margin-bottom: 15px;">
      <button class="btn btn-primary" onclick="addOrderRow()">➕ Agregar Producto</button>
      <button class="btn btn-success" onclick="saveSupplierOrder()">💾 Guardar Pedido</button>
      <p style="color: var(--text-light); margin-top: 8px; font-size: 14px;">💡 Haz clic en las celdas para editarlas como en Excel</p>
    </div>
    <div class="table-wrapper">
      <table class="report-table" id="order-table">
        <thead>
          <tr>
            <th>CANTIDAD</th>
            <th>PRODUCTO</th>
            <th>CÓDIGO</th>
            <th>ACCIONES</th>
          </tr>
        </thead>
        <tbody id="order-tbody">
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

function addOrderRow() {
  state.supplierOrder.push({
    quantity: 1,
    product_name: 'Nuevo Producto',
    barcode: ''
  });
  
  const tbody = document.getElementById('order-tbody');
  const idx = state.supplierOrder.length - 1;
  
  const newRow = document.createElement('tr');
  newRow.innerHTML = `
    <td contenteditable="true" class="editable-cell" data-idx="${idx}" data-field="quantity" style="text-align: center; cursor: text;">1</td>
    <td contenteditable="true" class="editable-cell" data-idx="${idx}" data-field="product_name" style="cursor: text;">Nuevo Producto</td>
    <td contenteditable="true" class="editable-cell" data-idx="${idx}" data-field="barcode" style="cursor: text;">-</td>
    <td style="text-align: center;">
      <button class="btn btn-small btn-danger" onclick="deleteOrderRow(${idx})">🗑️</button>
    </td>
  `;
  
  tbody.appendChild(newRow);
}

function deleteOrderRow(idx) {
  if (!confirm('¿Eliminar este producto del pedido?')) return;
  
  state.supplierOrder.splice(idx, 1);
  
  // Re-renderizar tabla
  const tbody = document.getElementById('order-tbody');
  tbody.innerHTML = state.supplierOrder.map((row, i) => `
    <tr>
      <td contenteditable="true" class="editable-cell" data-idx="${i}" data-field="quantity" style="text-align: center; cursor: text;">${row.quantity}</td>
      <td contenteditable="true" class="editable-cell" data-idx="${i}" data-field="product_name" style="cursor: text;">${row.product_name}</td>
      <td contenteditable="true" class="editable-cell" data-idx="${i}" data-field="barcode" style="cursor: text;">${row.barcode || '-'}</td>
      <td style="text-align: center;">
        <button class="btn btn-small btn-danger" onclick="deleteOrderRow(${i})">🗑️</button>
      </td>
    </tr>
  `).join('');
  
  // Re-attachar listeners
  attachEditableListeners();
}

function attachEditableListeners() {
  document.querySelectorAll('.editable-cell').forEach(cell => {
    cell.addEventListener('blur', function() {
      const idx = parseInt(this.dataset.idx);
      const field = this.dataset.field;
      let value = this.textContent.trim();
      
      if (field === 'quantity') {
        value = parseInt(value) || 1;
      }
      
      if (state.supplierOrder[idx]) {
        state.supplierOrder[idx][field] = value;
      }
    });
  });
}

function saveSupplierOrder() {
  // Actualizar valores desde las celdas editables
  document.querySelectorAll('.editable-cell').forEach(cell => {
    const idx = parseInt(cell.dataset.idx);
    const field = cell.dataset.field;
    let value = cell.textContent.trim();
    
    if (field === 'quantity') {
      value = parseInt(value) || 1;
    }
    
    if (state.supplierOrder[idx]) {
      state.supplierOrder[idx][field] = value;
    }
  });
  
  showNotification(`Pedido guardado con ${state.supplierOrder.length} productos`, 'success');
  console.log('Pedido guardado:', state.supplierOrder);
}

// Renderizar Historial Ventas
// Columnas: CANTIDAD | PRODUCTO | CÓDIGO | COSTO TOTAL FARMACIA | COSTO TOTAL
function renderHistoryReport(data) {
  if (!data || data.length === 0) return '<div style="padding: 40px; text-align: center;">No hay datos</div>';
  
  let totalQty = 0;
  let totalCostFarmacia = 0;
  let totalVenta = 0;
  
  const rows = data.map(row => {
    totalQty += row.quantity;
    totalCostFarmacia += row.cost_farmacia_total;
    totalVenta += row.sale_total;
    
    return `
      <tr>
        <td style="text-align: center;">${row.quantity}</td>
        <td>${row.product_name}</td>
        <td>${row.barcode || '-'}</td>
        <td style="text-align: right;">$${row.cost_farmacia_total.toFixed(2)}</td>
        <td style="text-align: right;"><strong>$${row.sale_total.toFixed(2)}</strong></td>
      </tr>
    `;
  }).join('');
  
  return `
    <div class="table-wrapper">
      <table class="report-table">
        <thead>
          <tr>
            <th>CANTIDAD</th>
            <th>PRODUCTO</th>
            <th>CÓDIGO</th>
            <th>COSTO TOTAL FARMACIA</th>
            <th>COSTO TOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
        <tfoot>
          <tr style="background: #f8fafc; font-weight: bold;">
            <td style="text-align: center;">${totalQty}</td>
            <td colspan="2" style="text-align: right;">TOTALES:</td>
            <td style="text-align: right;">$${totalCostFarmacia.toFixed(2)}</td>
            <td style="text-align: right;">$${totalVenta.toFixed(2)}</td>
          </tr>
        </tfoot>
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
    csvContent += "CANTIDAD,PRODUCTO,CODIGO,COSTO UNIT FARMACIA,COSTO TOTAL FARMACIA,COSTO UNITARIO,COSTO TOTAL\n";
    state.reportData.forEach(row => {
      csvContent += `${row.quantity},"${row.product_name}",${row.barcode || ''},${row.cost_farmacia_unit.toFixed(2)},${row.cost_farmacia_total.toFixed(2)},${row.sale_price_unit.toFixed(2)},${row.sale_total.toFixed(2)}\n`;
    });
  } else if (type === 'supplier-order') {
    csvContent += "CANTIDAD,PRODUCTO,CODIGO\n";
    state.supplierOrder.forEach(row => {
      csvContent += `${row.quantity},"${row.product_name}",${row.barcode || ''}\n`;
    });
  } else if (type === 'history') {
    csvContent += "CANTIDAD,PRODUCTO,CODIGO,COSTO TOTAL FARMACIA,COSTO TOTAL\n";
    state.reportData.forEach(row => {
      csvContent += `${row.quantity},"${row.product_name}",${row.barcode || ''},${row.cost_farmacia_total.toFixed(2)},${row.sale_total.toFixed(2)}\n`;
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

// ============ PUNTO DE VENTA (POS) - CON PAGO EFECTIVO PREDETERMINADO ============
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
    
    const response = await fetch('/api/sales/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(saleData)
    });
    
    const result = await response.json();
    
    if (response.ok) {
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
    } else {
      showNotification(result.error || 'Error al procesar venta', 'error');
    }
    
    btn.disabled = false;
    btn.textContent = '✅ Completar Venta (F3)';
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

// ============ PRODUCTOS (CON FILTROS MEJORADOS) ============
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
    
    <!-- Filtros de Productos -->
    <div class="table-container" style="margin-bottom: 20px;">
      <div class="table-header">
        <h3>🔍 Filtros</h3>
      </div>
      <div style="padding: 20px;">
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
          <div class="form-group">
            <label>Buscar</label>
            <input type="text" id="filter-search" placeholder="Nombre o código" onkeyup="applyProductFilters()">
          </div>
          <div class="form-group">
            <label>Proveedor</label>
            <select id="filter-supplier" onchange="applyProductFilters()">
              <option value="">Todos</option>
              ${state.data.suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Departamento</label>
            <select id="filter-department" onchange="applyProductFilters()">
              <option value="">Todos</option>
              ${state.data.departments.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Estado Stock</label>
            <select id="filter-stock" onchange="applyProductFilters()">
              <option value="">Todos</option>
              <option value="low">Stock Bajo</option>
              <option value="normal">Stock Normal</option>
              <option value="zeroOrNegative">Sin stock o en negativo</option>
            </select>
          </div>
        </div>
        <button class="btn btn-secondary" onclick="clearProductFilters()" style="margin-top: 10px;">Limpiar Filtros</button>
      </div>
    </div>
    
    <div class="table-container">
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
          <tbody id="products-tbody">
            ${renderProductsRows()}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderProductsRows(filteredProducts = null) {
  const products = filteredProducts || state.data.products;
  
  if (products.length === 0) {
    return '<tr><td colspan="8" style="text-align: center; padding: 40px; color: #94a3b8;">No hay productos</td></tr>';
  }
  
  return products.map(p => `
    <tr ${p.lowStock ? 'style="background: #fef3c7;"' : ''}>
      <td><strong>${p.name}</strong></td>
      <td>${p.barcode || '-'}</td>
      <td>$${parseFloat(p.price).toLocaleString('es-MX', {minimumFractionDigits: 2})}</td>
      <td>
        <span class="badge ${p.stock === 0 ? 'inactive' : p.lowStock ? 'inactive' : 'active'}">
          ${p.stock} ${p.stock === 0 ? '❌' : p.lowStock ? '⚠️' : ''}
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

function applyProductFilters() {
  const searchTerm = document.getElementById('filter-search').value.toLowerCase();
  const supplierId = document.getElementById('filter-supplier').value;
  const departmentId = document.getElementById('filter-department').value;
  const stockFilter = document.getElementById('filter-stock').value;
  
  let filtered = state.data.products.filter(p => {
    // Búsqueda
    const matchesSearch = !searchTerm || 
      p.name.toLowerCase().includes(searchTerm) || 
      (p.barcode && p.barcode.toLowerCase().includes(searchTerm));
    
    // Proveedor
    const matchesSupplier = !supplierId || p.supplier_id == supplierId;
    
    // Departamento
    const matchesDepartment = !departmentId || p.department_id == departmentId;
    
    // Stock
    let matchesStock = true;
    if (stockFilter === 'low') {
      matchesStock = p.lowStock && p.stock > 0;
    } else if (stockFilter === 'normal') {
      matchesStock = !p.lowStock && p.stock > 0;
    } else if (stockFilter === 'zeroOrNegative') {
      matchesStock = p.stock <= 0;
    }
    
    return matchesSearch && matchesSupplier && matchesDepartment && matchesStock;
  });
  
  document.getElementById('products-tbody').innerHTML = renderProductsRows(filtered);
}

function clearProductFilters() {
  document.getElementById('filter-search').value = '';
  document.getElementById('filter-supplier').value = '';
  document.getElementById('filter-department').value = '';
  document.getElementById('filter-stock').value = '';
  applyProductFilters();
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
      const response = await fetch(`/api/products/search?q=${encodeURIComponent(query)}`);
      const products = await response.json();
      
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
    
    const response = await fetch('/api/returns/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(returnData)
    });
    
    const result = await response.json();
    
    if (response.ok) {
      showNotification(`✅ Devolución procesada: $${total.toFixed(2)}`, 'success');
      
      // Mostrar recibo de devolución
      showReturnReceipt(result.returnId, state.returnCart, total, reason);
      
      state.returnCart = [];
      document.getElementById('return-reason').value = '';
      document.getElementById('return-notes').value = '';
      
      updateReturnCartDisplay();
      document.getElementById('return-search').focus();
    } else {
      showNotification(result.error || 'Error al procesar devolución', 'error');
    }
    
    btn.disabled = false;
    btn.textContent = '✅ Procesar Devolución';
  } catch (error) {
    console.error('Error:', error);
    showNotification('Error al conectar con el servidor', 'error');
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
    const response = await fetch(`/api/products/search?q=${encodeURIComponent(barcode)}`);
    const products = await response.json();
    
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
    
    const response = await fetch('/api/products/quick-entry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries })
    });
    
    const result = await response.json();
    
    if (response.ok) {
      showNotification(`✅ ${state.quickEntryQueue.length} producto(s) ingresado(s) al inventario`, 'success');
      state.quickEntryQueue = [];
      updateQuickEntryDisplay();
      document.getElementById('quick-barcode').focus();
    } else {
      showNotification(result.error || 'Error al procesar entrada', 'error');
    }
    
    btn.disabled = false;
    btn.textContent = '✅ Procesar Entrada';
  } catch (error) {
    console.error('Error:', error);
    showNotification('Error al conectar con el servidor', 'error');
    btn.disabled = false;
    btn.textContent = '✅ Procesar Entrada';
  }
}