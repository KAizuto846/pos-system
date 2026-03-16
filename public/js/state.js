// Estado global
const state = {
  currentModule: 'dashboard',
  currentUser: null,
  cart: [],
  data: {
    users: [],
    paymentMethods: [],
    suppliers: [],
    departments: [],
    products: []
  },
  reportData: [], // Para exportación
  supplierOrder: [] // Para pedido proveedor editable
};
