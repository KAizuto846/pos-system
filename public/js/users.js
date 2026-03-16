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
    state.data.users = await apiGet('/api/users');
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
    await apiPost(url, data);
    closeModal();
    await renderUsers();
    showNotification('Usuario guardado exitosamente', 'success');
  } catch (error) {
    showNotification(error.data?.error || 'Error al guardar usuario', 'error');
  }
}

function editUser(user) {
  openUserModal(user);
}

async function deleteUser(id) {
  if (!confirm('¿Estás seguro de eliminar este usuario?')) return;

  try {
    await apiPost('/api/users/delete', { id });
    await renderUsers();
    showNotification('Usuario eliminado', 'success');
  } catch (error) {
    showNotification('Error al eliminar usuario', 'error');
  }
}
