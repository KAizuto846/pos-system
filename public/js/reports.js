// ============ REPORTES ============
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
        data = await apiGet(`/api/reports/detailed-sales?${params}`);
        state.reportData = data;
        html = renderDetailedSales(data);
        break;

      case 'supplier-order':
        console.log('📊 Generando reporte de Pedido Proveedor...');
        console.log('Parameters:', { startDate, endDate, supplierId });

        data = await apiGet(`/api/reports/supplier-order?${params}`);
        console.log('✅ Datos recibidos:', data);

        state.supplierOrder = JSON.parse(JSON.stringify(data)); // Copia profunda
        state.reportData = data;
        html = renderSupplierOrder(data);

        // Cargar barra lateral de pedidos
        if (supplierId) {
          console.log('📌 Cargando barra lateral para proveedor:', supplierId);
          setTimeout(() => {
            if (typeof SidebarPedidos !== 'undefined' && SidebarPedidos.loadSupplierOrders) {
              SidebarPedidos.loadSupplierOrders(supplierId);
            } else {
              console.error('❌ SidebarPedidos no está disponible');
            }
          }, 300);
        }
        break;

      case 'history':
        data = await apiGet(`/api/reports/sales-history?${params}`);
        state.reportData = data;
        html = renderHistoryReport(data);
        break;
    }

    if (!html) {
      console.warn('⚠️ HTML vacío para reporte', type);
      container.innerHTML = '<div style="padding: 40px; text-align: center; color: #ff9800;">No se pudo generar el reporte</div>';
      return;
    }

    container.innerHTML = html;
    console.log('✅ Reporte renderizado');

  } catch (error) {
    console.error('❌ Error generando reporte:', error);
    container.innerHTML = `<div style="padding: 20px; color: red;">
      <strong>Error al generar reporte:</strong>
      <p>${error.message}</p>
    </div>`;
    showNotification('Error: ' + error.message, 'error');
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
