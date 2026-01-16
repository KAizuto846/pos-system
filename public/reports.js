// Estado global
let reportData = {
  sales: [],
  topProducts: [],
  cashiers: [],
  lowStock: [],
  supplierOrders: []
};

// Estado para pedidos de proveedor
let supplierOrders = JSON.parse(localStorage.getItem('supplierOrders') || '[]');
let pendingProducts = JSON.parse(localStorage.getItem('pendingProducts') || '[]');

// Verificar autenticación
const currentUser = JSON.parse(localStorage.getItem('currentUser'));
if (!currentUser) {
  window.location.href = 'login.html';
}

// Mostrar info del usuario
document.getElementById('userName').textContent = currentUser.username;
document.getElementById('userRole').textContent = currentUser.role === 'admin' ? 'Administrador' : 'Cajero';

// Inicializar
init();

async function init() {
  // Establecer fechas por defecto (hoy)
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('startDate').value = today;
  document.getElementById('endDate').value = today;
  
  // Cargar filtros
  await loadFilters();
  
  // Cargar reportes iniciales
  await loadReports();
}

async function loadFilters() {
  try {
    // Cargar usuarios
    const usersRes = await fetch('/api/users');
    const users = await usersRes.json();
    
    const userSelect = document.getElementById('filterUser');
    users.forEach(user => {
      const option = document.createElement('option');
      option.value = user.id;
      option.textContent = user.username;
      userSelect.appendChild(option);
    });
    
    // Cargar métodos de pago
    const paymentRes = await fetch('/api/payment-methods');
    const payments = await paymentRes.json();
    
    const paymentSelect = document.getElementById('filterPayment');
    payments.forEach(payment => {
      const option = document.createElement('option');
      option.value = payment.id;
      option.textContent = payment.name;
      paymentSelect.appendChild(option);
    });
  } catch (error) {
    console.error('Error cargando filtros:', error);
  }
}

async function loadReports() {
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;
  const userId = document.getElementById('filterUser').value;
  const paymentId = document.getElementById('filterPayment').value;
  
  if (!startDate || !endDate) {
    alert('Por favor selecciona un rango de fechas');
    return;
  }
  
  try {
    // Construir query params
    const params = new URLSearchParams({
      startDate,
      endDate,
      ...(userId && { userId }),
      ...(paymentId && { paymentId })
    });
    
    // Cargar todos los reportes en paralelo
    const [salesRes, productsRes, cashiersRes, stockRes] = await Promise.all([
      fetch(`/api/reports/sales?${params}`),
      fetch(`/api/reports/top-products?${params}`),
      fetch(`/api/reports/by-cashier?${params}`),
      fetch('/api/reports/low-stock')
    ]);
    
    const salesData = await salesRes.json();
    reportData.topProducts = await productsRes.json();
    reportData.cashiers = await cashiersRes.json();
    reportData.lowStock = await stockRes.json();
    
    // Renderizar todo
    renderSalesSummary(salesData);
    renderTopProducts();
    renderCashiers();
    renderLowStock();
    await renderSupplierOrders();
  } catch (error) {
    console.error('Error cargando reportes:', error);
    alert('Error al cargar los reportes');
  }
}

function renderSalesSummary(data) {
  const total = data.total || 0;
  const tickets = data.tickets || 0;
  const average = tickets > 0 ? total / tickets : 0;
  const cash = data.cash || 0;
  
  document.getElementById('salesSummary').innerHTML = `
    <div class="summary-item">
      <div class="value">$${total.toFixed(2)}</div>
      <div class="label">Total Ventas</div>
    </div>
    <div class="summary-item">
      <div class="value">${tickets}</div>
      <div class="label">Tickets</div>
    </div>
    <div class="summary-item">
      <div class="value">$${average.toFixed(2)}</div>
      <div class="label">Ticket Promedio</div>
    </div>
    <div class="summary-item">
      <div class="value">$${cash.toFixed(2)}</div>
      <div class="label">En Caja</div>
    </div>
  `;
  
  // Renderizar tabla de métodos de pago
  const tbody = document.querySelector('#paymentMethodTable tbody');
  if (!data.byPaymentMethod || data.byPaymentMethod.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="no-data">No hay datos para mostrar</td></tr>';
    return;
  }
  
  tbody.innerHTML = data.byPaymentMethod.map(pm => `
    <tr>
      <td>${pm.name}</td>
      <td>${pm.tickets}</td>
      <td>$${parseFloat(pm.total).toFixed(2)}</td>
      <td>${((pm.total / total) * 100).toFixed(1)}%</td>
    </tr>
  `).join('');
}

