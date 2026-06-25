// Estado de la aplicaci\u00f3n
let isCreatingAdmin = false;

// Elementos DOM
const form = document.getElementById('auth-form');
const formTitle = document.getElementById('form-title');
const formSubtitle = document.getElementById('form-subtitle');
const submitBtn = document.getElementById('submit-btn');
const errorMessage = document.getElementById('error-message');
const passwordRequirements = document.getElementById('password-requirements');

// Verificar si existe administrador al cargar
async function checkAdmin() {
  try {
    const response = await fetch('/api/check-admin');
    const data = await response.json();
    
    if (data.adminExists) {
      // Modo login normal
      isCreatingAdmin = false;
      formSubtitle.textContent = 'Inicia sesi\u00f3n para continuar';
      submitBtn.textContent = 'Iniciar Sesi\u00f3n';
    } else {
      // Modo crear administrador
      isCreatingAdmin = true;
      formTitle.textContent = 'Configuraci\u00f3n Inicial';
      formSubtitle.textContent = 'Crea la cuenta de administrador';
      submitBtn.textContent = 'Crear Administrador';
      passwordRequirements.style.display = 'block';
    }
  } catch (error) {
    showError('Error al conectar con el servidor');
  }
}

// Manejar env\u00edo del formulario
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  
  // Validaciones
  if (!username || !password) {
    showError('Por favor completa todos los campos');
    return;
  }
  
  if (isCreatingAdmin && password.length < 6) {
    showError('La contrase\u00f1a debe tener al menos 6 caracteres');
    return;
  }
  
  // Deshabilitar bot\u00f3n
  submitBtn.disabled = true;
  submitBtn.textContent = 'Procesando...';
  hideError();
  
  try {
    const endpoint = isCreatingAdmin ? '/api/create-admin' : '/api/login';
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      // \u00c9xito - redirigir al dashboard
      showSuccess(data.message);
      setTimeout(() => {
        window.location.href = '/dashboard.html';
      }, 500);
    } else {
      showError(data.error || 'Error en la autenticaci\u00f3n');
      submitBtn.disabled = false;
      submitBtn.textContent = isCreatingAdmin ? 'Crear Administrador' : 'Iniciar Sesi\u00f3n';
    }
  } catch (error) {
    showError('Error al conectar con el servidor');
    submitBtn.disabled = false;
    submitBtn.textContent = isCreatingAdmin ? 'Crear Administrador' : 'Iniciar Sesi\u00f3n';
  }
});

// Funciones de utilidad
function showError(message) {
  errorMessage.textContent = message;
  errorMessage.className = 'error-message show';
  errorMessage.style.background = '#fee2e2';
  errorMessage.style.color = '#dc2626';
}

function showSuccess(message) {
  errorMessage.textContent = message;
  errorMessage.className = 'error-message show';
  errorMessage.style.background = '#dcfce7';
  errorMessage.style.color = '#16a34a';
}

function hideError() {
  errorMessage.className = 'error-message';
}

// Inicializar
checkAdmin();
