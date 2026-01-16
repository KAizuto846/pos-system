/**
 * Módulo de Barra Lateral de Pedidos de Proveedores
 * Maneja la visualización, edición y drag-drop de pedidos en la sección de reportes
 */

const SidebarPedidos = (() => {
  let currentOrder = null;
  let currentSupplier = null;

  /**
   * Inicializar la barra lateral
   */
  function init() {
    createSidebarHTML();
    console.log('✅ Módulo SidebarPedidos inicializado');
  }

  /**
   * Anexar listeners de eventos
   */
  function attachEventListeners() {
    // Este método se llama cuando sea necesario
    // Por ahora no hay eventos que anexar en inicialización
  }

  /**
   * Crear estructura HTML de la barra lateral
   */
  function createSidebarHTML() {
    const sidebar = document.createElement('div');
    sidebar.id = 'sidebar-pedidos';
    sidebar.style.cssText = `
      position: fixed;
      right: 0;
      top: 0;
      width: 400px;
      height: 100vh;
      background: white;
      border-left: 2px solid #e0e0e0;
      box-shadow: -2px 0 8px rgba(0,0,0,0.1);
      overflow-y: auto;
      z-index: 1000;
      display: none;
      flex-direction: column;
    `;

    sidebar.innerHTML = `
      <div style="padding: 20px; border-bottom: 1px solid #e0e0e0; background: #f8fafc;">
        <h3 style="margin: 0 0 10px 0;">📦 Pedidos Pendientes</h3>
        <button class="btn btn-small btn-danger" onclick="SidebarPedidos.closeSidebar()" style="float: right;">✕</button>
        <div style="clear: both;"></div>
      </div>

      <div id="sidebar-content" style="flex: 1; padding: 15px; overflow-y: auto;">
        <p style="text-align: center; color: #999;">Selecciona un proveedor para ver pedidos</p>
      </div>

      <div style="padding: 15px; border-top: 1px solid #e0e0e0; background: #f8fafc;">
        <button class="btn btn-primary btn-block" onclick="SidebarPedidos.createNewOrder()" style="margin-bottom: 8px;">
          ➕ Nuevo Pedido
        </button>
        <button class="btn btn-success btn-block" onclick="SidebarPedidos.saveCurrentOrder()">
          💾 Guardar Cambios
        </button>
      </div>
    `;

    document.body.appendChild(sidebar);
  }

  /**
   * Mostrar la barra lateral
   */
  function showSidebar() {
    const sidebar = document.getElementById('sidebar-pedidos');
    if (sidebar) {
      sidebar.style.display = 'flex';
    }
  }

  /**
   * Cerrar la barra lateral
   */
  function closeSidebar() {
    const sidebar = document.getElementById('sidebar-pedidos');
    if (sidebar) {
      sidebar.style.display = 'none';
    }
    currentOrder = null;
    currentSupplier = null;
  }

  /**
   * Cargar pedidos de un proveedor
   */
  async function loadSupplierOrders(supplierId) {
    if (!supplierId) {
      console.error('❌ supplierId no proporcionado');
      return;
    }

    currentSupplier = supplierId;
    showSidebar();

    const content = document.getElementById('sidebar-content');
    if (!content) {
      console.error('❌ No se encontró elemento sidebar-content');
      return;
    }

    content.innerHTML = '<p style="text-align: center;">⏳ Cargando pedidos...</p>';

    try {
      const response = await fetch(`/api/supplier-orders-list?supplierId=${supplierId}&status=draft`);
      
      if (!response.ok) {
        console.warn('⚠️ Respuesta no OK:', response.status);
        content.innerHTML = `
          <div style="text-align: center; padding: 20px; color: #ff9800;">
            <p>No hay pedidos en borrador (o es la primera vez)</p>
            <p style="font-size: 12px;">Usa el botón "Nuevo Pedido" para crear uno</p>
          </div>
        `;
        return;
      }

      const orders = await response.json();

      if (!orders || orders.length === 0) {
        content.innerHTML = `
          <div style="text-align: center; padding: 20px; color: #999;">
            <p>No hay pedidos en borrador</p>
            <p style="font-size: 12px;">Usa el botón "Nuevo Pedido" para crear uno</p>
          </div>
        `;
        console.log('ℹ️ No hay pedidos en draft para supplier:', supplierId);
        return;
      }

      console.log('✅ Pedidos cargados:', orders.length);
      renderOrdersList(orders);
    } catch (error) {
      console.error('❌ Error cargando pedidos:', error);
      content.innerHTML = `
        <div style="color: red; padding: 10px;">
          <strong>Error al cargar pedidos:</strong>
          <p style="font-size: 12px; margin-top: 5px;">${error.message}</p>
        </div>
      `;
    }
  }

  /**
   * Renderizar lista de pedidos
   */
  function renderOrdersList(orders) {
    const content = document.getElementById('sidebar-content');
    
    const html = orders.map(order => `
      <div class="order-card" onclick="SidebarPedidos.loadOrderDetails(${order.id})" 
           style="
             padding: 12px;
             margin-bottom: 10px;
             border: 1px solid #ddd;
             border-radius: 6px;
             cursor: pointer;
             background: white;
             transition: all 0.2s;
           "
           onmouseover="this.style.background='#f0f0f0'"
           onmouseout="this.style.background='white'">
        <div style="font-weight: bold; margin-bottom: 5px;">
          Pedido #${order.id}
          <span style="float: right; font-size: 12px; color: #666;">
            ${order.item_count} items
          </span>
        </div>
        <div style="font-size: 12px; color: #666;">
          ${order.received_count}/${order.item_count} recibidos
          <br/>
          Estado: <strong>${getStatusLabel(order.status)}</strong>
        </div>
        <div style="margin-top: 8px;">
          <button class="btn btn-small btn-danger" onclick="event.stopPropagation(); SidebarPedidos.deleteOrder(${order.id})">
            🗑️ Eliminar
          </button>
        </div>
      </div>
    `).join('');

    content.innerHTML = html;
  }

  /**
   * Cargar detalles de un pedido
   */
  async function loadOrderDetails(orderId) {
    try {
      const response = await fetch(`/api/supplier-orders/${orderId}/complete`);
      const order = await response.json();
      
      currentOrder = order;
      renderOrderDetails(order);
    } catch (error) {
      console.error('Error cargando detalles:', error);
      Utils.showError('Error al cargar detalles del pedido');
    }
  }

  /**
   * Renderizar detalles del pedido
   */
  function renderOrderDetails(order) {
    const content = document.getElementById('sidebar-content');

    const itemsHTML = order.items.map((item, idx) => `
      <div style="
        padding: 10px;
        background: #f9f9f9;
        margin-bottom: 10px;
        border-radius: 4px;
        border-left: 3px solid ${item.received ? '#4caf50' : '#ff9800'};
      ">
        <div style="margin-bottom: 8px;">
          <strong>${item.product_name}</strong>
          <span style="float: right; font-size: 12px; color: #666;">${item.barcode || 'N/A'}</span>
        </div>

        <div style="margin-bottom: 8px;">
          <label style="display: block; font-size: 12px; margin-bottom: 3px;">
            Cantidad solicitada:
          </label>
          <input type="number" value="${item.quantity}" 
            onchange="SidebarPedidos.updateItemQuantity(${order.id}, ${item.id}, this.value)"
            style="width: 100%; padding: 5px; border: 1px solid #ddd; border-radius: 3px;">
        </div>

        <div style="margin-bottom: 8px;">
          <label style="display: block; font-size: 12px; margin-bottom: 3px;">
            Cantidad recibida:
          </label>
          <input type="number" value="${item.received_quantity || 0}" 
            onchange="SidebarPedidos.updateItemReceived(${order.id}, ${item.id}, this.value)"
            style="width: 100%; padding: 5px; border: 1px solid #ddd; border-radius: 3px;">
        </div>

        <div style="margin-bottom: 8px;">
          <label style="display: flex; align-items: center; font-size: 12px; cursor: pointer;">
            <input type="checkbox" ${item.received ? 'checked' : ''} 
              onchange="SidebarPedidos.toggleItemReceived(${order.id}, ${item.id}, this.checked)"
              style="margin-right: 5px; cursor: pointer;">
            Marcar como recibido
          </label>
        </div>

        <div style="margin-bottom: 8px;">
          <label style="display: block; font-size: 12px; margin-bottom: 3px;">
            Notas:
          </label>
          <textarea placeholder="Ej: En camino, requiere inspección..." 
            onchange="SidebarPedidos.updateItemNotes(${order.id}, ${item.id}, this.value)"
            style="width: 100%; padding: 5px; border: 1px solid #ddd; border-radius: 3px; min-height: 60px; font-size: 12px;"
          >${item.notes || ''}</textarea>
        </div>

        <button class="btn btn-small btn-danger" 
          onclick="SidebarPedidos.deleteOrderItem(${order.id}, ${item.id})"
          style="width: 100%; margin-top: 5px;">
          🗑️ Eliminar Producto
        </button>
      </div>
    `).join('');

    content.innerHTML = `
      <div style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 2px solid #e0e0e0;">
        <h4 style="margin: 0 0 10px 0;">Pedido #${order.id}</h4>
        <button class="btn btn-small btn-primary" onclick="SidebarPedidos.addProductToOrder(${order.id})">
          ➕ Agregar Producto
        </button>
        <button class="btn btn-small btn-secondary" onclick="SidebarPedidos.backToList()">
          ⬅️ Volver
        </button>
      </div>

      <div id="items-container">
        ${itemsHTML || '<p style="text-align: center; color: #999;">Sin items</p>'}
      </div>
    `;
  }

  /**
   * Actualizar cantidad del item
   */
  async function updateItemQuantity(orderId, itemId, quantity) {
    if (quantity <= 0) {
      Utils.showError('La cantidad debe ser mayor a 0');
      return;
    }

    try {
      await fetch(`/api/supplier-orders/${orderId}/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: parseInt(quantity) })
      });
      Utils.showSuccess('Cantidad actualizada');
    } catch (error) {
      Utils.showError('Error al actualizar cantidad');
    }
  }

  /**
   * Actualizar cantidad recibida
   */
  async function updateItemReceived(orderId, itemId, receivedQuantity) {
    if (receivedQuantity < 0) {
      Utils.showError('La cantidad debe ser 0 o mayor');
      return;
    }

    try {
      await fetch(`/api/supplier-orders/${orderId}/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receivedQuantity: parseInt(receivedQuantity) })
      });
      Utils.showSuccess('Cantidad recibida actualizada');
    } catch (error) {
      Utils.showError('Error al actualizar cantidad recibida');
    }
  }

  /**
   * Toggle estado recibido
   */
  async function toggleItemReceived(orderId, itemId, received) {
    try {
      await fetch(`/api/supplier-orders/${orderId}/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ received: received ? 1 : 0 })
      });
      Utils.showSuccess(received ? 'Marcado como recibido' : 'Desmarcado como no recibido');
    } catch (error) {
      Utils.showError('Error al actualizar estado');
    }
  }

  /**
   * Actualizar notas del item
   */
  async function updateItemNotes(orderId, itemId, notes) {
    try {
      await fetch(`/api/supplier-orders/${orderId}/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes })
      });
      Utils.showSuccess('Notas guardadas');
    } catch (error) {
      Utils.showError('Error al guardar notas');
    }
  }

  /**
   * Eliminar item del pedido
   */
  async function deleteOrderItem(orderId, itemId) {
    if (!confirm('¿Eliminar este producto del pedido?')) return;

    try {
      await fetch(`/api/supplier-orders/${orderId}/items/${itemId}`, {
        method: 'DELETE'
      });
      Utils.showSuccess('Producto eliminado del pedido');
      loadOrderDetails(orderId);
    } catch (error) {
      Utils.showError('Error al eliminar producto');
    }
  }

  /**
   * Agregar producto a un pedido
   */
  async function addProductToOrder(orderId) {
    const productId = prompt('Ingresa el ID del producto:');
    if (!productId || isNaN(productId)) return;

    const quantity = prompt('¿Cuántos?', '1');
    if (!quantity || isNaN(quantity) || quantity <= 0) return;

    try {
      const response = await fetch(`/api/supplier-orders/${orderId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: parseInt(productId),
          quantity: parseInt(quantity)
        })
      });

      if (response.ok) {
        Utils.showSuccess('Producto agregado al pedido');
        loadOrderDetails(orderId);
      } else {
        const error = await response.json();
        Utils.showError(error.error || 'Error al agregar producto');
      }
    } catch (error) {
      Utils.showError('Error al agregar producto');
    }
  }

  /**
   * Crear nuevo pedido
   */
  async function createNewOrder() {
    if (!currentSupplier) {
      Utils.showError('Selecciona un proveedor primero');
      return;
    }

    const notes = prompt('Notas para el pedido (opcional):', '');

    try {
      const response = await fetch('/api/supplier-orders/create-header', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: currentSupplier,
          notes
        })
      });

      if (response.ok) {
        const data = await response.json();
        Utils.showSuccess('Pedido creado. Agrega productos.');
        loadSupplierOrders(currentSupplier);
      } else {
        Utils.showError('Error al crear pedido');
      }
    } catch (error) {
      Utils.showError('Error al crear pedido');
    }
  }

  /**
   * Guardar cambios del pedido actual
   */
  async function saveCurrentOrder() {
    if (!currentOrder) {
      Utils.showError('No hay pedido seleccionado');
      return;
    }

    try {
      await fetch(`/api/supplier-orders/${currentOrder.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'sent' })
      });

      Utils.showSuccess('Pedido enviado al proveedor');
      loadSupplierOrders(currentSupplier);
    } catch (error) {
      Utils.showError('Error al guardar pedido');
    }
  }

  /**
   * Eliminar pedido
   */
  async function deleteOrder(orderId) {
    if (!confirm('¿Eliminar este pedido completamente?')) return;

    try {
      await fetch(`/api/supplier-orders/${orderId}`, {
        method: 'DELETE'
      });
      Utils.showSuccess('Pedido eliminado');
      loadSupplierOrders(currentSupplier);
    } catch (error) {
      Utils.showError('Error al eliminar pedido');
    }
  }

  /**
   * Volver a la lista de pedidos
   */
  function backToList() {
    if (currentSupplier) {
      loadSupplierOrders(currentSupplier);
    }
  }

  /**
   * Obtener etiqueta de estado
   */
  function getStatusLabel(status) {
    const labels = {
      'draft': '📝 Borrador',
      'sent': '✉️ Enviado',
      'pending': '⏳ Pendiente',
      'partial_received': '📦 Parcialmente Recibido',
      'received': '✅ Recibido'
    };
    return labels[status] || status;
  }

  // Retornar API pública
  return {
    init,
    showSidebar,
    closeSidebar,
    loadSupplierOrders,
    loadOrderDetails,
    backToList,
    createNewOrder,
    saveCurrentOrder,
    deleteOrder,
    updateItemQuantity,
    updateItemReceived,
    toggleItemReceived,
    updateItemNotes,
    deleteOrderItem,
    addProductToOrder
  };
})();

// Inicializar cuando carga el módulo
document.addEventListener('DOMContentLoaded', () => {
  SidebarPedidos.init();
});
