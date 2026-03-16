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
      <div class="table-wrapper">
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
        <button class="btn btn-primary" onclick="loadModule('reports')" style="justify-content: center; padding: 20px;">
          📊 Reportes
        </button>
      </div>
    </div>
  `;
}

async function fetchStats() {
  try {
    return await apiGet('/api/reports/stats');
  } catch (error) {
    return { users: 0, products: 0, sales: 0, revenue: 0, cashTotal: 0, lowStock: 0, salesByCashier: [] };
  }
}
