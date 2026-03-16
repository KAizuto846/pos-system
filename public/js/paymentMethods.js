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
    state.data.paymentMethods = await apiGet('/api/payment-methods');
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
    await apiPost(url, data);
    closeModal();
    await renderPaymentMethods();
    showNotification('Forma de pago guardada', 'success');
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
    await apiPost('/api/payment-methods/delete', { id });
    await renderPaymentMethods();
    showNotification('Forma de pago eliminada', 'success');
  } catch (error) {
    showNotification('Error al eliminar', 'error');
  }
}
