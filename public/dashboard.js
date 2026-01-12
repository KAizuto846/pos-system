// Estado global
const state = {
  currentModule: 'dashboard',
  currentUser: null,
  data: {
    users: [],
    paymentMethods: [],
    suppliers: [],
    departments: [],
    products: []
  }
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
      renderComingSoon('Punto de Venta');
      break;
    default:
      document.getElementById('content-wrapper').innerHTML = '<h1>Módulo no encontrado</h1>';
  }
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
        <button class="btn btn-primary" onclick="loadModule('users')" style="justify-content: center; padding: 20px;">
          👥 Usuarios
        </button>
        <button class="btn btn-primary" onclick="loadModule('payment-methods')" style="justify-content: center; padding: 20px;">
          💳 Formas de Pago
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
      <button class="btn btn-primary" onclick="openProductModal()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Nuevo Producto
      </button>
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

// ============ UTILIDADES ============
function renderComingSoon(moduleName) {
  const wrapper = document.getElementById('content-wrapper');
  wrapper.innerHTML = `
    <div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <h2>${moduleName}</h2>
      <p>Este módulo estará disponible próximamente</p>
    </div>
  `;
}

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