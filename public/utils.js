// public/utils.js - Funciones de utilidad reutilizables

const Utils = (() => {
  // ============ NOTIFICACIONES ============
  const showNotification = (message, type = 'info', duration = 3000) => {
    const div = document.createElement('div');
    div.className = `notification notification-${type}`;
    div.textContent = message;
    div.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${type === 'error' ? '#f87171' : type === 'success' ? '#4ade80' : '#60a5fa'};
      color: white;
      padding: 16px 24px;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      z-index: 9999;
      animation: slideIn 0.3s ease;
    `;

    document.body.appendChild(div);

    if (duration > 0) {
      setTimeout(() => div.remove(), duration);
    }

    return div;
  };

  const showError = (message) => showNotification(message, 'error');
  const showSuccess = (message) => showNotification(message, 'success');
  const showInfo = (message) => showNotification(message, 'info');

  // ============ VALIDACIÓN ============
  const validateEmail = (email) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  };

  const validateUsername = (username) => {
    return username && username.length >= 3;
  };

  const validatePassword = (password) => {
    return password && password.length >= 6;
  };

  // ============ FORMATO ============
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(value);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('es-MX', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(date);
  };

  // ============ MANIPULACIÓN DE ARRAYS ============
  const groupBy = (array, key) => {
    return array.reduce((result, item) => {
      const group = item[key];
      if (!result[group]) {
        result[group] = [];
      }
      result[group].push(item);
      return result;
    }, {});
  };

  const sumBy = (array, key) => {
    return array.reduce((sum, item) => sum + (parseFloat(item[key]) || 0), 0);
  };

  const findById = (array, id) => {
    return array.find(item => item.id == id);
  };

  // ============ ALMACENAMIENTO LOCAL ============
  const storage = {
    set: (key, value) => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (error) {
        console.error('Error guardando en localStorage:', error);
      }
    },

    get: (key, defaultValue = null) => {
      try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
      } catch (error) {
        console.error('Error leyendo de localStorage:', error);
        return defaultValue;
      }
    },

    remove: (key) => {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        console.error('Error eliminando de localStorage:', error);
      }
    },

    clear: () => {
      try {
        localStorage.clear();
      } catch (error) {
        console.error('Error limpiando localStorage:', error);
      }
    }
  };

  // ============ DOM ============
  const createElement = (html) => {
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content.firstChild;
  };

  const setLoading = (element, isLoading = true) => {
    if (isLoading) {
      element.disabled = true;
      element.dataset.originalText = element.textContent;
      element.textContent = '⏳ Cargando...';
    } else {
      element.disabled = false;
      element.textContent = element.dataset.originalText || element.textContent;
    }
  };

  const toggleVisibility = (element, show = true) => {
    if (show) {
      element.style.display = '';
      element.classList.remove('hidden');
    } else {
      element.style.display = 'none';
      element.classList.add('hidden');
    }
  };

  // ============ CONFIRMACIÓN ============
  const confirm = (message) => {
    return window.confirm(message);
  };

  return {
    showNotification,
    showError,
    showSuccess,
    showInfo,
    validateEmail,
    validateUsername,
    validatePassword,
    formatCurrency,
    formatDate,
    formatTime,
    groupBy,
    sumBy,
    findById,
    storage,
    createElement,
    setLoading,
    toggleVisibility,
    confirm
  };
})();
