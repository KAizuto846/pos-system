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
    state.data.departments = await apiGet('/api/departments');
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
    await apiPost(url, data);
    closeModal();
    await renderDepartments();
    showNotification('Departamento guardado', 'success');
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
    await apiPost('/api/departments/delete', { id });
    await renderDepartments();
    showNotification('Departamento eliminado', 'success');
  } catch (error) {
    showNotification('Error al eliminar', 'error');
  }
}
