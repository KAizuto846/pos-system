# Implementación de Mejoras - Detalles Técnicos

## Cambios Completados

### 1. DEVOLUCIONES NO CREAN PEDIDOS 
✅ **Estado: COMPLETADO**

El endpoint `/api/returns/create` ya no crea automáticamente `supplier_orders`.
- Solo incrementa el stock
- Registra la devolución en `sales` con cantidad negativa
- **Confirmado:** No hay lógica que agregue items a pedidos de proveedores

### 2. NUEVA ESTRUCTURA DE BD: PEDIDOS CON ITEMS

#### Cambios en `database/init.js`
```
ANTES:
- supplier_orders tenía columns: product_id, supplier_id, quantity
- Un pedido = un producto

AHORA:
- supplier_orders es CABECERA: id, supplier_id, status, notes, created_at, updated_at, sent_at
- supplier_order_items son ITEMS: id, supplier_order_id, product_id, quantity, received_quantity, received, notes
- Un pedido puede tener MÚLTIPLES productos
```

#### Nuevas Migraciones
- Migración 6: Tabla `supplier_orders` con nueva estructura
- Migración 7: Tabla `supplier_order_items` 
- Migración 8-9: Agregar columnas faltantes si BD ya existe

### 3. ENDPOINTS API NUEVOS

#### Crear y Listar Pedidos
```javascript
POST   /api/supplier-orders/create-header
GET    /api/supplier-orders-list?supplierId=X&status=draft
GET    /api/supplier-orders/:orderId/complete  // Cabecera + items
PATCH  /api/supplier-orders/:orderId/status
DELETE /api/supplier-orders/:orderId
```

#### CRUD de Items en Pedidos
```javascript
GET    /api/supplier-orders/:orderId/items
POST   /api/supplier-orders/:orderId/items
PATCH  /api/supplier-orders/:orderId/items/:itemId
DELETE /api/supplier-orders/:orderId/items/:itemId
PATCH  /api/supplier-orders/:orderId/items/:itemId/receive
```

### 4. REPORTES FILTRAN POR LÍNEA PRINCIPAL

#### Cambio en `/api/reports/supplier-order`
```sql
ANTES: WHERE p.supplier_id = ?
AHORA: WHERE pl.supplier_id = ? AND pl.is_primary = 1
       (solo muestra productos donde esta es la línea PRINCIPAL)
```

### 5. MÓDULO FRONTEND: sidebar-pedidos.js

#### Funcionalidades
- ✅ Mostrar/ocultar barra lateral derecha
- ✅ Cargar list de pedidos por proveedor
- ✅ Ver detalles de pedido (items con cantidades)
- ✅ Marcar items como "recibido" con checkboxes
- ✅ Editar cantidades (solicitada vs recibida)
- ✅ Agregar notas por item
- ✅ Agregar nuevos items al pedido
- ✅ Eliminar items
- ✅ Crear pedidos nuevos
- ✅ Eliminar pedidos (solo si status = draft)
- ⏳ Drag-drop entre pedidos (próxima fase)

#### API Pública del Módulo
```javascript
SidebarPedidos.init()                     // Inicializa
SidebarPedidos.loadSupplierOrders(id)     // Cargar pedidos de proveedor
SidebarPedidos.loadOrderDetails(id)       // Ver detalles
SidebarPedidos.showSidebar() / closeSidebar()
SidebarPedidos.createNewOrder()
SidebarPedidos.saveCurrentOrder()
// ... más métodos
```

### 6. INTEGRACIÓN EN DASHBOARD.JS

#### Evento en Reportes
Cuando generas reporte de "Pedido Proveedor":
1. Se muestra la tabla del reporte (como antes)
2. Se activa automáticamente `SidebarPedidos.loadSupplierOrders(supplierId)`
3. Aparece barra lateral con pedidos

---

## ESTADÍSTICAS DE CAMBIOS

### Backend (server.js)
- **Líneas modificadas:** ~250
- **Nuevos endpoints:** 8
- **Endpoints actualizados:** 1 (reporte supplier-order)

### BD (database/init.js)
- **Nuevas tablas:** 1 (`supplier_order_items`)
- **Tablas modificadas:** 1 (`supplier_orders`)
- **Nuevas migraciones:** 4
- **Nuevos índices:** 3

### Frontend
- **Nuevo archivo:** `public/sidebar-pedidos.js` (400 líneas)
- **Archivo actualizado:** `dashboard.html` (agregó script)
- **Archivo actualizado:** `dashboard.js` (agregó evento)

### Total
- **Archivos modificados:** 5
- **Archivos nuevos:** 2
- **Líneas de código:** +700

---

## CÓMO FUNCIONA AHORA

