// ============ INICIALIZACIÓN Y NAVEGACIÓN ============

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  loadModule('dashboard');
  setupEventListeners();
});

// Verificar autenticación
async function checkAuth() {
  try {
    const data = await apiGet('/api/session');

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
    await apiFetch('/api/logout', { method: 'POST' });
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
