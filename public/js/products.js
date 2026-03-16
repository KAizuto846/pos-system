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
    state.data.products = await apiGet('/api/products');
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
    await apiPost(url, data);
    closeModal();
    await renderProducts();
    showNotification('Producto guardado exitosamente', 'success');
  } catch (error) {
    showNotification(error.data?.error || 'Error al guardar producto', 'error');
  }
}

function editProduct(product) {
  openProductModal(product);
}

async function deleteProduct(id) {
  if (!confirm('¿Estás seguro de eliminar este producto?')) return;

  try {
    await apiPost('/api/products/delete', { id });
    await renderProducts();
    showNotification('Producto eliminado', 'success');
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
    const result = await apiPost('/api/products/adjust-stock', { id: productId, adjustment });
    closeModal();
    await renderProducts();
    showNotification(`Stock actualizado a ${result.newStock}`, 'success');
  } catch (error) {
    showNotification(error.data?.error || 'Error al ajustar stock', 'error');
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

    const { data: result } = await apiFetch('/api/products/import', {
      method: 'POST',
      body: formData
    });

    progressBar.style.width = '100%';
    progressText.textContent = `✅ Éxito: ${result.imported} productos importados en ${result.duration}`;
    setTimeout(() => {
      closeModal();
      renderProducts();
      showNotification(`${result.imported} productos importados exitosamente`, 'success');
    }, 2000);
  } catch (error) {
    console.error('Error:', error);
    progressBar.style.width = '100%';
    progressText.textContent = `❌ Error: ${error.data?.error || error.message}`;
    showNotification(error.data?.error || 'Error al importar', 'error');
    importBtn.disabled = false;
    importBtn.textContent = '🚀 Importar';
  }
}
