// Estado global
let reportData = {
  sales: [],
  topProducts: [],
  cashiers: [],
  lowStock: []
};

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