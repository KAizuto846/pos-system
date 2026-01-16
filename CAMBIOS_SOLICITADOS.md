# Cambios Solicitados - Sistema POS

## 1. DEVOLUCIONES NO DEBEN CREAR PEDIDOS DE PROVEEDORES

### Problema Actual
Cuando un cliente devuelve un producto, el sistema simplemente incrementa el stock. Pero no debería agregarse automáticamente a los pedidos de proveedores.

### Solución
- Eliminar lógica que crea `supplier_orders` cuando se devuelve un producto
- El stock se incrementa (como está ahora), pero sin crear orden de compra
- Las devoluciones quedan registradas solo en `sales` con cantidad negativa

### Cambios en `server.js`
- Endpoint `/api/returns/create` ya está bien. No modifica `supplier_orders`
- Confirmar que NO haya lógica de auto-creación de pedidos

---

## 2. BARRA LATERAL DE PEDIDOS CON MEMORIA TEMPORAL

### Requisitos
1. **Tabla de Pedidos en Barra Lateral (en memoria)**
   - Se carga automáticamente desde BD cuando entra a reportes
   - Cada producto del proveedor seleccionado aparece en una lista
   - Admin puede marcar cuáles productos YA LLEGARON ✓ 
   - Los no marcados quedan pendientes

2. **Funcionalidad Drag-Drop**
   - Productos NO marcados pueden ser ARRASTRADOS
   - Destinos posibles:
     - Otro pedido futuro (mismo proveedor)
     - Otro proveedor (producto multi-proveedor)

3. **CRUD de Productos en Pedido**
   - Crear: Agregar producto manualmente a la lista de pedidos
   - Editar: Cambiar cantidad, descripción
   - Borrar: Eliminar producto del pedido
   - Todo SE GUARDA en BD

### Estructura de Datos
```javascript
// En sidebar-pedidos.js (NUEVO ARCHIVO)
const pedidosTemporal = {
  supplierId: 123,
  items: [
    { 
      id: 1,
      productId: 5,
      productName: 'Tempra',
      quantity: 50,
      received: false,      // ✓ Marcar recibido
      notes: 'En camino'
    },
    ...
  ]
};
```

### Cambios en BD
- Crear tabla: `supplier_order_items` con campo `received` (booleano)
- Tabla `supplier_orders` agregar estado: `draft` | `sent` | `pending` | `partial_received` | `received`

---

## 3. PRODUCTOS CON MÚLTIPLES LÍNEAS (MAIN + SECUNDARIAS)

### Problema Actual
Un producto (ej: Tempra) pertenece a UN proveedor. No hay múltiples líneas.

### Solución: Modelo de Líneas Principales

**Estructura:**
```
Producto "Tempra"
├─ Línea Principal: 1 (Proveedor "Franco Ibérica")    ← AQUÍ aparece en reporte
├─ Línea Secundaria: 2 (Proveedor "Empsur")          ← NO aparece, pero se puede reasignar
└─ Línea Secundaria: 3 (Proveedor "Efe")
```

**Comportamiento en Reportes:**
- Reporte de Línea 1 → Tempra aparece (línea principal)
- Reporte de Línea 2 → Tempra NO aparece (es secundaria)
- Reporte de Línea 3 → Tempra NO aparece (es secundaria)

**En Inventario:**
- Mostrar etiqueta: `[Línea 1, Línea 2, Línea 3]` o `[Principal: 1, También: 2,3]`
- Admin puede cambiar cual es la línea principal

### Cambios en BD
Ya existe `product_lines` pero necesita:
- Asegurar `is_primary` = 1 para línea principal
- Actualizar vista de inventario para mostrar todas las líneas
- En `products` tabla, guardar también `primary_supplier_id` para búsquedas rápidas

### Cambios en API
- `GET /api/products/:id` → devolver array de líneas con cual es principal
- `PATCH /api/products/:id/lines/:lineId/set-primary` → cambiar línea principal
- `POST /api/products/:id/lines` → agregar nueva línea
- `DELETE /api/products/:id/lines/:lineId` → eliminar línea (solo si no es principal)

---

## 4. FILTRADO DE REPORTES POR LÍNEA PRINCIPAL

### Cambio en Reports
- Ya existe filtro por supplier, pero debe ser por PRIMARY_LINE
- Solo mostrar productos donde `product_lines.is_primary = 1` para ese supplier

### Endpoint Actual
```
GET /api/reports/supplier-order?startDate=...&endDate=...&supplierId=...
```

### Nueva Lógica SQL
```sql
SELECT ... 
FROM sale_items si
WHERE ... 
  AND EXISTS (
    SELECT 1 FROM product_lines pl
    WHERE pl.product_id = si.product_id
    AND pl.supplier_id = ?
    AND pl.is_primary = 1
  )
```

---

## RESUMEN DE CAMBIOS

### Backend (server.js)
1. ✅ Confirmar `/api/returns/create` NO crea pedidos
2. Crear tabla: `supplier_order_items` con campo `received`
3. Crear endpoints CRUD para barra lateral:
   - `POST /api/supplier-order-items` (crear)
   - `PATCH /api/supplier-order-items/:id` (editar)
   - `DELETE /api/supplier-order-items/:id` (borrar)
   - `GET /api/supplier-order-items` (listar por pedido)
4. Implementar drag-drop API: `PATCH /api/supplier-order-items/:id/move`
5. Actualizar `/api/reports/supplier-order` para filtrar por línea principal

### Frontend (dashboard.js + NUEVO: sidebar-pedidos.js)
1. ✅ Mostrar barra lateral con pedidos
2. Implementar checkboxes para marcar "recibido"
3. Implementar drag-drop para reasignar productos
4. Interfaz CRUD para agregar/editar/borrar productos
5. Mostrar etiquetas de líneas en inventario

### BD (database/init.js)
1. Crear tabla `supplier_order_items`
2. Agregar índices para queries frecuentes
3. Migraciones para tablas existentes

---

## CRONOGRAMA SUGERIDO

1. **Fase 1** (esta sesión): Crear tablas, endpoints básicos, barra lateral estática
2. **Fase 2**: Implementar marcado de "recibido" y guardado en BD
3. **Fase 3**: Drag-drop y reasignación a otros proveedores
4. **Fase 4**: Múltiples líneas en inventario
5. **Fase 5**: Filtrado avanzado en reportes

---

## DETALLES TÉCNICOS

### Tabla supplier_order_items (NUEVA)
```sql
CREATE TABLE supplier_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  received_quantity INTEGER DEFAULT 0,
  received INTEGER DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (supplier_order_id) REFERENCES supplier_orders(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);
```

### Tabla supplier_orders (MODIFICACIONES)
```
Agregar columnas:
- status: 'draft' | 'sent' | 'pending' | 'partial_received' | 'received'
- notes: TEXT
```

### Archivos Nuevos
- `public/sidebar-pedidos.js` - Lógica de barra lateral
- Actualizar `public/reports.js` para integración

