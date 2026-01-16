// config.js - Centralized configuration management
require('dotenv').config();

const config = {
  // Ambiente
  env: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',
  isProd: process.env.NODE_ENV === 'production',

  // Servidor
  server: {
    port: parseInt(process.env.PORT || '3000'),
    host: 'localhost'
  },

  // Base de datos
  database: {
    path: process.env.DATABASE_PATH || './database/pos.db'
  },

  // Sesión
  session: {
    secret: process.env.SESSION_SECRET || 'default-secret-change-this',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // true si HTTPS
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 // 24 horas
    }
  },

  // API
  api: {
    baseUrl: process.env.API_BASE_URL || 'http://localhost:3000/api'
  },

  // Aplicación
  app: {
    name: process.env.APP_NAME || 'POS System',
    version: process.env.APP_VERSION || '1.0.0'
  }
};

module.exports = config;