function renderTopProducts() {
  const tbody = document.querySelector('#topProductsTable tbody');
  
  if (reportData.topProducts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="no-data">No hay datos para mostrar</td></tr>';
    return;
  }
  
  const totalSales = reportData.topProducts.reduce((sum, p) => sum + parseFloat(p.total), 0);
  
  tbody.innerHTML = reportData.topProducts.map((product, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${product.name}</td>
      <td>${product.quantity}</td>
      <td>$${parseFloat(product.total).toFixed(2)}</td>
      <td>${((product.total / totalSales) * 100).toFixed(1)}%</td>
    </tr>
  `).join('');
}

function renderCashiers() {
  const tbody = document.querySelector('#cashierTable tbody');
  
  if (reportData.cashiers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="no-data">No hay datos para mostrar</td></tr>';
    return;
  }
  
  tbody.innerHTML = reportData.cashiers.map(cashier => {
    const avg = cashier.tickets > 0 ? cashier.total / cashier.tickets : 0;
    return `
      <tr>
        <td>${cashier.username}</td>
        <td>${cashier.tickets}</td>
        <td>$${parseFloat(cashier.total).toFixed(2)}</td>
        <td>$${avg.toFixed(2)}</td>
      </tr>
    `;
  }).join('');
}

function renderLowStock() {
  const tbody = document.querySelector('#lowStockTable tbody');
  
  if (reportData.lowStock.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="no-data">No hay productos con stock bajo</td></tr>';
    return;
  }
  
  tbody.innerHTML = reportData.lowStock.map(product => {
    const diff = product.stock - product.min_stock;
    return `
      <tr style="background: ${diff < 0 ? '#fee2e2' : '#fed7aa'}">
        <td>${product.name}</td>
        <td>${product.barcode || 'N/A'}</td>
        <td><strong>${product.stock}</strong></td>
        <td>${product.min_stock}</td>
        <td style="color: ${diff < 0 ? 'var(--danger-color)' : 'var(--warning-color)'}">
          ${diff}
        </td>
      </tr>
    `;
  }).join('');
}

function exportToCSV() {
  if (reportData.topProducts.length === 0 && reportData.cashiers.length === 0) {
    alert('No hay datos para exportar');
    return;
  }
  
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;
  
  let csv = 'REPORTE DE VENTAS\n';
  csv += `Periodo: ${startDate} a ${endDate}\n\n`;
  
  // Top productos
  if (reportData.topProducts.length > 0) {
    csv += 'TOP PRODUCTOS VENDIDOS\n';
    csv += 'Posición,Producto,Cantidad,Total\n';
    reportData.topProducts.forEach((p, i) => {
      csv += `${i + 1},"${p.name}",${p.quantity},${parseFloat(p.total).toFixed(2)}\n`;
    });
    csv += '\n';
  }
  
  // Ventas por cajero
  if (reportData.cashiers.length > 0) {
    csv += 'VENTAS POR CAJERO\n';
    csv += 'Cajero,Tickets,Total,Promedio\n';
    reportData.cashiers.forEach(c => {
      const avg = c.tickets > 0 ? c.total / c.tickets : 0;
      csv += `"${c.username}",${c.tickets},${parseFloat(c.total).toFixed(2)},${avg.toFixed(2)}\n`;
    });
    csv += '\n';
  }
  
  // Stock bajo
  if (reportData.lowStock.length > 0) {
    csv += 'INVENTARIO CRÍTICO\n';
    csv += 'Producto,Código,Stock Actual,Stock Mínimo,Diferencia\n';
    reportData.lowStock.forEach(p => {
      csv += `"${p.name}","${p.barcode || 'N/A'}",${p.stock},${p.min_stock},${p.stock - p.min_stock}\n`;
    });
  }
  
  // Descargar archivo
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `reporte_${startDate}_${endDate}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function logout() {
  localStorage.removeItem('currentUser');
  window.location.href = 'login.html';
}

// ========== PEDIDOS DE PROVEEDOR MEJORADOS ==========

async function renderSupplierOrders() {
  try {
    const response = await fetch('/api/supplier-orders');
    const orders = await response.json();
    
    const tbody = document.querySelector('#supplierOrdersTable tbody');
    
    if (!orders || orders.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="no-data">No hay pedidos registrados</td></tr>';
      renderPendingProducts([]);
      return;
    }
    
    tbody.innerHTML = orders.map(order => `
      <tr style="${order.status === 'received' ? 'opacity: 0.6;' : ''}">
        <td>${order.supplier_name}</td>
        <td>${order.product_name}</td>
        <td>${order.barcode || 'N/A'}</td>
        <td>${order.quantity}</td>
        <td>${order.received_quantity || 0}</td>
        <td>${new Date(order.created_at).toLocaleDateString('es-MX')}</td>
        <td>
          <span class="badge ${order.status === 'received' ? 'active' : 'inactive'}">
            ${order.status === 'received' ? '✅ Recibido' : '⏳ Pendiente'}
          </span>
        </td>
        <td>
          ${order.status !== 'received' ? `
            <button class="btn btn-small btn-success" onclick="markOrderAsReceived(${order.id})">✅ Marcar</button>
            <button class="btn btn-small btn-warning" onclick="duplicateOrder(${order.id})">➡️ Copiar</button>
            <button class="btn btn-small btn-danger" onclick="deleteSupplierOrder(${order.id})">🗑️</button>
          ` : `
            <button class="btn btn-small btn-secondary" onclick="reactivateOrder(${order.id})">↩️ Reactivar</button>
          `}
        </td>
      </tr>
    `).join('');
    
    renderPendingProducts(orders.filter(o => o.status !== 'received'));
  } catch (error) {
    console.error('Error cargando pedidos:', error);
    alert('Error al cargar pedidos de proveedor');
  }
}

function renderPendingProducts(orders) {
  const list = document.getElementById('pendingProductsList');
  
  if (!orders || orders.length === 0) {
    list.innerHTML = `
      <div style="text-align: center; color: var(--text-light); padding: 20px;">
        ✅ No hay productos pendientes
      </div>
    `;
    return;
  }
  
  list.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 8px;">
      ${orders.map((order, idx) => `
        <div 
          style="padding: 12px; background: #f1f5f9; border-radius: 6px; font-size: 13px; border-left: 3px solid var(--primary-color); cursor: move;"
          draggable="true"
          ondragstart="startDrag(event, ${order.id})"
          ondragover="allowDrop(event)"
          ondrop="handleDrop(event, ${order.id})"
        >
          <div><strong>${order.product_name}</strong></div>
          <div style="color: var(--text-light); margin-top: 4px; font-size: 12px;">
            ${order.supplier_name} • ${order.quantity} unidades
          </div>
          <div style="color: var(--text-light); font-size: 11px; margin-top: 4px;">
            ${new Date(order.created_at).toLocaleDateString('es-MX')}
          </div>
          <div style="margin-top: 8px; display: flex; gap: 4px;">
            <button class="btn btn-small btn-success" onclick="markOrderAsReceived(${order.id})" style="flex: 1; padding: 4px;">✅ Recibido</button>
            <button class="btn btn-small btn-secondary" onclick="showChangeSupplierDialog(${order.id})" style="flex: 1; padding: 4px;">➡️ Cambiar</button>
          </div>
        </div>
      `).join('')}
    </div>
    <div style="margin-top: 16px; padding: 12px; background: #eff6ff; border-radius: 6px; font-size: 12px; color: var(--primary-color);">
      <strong>${orders.length}</strong> producto(s) pendiente(s)
    </div>
  `;
}

async function markOrderAsReceived(orderId) {
  const quantity = prompt('¿Cantidad recibida?', '');
  if (quantity === null) return;
  
  const receivedQty = parseInt(quantity) || 0;
  
  try {
    const response = await fetch(`/api/supplier-orders/${orderId}/receive`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receivedQuantity: receivedQty })
    });
    
    if (response.ok) {
      showNotification('✅ Pedido marcado como recibido', 'success');
      await renderSupplierOrders();
    } else {
      showNotification('Error al marcar como recibido', 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showNotification('Error al conectar con el servidor', 'error');
  }
}

async function duplicateOrder(orderId) {
  try {
    const response = await fetch(`/api/supplier-orders/${orderId}`);
    if (!response.ok) return;
    
    // Mostrar lista de proveedores disponibles
    const suppliersRes = await fetch('/api/suppliers');
    const suppliers = await suppliersRes.json();
    
    // Crear selector (simplificado con prompt)
    const supplierNames = suppliers.map(s => s.name).join('\n');
    const newSupplier = prompt(`Selecciona un proveedor para duplicar:\n${supplierNames}`, '');
    
    if (!newSupplier) return;
    
    const supplier = suppliers.find(s => s.name === newSupplier);
    if (!supplier) {
      showNotification('Proveedor no encontrado', 'error');
      return;
    }
    
    const dupRes = await fetch(`/api/supplier-orders/${orderId}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newSupplierId: supplier.id })
    });
    
    if (dupRes.ok) {
      showNotification('✅ Pedido copiado a nuevo proveedor', 'success');
      await renderSupplierOrders();
    }
  } catch (error) {
    console.error('Error:', error);
    showNotification('Error al duplicar pedido', 'error');
  }
}