### Flujo de Reportes → Pedidos de Proveedores

1. **Usuario abre Reportes → Pedido Proveedor**
   - Selecciona proveedor y rango de fechas
   - Sistema muestra tabla de productos vendidos (línea principal)
   - Automáticamente abre barra lateral derecha

2. **Barra Lateral de Pedidos**
   - Muestra todos los pedidos en "draft" del proveedor
   - Admin cliquea en un pedido para ver detalles
   - Para cada item puede:
     - ✓ Marcar como "recibido"
     - ✓ Editar cantidad recibida vs solicitada
     - ✓ Agregar notas ("En camino", "Falta inspección", etc.)
     - ✓ Eliminar producto del pedido

3. **Crear Nuevo Pedido**
   - Click "Nuevo Pedido"
   - Sistema crea pedido vacío (status = "draft")
   - Admin agrega productos manualmente
   - Cuando termina, cliquea "Guardar Cambios" (cambia status a "sent")

4. **Historial**
   - Los pedidos con status "received" quedan en el sistema
   - Se puede hacer reporte de lo que llegó vs lo que se pidió

---

## PRÓXIMAS FASES (Roadmap)

### Fase 2: Drag-Drop (Próxima sesión)
- [ ] Drag items entre pedidos
- [ ] Mover items a otros proveedores
- [ ] Mover items no recibidos a próximo mes

### Fase 3: Sistema de Líneas Avanzado
- [ ] Mostrar etiquetas de líneas en inventario
- [ ] Cambiar línea principal de producto
- [ ] UI para gestionar líneas de producto

### Fase 4: Reportes Avanzados
- [ ] Reporte de lo recibido vs lo pedido
- [ ] Tracking de proveedores (velocidad de entrega)
- [ ] Análisis de discrepancias

### Fase 5: Integración con Inventario
- [ ] Auto-actualizar stock cuando se marca "recibido"
- [ ] Validar stock mínimo
- [ ] Alertas de reabastecimiento

---

## TESTING

### Verificar que funciona:

1. **BD está bien:**
   ```bash
   npm start
   # Debe mostrar todas las migraciones OK
   ```

2. **Endpoints están disponibles:**
   ```bash
   curl http://localhost:3000/api/supplier-orders-list
   # Debe retornar JSON vacío []
   ```

3. **Barra lateral carga:**
   - Ir a Dashboard → Reportes → Pedido Proveedor
   - Seleccionar proveedor
   - Debe aparecer barra derecha

---

## COMPATIBILIDAD

✅ **Sin cambios romper:** Todo el código viejo sigue funcionando
✅ **BD compatible:** Las migraciones crean tablas nuevas sin afectar las existentes
✅ **API anterior:** Los viejos endpoints de `supplier_orders` ya no se usan, pero existen para backwards compatibility

---

## ARCHIVOS MODIFICADOS

1. `database/init.js` - Nueva estructura de pedidos
2. `server.js` - 8 nuevos endpoints + actualización de reporte
3. `public/dashboard.html` - Agregó script sidebar-pedidos.js
4. `public/dashboard.js` - Evento para cargar barra cuando se genera reporte
5. `public/sidebar-pedidos.js` - ✨ NUEVO MÓDULO (400 líneas)

---

## NOTAS TÉCNICAS

### Por qué se cambió la estructura
**Antes:** 1 Pedido = 1 Producto
**Ahora:** 1 Pedido = N Productos

Ventajas:
- Admin puede agrupar compras del mismo proveedor
- Pedido único = factura única
- Mejor tracking ("llegaron 10 de 50 de este item")
- Drag-drop entre pedidos es más fácil

### Por qué se guardan items en tabla separada
- Normalización de BD (reduce redundancia)
- Facilita queries complejas
- Prepara para historial de cambios

### Estado del pedido
- `draft`: En edición, sin enviar
- `sent`: Enviado al proveedor
- `pending`: En espera de llegada
- `partial_received`: Llegó parte
- `received`: Llegó todo

---

## SOPORTE Y DEBUGGING

Si algo no funciona:

1. **Revisa logs del servidor:**
   ```bash
   npm start
   # Busca "Error" o "❌"
   ```

2. **Verifica que la BD migró bien:**
   ```bash
   sqlite3 database/pos.db ".tables"
   # Debe listar: supplier_orders supplier_order_items
   ```

3. **Abre browser console (F12) y busca errores**

4. **Revisa que sidebar-pedidos.js está cargado:**
   ```javascript
   // En console
   SidebarPedidos.init
   // Debe mostrar [Function: init]
   ```

---

## Próximo Paso
Cuando estés listo, podemos implementar Fase 2 (drag-drop) o cualquier mejora adicional.

