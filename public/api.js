// public/api.js - API client centralizado
// Evita repetir fetch() en toda la aplicación

const API = (() => {
  const baseURL = '/api';

  // Función auxiliar para hacer requests
  const request = async (endpoint, options = {}) => {
    const url = `${baseURL}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error(`Error en ${endpoint}:`, error.message);
      throw error;
    }
  };

  return {
    // ============ AUTENTICACIÓN ============
    login: (username, password) =>
      request('/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      }),

    createAdmin: (username, password) =>
      request('/create-admin', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      }),

    logout: () => request('/logout', { method: 'POST' }),

    checkAdmin: () => request('/check-admin'),

    // ============ USUARIOS ============
    getUsers: () => request('/users'),

    createUser: (userData) =>
      request('/users/create', {
        method: 'POST',
        body: JSON.stringify(userData)
      }),

    deleteUser: (userId) =>
      request(`/users/delete`, {
        method: 'POST',
        body: JSON.stringify({ id: userId })
      }),

    // ============ PRODUCTOS ============
    getProducts: () => request('/products'),

    searchProducts: (query) =>
      request(`/products/search?q=${encodeURIComponent(query)}`),

    createProduct: (productData) =>
      request('/products/create', {
        method: 'POST',
        body: JSON.stringify(productData)
      }),

    updateProduct: (productData) =>
      request('/products/update', {
        method: 'POST',
        body: JSON.stringify(productData)
      }),

    deleteProduct: (productId) =>
      request('/products/delete', {
        method: 'POST',
        body: JSON.stringify({ id: productId })
      }),

    // ============ VENTAS ============
    createSale: (saleData) =>
      request('/sales/create', {
        method: 'POST',
        body: JSON.stringify(saleData)
      }),

    // ============ DEVOLUCIONES ============
    createReturn: (returnData) =>
      request('/returns/create', {
        method: 'POST',
        body: JSON.stringify(returnData)
      }),

    // ============ PROVEEDORES ============
    getSuppliers: () => request('/suppliers'),

    createSupplier: (supplierData) =>
      request('/suppliers/create', {
        method: 'POST',
        body: JSON.stringify(supplierData)
      }),

    // ============ PEDIDOS DE PROVEEDOR ============
    getSupplierOrders: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/supplier-orders?${query}`);
    },

    createSupplierOrder: (orderData) =>
      request('/supplier-orders', {
        method: 'POST',
        body: JSON.stringify(orderData)
      }),

    markOrderAsReceived: (orderId, receivedQuantity) =>
      request(`/supplier-orders/${orderId}/receive`, {
        method: 'PATCH',
        body: JSON.stringify({ receivedQuantity })
      }),

    deleteSupplierOrder: (orderId) =>
      request(`/supplier-orders/${orderId}`, {
        method: 'DELETE'
      }),

    // ============ REPORTES ============
    getSalesReport: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/reports/sales?${query}`);
    },

    getTopProducts: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/reports/top-products?${query}`);
    },

    getCashierReport: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/reports/by-cashier?${query}`);
    },

    getLowStockReport: () => request('/reports/low-stock'),

    // ============ SESIÓN ============
    checkSession: () => request('/session'),

    // ============ CONFIGURACIÓN ============
    getPaymentMethods: () => request('/payment-methods'),

    getDepartments: () => request('/departments')
  };
})();