async function deleteSupplierOrder(orderId) {
  if (!confirm('¿Eliminar este pedido?')) return;
  
  try {
    const response = await fetch(`/api/supplier-orders/${orderId}`, {
      method: 'DELETE'
    });
    
    if (response.ok) {
      showNotification('✅ Pedido eliminado', 'success');
      await renderSupplierOrders();
    }
  } catch (error) {
    console.error('Error:', error);
    showNotification('Error al eliminar pedido', 'error');
  }
}

async function reactivateOrder(orderId) {
  // Revertir estado a pendiente
  try {
    const response = await fetch(`/api/supplier-orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'pending' })
    });
    
    if (response.ok) {
      showNotification('✅ Pedido reactivado', 'success');
      await renderSupplierOrders();
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

async function showChangeSupplierDialog(orderId) {
  try {
    const suppliersRes = await fetch('/api/suppliers');
    const suppliers = await suppliersRes.json();
    
    const supplierNames = suppliers.map(s => s.name).join('\n');
    const newSupplier = prompt(`Cambiar a proveedor:\n${supplierNames}`, '');
    
    if (!newSupplier) return;
    
    const supplier = suppliers.find(s => s.name === newSupplier);
    if (!supplier) {
      showNotification('Proveedor no encontrado', 'error');
      return;
    }
    
    await duplicateOrder(orderId);
    await deleteSupplierOrder(orderId);
  } catch (error) {
    console.error('Error:', error);
  }
}

// Funciones de arrastrar y soltar (drag & drop)
let draggedOrderId = null;

function startDrag(event, orderId) {
  draggedOrderId = orderId;
  event.dataTransfer.effectAllowed = 'move';
}

function allowDrop(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
}

async function handleDrop(event, targetOrderId) {
  event.preventDefault();
  
  if (draggedOrderId === targetOrderId) return;
  
  // Aquí se podría implementar lógica para cambiar proveedores al soltar
  draggedOrderId = null;
}

// Función auxiliar para mostrar notificaciones
function showNotification(message, type = 'info') {
  // Reutilizar la lógica de notificaciones existente si está disponible
  // O crear una simple alerta
  console.log(`[${type}] ${message}`);
}

// Crear pedido de proveedor
async function showCreateOrderDialog() {
  try {
    // Obtener productos y proveedores
    const [productsRes, suppliersRes] = await Promise.all([
      fetch('/api/products'),
      fetch('/api/suppliers')
    ]);
    
    const products = await productsRes.json();
    const suppliers = await suppliersRes.json();
    
    if (!products.length || !suppliers.length) {
      showNotification('Necesita productos y proveedores registrados', 'error');
      return;
    }
    
    // Crear diálogo simple
    const productNames = products.map(p => `${p.id}:${p.name}`).join('\n');
    const supplierNames = suppliers.map(s => `${s.id}:${s.name}`).join('\n');
    
    const productSelection = prompt(`Selecciona un producto:\n${productNames}`, '');
    if (!productSelection) return;
    
    const productId = parseInt(productSelection.split(':')[0]);
    
    const supplierSelection = prompt(`Selecciona un proveedor:\n${supplierNames}`, '');
    if (!supplierSelection) return;
    
    const supplierId = parseInt(supplierSelection.split(':')[0]);
    
    const quantity = parseInt(prompt('Cantidad:', '10'));
    if (!quantity || quantity <= 0) return;
    
    // Crear pedido
    const response = await fetch('/api/supplier-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId,
        supplierId,
        quantity
      })
    });
    
    if (response.ok) {
      showNotification('✅ Pedido creado correctamente', 'success');
      await renderSupplierOrders();
    } else {
      showNotification('Error al crear pedido', 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showNotification('Error al crear pedido', 'error');
  }
}