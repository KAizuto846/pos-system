const express = require('express');
const session = require('express-session');
const path = require('path');
const { initDatabase } = require('./database/init');
const config = require('./config');

// Route imports
const authRoutes = require('./routes/auth.routes');
const usersRoutes = require('./routes/users.routes');
const paymentMethodsRoutes = require('./routes/paymentMethods.routes');
const suppliersRoutes = require('./routes/suppliers.routes');
const departmentsRoutes = require('./routes/departments.routes');
const productsRoutes = require('./routes/products.routes');
const salesRoutes = require('./routes/sales.routes');
const returnsRoutes = require('./routes/returns.routes');
const reportsRoutes = require('./routes/reports.routes');
const supplierOrdersRoutes = require('./routes/supplierOrders.routes');

// Initialize database
initDatabase();

const app = express();

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));
app.use(session(config.session));

// Mount routes
app.use('/api', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/payment-methods', paymentMethodsRoutes);
app.use('/api/suppliers', suppliersRoutes);
app.use('/api/departments', departmentsRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/returns', returnsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/supplier-orders', supplierOrdersRoutes);

// Start server
app.listen(config.server.port, config.server.host, () => {
  console.log(`Servidor corriendo en http://${config.server.host}:${config.server.port}`);
});
