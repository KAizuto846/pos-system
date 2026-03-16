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
    state.data.suppliers = await apiGet('/api/suppliers');
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
    await apiPost(url, data);
    closeModal();
    await renderSuppliers();
    showNotification('Proveedor guardado', 'success');
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
    await apiPost('/api/suppliers/delete', { id });
    await renderSuppliers();
    showNotification('Proveedor eliminado', 'success');
  } catch (error) {
    showNotification('Error al eliminar', 'error');
  }
}
